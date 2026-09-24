import { test, expect } from "playwright/test";
import bcrypt from "bcryptjs";
import { prisma, loginViaUi } from "../../helpers";

// Design.md 3.2 [BRD-required]: successful and failed login attempts must
// be recorded (LoginHistory) for security/login-history purposes, even
// though this is no longer surfaced in the Account page UI.
test.describe.configure({ mode: "serial" });

test.afterAll(async () => {
  await prisma.$disconnect();
});

function uniqueSuffix() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

test("Design 3.2: a failed login attempt and a successful login are both recorded in LoginHistory", async ({ page }) => {
  const password = "Passw0rd!123";
  const passwordHash = await bcrypt.hash(password, 10);
  const email = `pw-loginhist-${uniqueSuffix()}@example.com`;

  const user = await prisma.user.create({
    data: {
      email,
      passwordHash,
      referralCode: `PWL${uniqueSuffix().replace(/[^a-zA-Z0-9]/g, "").toUpperCase().slice(-7)}`,
      role: "USER",
      isEmailVerified: true,
    },
  });

  // A wrong-password attempt must be recorded as a FAILED LoginHistory row,
  // not just an audit-log entry.
  await page.goto("/login");
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill("WrongPassword!1");
  await Promise.all([
    page.waitForResponse((res) => res.request().method() === "POST"),
    page.getByRole("button", { name: "Log in" }).click(),
  ]);
  await expect(page.getByText("Invalid email or password")).toBeVisible();

  const failedEntry = await prisma.loginHistory.findFirstOrThrow({
    where: { userId: user.id, result: "FAILED" },
  });
  expect(failedEntry.result).toBe("FAILED");

  // A real login then succeeds and is recorded as SUCCESS.
  await loginViaUi(page, email, password);
  await page.waitForURL("**/dashboard");

  const successEntry = await prisma.loginHistory.findFirstOrThrow({
    where: { userId: user.id, result: "SUCCESS" },
  });
  expect(successEntry.result).toBe("SUCCESS");

  await prisma.loginHistory.deleteMany({ where: { userId: user.id } });
});
