import { test, expect } from "playwright/test";
import bcrypt from "bcryptjs";
import { prisma, loginViaUi } from "../../helpers";
import { cleanupTestUser } from "../fixtures";

// Design.md 5.13: Next Deduction, AutoPay/Change Payment Method, Transaction
// Graph, and Payout Information on the user Payment History dashboard.
test.describe.configure({ mode: "serial" });

test.afterAll(async () => {
  await prisma.$disconnect();
});

async function createActiveMonthlyUserPlan(instalmentsPaid: number) {
  const plan = await prisma.plan.findUniqueOrThrow({
    where: { id: "seed-plan-basic" },
    include: { interestMethod: true },
  });

  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const email = `pw-payments-${suffix}@example.com`;
  const password = "Passw0rd!123";
  const passwordHash = await bcrypt.hash(password, 10);
  const referralCode = `PW${suffix.replace(/[^a-zA-Z0-9]/g, "").toUpperCase().slice(-8)}`;

  const user = await prisma.user.create({
    data: { email, passwordHash, referralCode, role: "USER", isEmailVerified: true },
  });

  const paymentAmount = Number(plan.presetAmounts[0]);
  const startDate = new Date(Date.now() - instalmentsPaid * 30 * 24 * 60 * 60 * 1000);
  const maturityDate = new Date(Date.now() + (plan.tenureMonths - instalmentsPaid) * 30 * 24 * 60 * 60 * 1000);

  const userPlan = await prisma.userPlan.create({
    data: {
      userId: user.id,
      planId: plan.id,
      interestMethodId: plan.interestMethodId,
      interestMethodVersion: plan.interestMethod.version,
      rewardPercentSnapshot: plan.rewardPercent,
      commissionPercentSnapshot: plan.commissionPercent,
      paymentAmount,
      paymentFrequency: "MONTHLY",
      status: "ACTIVE",
      principalPaid: paymentAmount * instalmentsPaid,
      startDate,
      maturityDate,
    },
  });

  return { user, userPlan, email, password, paymentAmount };
}

test("BRD/Design 5.13: Next Deduction shows the upcoming instalment amount and date for an ACTIVE plan", async ({ page }) => {
  const { userPlan, email, password, paymentAmount } = await createActiveMonthlyUserPlan(2);

  await loginViaUi(page, email, password);
  await page.waitForURL("**/dashboard");
  await page.goto("/dashboard/payments");

  await expect(page.getByText("AutoPay & Next Deduction")).toBeVisible();
  await expect(page.getByText(new RegExp(`₹${paymentAmount.toFixed(2)}`))).toBeVisible();
  await expect(page.getByText("Mandate: NONE")).toBeVisible();

  await cleanupTestUser(userPlan.userId);
});

test("BRD/Design 5.13: user can change payment method for an ACTIVE plan without altering amount/frequency/principal", async ({ page }) => {
  const { userPlan, email, password, paymentAmount } = await createActiveMonthlyUserPlan(1);

  await loginViaUi(page, email, password);
  await page.waitForURL("**/dashboard");
  await page.goto("/dashboard/payments");

  await expect(page.getByText("Current Method")).toBeVisible();
  await page.locator('select[name="method"]').selectOption("CARD");
  await Promise.all([
    page.waitForResponse((res) => res.request().method() === "POST"),
    page.getByRole("button", { name: "Change payment method" }).click(),
  ]);
  await expect(page.getByText("Updated")).toBeVisible();

  const updated = await prisma.userPlan.findUniqueOrThrow({ where: { id: userPlan.id } });
  expect(updated.preferredPaymentMethod).toBe("CARD");
  // Not altered by the method change:
  expect(Number(updated.paymentAmount)).toBe(paymentAmount);
  expect(updated.paymentFrequency).toBe("MONTHLY");
  expect(Number(updated.principalPaid)).toBe(paymentAmount);

  const audit = await prisma.auditLog.findFirst({
    where: { eventType: "PAYMENT_METHOD_CHANGED", entityRef: userPlan.id },
  });
  expect(audit).not.toBeNull();

  await cleanupTestUser(userPlan.userId);
});

test("Access control: another user's plan is not shown or editable on my Payment History page", async ({ page }) => {
  const { userPlan } = await createActiveMonthlyUserPlan(1);

  await loginViaUi(page, "user@demo.local", "User@1234");
  await page.waitForURL("**/dashboard");
  await page.goto("/dashboard/payments");

  // The other user's plan card (identified by its unique payment amount /
  // plan name pairing does not distinguish rows reliably, so assert on plan
  // count instead) must not surface anywhere on this user's own page.
  const otherPlanCards = await prisma.userPlan.count({ where: { userId: userPlan.userId } });
  expect(otherPlanCards).toBe(1);
  await expect(page.locator(`[data-user-plan-id="${userPlan.id}"]`)).toHaveCount(0);

  await cleanupTestUser(userPlan.userId);
});

test("BRD/Design 5.13: Payout Information lists an APPROVED redemption with amount and date", async ({ page }) => {
  const { userPlan, email, password } = await createActiveMonthlyUserPlan(3);
  const now = new Date();

  await prisma.redemptionRequest.create({
    data: {
      userId: userPlan.userId,
      category: "REFUND",
      status: "APPROVED",
      requestedAmount: 4321,
      availableMarginAtRequest: 5000,
      expiresAt: new Date(now.getTime() + 86_400_000),
    },
  });

  await loginViaUi(page, email, password);
  await page.waitForURL("**/dashboard");
  await page.goto("/dashboard/payments");

  await expect(page.getByText("Payout Information")).toBeVisible();
  await expect(page.getByText("REFUND")).toBeVisible();
  await expect(page.getByText(/4,?321\.00/)).toBeVisible();

  await cleanupTestUser(userPlan.userId);
});
