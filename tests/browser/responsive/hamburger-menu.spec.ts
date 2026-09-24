import { test, expect, type Page } from "playwright/test";
import { loginViaUi } from "../../helpers";

// Collapsible hamburger side menu for mobile/tablet screens, shared by
// DashboardShell (User) and AdminShell (Admin) via ShellMobileNav. Below the
// `lg` breakpoint the horizontal nav bar is hidden and a hamburger button
// opens a slide-in drawer instead; at `lg` and above, the drawer trigger is
// hidden and the horizontal bar is shown. The drawer is rendered via a React
// portal to document.body (see ShellMobileNav.tsx) because the shell
// header's `backdrop-blur-xl` would otherwise make `position: fixed`
// resolve relative to the header instead of the viewport.

// Dashboard | Plans | Franchisee | Referrals | Redeem Hub | Payments |
// Account | Contact Us | About Us — Plans/Franchisee/Contact Us/About Us
// are the same catalog pages linked from the home page, but for a signed-in
// User they render inside DashboardShell (see src/app/plans/page.tsx et al.),
// so the hamburger trigger stays present after navigating to any of them.
// "Dashboard" is excluded from this list — the drawer-navigation loop below
// starts already on /dashboard, and the drawer only auto-closes on a
// pathname change (see ShellMobileNav.tsx), so clicking "Dashboard" from
// /dashboard is a same-page no-op and would never close the drawer.
const USER_NAV_ITEMS: { label: string; url: string }[] = [
  { label: "Plans", url: "**/plans" },
  { label: "Franchisee", url: "**/franchisee" },
  { label: "Referrals", url: "**/dashboard/referrals" },
  { label: "Redeem Hub", url: "**/dashboard/redeem" },
  { label: "Payments", url: "**/dashboard/payments" },
  { label: "Account", url: "**/dashboard/account" },
  { label: "Contact Us", url: "**/contact" },
];

const ADMIN_NAV_ITEMS = [
  { label: "Users", url: "**/admin/users" },
  { label: "Plans", url: "**/admin/plans" },
  { label: "Interest Methods", url: "**/admin/interest-methods" },
  { label: "Commissions", url: "**/admin/commissions" },
  { label: "AutoPay Simulator", url: "**/admin/payments" },
  { label: "Redemptions", url: "**/admin/redemptions" },
  { label: "General Enquiries", url: "**/admin/enquiries/general" },
  { label: "Catalog", url: "**/admin/catalog" },
  { label: "Emails", url: "**/admin/emails" },
  { label: "Audit Log", url: "**/admin/audit-log" },
  { label: "Reports", url: "**/admin/reports" },
  { label: "Appearance", url: "**/admin/theme" },
  { label: "Settings", url: "**/admin/settings" },
  { label: "Account", url: "**/admin/account" },
];

async function openDrawer(page: Page, drawerLabel: string) {
  await page.getByRole("button", { name: "Open navigation menu" }).click();
  const drawer = page.getByRole("navigation", { name: drawerLabel });
  await expect(drawer).toBeVisible();
  return drawer;
}

test.describe("Collapsible hamburger navigation", () => {
  test("user dashboard: hamburger menu opens a drawer at mobile width and navigates", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await loginViaUi(page, "user@demo.local", "User@1234");
    await page.waitForURL("**/dashboard");

    await expect(page.getByLabel("Dashboard Quick Navigation")).toBeHidden();

    const trigger = page.getByRole("button", { name: "Open navigation menu" });
    await expect(trigger).toBeVisible();

    await trigger.click();
    const drawer = page.getByRole("navigation", { name: "Dashboard Navigation" });
    await expect(drawer).toBeVisible();

    await drawer.getByRole("link", { name: "Referrals" }).click();
    await page.waitForURL("**/dashboard/referrals");
    await expect(drawer).toBeHidden();
  });

  test("user dashboard: at desktop width the horizontal nav bar is shown and the hamburger trigger is hidden", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await loginViaUi(page, "user@demo.local", "User@1234");
    await page.waitForURL("**/dashboard");

    await expect(page.getByLabel("Dashboard Quick Navigation")).toBeVisible();
    await expect(page.getByRole("button", { name: "Open navigation menu" })).toBeHidden();
  });

  test("admin console: hamburger menu opens a drawer at tablet width and navigates", async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await loginViaUi(page, "admin@demo.local", "Admin@1234");
    await page.waitForURL("**/admin");

    await expect(page.getByLabel("Admin Navigation")).toBeHidden();

    const trigger = page.getByRole("button", { name: "Open navigation menu" });
    await expect(trigger).toBeVisible();

    await trigger.click();
    const drawer = page.getByRole("navigation", { name: "Admin Menu" });
    await expect(drawer).toBeVisible();

    await drawer.getByRole("link", { name: "Users" }).click();
    await page.waitForURL("**/admin/users");
    await expect(drawer).toBeHidden();
  });

  test("admin console: at desktop width the horizontal nav bar is shown and the hamburger trigger is hidden", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await loginViaUi(page, "admin@demo.local", "Admin@1234");
    await page.waitForURL("**/admin");

    await expect(page.getByRole("button", { name: "Open navigation menu" })).toBeHidden();
  });

  test("sanity: every user dashboard drawer item redirects to its correct screen at mobile width", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await loginViaUi(page, "user@demo.local", "User@1234");
    await page.waitForURL("**/dashboard");

    for (const item of USER_NAV_ITEMS) {
      const drawer = await openDrawer(page, "Dashboard Navigation");
      await drawer.getByRole("link", { name: item.label, exact: true }).click();
      await page.waitForURL(item.url);
      await expect(drawer).toBeHidden();

      // The trigger must still exist and be usable after each navigation —
      // proves the drawer/portal survives a full client-side route change,
      // not just a single open/close cycle.
      await expect(page.getByRole("button", { name: "Open navigation menu" })).toBeVisible();
    }
  });

  test("sanity: every admin console drawer item redirects to its correct screen at mobile width", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await loginViaUi(page, "admin@demo.local", "Admin@1234");
    await page.waitForURL("**/admin");

    for (const item of ADMIN_NAV_ITEMS) {
      const drawer = await openDrawer(page, "Admin Menu");
      await drawer.getByRole("link", { name: item.label, exact: true }).click();
      await page.waitForURL(item.url);
      await expect(drawer).toBeHidden();
      await expect(page.getByRole("button", { name: "Open navigation menu" })).toBeVisible();
    }
  });
});
