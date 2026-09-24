import { test, expect, type Page } from "playwright/test";
import { prisma, loginViaUi, getLatestOtpCode } from "../../helpers";

test.describe.configure({ mode: "serial" });

test.afterAll(async () => {
  await prisma.$disconnect();
});

test("register creates an account and logs the user straight in (no 2FA on register)", async ({
  page,
}) => {
  // src/app/(auth)/actions.ts registerAction creates a session + redirects to
  // /dashboard directly — there is no 2FA step on registration (2FA only
  // applies to the login flow, verified below).
  const email = `pw-test-${Date.now()}@example.com`;
  const password = "Passw0rd!123";

  await page.goto("/register");
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(password);

  await Promise.all([
    page.waitForResponse((res) => res.request().method() === "POST"),
    page.getByRole("button", { name: "Register" }).click(),
  ]);

  await page.waitForURL("**/dashboard");
  expect(new URL(page.url()).pathname).toBe("/dashboard");

  const user = await prisma.user.findUnique({ where: { email } });
  expect(user).not.toBeNull();
  expect(user?.role).toBe("USER");
});

test("login with seeded user goes through 2FA via a DB-visible simulated OTP", async ({ page }) => {
  await loginViaUi(page, "user@demo.local", "User@1234");

  await page.waitForURL("**/dashboard");
  expect(new URL(page.url()).pathname).toBe("/dashboard");
});

test("login with seeded admin goes through 2FA and lands on /admin", async ({ page }) => {
  await loginViaUi(page, "admin@demo.local", "Admin@1234");

  await page.waitForURL("**/admin");
  expect(new URL(page.url()).pathname).toBe("/admin");
});

// The login and OTP-verify redirects use `redirect(url, "replace")" (see
// src/app/(auth)/actions.ts and verify-2fa/actions.ts) so those history
// entries are swapped out rather than pushed — Back should no longer be able
// to step back to either the login form or the OTP screen post-login.
test("sanity: pressing Back after login does not return to the login or 2FA screens", async ({ page }) => {
  await loginViaUi(page, "user@demo.local", "User@1234");
  await page.waitForURL("**/dashboard");

  await page.goBack();

  const pathname = new URL(page.url()).pathname;
  expect(pathname).not.toBe("/login");
  expect(pathname).not.toBe("/verify-2fa");
});

test("sanity: an authenticated user hitting /login directly is redirected to their dashboard", async ({
  page,
}) => {
  await loginViaUi(page, "admin@demo.local", "Admin@1234");
  await page.waitForURL("**/admin");

  await page.goto("/login");

  expect(new URL(page.url()).pathname).toBe("/admin");
});

// "Remember me" checkbox on the shared login form (used by both User and
// Admin, since there is no separate admin login page — see LoginForm.tsx).
// Checking it should give both the access-token (session_token) and
// refresh_token cookies a ~400-day lifetime instead of the default
// 30-minute / 30-day one, so the user stays logged in until they log out or
// clear site data.

async function loginWithRememberMe(page: Page, email: string, password: string, remember: boolean) {
  await prisma.otpCode.deleteMany({ where: { user: { email }, purpose: "LOGIN_2FA" } });

  await page.goto("/login");
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
  if (remember) {
    await page.locator('input[name="remember"]').check();
  }

  await Promise.all([
    page.waitForResponse((res) => res.request().method() === "POST"),
    page.getByRole("button", { name: "Log in" }).click(),
  ]);

  await page.waitForURL("**/verify-2fa");
  const code = await getLatestOtpCode(email, "LOGIN_2FA");
  await page.locator('input[name="code"]').fill(code);

  await Promise.all([
    page.waitForResponse((res) => res.request().method() === "POST"),
    page.getByRole("button", { name: "Verify" }).click(),
  ]);
}

test("sanity: checking 'Remember me' gives session and refresh cookies a long-lived (~400 day) expiry", async ({
  page,
  context,
}) => {
  await loginWithRememberMe(page, "user@demo.local", "User@1234", true);
  await page.waitForURL("**/dashboard");

  const cookies = await context.cookies();
  const sessionCookie = cookies.find((c) => c.name === "session_token");
  const refreshCookie = cookies.find((c) => c.name === "refresh_token");
  expect(sessionCookie).toBeTruthy();
  expect(refreshCookie).toBeTruthy();

  const now = Date.now() / 1000;
  const days300InSeconds = 300 * 24 * 60 * 60;
  // Both cookies should expire far in the future (~400 days), not the
  // 30-minute / 30-day defaults — 300 days is a safe lower bound to assert.
  expect(sessionCookie!.expires).toBeGreaterThan(now + days300InSeconds);
  expect(refreshCookie!.expires).toBeGreaterThan(now + days300InSeconds);
});

test("sanity: leaving 'Remember me' unchecked keeps the default short-lived cookie expiry", async ({
  page,
  context,
}) => {
  await loginWithRememberMe(page, "admin@demo.local", "Admin@1234", false);
  await page.waitForURL("**/admin");

  const cookies = await context.cookies();
  const sessionCookie = cookies.find((c) => c.name === "session_token");
  const refreshCookie = cookies.find((c) => c.name === "refresh_token");
  expect(sessionCookie).toBeTruthy();
  expect(refreshCookie).toBeTruthy();

  const now = Date.now() / 1000;
  const days300InSeconds = 300 * 24 * 60 * 60;
  // Default durations (30 min access token, 30 day refresh token) — well
  // under the 300-day remembered threshold.
  expect(sessionCookie!.expires).toBeLessThan(now + days300InSeconds);
  expect(refreshCookie!.expires).toBeLessThan(now + days300InSeconds);
});
