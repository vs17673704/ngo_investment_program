import { test, expect } from "playwright/test";
import { loginAsUser, loginAsAdmin, getLatestOtpCode, prisma, uniqueSuffix } from "./helpers";
import { hashPassword } from "../src/lib/auth/password";
import { generateUniqueReferralCode } from "../src/lib/referral-code";

test("pressing Back right after login never reveals the login screen and keeps the session alive", async ({
  page,
}) => {
  const suffix = uniqueSuffix();
  const email = `back-check-${suffix}@example.com`;
  const password = "Password@1234";
  const passwordHash = await hashPassword(password);
  const referralCode = await generateUniqueReferralCode();
  await prisma.user.create({
    data: { email, passwordHash, referralCode, role: "USER" },
  });

  // Start from the homepage and click through to /login via a real Next.js
  // <Link> rather than page.goto("/login") directly — a direct goto has no
  // prior history entry to fall back into, which would make Back leave the
  // app entirely (an artificial test-only scenario that never happens for a
  // real user who reaches /login by clicking a nav link).
  await page.goto("/");
  await page.getByRole("link", { name: "Login", exact: true }).first().click();
  await page.waitForURL("**/login");

  await prisma.otpCode.deleteMany({ where: { user: { email }, purpose: "LOGIN_2FA" } });
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
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
  await page.waitForURL("**/dashboard");

  // The login and verify-2fa entries were both replaced (see the "replace"
  // redirects in actions.ts / verify-2fa/actions.ts), so Back from /dashboard
  // steps to the homepage that preceded /login — never to the login form
  // itself (BRD Rule XLIV).
  await page.goBack();
  await page.waitForURL((url) => url.pathname === "/");
  await expect(page.locator('input[name="email"]')).toHaveCount(0);

  // The session must still be alive — a fresh visit to /dashboard renders it
  // rather than redirecting to the landing page.
  await page.goto("/dashboard");
  await page.waitForURL("**/dashboard");
});

test("pressing Back right after admin login never reveals the login screen and keeps the session alive", async ({
  page,
}) => {
  await page.goto("/");
  await loginAsAdmin(page);
  await page.waitForURL("**/admin");

  await page.goBack();
  await page.waitForURL((url) => url.pathname === "/");
  await expect(page.locator('input[name="email"]')).toHaveCount(0);

  await page.goto("/admin");
  await page.waitForURL("**/admin");
});

test("pressing Back after a normal logout lands on the landing page, not a stale dashboard", async ({ page }) => {
  const suffix = uniqueSuffix();
  const email = `back-check3-${suffix}@example.com`;
  const password = "Password@1234";
  const passwordHash = await hashPassword(password);
  const referralCode = await generateUniqueReferralCode();
  await prisma.user.create({
    data: { email, passwordHash, referralCode, role: "USER" },
  });

  // Establish a real prior history entry before /login (same reasoning as
  // the first test above) — without it, /login is the very first navigation
  // in this browser context, so goBack() below has nothing to return to at
  // all and lands on "about:blank" instead of "/".
  await page.goto("/");
  await loginAsUser(page, email, password);
  await page.waitForURL("**/dashboard");

  await page.getByRole("button", { name: "Log out" }).click();
  await page.waitForURL((url) => url.pathname === "/");

  // Back after a real logout must not reveal a stale/cached dashboard. The
  // logout Server Action uses redirect("/", "replace") (see actions.ts), so
  // the Dashboard history entry is dropped rather than left behind — Back
  // has nothing logged-in to land on at all. Combined with login/verify-2fa
  // also using "replace", this whole session often collapses to a single
  // history entry already sitting on "/", so Back may produce no detectable
  // URL transition for waitForURL to wait on: the browser is already on (or
  // silently stays on) the correct destination instead of ever exposing a
  // stale dashboard. Assert the resulting state directly rather than
  // waiting on a navigation event that may not occur.
  await page.goBack();
  await expect.poll(() => new URL(page.url()).pathname).toBe("/");
  await expect(page.locator('input[name="email"]')).toHaveCount(0);
});

test("normal in-app back navigation between dashboard sub-pages is unaffected", async ({ page }) => {
  const suffix = uniqueSuffix();
  const email = `back-check2-${suffix}@example.com`;
  const password = "Password@1234";
  const passwordHash = await hashPassword(password);
  const referralCode = await generateUniqueReferralCode();
  await prisma.user.create({
    data: { email, passwordHash, referralCode, role: "USER" },
  });

  await loginAsUser(page, email, password);
  await page.waitForURL("**/dashboard");

  // Navigate deeper into the dashboard, then back — should NOT force logout.
  await page.goto("/dashboard/referrals");
  await page.goBack();
  await page.waitForURL("**/dashboard");
  await expect(page).toHaveURL(/\/dashboard$/);

  // Session should still be alive.
  await page.reload();
  await expect(page).not.toHaveURL(/\/login/);
});
