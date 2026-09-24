import { test, expect } from "playwright/test";
import bcrypt from "bcryptjs";
import { prisma, loginViaUi } from "../../helpers";

// Verifies the Mobile Number and Change Password forms on both
// /dashboard/account (User) and /admin/account (Admin): every save must (1)
// persist to the database and (2) be reflected in the UI immediately after
// the server action's response resolves, with no manual page.reload().
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

async function submit(page: import("playwright/test").Page, buttonName: string) {
  await Promise.all([
    page.waitForResponse((res) => res.request().method() === "POST"),
    page.getByRole("button", { name: buttonName }).click(),
  ]);
}

for (const target of [
  { role: "USER" as const, accountPath: "/dashboard/account", homeUrl: "**/dashboard" },
  { role: "ADMIN" as const, accountPath: "/admin/account", homeUrl: "**/admin" },
]) {
  test(`${target.role}: mobile number save/update/remove reflects in UI immediately and persists to DB`, async ({ page }) => {
    const { user, email, password } = await createVerifiedUser(`mn-${target.role.toLowerCase()}`, target.role);

    await loginViaUi(page, email, password);
    await page.waitForURL(target.homeUrl);
    await page.goto(target.accountPath);

    const input = page.locator('input[name="mobileNumber"]');
    await expect(input).toHaveValue("");

    // Save a brand-new mobile number.
    await input.fill("+919876543210");
    await submit(page, "Save mobile number");
    await expect(page.getByText("Mobile number updated")).toBeVisible();
    await expect(input).toHaveValue("+919876543210");
    let updated = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(updated.mobileNumber).toBe("+919876543210");

    // Update it to a different value, still without reloading.
    await input.fill("9123456780");
    await submit(page, "Save mobile number");
    await expect(page.getByText("Mobile number updated")).toBeVisible();
    await expect(input).toHaveValue("9123456780");
    updated = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(updated.mobileNumber).toBe("9123456780");

    // Remove it (blank submission).
    await input.fill("");
    await submit(page, "Save mobile number");
    await expect(page.getByText("Mobile number removed")).toBeVisible();
    await expect(input).toHaveValue("");
    updated = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(updated.mobileNumber).toBeNull();

    // Persistence survives a subsequent hard reload too.
    await page.reload();
    await expect(page.locator('input[name="mobileNumber"]')).toHaveValue("");
  });

  test(`${target.role}: mobile number rejects invalid input without touching the DB, then a valid save still works without reload`, async ({ page }) => {
    const { user, email, password } = await createVerifiedUser(`mn-invalid-${target.role.toLowerCase()}`, target.role);

    await loginViaUi(page, email, password);
    await page.waitForURL(target.homeUrl);
    await page.goto(target.accountPath);

    const input = page.locator('input[name="mobileNumber"]');
    await input.fill("abc");
    await submit(page, "Save mobile number");
    await expect(page.getByText(/Enter a valid mobile number/)).toBeVisible();
    let unchanged = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(unchanged.mobileNumber).toBeNull();

    await input.fill("+447911123456");
    await submit(page, "Save mobile number");
    await expect(page.getByText("Mobile number updated")).toBeVisible();
    await expect(input).toHaveValue("+447911123456");
    unchanged = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(unchanged.mobileNumber).toBe("+447911123456");
  });

  test(`${target.role}: change password persists the new hash, revokes the session, and redirects to /login without a manual reload`, async ({ page }) => {
    const { user, email, password } = await createVerifiedUser(`pw-${target.role.toLowerCase()}`, target.role);
    const newPassword = "NewPassw0rd!456";

    await loginViaUi(page, email, password);
    await page.waitForURL(target.homeUrl);
    await page.goto(target.accountPath);

    await page.locator('input[name="currentPassword"]').fill(password);
    await page.locator('input[name="newPassword"]').fill(newPassword);

    await Promise.all([
      page.waitForResponse((res) => res.request().method() === "POST"),
      page.getByRole("button", { name: "Change password" }).click(),
    ]);
    // The server action calls redirect("/login") after destroying the
    // session — this must happen as a client-side navigation driven by the
    // action's response, not a manual reload.
    await page.waitForURL("**/login");
    expect(page.url()).toContain("/login");

    const updated = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    const oldHashStillValid = await bcrypt.compare(password, updated.passwordHash!);
    const newHashValid = await bcrypt.compare(newPassword, updated.passwordHash!);
    expect(oldHashStillValid).toBe(false);
    expect(newHashValid).toBe(true);

    // The old session must actually be revoked, not just visually redirected.
    // dashboard/layout.tsx and admin/layout.tsx redirect an unauthenticated
    // visitor to "/" (home), not "/login" — that's the current app-wide
    // guard behavior, distinct from the login-page redirect the account
    // page's own server action just performed.
    await page.goto(target.accountPath);
    await page.waitForURL("**/");
    expect(page.url()).not.toContain(target.accountPath);

    // And the new password must actually work end-to-end.
    await loginViaUi(page, email, newPassword);
    await page.waitForURL(target.homeUrl);
  });

  test(`${target.role}: an incorrect current password is rejected without changing the DB or the session`, async ({ page }) => {
    const { user, email, password } = await createVerifiedUser(`pw-wrong-${target.role.toLowerCase()}`, target.role);

    await loginViaUi(page, email, password);
    await page.waitForURL(target.homeUrl);
    await page.goto(target.accountPath);

    await page.locator('input[name="currentPassword"]').fill("TotallyWrong!1");
    await page.locator('input[name="newPassword"]').fill("Whatever!123");
    await submit(page, "Change password");
    await expect(page.getByText("Current password is incorrect")).toBeVisible();
    // Still on the account page — no redirect, no reload needed to see the error.
    expect(page.url()).toContain(target.accountPath);

    const unchanged = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    const stillOriginal = await bcrypt.compare(password, unchanged.passwordHash!);
    expect(stillOriginal).toBe(true);
  });
}
