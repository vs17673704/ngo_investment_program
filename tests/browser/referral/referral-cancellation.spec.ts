import { test, expect, type Page } from "playwright/test";
import bcrypt from "bcryptjs";
import { subDays } from "date-fns";
import { prisma, loginViaUi } from "../../helpers";
import { accrueReferralCommissionForPayment } from "../../../src/lib/commission-engine";

// BRD Rule XX: an admin may cancel an active referral relationship with a
// reason. Cancellation must stop future commission accrual only — it must
// never mark already-accrued commission as CANCELLED (BRD Rule XXI).
test.describe.configure({ mode: "serial" });

test.afterAll(async () => {
  await prisma.$disconnect();
});

function uniqueSuffix() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

// See admin-notifications.spec.ts / referral-commission-e2e.spec.ts for the
// diagnosed reason this is needed: on this spec's accumulated dev database,
// /admin/commissions and /admin/users can grow long enough that the
// fixed-position PushOptIn "Enable notifications" banner intercepts clicks on
// this test's target row.
async function suppressPushOptIn(page: Page) {
  await page.addInitScript(() => sessionStorage.setItem("push-opt-in-dismissed", "1"));
}

test("BRD Rule XX: admin cancelling a referral stops future commission accrual without reversing existing commission, and the untouched commission still reaches the referrer's own withdrawal", async ({ page, browser }) => {
  await suppressPushOptIn(page);
  const plan = await prisma.plan.findUniqueOrThrow({
    where: { id: "seed-plan-basic" },
    include: { interestMethod: true },
  });
  const passwordHash = await bcrypt.hash("Passw0rd!123", 10);

  const referrer = await prisma.user.create({
    data: {
      email: `pw-cancel-referrer-${uniqueSuffix()}@example.com`,
      passwordHash,
      referralCode: `PWC${uniqueSuffix().replace(/[^a-zA-Z0-9]/g, "").toUpperCase().slice(-7)}`,
      role: "USER",
      isEmailVerified: true,
    },
  });
  const referred = await prisma.user.create({
    data: {
      email: `pw-cancel-referred-${uniqueSuffix()}@example.com`,
      passwordHash,
      referralCode: `PWD${uniqueSuffix().replace(/[^a-zA-Z0-9]/g, "").toUpperCase().slice(-7)}`,
      role: "USER",
      isEmailVerified: true,
    },
  });
  const referral = await prisma.referral.create({
    data: {
      referrerUserId: referrer.id,
      referredUserId: referred.id,
      referralCodeUsed: referrer.referralCode,
      status: "ACTIVE",
      expiryDate: subDays(new Date(), -365),
    },
  });

  const userPlan = await prisma.userPlan.create({
    data: {
      userId: referred.id,
      planId: plan.id,
      interestMethodId: plan.interestMethodId,
      interestMethodVersion: plan.interestMethod.version,
      rewardPercentSnapshot: plan.rewardPercent,
      commissionPercentSnapshot: plan.commissionPercent,
      paymentAmount: Number(plan.presetAmounts[0]),
      paymentFrequency: plan.paymentFrequency,
      status: "ACTIVE",
      startDate: new Date(),
      maturityDate: subDays(new Date(), -plan.tenureMonths * 30),
    },
  });
  const firstPayment = await prisma.payment.create({
    data: {
      userPlanId: userPlan.id,
      idempotencyKey: `pw-cancel-${uniqueSuffix()}`,
      gatewayOrderId: `pw-cancel-order-${uniqueSuffix()}`,
      status: "SUCCESS",
      amount: userPlan.paymentAmount,
      method: "UPI",
      scheduledDate: new Date(),
      actualDate: new Date(),
    },
  });

  const existingCommission = await accrueReferralCommissionForPayment({
    referredUserId: referred.id,
    userPlanId: userPlan.id,
    paymentId: firstPayment.id,
    paymentAmount: Number(userPlan.paymentAmount),
    commissionPercent: 5,
  });
  expect(existingCommission).not.toBeNull();

  await loginViaUi(page, "admin@demo.local", "Admin@1234");
  await page.waitForURL("**/admin");
  await page.goto("/admin/referrers");

  const row = page
    .locator("section", { has: page.getByRole("heading", { name: "Active Referral Relationships" }) })
    .locator("tr", { has: page.getByText(referred.email) });
  await expect(row).toBeVisible();
  await row.locator('input[name="reason"]').fill("Suspected fraudulent referral activity");
  await Promise.all([
    page.waitForResponse((res) => res.request().method() === "POST"),
    row.getByRole("button", { name: "Cancel referral" }).click(),
  ]);

  const cancelledReferral = await prisma.referral.findUniqueOrThrow({ where: { id: referral.id } });
  expect(cancelledReferral.status).toBe("CANCELLED");
  expect(cancelledReferral.cancellationReason).toBe("Suspected fraudulent referral activity");
  expect(cancelledReferral.cancelledBy).not.toBeNull();
  expect(cancelledReferral.cancelledAt).not.toBeNull();

  // Existing commission is untouched — Rule XXI, non-reversible.
  const untouchedCommission = await prisma.commission.findUniqueOrThrow({ where: { id: existingCommission!.id } });
  expect(untouchedCommission.status).toBe(existingCommission!.status);
  expect(Number(untouchedCommission.amount)).toBe(Number(existingCommission!.amount));

  // A second payment must no longer accrue commission for a cancelled referral.
  const secondPayment = await prisma.payment.create({
    data: {
      userPlanId: userPlan.id,
      idempotencyKey: `pw-cancel-2-${uniqueSuffix()}`,
      gatewayOrderId: `pw-cancel-2-order-${uniqueSuffix()}`,
      status: "SUCCESS",
      amount: userPlan.paymentAmount,
      method: "UPI",
      scheduledDate: new Date(),
      actualDate: new Date(),
    },
  });
  const secondCommission = await accrueReferralCommissionForPayment({
    referredUserId: referred.id,
    userPlanId: userPlan.id,
    paymentId: secondPayment.id,
    paymentAmount: Number(userPlan.paymentAmount),
    commissionPercent: 5,
  });
  expect(secondCommission).toBeNull();

  const audit = await prisma.auditLog.findFirst({
    where: { eventType: "REFERRAL_CANCELLED", entityRef: referral.id },
    orderBy: { timestamp: "desc" },
  });
  expect(audit).not.toBeNull();

  // BRD Rule XXI in full: the untouched, pre-cancellation commission must
  // still be payable — admin can approve/credit it, and the referrer can
  // withdraw it, exactly as if the referral had never been cancelled.
  await page.goto("/admin/commissions");
  const accruedRow = page.locator("li", { hasText: referred.email }).filter({ hasText: "cycle #1" });
  await expect(accruedRow).toBeVisible();
  await Promise.all([
    page.waitForResponse((res) => res.request().method() === "POST"),
    accruedRow.getByRole("button", { name: "Approve" }).click(),
  ]);

  let updatedCommission = await prisma.commission.findUniqueOrThrow({ where: { id: existingCommission!.id } });
  expect(updatedCommission.status).toBe("APPROVED");

  await page.reload();
  const approvedRow = page.locator("li", { hasText: referred.email }).filter({ hasText: "cycle #1" });
  await Promise.all([
    page.waitForResponse((res) => res.request().method() === "POST"),
    approvedRow.getByRole("button", { name: "Credit to ledger" }).click(),
  ]);

  updatedCommission = await prisma.commission.findUniqueOrThrow({ where: { id: existingCommission!.id } });
  expect(updatedCommission.status).toBe("AVAILABLE_FOR_WITHDRAWAL");
  expect(updatedCommission.creditDate).not.toBeNull();

  const referrerContext = await browser.newContext();
  const referrerPage = await referrerContext.newPage();
  await suppressPushOptIn(referrerPage);
  await loginViaUi(referrerPage, referrer.email, "Passw0rd!123");
  await referrerPage.waitForURL("**/dashboard");
  await referrerPage.goto("/dashboard/referrals");

  const withdrawSection = referrerPage.locator("section", {
    has: referrerPage.getByRole("heading", { name: "Available for withdrawal" }),
  });
  const withdrawRow = withdrawSection.locator("li", { hasText: "ONE_TIME" });
  await expect(withdrawRow).toBeVisible();
  await Promise.all([
    referrerPage.waitForResponse((res) => res.request().method() === "POST"),
    withdrawRow.getByRole("button", { name: "Withdraw" }).click(),
  ]);
  await referrerContext.close();

  const withdrawn = await prisma.commission.findUniqueOrThrow({ where: { id: existingCommission!.id } });
  expect(withdrawn.status).toBe("WITHDRAWN");
  expect(withdrawn.withdrawalDate).not.toBeNull();

  await prisma.commission.deleteMany({ where: { referralId: referral.id } });
  await prisma.payment.deleteMany({ where: { userPlanId: userPlan.id } });
  await prisma.userPlan.deleteMany({ where: { id: userPlan.id } });
  await prisma.referral.deleteMany({ where: { id: referral.id } });
});
