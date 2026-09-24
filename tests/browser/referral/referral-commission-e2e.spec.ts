import { test, expect, type Page } from "playwright/test";
import { subDays, subMonths } from "date-fns";
import { prisma, loginAsUser, loginAsAdmin, uniqueSuffix } from "../../helpers";
import { createUser, createPlan, runAutoPayNow, TEST_PASSWORD } from "../fixtures";

// TEST_SCENARIOS.md referral/commission sections; BRD Rules XI-XIII,
// XXII-XXVI. Supersedes referral-and-commission.spec.ts: its first two tests
// (own referral code + share link display, registering with a code creates a
// real Referral relationship visible on the referrer's page) are folded into
// this file's setup steps below, and its third test (an ACCRUED commission
// pushed through APPROVED -> CREDITED via Prisma-seeded data) is replaced by
// a genuine referrer-driven-registration -> real-payment-cycles -> accrue ->
// approve -> credit -> withdraw chain, verified end-to-end through the real
// UI and exercising the recurring commission cycle-length rule
// (COMMISSION_RECURRING_CYCLE_LENGTH, src/lib/config.ts, default 4) that the
// original test never touched.
test.describe.configure({ mode: "serial" });

test.afterAll(async () => {
  await prisma.$disconnect();
});

// See admin-notifications.spec.ts / redemption-course-reward-points-e2e.spec.ts
// for the diagnosed reason this is needed: on this spec's accumulated dev
// database, /admin/commissions can grow long enough that the fixed-position
// PushOptIn "Enable notifications" banner intercepts clicks on this test's
// target row, and Playwright's click() retries actionability indefinitely
// (no actionTimeout configured) rather than throwing — silently hanging
// until the outer test timeout.
async function suppressPushOptIn(page: Page) {
  await page.addInitScript(() => sessionStorage.setItem("push-opt-in-dismissed", "1"));
}

async function registerReferredUser(page: Page, referralCode: string) {
  const email = `pw-referred-${uniqueSuffix()}@example.com`;
  await page.goto(`/register?ref=${referralCode}`);
  await expect(page.locator('input[name="referralCode"]')).toHaveValue(referralCode);
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(TEST_PASSWORD);
  await Promise.all([
    page.waitForResponse((res) => res.request().method() === "POST"),
    page.getByRole("button", { name: "Register" }).click(),
  ]);
  await page.waitForURL("**/dashboard");
  return email;
}

async function subscribeToPlan(page: Page, planId: string, amount: number) {
  await page.goto(`/plans/${planId}/subscribe`);
  await page.locator('select[name="amount"]').selectOption(String(amount));
  await Promise.all([
    page.waitForResponse((res) => res.request().method() === "POST"),
    page.getByRole("button", { name: "Confirm & Set Up AutoPay" }).click(),
  ]);
  await page.waitForURL("**/dashboard");
}

/**
 * findDuePlans() (src/lib/autopay-scheduler.ts) anchors the next due date on
 * the most recent resolved Payment's createdAt (or startDate if none exist
 * yet). Backdating that Payment by just over a month makes the userPlan due
 * again on the next runAutoPayNow() click, simulating the next monthly
 * cycle without waiting a real month.
 */
async function backdateLatestPayment(userPlanId: string) {
  const latest = await prisma.payment.findFirstOrThrow({
    where: { userPlanId },
    orderBy: { createdAt: "desc" },
  });
  await prisma.payment.update({
    where: { id: latest.id },
    data: { createdAt: subDays(subMonths(new Date(), 1), 1) },
  });
}

test("BRD Rules XI-XIII/XXII-XXVI: referral registration through 4 payment cycles accrues ONE_TIME then RECURRING commission, which admin approves, credits, and the referrer withdraws", async ({ page, browser }) => {
  // This test's two-session, 4-payment-cycle, approve/credit/withdraw chain is
  // the longest single flow in the suite; with the global slowMo the default
  // 60s timeout is no longer enough (see account-lock-e2e.spec.ts for the
  // same rationale on a similarly long flow).
  test.setTimeout(180_000);

  const { user: referrer } = await createUser();
  // commissionPercent 10 on a fixed 1000 preset amount gives a deterministic
  // ₹100 commission per accrual event.
  const plan = await createPlan({ presetAmounts: [1000], commissionPercent: 10 });

  const referrerContext = await browser.newContext();
  const referrerPage = await referrerContext.newPage();
  await suppressPushOptIn(referrerPage);
  await loginAsUser(referrerPage, referrer.email, TEST_PASSWORD);
  await referrerPage.waitForURL("**/dashboard");
  await referrerPage.goto("/dashboard/referrals");

  // Folded in from referral-and-commission.spec.ts's first test.
  await expect(referrerPage.getByText("Your referral code", { exact: true })).toBeVisible();
  await expect(referrerPage.getByText(referrer.referralCode).first()).toBeVisible();
  await expect(referrerPage.getByText(new RegExp(`ref=${referrer.referralCode}`))).toBeVisible();

  // Folded in from referral-and-commission.spec.ts's second test: a real
  // registration through the UI, not a Prisma-seeded Referral row.
  const referredEmail = await registerReferredUser(page, referrer.referralCode);

  const referredUser = await prisma.user.findUniqueOrThrow({ where: { email: referredEmail } });
  const referral = await prisma.referral.findUniqueOrThrow({ where: { referredUserId: referredUser.id } });
  expect(referral.referrerUserId).toBe(referrer.id);
  expect(referral.status).toBe("ACTIVE");

  await referrerPage.reload();
  await expect(referrerPage.getByText(referredEmail)).toBeVisible();

  // Subscribing immediately triggers and completes payment #1
  // (subscribeToPlanAction calls processScheduledPayment synchronously),
  // which is payment sequence 1 -> a ONE_TIME commission accrual.
  await subscribeToPlan(page, plan.id, 1000);

  const userPlan = await prisma.userPlan.findFirstOrThrow({ where: { userId: referredUser.id, planId: plan.id } });

  const oneTimeCommission = await prisma.commission.findFirstOrThrow({ where: { referralId: referral.id } });
  expect(oneTimeCommission.commissionType).toBe("ONE_TIME");
  expect(oneTimeCommission.cyclePosition).toBe(1);
  expect(Number(oneTimeCommission.amount)).toBe(100);
  expect(oneTimeCommission.status).toBe("ACCRUED");

  const adminContext = await browser.newContext();
  const adminPage = await adminContext.newPage();
  await suppressPushOptIn(adminPage);
  await loginAsAdmin(adminPage);
  await adminPage.waitForURL("**/admin");

  // Payment sequences 2 and 3 are neither the first payment nor a multiple
  // of the default COMMISSION_RECURRING_CYCLE_LENGTH (4, src/lib/config.ts)
  // -> no new Commission row on either cycle.
  for (const cycle of [2, 3]) {
    await backdateLatestPayment(userPlan.id);
    await runAutoPayNow(adminPage);
    const commissions = await prisma.commission.findMany({ where: { referralId: referral.id } });
    expect(commissions, `no new commission should accrue on payment sequence ${cycle}`).toHaveLength(1);
  }

  // Payment sequence 4 is a multiple of the cycle length -> a RECURRING
  // commission accrues.
  await backdateLatestPayment(userPlan.id);
  await runAutoPayNow(adminPage);

  const recurringCommission = await prisma.commission.findFirstOrThrow({
    where: { referralId: referral.id, commissionType: "RECURRING" },
  });
  expect(recurringCommission.cyclePosition).toBe(4);
  expect(Number(recurringCommission.amount)).toBe(100);
  expect(recurringCommission.status).toBe("ACCRUED");

  await adminPage.goto("/admin/commissions");
  const accruedRow = adminPage.locator("li", { hasText: referredEmail }).filter({ hasText: "cycle #4" });
  await expect(accruedRow).toBeVisible();
  await Promise.all([
    adminPage.waitForResponse((res) => res.request().method() === "POST"),
    accruedRow.getByRole("button", { name: "Approve" }).click(),
  ]);

  let updatedCommission = await prisma.commission.findUniqueOrThrow({ where: { id: recurringCommission.id } });
  expect(updatedCommission.status).toBe("APPROVED");

  await adminPage.reload();
  const approvedRow = adminPage.locator("li", { hasText: referredEmail }).filter({ hasText: "cycle #4" });
  await Promise.all([
    adminPage.waitForResponse((res) => res.request().method() === "POST"),
    approvedRow.getByRole("button", { name: "Credit to ledger" }).click(),
  ]);

  // The app deliberately merges CREDITED and AVAILABLE_FOR_WITHDRAWAL into
  // one transition (src/app/admin/commissions/actions.ts) — this is the real
  // end state, not an intermediate CREDITED status.
  updatedCommission = await prisma.commission.findUniqueOrThrow({ where: { id: recurringCommission.id } });
  expect(updatedCommission.status).toBe("AVAILABLE_FOR_WITHDRAWAL");
  expect(updatedCommission.creditDate).not.toBeNull();

  const ledgerEntry = await prisma.ledgerEntry.findFirstOrThrow({
    where: { userId: referrer.id, transactionType: "COMMISSION" },
  });
  expect(Number(ledgerEntry.amount)).toBe(100);

  const notification = await prisma.notification.findFirstOrThrow({
    where: { userId: referrer.id, type: "REFERRAL_EARNED", title: "Referral commission credited" },
  });
  expect(notification.message).toContain("₹100.00");

  // Final business outcome verified from the referrer's own session: the
  // credited commission is listed as withdrawable, and withdrawing it moves
  // its status to WITHDRAWN.
  await referrerPage.reload();
  const withdrawSection = referrerPage.locator("section", { has: referrerPage.getByRole("heading", { name: "Available for withdrawal" }) });
  const withdrawRow = withdrawSection.locator("li", { hasText: "RECURRING" });
  await expect(withdrawRow).toBeVisible();
  await Promise.all([
    referrerPage.waitForResponse((res) => res.request().method() === "POST"),
    withdrawRow.getByRole("button", { name: "Withdraw" }).click(),
  ]);

  const withdrawn = await prisma.commission.findUniqueOrThrow({ where: { id: recurringCommission.id } });
  expect(withdrawn.status).toBe("WITHDRAWN");
  expect(withdrawn.withdrawalDate).not.toBeNull();

  await referrerContext.close();
  await adminContext.close();
});

test("BRD Rule XXII: a ONE_TIME commission from the first payment does not accrue again on a later payment cycle that isn't a recurring cycle point", async ({ page, browser }) => {
  const { user: referrer } = await createUser();
  const plan = await createPlan({ presetAmounts: [1000], commissionPercent: 10 });

  const referredEmail = await registerReferredUser(page, referrer.referralCode);
  const referredUser = await prisma.user.findUniqueOrThrow({ where: { email: referredEmail } });
  const referral = await prisma.referral.findUniqueOrThrow({ where: { referredUserId: referredUser.id } });

  await subscribeToPlan(page, plan.id, 1000);
  const userPlan = await prisma.userPlan.findFirstOrThrow({ where: { userId: referredUser.id, planId: plan.id } });

  const firstCommission = await prisma.commission.findFirstOrThrow({ where: { referralId: referral.id } });
  expect(firstCommission.commissionType).toBe("ONE_TIME");
  expect(firstCommission.cyclePosition).toBe(1);

  const adminContext = await browser.newContext();
  const adminPage = await adminContext.newPage();
  await suppressPushOptIn(adminPage);
  await loginAsAdmin(adminPage);
  await adminPage.waitForURL("**/admin");

  // Payment sequence 2: not the first payment, not a multiple of the
  // recurring cycle length -> the ONE_TIME commission must not repeat and no
  // new commission should be created.
  await backdateLatestPayment(userPlan.id);
  await runAutoPayNow(adminPage);

  const commissions = await prisma.commission.findMany({ where: { referralId: referral.id } });
  expect(commissions).toHaveLength(1);
  expect(commissions[0]!.id).toBe(firstCommission.id);

  await adminContext.close();
});
