import { test, expect } from "playwright/test";
import bcrypt from "bcryptjs";
import { prisma, loginViaUi } from "../../helpers";

// BRD Rule XLII: disabling push notifications must (1) persist the
// preference, (2) revoke existing active PushSubscription rows, and (3)
// leave the in-app Notification history mechanism untouched — this spec
// covers (1) and (2) end-to-end through the real UI/server action; (3) is
// an invariant of src/lib/providers/notification.ts unrelated to this
// toggle and is covered by the existing notification specs.
test.describe.configure({ mode: "serial" });

test.afterAll(async () => {
  await prisma.$disconnect();
});

function uniqueSuffix() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

async function createVerifiedUser(prefix: string, role: "USER" | "ADMIN" = "USER") {
  const password = "Passw0rd!123";
  const passwordHash = await bcrypt.hash(password, 10);
  const email = `${prefix}-${uniqueSuffix()}@example.com`;
  const user = await prisma.user.create({
    data: {
      email,
      passwordHash,
      referralCode: `${prefix.slice(0, 3).toUpperCase()}${uniqueSuffix().replace(/[^a-zA-Z0-9]/g, "").toUpperCase().slice(-7)}`,
      role,
      isEmailVerified: true,
    },
  });
  return { user, email, password };
}

test("Rule XLII: a user can disable push notifications, which revokes active subscriptions and persists across reload", async ({ page }) => {
  const { user, email, password } = await createVerifiedUser("pw-optout");

  await prisma.pushSubscription.create({
    data: { userId: user.id, fcmToken: `fake-token-${uniqueSuffix()}`, platform: "test" },
  });

  await loginViaUi(page, email, password);
  await page.waitForURL("**/dashboard");

  await page.goto("/dashboard/account");
  const checkbox = page.locator('input[name="pushNotificationsEnabled"]');
  await expect(checkbox).toBeChecked();

  await checkbox.uncheck();
  await Promise.all([
    page.waitForResponse((res) => res.request().method() === "POST"),
    page.getByRole("button", { name: "Save preference" }).click(),
  ]);
  await expect(page.getByText("Push notifications disabled")).toBeVisible();
  // Regression guard: immediately after save, before any reload, the
  // checkbox must not visually revert to checked (a bug previously caused
  // by React resetting the <form>'s fields to their initial DOM attribute
  // values on submit when the action is wired via the form's `action` prop
  // — see PushNotificationToggle.tsx).
  await expect(checkbox).not.toBeChecked();

  const updated = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
  expect(updated.pushNotificationsEnabled).toBe(false);

  const activeSubs = await prisma.pushSubscription.count({ where: { userId: user.id, revokedAt: null } });
  expect(activeSubs).toBe(0);

  await page.reload();
  await expect(page.locator('input[name="pushNotificationsEnabled"]')).not.toBeChecked();

  await prisma.pushSubscription.deleteMany({ where: { userId: user.id } });
});

test("Rule XLII: re-enabling push notifications restores the preference", async ({ page }) => {
  const { user, email, password } = await createVerifiedUser("pw-optin");
  await prisma.user.update({ where: { id: user.id }, data: { pushNotificationsEnabled: false } });

  await loginViaUi(page, email, password);
  await page.waitForURL("**/dashboard");

  await page.goto("/dashboard/account");
  const checkbox = page.locator('input[name="pushNotificationsEnabled"]');
  await expect(checkbox).not.toBeChecked();

  await checkbox.check();
  await Promise.all([
    page.waitForResponse((res) => res.request().method() === "POST"),
    page.getByRole("button", { name: "Save preference" }).click(),
  ]);
  await expect(page.getByText("Push notifications enabled")).toBeVisible();
  await expect(checkbox).toBeChecked();

  const updated = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
  expect(updated.pushNotificationsEnabled).toBe(true);
});

test("Rule XLII: an opted-out user's POST /api/push/subscribe no-ops instead of creating a subscription", async ({ page }) => {
  const { user, email, password } = await createVerifiedUser("pw-optout-api");
  await prisma.user.update({ where: { id: user.id }, data: { pushNotificationsEnabled: false } });

  await loginViaUi(page, email, password);
  await page.waitForURL("**/dashboard");

  const response = await page.evaluate(async () => {
    const res = await fetch("/api/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fcmToken: "fake-token-should-not-persist" }),
    });
    return res.json();
  });
  expect(response).toEqual({ ok: false, disabled: true });

  const subCount = await prisma.pushSubscription.count({ where: { fcmToken: "fake-token-should-not-persist" } });
  expect(subCount).toBe(0);
});

// Rule XLII applies uniformly to Users and Admins — sanity check that the
// same PushNotificationToggle wired to the admin's own server action
// (src/app/admin/account/actions.ts) behaves the same as the User flow above.
test("Rule XLII: an admin can disable and re-enable push notifications on /admin/account", async ({ page }) => {
  const { user, email, password } = await createVerifiedUser("pw-admin-optout", "ADMIN");

  await loginViaUi(page, email, password);
  await page.waitForURL("**/admin");

  await page.goto("/admin/account");
  const checkbox = page.locator('input[name="pushNotificationsEnabled"]');
  await expect(checkbox).toBeChecked();

  await checkbox.uncheck();
  await Promise.all([
    page.waitForResponse((res) => res.request().method() === "POST"),
    page.getByRole("button", { name: "Save preference" }).click(),
  ]);
  await expect(page.getByText("Push notifications disabled")).toBeVisible();
  await expect(checkbox).not.toBeChecked();

  let updated = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
  expect(updated.pushNotificationsEnabled).toBe(false);

  await page.reload();
  await expect(page.locator('input[name="pushNotificationsEnabled"]')).not.toBeChecked();

  await checkbox.check();
  await Promise.all([
    page.waitForResponse((res) => res.request().method() === "POST"),
    page.getByRole("button", { name: "Save preference" }).click(),
  ]);
  await expect(page.getByText("Push notifications enabled")).toBeVisible();
  await expect(checkbox).toBeChecked();

  updated = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
  expect(updated.pushNotificationsEnabled).toBe(true);
});
