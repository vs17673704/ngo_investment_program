import { test, expect } from "playwright/test";
import bcrypt from "bcryptjs";
import { subDays } from "date-fns";
import { prisma, loginViaUi } from "../../helpers";

// Design.md 3.5: the Referrals page must show summary metrics (accrued,
// approved, credited, withdrawn, pending, total earned, upcoming), an
// expiry date per referred user, a per-referred-user commission history, and
// plan-level upcoming-commission detail for active plans.
test.describe.configure({ mode: "serial" });

test.afterAll(async () => {
  await prisma.$disconnect();
});

function uniqueSuffix() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

test("Design 3.5: Referrals page shows summary metrics, per-referred-user commission history, and upcoming plan-level commission", async ({ page }) => {
  const plan = await prisma.plan.findUniqueOrThrow({
    where: { id: "seed-plan-basic" },
    include: { interestMethod: true },
  });
  const passwordHash = await bcrypt.hash("Passw0rd!123", 10);

  const referrer = await prisma.user.create({
    data: {
      email: `pw-detail-referrer-${uniqueSuffix()}@example.com`,
      passwordHash,
      referralCode: `PWE${uniqueSuffix().replace(/[^a-zA-Z0-9]/g, "").toUpperCase().slice(-7)}`,
      role: "USER",
      isEmailVerified: true,
    },
  });
  const referred = await prisma.user.create({
    data: {
      email: `pw-detail-referred-${uniqueSuffix()}@example.com`,
      passwordHash,
      referralCode: `PWF${uniqueSuffix().replace(/[^a-zA-Z0-9]/g, "").toUpperCase().slice(-7)}`,
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
      commissionPercentSnapshot: 5,
      paymentAmount: 1000,
      paymentFrequency: plan.paymentFrequency,
      status: "ACTIVE",
      startDate: new Date(),
      maturityDate: subDays(new Date(), -plan.tenureMonths * 30),
    },
  });
  const commission = await prisma.commission.create({
    data: {
      referralId: referral.id,
      userPlanId: userPlan.id,
      amount: 50,
      status: "ACCRUED",
      commissionType: "ONE_TIME",
    },
  });

  await loginViaUi(page, referrer.email, "Passw0rd!123");
  await page.waitForURL("**/dashboard");
  await page.goto("/dashboard/referrals");

  await expect(page.getByText("Total Commission Accrued")).toBeVisible();
  await expect(page.getByText("Total Pending Commission")).toBeVisible();
  await expect(page.getByText("Upcoming commission from active plans")).toBeVisible();

  await expect(page.getByText(referred.email)).toBeVisible();
  await expect(page.getByText("Commission history")).toBeVisible();
  await expect(page.getByText(plan.name).first()).toBeVisible();
  await expect(page.getByText("Upcoming eligible commission")).toBeVisible();
  // 5% of the 1000 next-instalment amount = 50.00
  await expect(page.getByText("₹50.00").first()).toBeVisible();

  await prisma.commission.deleteMany({ where: { id: commission.id } });
  await prisma.userPlan.deleteMany({ where: { id: userPlan.id } });
  await prisma.referral.deleteMany({ where: { id: referral.id } });
});
