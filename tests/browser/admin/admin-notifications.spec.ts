import { test, expect, type Page } from "playwright/test";
import { prisma, loginViaUi, loginAsUser } from "../../helpers";
import { createReferralWithAccruedCommission, TEST_PASSWORD } from "../fixtures";

// PushOptIn.tsx renders a real, fixed bottom-right "Enable notifications"
// banner, shown after an async permission check on mount unless
// sessionStorage["push-opt-in-dismissed"] is already set. On this spec's dev
// database (which accumulates commission fixtures across runs) the row this
// test needs to click can end up sorted to the very bottom of a long list,
// directly under that fixed overlay — Playwright's click() then retries
// actionability forever (no actionTimeout is configured), silently hanging
// until the test's own timeout. Clicking the banner's own "Dismiss" button
// reactively is racy (the banner can appear after a page.goto() with no
// visible signal to wait on); pre-seeding the same sessionStorage key it
// checks, via an init script that runs before every document on this page,
// suppresses it deterministically without touching app behavior.
async function suppressPushOptIn(page: Page) {
  await page.addInitScript(() => sessionStorage.setItem("push-opt-in-dismissed", "1"));
}

// Sanity coverage for AdminShell's notification bell + /admin/notifications
// page (parity with the existing User-side bell/`/dashboard/notifications`).
test.describe.configure({ mode: "serial" });

test.afterAll(async () => {
  await prisma.$disconnect();
});

test("Admin notification bell shows an unread badge and links to /admin/notifications", async ({ page }) => {
  const admin = await prisma.user.findFirstOrThrow({ where: { role: "ADMIN" } });

  const notification = await prisma.notification.create({
    data: {
      userId: admin.id,
      type: "GENERAL_ENQUIRY_RECEIVED",
      title: "Sanity Test Notification",
      message: "This is a sanity-test notification for the admin notification area.",
      isRead: false,
    },
  });

  await loginViaUi(page, admin.email, "Admin@1234");
  await page.waitForURL("**/admin");

  const bell = page.getByRole("link", { name: /Notifications \(\d+ unread\)/ });
  await expect(bell).toBeVisible();
  await expect(bell.locator("span").last()).toHaveText(/\d+/);

  await bell.click();
  await page.waitForURL("**/admin/notifications");

  await expect(page.getByRole("heading", { name: "Notifications" })).toBeVisible();
  await expect(page.getByText("Sanity Test Notification")).toBeVisible();
  await expect(
    page.getByText("This is a sanity-test notification for the admin notification area."),
  ).toBeVisible();

  // Visiting the page marks all of this admin's notifications read, so the
  // header badge should disappear on the next navigation.
  const updated = await prisma.notification.findUniqueOrThrow({ where: { id: notification.id } });
  expect(updated.isRead).toBe(true);

  await page.goto("/admin");
  await expect(page.getByRole("link", { name: /Notifications \(\d+ unread\)/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Notifications \(0 unread\)/ })).toBeVisible();

  await prisma.notification.delete({ where: { id: notification.id } });
});

test("Admin: empty state shown when there are no notifications", async ({ page }) => {
  const admin = await prisma.user.findFirstOrThrow({ where: { role: "ADMIN" } });
  await prisma.notification.deleteMany({ where: { userId: admin.id } });

  await loginViaUi(page, admin.email, "Admin@1234");
  await page.waitForURL("**/admin");
  await page.goto("/admin/notifications");

  await expect(page.getByText("You have no notifications yet.")).toBeVisible();
  await expect(page.getByRole("link", { name: /Notifications \(0 unread\)/ })).toBeVisible();
});

// Every other test in this file seeds a notification directly via Prisma —
// useful for the bell/page UI itself, but it never proves the app's real
// admin-action -> notification pipeline. creditCommissionAction
// (src/app/admin/commissions/actions.ts) is the one genuine ADMIN-UI-driven
// action that creates a notification for a target regular USER (the
// referrer, on REFERRAL_EARNED) rather than seeding one for the admin's own
// inbox. This drives that action for real, through /admin/commissions, then
// verifies the referrer sees it in their own /dashboard/notifications in a
// separate session — a true cross-role flow rather than a Prisma-seeded stub.
test("crediting a commission from /admin/commissions notifies the referrer, who sees it in their own dashboard", async ({
  page,
  browser,
}) => {
  test.setTimeout(120_000);
  const amount = 250;
  const { referrer, commission } = await createReferralWithAccruedCommission(amount);

  await suppressPushOptIn(page);
  await loginViaUi(page, "admin@demo.local", "Admin@1234");
  await page.waitForURL("**/admin");
  await page.goto("/admin/commissions");

  await expect(page.getByRole("heading", { name: "Commission Lifecycle" })).toBeVisible();
  const accruedRow = page.locator("li", { has: page.getByText(referrer.email) });
  await expect(accruedRow).toBeVisible();

  await Promise.all([
    page.waitForResponse((res) => res.request().method() === "POST"),
    accruedRow.getByRole("button", { name: "Approve" }).click(),
  ]);

  // See account-lock-e2e.spec.ts for the diagnosed reason this waits directly
  // on the DOM with a generous timeout instead of calling page.reload():
  // revalidatePath's re-render is included in the action's own response, but
  // the client applies it as a delayed "seeded navigation" that can trail the
  // POST resolving by several seconds under load, and racing that delay with
  // an explicit reload is what produces intermittent detached-frame errors.
  const approvedRow = page.locator("li", { has: page.getByText(referrer.email) });
  await expect(approvedRow.getByRole("button", { name: "Credit to ledger" })).toBeVisible({ timeout: 30_000 });

  await Promise.all([
    page.waitForResponse((res) => res.request().method() === "POST"),
    approvedRow.getByRole("button", { name: "Credit to ledger" }).click(),
  ]);

  const credited = await prisma.commission.findUniqueOrThrow({ where: { id: commission.id } });
  expect(credited.status).toBe("AVAILABLE_FOR_WITHDRAWAL");
  expect(credited.creditDate).not.toBeNull();

  const notification = await prisma.notification.findFirstOrThrow({
    where: { userId: referrer.id, type: "REFERRAL_EARNED" },
  });
  expect(notification.title).toBe("Referral commission credited");
  expect(notification.message).toContain(amount.toFixed(2));
  expect(notification.isRead).toBe(false);

  // The referrer's own session, genuinely separate from the admin's, must see
  // the notification for real in /dashboard/notifications.
  const referrerContext = await browser.newContext();
  const referrerPage = await referrerContext.newPage();
  await suppressPushOptIn(referrerPage);
  await loginAsUser(referrerPage, referrer.email, TEST_PASSWORD);
  await referrerPage.waitForURL("**/dashboard");

  const bell = referrerPage.getByRole("link", { name: /Notifications \(\d+ unread\)/ });
  await expect(bell).toBeVisible();
  await expect(referrerPage.getByRole("link", { name: /Notifications \(0 unread\)/ })).not.toBeVisible();

  await bell.click();
  await referrerPage.waitForURL("**/dashboard/notifications");
  await expect(referrerPage.getByRole("heading", { name: "Notifications" })).toBeVisible();
  await expect(referrerPage.getByText("Referral commission credited")).toBeVisible();
  await expect(referrerPage.getByText(`₹${amount.toFixed(2)}`)).toBeVisible();

  const readAfterView = await prisma.notification.findUniqueOrThrow({ where: { id: notification.id } });
  expect(readAfterView.isRead).toBe(true);

  await referrerContext.close();
});

test("Access control: /admin/notifications redirects unauthenticated and non-admin users", async ({ page, browser }) => {
  await page.goto("/admin/notifications");
  await page.waitForURL("**/login");

  const userContext = await browser.newContext();
  const userPage = await userContext.newPage();
  await loginViaUi(userPage, "user@demo.local", "User@1234");
  await userPage.waitForURL("**/dashboard");
  await userPage.goto("/admin/notifications");
  await userPage.waitForURL("**/dashboard");
  await userContext.close();
});
