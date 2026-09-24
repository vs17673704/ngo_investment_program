import { test, expect, type Page } from "playwright/test";
import bcrypt from "bcryptjs";
import { subMonths, subDays } from "date-fns";
import { prisma, loginViaUi } from "../../helpers";
import { getAvailableMargin } from "../../../src/lib/redemption-engine";

// BRD Rule III (Plan Discontinuation): "When an Admin discontinues a plan,
// existing users enrolled in that plan shall continue... The Plan shall move
// to DISCONTINUED status for existing enrolled users." Regression test for
// the cascade in src/app/admin/plans/actions.ts's togglePlanStatusAction,
// which previously only flipped the master Plan.status and never touched
// any enrolled UserPlan row (UserPlanStatus.DISCONTINUED was unreachable).
test.describe.configure({ mode: "serial" });

test.afterAll(async () => {
  await prisma.$disconnect();
});

function uniqueSuffix() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

// See admin-notifications.spec.ts / referral-commission-e2e.spec.ts for the
// diagnosed reason this is needed: on this spec's accumulated dev database,
// admin list pages can grow long enough that the fixed-position PushOptIn
// "Enable notifications" banner intercepts clicks on this test's target row.
async function suppressPushOptIn(page: Page) {
  await page.addInitScript(() => sessionStorage.setItem("push-opt-in-dismissed", "1"));
}

test("BRD Rule III: discontinuing a Plan moves its enrolled ACTIVE UserPlans to DISCONTINUED, and reactivating reverses them", async ({ page }) => {
  const basePlan = await prisma.plan.findUniqueOrThrow({
    where: { id: "seed-plan-basic" },
    include: { interestMethod: true },
  });

  const plan = await prisma.plan.create({
    data: {
      name: `Discontinuation Test Plan ${uniqueSuffix()}`,
      tenureMonths: basePlan.tenureMonths,
      paymentFrequency: basePlan.paymentFrequency,
      presetAmounts: basePlan.presetAmounts,
      interestMethodId: basePlan.interestMethodId,
      rewardPercent: basePlan.rewardPercent,
      commissionPercent: basePlan.commissionPercent,
    },
  });

  const passwordHash = await bcrypt.hash("Passw0rd!123", 10);
  const user = await prisma.user.create({
    data: {
      email: `pw-discontinue-${uniqueSuffix()}@example.com`,
      passwordHash,
      referralCode: `PWQ${uniqueSuffix().replace(/[^a-zA-Z0-9]/g, "").toUpperCase().slice(-7)}`,
      role: "USER",
      isEmailVerified: true,
    },
  });

  const startDate = subMonths(new Date(), 1);
  const enrolledUserPlan = await prisma.userPlan.create({
    data: {
      userId: user.id,
      planId: plan.id,
      interestMethodId: plan.interestMethodId,
      interestMethodVersion: basePlan.interestMethod.version,
      rewardPercentSnapshot: plan.rewardPercent,
      commissionPercentSnapshot: plan.commissionPercent,
      paymentAmount: Number(plan.presetAmounts[0]),
      paymentFrequency: plan.paymentFrequency,
      status: "ACTIVE",
      startDate,
      maturityDate: subMonths(new Date(), -plan.tenureMonths),
    },
  });
  // A MATURED plan on the same discontinued Plan template must never be
  // touched by the cascade — only ACTIVE enrolments transition.
  const maturedUserPlan = await prisma.userPlan.create({
    data: {
      userId: user.id,
      planId: plan.id,
      interestMethodId: plan.interestMethodId,
      interestMethodVersion: basePlan.interestMethod.version,
      rewardPercentSnapshot: plan.rewardPercent,
      commissionPercentSnapshot: plan.commissionPercent,
      paymentAmount: Number(plan.presetAmounts[0]),
      paymentFrequency: plan.paymentFrequency,
      status: "MATURED",
      startDate: subMonths(new Date(), 20),
      maturityDate: subMonths(new Date(), 1),
    },
  });

  await loginViaUi(page, "admin@demo.local", "Admin@1234");
  await page.waitForURL("**/admin");
  await page.goto("/admin/plans");

  const row = page.locator("tr", { has: page.getByText(plan.name) });
  await expect(row).toBeVisible();
  await Promise.all([
    page.waitForResponse((res) => res.request().method() === "POST"),
    row.getByRole("button", { name: "Discontinue" }).click(),
  ]);

  const discontinuedPlan = await prisma.plan.findUniqueOrThrow({ where: { id: plan.id } });
  expect(discontinuedPlan.status).toBe("DISCONTINUED");

  const activeCascaded = await prisma.userPlan.findUniqueOrThrow({ where: { id: enrolledUserPlan.id } });
  expect(activeCascaded.status).toBe("DISCONTINUED");
  const maturedUnaffected = await prisma.userPlan.findUniqueOrThrow({ where: { id: maturedUserPlan.id } });
  expect(maturedUnaffected.status).toBe("MATURED");

  // Reactivating the Plan reverses only the UserPlan the cascade discontinued.
  await page.goto("/admin/plans");
  const rowAfter = page.locator("tr", { has: page.getByText(plan.name) });
  await Promise.all([
    page.waitForResponse((res) => res.request().method() === "POST"),
    rowAfter.getByRole("button", { name: "Reactivate" }).click(),
  ]);

  const reactivatedPlan = await prisma.plan.findUniqueOrThrow({ where: { id: plan.id } });
  expect(reactivatedPlan.status).toBe("ACTIVE");
  const reactivatedUserPlan = await prisma.userPlan.findUniqueOrThrow({ where: { id: enrolledUserPlan.id } });
  expect(reactivatedUserPlan.status).toBe("ACTIVE");
  const stillMatured = await prisma.userPlan.findUniqueOrThrow({ where: { id: maturedUserPlan.id } });
  expect(stillMatured.status).toBe("MATURED");

  await prisma.userPlan.deleteMany({ where: { planId: plan.id } });
  await prisma.plan.delete({ where: { id: plan.id } });
});

test("BRD Rule III/XXXI: the enrolled user's own dashboard observes the DISCONTINUED -> MATURED transition, and the unlocked balance can then trigger a shortfall redemption", async ({ page, browser }) => {
  const basePlan = await prisma.plan.findUniqueOrThrow({
    where: { id: "seed-plan-basic" },
    include: { interestMethod: true },
  });

  const plan = await prisma.plan.create({
    data: {
      name: `Discontinuation Cascade Test Plan ${uniqueSuffix()}`,
      tenureMonths: basePlan.tenureMonths,
      paymentFrequency: basePlan.paymentFrequency,
      presetAmounts: basePlan.presetAmounts,
      interestMethodId: basePlan.interestMethodId,
      rewardPercent: basePlan.rewardPercent,
      commissionPercent: basePlan.commissionPercent,
    },
  });

  const passwordHash = await bcrypt.hash("Passw0rd!123", 10);
  const user = await prisma.user.create({
    data: {
      email: `pw-discontinue-cascade-${uniqueSuffix()}@example.com`,
      passwordHash,
      referralCode: `PWZ${uniqueSuffix().replace(/[^a-zA-Z0-9]/g, "").toUpperCase().slice(-7)}`,
      role: "USER",
      isEmailVerified: true,
    },
  });

  await suppressPushOptIn(page);
  await loginViaUi(page, user.email, "Passw0rd!123");
  await page.waitForURL("**/dashboard");

  // Subscribing immediately triggers a real first payment (subscribeToPlanAction
  // calls processScheduledPayment synchronously) -> a genuine PLAN_PAYMENT
  // ledger credit and a locked principal, not a Prisma-seeded shortcut.
  const amount = Number(plan.presetAmounts[0]);
  await page.goto(`/plans/${plan.id}/subscribe`);
  await page.locator('select[name="amount"]').selectOption(String(amount));
  await Promise.all([
    page.waitForResponse((res) => res.request().method() === "POST"),
    page.getByRole("button", { name: "Confirm & Set Up AutoPay" }).click(),
  ]);
  await page.waitForURL("**/dashboard");

  const userPlan = await prisma.userPlan.findFirstOrThrow({ where: { userId: user.id, planId: plan.id } });
  expect(userPlan.status).toBe("ACTIVE");
  expect(Number(userPlan.principalPaid)).toBe(amount);

  const adminContext = await browser.newContext();
  const adminPage = await adminContext.newPage();
  await suppressPushOptIn(adminPage);
  await loginViaUi(adminPage, "admin@demo.local", "Admin@1234");
  await adminPage.waitForURL("**/admin");
  await adminPage.goto("/admin/plans");

  const planRow = adminPage.locator("tr", { has: adminPage.getByText(plan.name) });
  await expect(planRow).toBeVisible();
  await Promise.all([
    adminPage.waitForResponse((res) => res.request().method() === "POST"),
    planRow.getByRole("button", { name: "Discontinue" }).click(),
  ]);

  const discontinuedUserPlan = await prisma.userPlan.findUniqueOrThrow({ where: { id: userPlan.id } });
  expect(discontinuedUserPlan.status).toBe("DISCONTINUED");

  // Principal is still locked while DISCONTINUED (BRD Rule III) -> no margin yet.
  expect(await getAvailableMargin(user.id)).toBe(0);

  await page.reload();
  const planCard = page.locator("article", { hasText: plan.name });
  await expect(planCard.getByText("DISCONTINUED", { exact: true })).toBeVisible();

  // Backdate maturityDate so the next maturity-check batch picks this plan up,
  // mirroring the established backdate-then-click-the-admin-simulator pattern
  // used throughout this suite for time-dependent flows (e.g.
  // referral-commission-e2e.spec.ts's backdateLatestPayment).
  await prisma.userPlan.update({ where: { id: userPlan.id }, data: { maturityDate: subDays(new Date(), 1) } });

  await adminPage.goto("/admin/payments");
  await Promise.all([
    adminPage.waitForResponse((res) => res.request().method() === "POST"),
    adminPage.getByRole("button", { name: "Run plan maturity check now" }).click(),
  ]);

  const maturedUserPlan = await prisma.userPlan.findUniqueOrThrow({ where: { id: userPlan.id } });
  expect(maturedUserPlan.status).toBe("MATURED");

  await page.reload();
  await expect(planCard.getByText("MATURED", { exact: true })).toBeVisible();
  await expect(planCard.getByRole("link", { name: /Redeem or Reinvest/ })).toBeVisible();

  // Maturity unlocks the principal (plus any posted interest) into the
  // redeemable balance (BRD Rule XXXI) — read the real, unlocked margin
  // rather than hardcoding a value that depends on the interest formula, then
  // deliberately request more than it to trigger a shortfall.
  const unlockedMargin = await getAvailableMargin(user.id);
  expect(unlockedMargin).toBeGreaterThan(0);
  const requestedAmount = unlockedMargin + 5000;

  await page.goto("/dashboard/redeem/refund");
  await page.locator('input[name="amount"]').fill(String(requestedAmount));
  await Promise.all([
    page.waitForResponse((res) => res.request().method() === "POST"),
    page.getByRole("button", { name: "Submit request" }).click(),
  ]);
  await page.waitForURL("**/dashboard/redeem");

  const request = await prisma.redemptionRequest.findFirstOrThrow({
    where: { userId: user.id, category: "REFUND" },
  });
  expect(request.status).toBe("AWAITING_SHORTFALL_RESOLUTION");
  expect(Number(request.shortfallAmount)).toBe(5000);
  expect(Number(request.availableMarginAtRequest)).toBe(unlockedMargin);

  await adminPage.goto("/admin/redemptions");
  const redemptionRow = adminPage.locator("li", { has: adminPage.getByText(user.email) });
  await expect(redemptionRow).toBeVisible();
  await expect(redemptionRow.getByRole("button", { name: "Approve" })).toBeDisabled();
  await Promise.all([
    adminPage.waitForResponse((res) => res.request().method() === "POST"),
    (async () => {
      await redemptionRow.locator('input[name="reference"]').fill("BANK-TXN-CASCADE-1");
      await redemptionRow.getByRole("button", { name: "Verify shortfall" }).click();
    })(),
  ]);

  await adminPage.reload();
  const verifiedRow = adminPage.locator("li", { has: adminPage.getByText(user.email) });
  await Promise.all([
    adminPage.waitForResponse((res) => res.request().method() === "POST"),
    verifiedRow.getByRole("button", { name: "Approve" }).click(),
  ]);

  const approved = await prisma.redemptionRequest.findUniqueOrThrow({ where: { id: request.id } });
  expect(approved.status).toBe("APPROVED");

  const ledgerEntry = await prisma.ledgerEntry.findFirstOrThrow({
    where: { userId: user.id, transactionType: "REDEMPTION_REFUND" },
  });
  expect(Number(ledgerEntry.amount)).toBe(-unlockedMargin);

  // Final business outcome verified from the user's own session.
  await page.goto("/dashboard/redeem");
  await expect(page.getByText("APPROVED").first()).toBeVisible();

  await adminContext.close();
  await prisma.redemptionStatusEvent.deleteMany({ where: { redemptionRequestId: request.id } });
  await prisma.redemptionRequest.deleteMany({ where: { id: request.id } });
  await prisma.ledgerEntry.deleteMany({ where: { userId: user.id } });
  const payments = await prisma.payment.findMany({ where: { userPlanId: userPlan.id }, select: { id: true } });
  await prisma.paymentEvent.deleteMany({ where: { paymentId: { in: payments.map((p) => p.id) } } });
  await prisma.payment.deleteMany({ where: { userPlanId: userPlan.id } });
  await prisma.paymentMandate.deleteMany({ where: { userPlanId: userPlan.id } });
  await prisma.userPlan.deleteMany({ where: { id: userPlan.id } });
  await prisma.plan.delete({ where: { id: plan.id } });
});
