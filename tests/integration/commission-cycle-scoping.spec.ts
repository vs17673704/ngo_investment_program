import { test, expect } from "playwright/test";
import bcrypt from "bcryptjs";
import { subDays } from "date-fns";
import { prisma } from "../helpers";
import { accrueReferralCommissionForPayment } from "../../src/lib/commission-engine";

// BRD Rule IX / XXXII: the commission cycle (first payment + every Nth
// consecutive successful payment) is scoped to the referred user's payments
// *under the applicable plan*, not pooled across all of the referred user's
// plans. Regression test for the commission-engine.ts fix that scopes the
// prior-successful-payment count by userPlanId instead of by userId.
//
// Relocated here from tests/browser/referral/ (Phase D, per plan.md): this
// test drives no UI at all (no `page` fixture used anywhere below) — it
// exercises accrueReferralCommissionForPayment directly against Prisma-seeded
// data, so it belongs alongside the other non-UI engine-level regression
// tests rather than the browser E2E suite.
test.describe.configure({ mode: "serial" });

test.afterAll(async () => {
  await prisma.$disconnect();
});

function uniqueSuffix() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

test("BRD Rule IX/XXXII: a referred user's first payment on a second plan still counts as that plan's own first payment", async () => {
  const plan = await prisma.plan.findUniqueOrThrow({
    where: { id: "seed-plan-basic" },
    include: { interestMethod: true },
  });
  const passwordHash = await bcrypt.hash("Passw0rd!123", 10);

  const referrer = await prisma.user.create({
    data: {
      email: `pw-cyc-referrer-${uniqueSuffix()}@example.com`,
      passwordHash,
      referralCode: `PWA${uniqueSuffix().replace(/[^a-zA-Z0-9]/g, "").toUpperCase().slice(-7)}`,
      role: "USER",
      isEmailVerified: true,
    },
  });
  const referred = await prisma.user.create({
    data: {
      email: `pw-cyc-referred-${uniqueSuffix()}@example.com`,
      passwordHash,
      referralCode: `PWB${uniqueSuffix().replace(/[^a-zA-Z0-9]/g, "").toUpperCase().slice(-7)}`,
      role: "USER",
      isEmailVerified: true,
    },
  });
  await prisma.referral.create({
    data: {
      referrerUserId: referrer.id,
      referredUserId: referred.id,
      referralCodeUsed: referrer.referralCode,
      status: "ACTIVE",
      expiryDate: subDays(new Date(), -365),
    },
  });

  async function createPlanWithSuccessfulPayment() {
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
    const payment = await prisma.payment.create({
      data: {
        userPlanId: userPlan.id,
        idempotencyKey: `pw-cyc-${uniqueSuffix()}`,
        gatewayOrderId: `pw-cyc-order-${uniqueSuffix()}`,
        status: "SUCCESS",
        amount: userPlan.paymentAmount,
        method: "UPI",
        scheduledDate: new Date(),
        actualDate: new Date(),
      },
    });
    return { userPlan, payment };
  }

  // Plan A: the referred user's first-ever successful payment overall.
  const planA = await createPlanWithSuccessfulPayment();
  const commissionA = await accrueReferralCommissionForPayment({
    referredUserId: referred.id,
    userPlanId: planA.userPlan.id,
    paymentId: planA.payment.id,
    paymentAmount: Number(planA.userPlan.paymentAmount),
    commissionPercent: 5,
  });
  expect(commissionA?.cyclePosition).toBe(1);
  expect(commissionA?.commissionType).toBe("ONE_TIME");

  // Plan B: a second, independent plan for the same referred user. Its own
  // first successful payment must still be treated as cyclePosition 1 for
  // that plan — not sequence 2 pooled across the user's plans.
  const planB = await createPlanWithSuccessfulPayment();
  const commissionB = await accrueReferralCommissionForPayment({
    referredUserId: referred.id,
    userPlanId: planB.userPlan.id,
    paymentId: planB.payment.id,
    paymentAmount: Number(planB.userPlan.paymentAmount),
    commissionPercent: 5,
  });
  expect(commissionB).not.toBeNull();
  expect(commissionB?.cyclePosition).toBe(1);
  expect(commissionB?.commissionType).toBe("ONE_TIME");
  expect(commissionB?.userPlanId).toBe(planB.userPlan.id);

  await prisma.commission.deleteMany({ where: { referralId: commissionA!.referralId } });
  await prisma.payment.deleteMany({ where: { userPlanId: { in: [planA.userPlan.id, planB.userPlan.id] } } });
  await prisma.userPlan.deleteMany({ where: { userId: referred.id } });
});
