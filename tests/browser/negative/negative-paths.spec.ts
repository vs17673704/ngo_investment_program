import { test, expect } from "playwright/test";
import { prisma, loginViaUi } from "../../helpers";
import { createUserWithRedeemableBalance } from "../fixtures";

test.describe.configure({ mode: "serial" });

test.afterAll(async () => {
  await prisma.$disconnect();
});

test("login with an invalid password shows an error and does not authenticate", async ({ page }) => {
  await page.goto("/login");
  await page.locator('input[name="email"]').fill("user@demo.local");
  await page.locator('input[name="password"]').fill("WrongPassword!");
  await Promise.all([
    page.waitForResponse((res) => res.request().method() === "POST"),
    page.getByRole("button", { name: "Log in" }).click(),
  ]);
  expect(new URL(page.url()).pathname).toBe("/login");
  await expect(page.getByText(/invalid|incorrect/i)).toBeVisible();
});

test("a redemption request for zero or negative amount is rejected client/server side", async ({ page }) => {
  const { email, password } = await createUserWithRedeemableBalance(10000);
  await loginViaUi(page, email, password);
  await page.waitForURL("**/dashboard");
  await page.goto("/dashboard/redeem/refund");

  await page.locator('input[name="amount"]').fill("0");
  await page.getByRole("button", { name: "Submit request" }).click();
  // Either blocked by native min validation or by a server-side error message;
  // in both cases the app must not navigate away to a success state.
  await page.waitForTimeout(500);
  expect(new URL(page.url()).pathname).toBe("/dashboard/redeem/refund");
});

// "a USER-role account is redirected away from admin-only routes" merged
// into tests/browser/auth/auth-rbac-lifecycle.spec.ts as a parametrized table
// covering every admin-only route in one place.

test("visiting a protected route while logged out redirects to /login", async ({ page }) => {
  await page.context().clearCookies();
  await page.goto("/dashboard");
  await page.waitForURL("**/login");
  expect(new URL(page.url()).pathname).toBe("/login");
});

// "uploading an oversized theme asset is rejected" merged into
// admin-theme-lifecycle.spec.ts, which owns all other theme-upload negative
// paths (invalid file, accessibility-blocked colors).
