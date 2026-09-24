import { test, expect } from "playwright/test";
import { loginAsUser, loginViaUi } from "../../helpers";

// Consolidates the many near-duplicate "a USER-role account is redirected
// away from admin-only routes" checks that used to be scattered one-per-file
// (negative-paths.spec.ts, admin-interest-methods.spec.ts,
// admin-theme-lifecycle.spec.ts each had their own copy of essentially this
// same assertion for a single route) into one parametrized table covering
// every admin-only route in the app. Feature files that pair this check with
// an additional *unauthenticated* (logged-out) redirect assertion for their
// own route (about-contact-content.spec.ts, general-enquiry.spec.ts,
// admin-notifications.spec.ts) keep their own "Access control:" tests as-is,
// since those exercise a second, distinct code path colocated with
// feature-specific setup.
const ADMIN_ONLY_ROUTES = [
  "/admin",
  "/admin/theme",
  "/admin/redemptions",
  "/admin/commissions",
  "/admin/users",
  "/admin/plans",
  "/admin/settings",
  "/admin/audit-log",
  "/admin/interest-methods",
];

for (const adminPath of ADMIN_ONLY_ROUTES) {
  test(`a USER-role account is redirected away from ${adminPath}`, async ({ page }) => {
    await loginAsUser(page, "user@demo.local", "User@1234");
    await page.waitForURL("**/dashboard");
    await page.goto(adminPath);
    await page.waitForURL("**/dashboard");
    expect(new URL(page.url()).pathname).toBe("/dashboard");
  });
}

// Moved from the former full-regression.spec.ts (deleted — its page-load
// sweep and redemption mini-flow were fully superseded by deeper
// feature-specific specs), this is the only place logout itself is exercised.
test("logging out redirects to the public home page, not /login", async ({ page }) => {
  await loginViaUi(page, "user@demo.local", "User@1234");
  await page.waitForURL("**/dashboard");

  const logoutLink = page.getByRole("button", { name: /log ?out/i }).or(page.getByRole("link", { name: /log ?out/i }));
  await logoutLink.first().click();
  await page.waitForURL("http://localhost:3000/");
  await expect(page.getByRole("link", { name: "Login", exact: true })).toBeVisible();
});
