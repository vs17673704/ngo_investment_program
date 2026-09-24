import { test, expect, type Page } from "playwright/test";
import { subDays } from "date-fns";
import { prisma, loginViaUi } from "../../helpers";
import { createDuePaymentMandate, runAutoPayNow, runRetriesNow, runMaturityCheckNow } from "../fixtures";
import { calculateInterest } from "../../../src/lib/interest-engine";

// BRD Rule XXVII / "Handling Missed Instalments": a missed instalment (all
// retries + grace period exhausted, manual fallback window lapsed) must
// never cancel or suspend the Plan — it matures on schedule regardless, and
// the maturity interest/settlement is computed strictly pro-rata from the
// amount actually received (principalPaid), never the full intended
// principal. IMPORTANT, confirmed by direct code reading of
// runMaturityTransitions() (src/lib/interest-engine.ts): there is no
// dedicated "reduce remainingUnpaidPrincipal by the missed amount, floored
// at 0" write-off step anywhere in the app — remainingUnpaidPrincipal is
// only ever decremented by postSuccessfulPayment on a successful payment, so
// a missed instalment simply never decrements it further. This test
// therefore asserts what the app actually and verifiably does (pro-rata
// interest on principalPaid, MATURED despite remainingUnpaidPrincipal > 0,
// no distinct "missed instalment" UI state) rather than a write-off bookkeeping
// step that has no implementation to exercise.
test.describe.configure({ mode: "serial" });

test.afterAll(async () => {
  await prisma.$disconnect();
});

// See admin-notifications.spec.ts / referral-commission-e2e.spec.ts for the
// diagnosed reason this is needed: on this spec's accumulated dev database,
// admin list pages can grow long enough that the fixed-position PushOptIn
// "Enable notifications" banner intercepts clicks on this test's target row.
async function suppressPushOptIn(page: Page) {
  await page.addInitScript(() => sessionStorage.setItem("push-opt-in-dismissed", "1"));
}

test("a plan with one missed (unrecovered) instalment still matures on schedule, with interest credited pro-rata on the principal actually received", async ({ page, browser }) => {
  test.setTimeout(120_000);

  // --- Missed-instalment plan: one charge that goes unrecovered all the way
  // through retries/grace/manual-window expiry. ---
  const missed = await createDuePaymentMandate();

  const adminContext = await browser.newContext();
  const adminPage = await adminContext.newPage();
  await suppressPushOptIn(adminPage);
  await loginViaUi(adminPage, "admin@demo.local", "Admin@1234");
  await adminPage.waitForURL("**/admin");

  // AutoPay fails at the gateway, then drive it straight to the terminal
  // FAILED state via the grace-period exit condition, then let the manual
  // fallback window itself lapse — the same proven pattern as
  // payment-retry-e2e.spec.ts's second test, just without ever recovering.
  // The control plan's due mandate is deliberately created only AFTER this
  // is fully resolved: runDueAutoPayCharges (src/lib/autopay-scheduler.ts)
  // batches every ACTIVE due UserPlan under one shared forceOutcome per call
  // — creating both fixtures up front would sweep the control plan's charge
  // into this same FAILED batch, corrupting the control case entirely.
  await runAutoPayNow(adminPage, { forceOutcome: "FAILED" });
  const missedPayment = await prisma.payment.findFirstOrThrow({ where: { userPlanId: missed.userPlan.id } });
  await prisma.payment.update({
    where: { id: missedPayment.id },
    data: { gracePeriodEndsAt: new Date(0), nextRetryAt: new Date(0) },
  });
  await runRetriesNow(adminPage, { forceOutcome: "FAILED" });
  const missedFailed = await prisma.payment.findUniqueOrThrow({ where: { id: missedPayment.id } });
  expect(missedFailed.status).toBe("FAILED");
  await prisma.payment.update({ where: { id: missedFailed.id }, data: { manualWindowEndsAt: new Date(0) } });

  // --- Control plan: identical setup, but its instalment succeeds, so the
  // pro-rata difference in credited interest is directly demonstrated.
  // Created now (missed plan's payment is FAILED with an already-expired
  // manual window, so findDuePlans() no longer considers it "due" and won't
  // sweep it into this next batch). ---
  const control = await createDuePaymentMandate();
  await runAutoPayNow(adminPage, { forceOutcome: "SUCCESS" });
  const controlPayment = await prisma.payment.findFirstOrThrow({ where: { userPlanId: control.userPlan.id } });
  expect(controlPayment.status).toBe("SUCCESS");

  const missedPlanBeforeMaturity = await prisma.userPlan.findUniqueOrThrow({ where: { id: missed.userPlan.id } });
  const controlPlanBeforeMaturity = await prisma.userPlan.findUniqueOrThrow({ where: { id: control.userPlan.id } });
  // The unrecovered missed instalment never increased principalPaid; the
  // control plan's successful charge did.
  expect(Number(missedPlanBeforeMaturity.principalPaid)).toBe(0);
  expect(Number(controlPlanBeforeMaturity.principalPaid)).toBe(Number(control.userPlan.paymentAmount));
  // remainingUnpaidPrincipal is confirmed to have no dedicated missed-instalment
  // write-off step — it is untouched by the missed cycle (still the full
  // amount*tenureMonths from subscription), and only decremented by an actual
  // successful payment.
  expect(Number(missedPlanBeforeMaturity.remainingUnpaidPrincipal)).toBe(
    Number(missed.userPlan.remainingUnpaidPrincipal),
  );
  expect(Number(controlPlanBeforeMaturity.remainingUnpaidPrincipal)).toBe(
    Number(control.userPlan.remainingUnpaidPrincipal) - Number(control.userPlan.paymentAmount),
  );

  // Force both plans' maturityDate into the past so the batch job picks them up.
  await prisma.userPlan.update({ where: { id: missed.userPlan.id }, data: { maturityDate: subDays(new Date(), 1) } });
  await prisma.userPlan.update({ where: { id: control.userPlan.id }, data: { maturityDate: subDays(new Date(), 1) } });

  await runMaturityCheckNow(adminPage);

  const missedMatured = await prisma.userPlan.findUniqueOrThrow({
    where: { id: missed.userPlan.id },
    include: { interestMethod: true },
  });
  const controlMatured = await prisma.userPlan.findUniqueOrThrow({
    where: { id: control.userPlan.id },
    include: { interestMethod: true },
  });

  // (a) Rule XXVII: missing an instalment (even fully unrecovered) shall not
  // result in cancellation or suspension of the Plan — it matures like any
  // other ACTIVE plan, despite remainingUnpaidPrincipal > 0. No
  // LAPSED/CANCELLED/DEFAULTED status exists on UserPlan.
  expect(missedMatured.status).toBe("MATURED");
  expect(Number(missedMatured.remainingUnpaidPrincipal)).toBeGreaterThan(0);
  expect(controlMatured.status).toBe("MATURED");

  // (b) Pro-rata settlement: interest is computed strictly from principalPaid
  // (the amount actually received), never the full intended principal.
  const missedElapsedDays = Math.max(
    0,
    Math.round((missedMatured.maturityDate.getTime() - missedMatured.startDate.getTime()) / 86_400_000),
  );
  const expectedMissedInterest =
    Number(missedMatured.principalPaid) > 0
      ? calculateInterest({
          method: missedMatured.interestMethod,
          principal: Number(missedMatured.principalPaid),
          elapsedDays: missedElapsedDays,
        })
      : 0;
  // The unrecovered plan never had a successful payment, so principalPaid is
  // 0 and no interest is due at all — the strongest possible demonstration
  // that settlement tracks amounts actually received, not the intended plan.
  expect(Number(missedMatured.principalPaid)).toBe(0);
  expect(expectedMissedInterest).toBe(0);
  const missedInterestEntry = await prisma.ledgerEntry.findFirst({
    where: { userId: missed.user.id, userPlanId: missed.userPlan.id, transactionType: "INTEREST" },
  });
  expect(missedInterestEntry).toBeNull();

  const controlElapsedDays = Math.max(
    0,
    Math.round((controlMatured.maturityDate.getTime() - controlMatured.startDate.getTime()) / 86_400_000),
  );
  const expectedControlInterest = calculateInterest({
    method: controlMatured.interestMethod,
    principal: Number(controlMatured.principalPaid),
    elapsedDays: controlElapsedDays,
  });
  const controlInterestEntry = await prisma.ledgerEntry.findFirst({
    where: { userId: control.user.id, userPlanId: control.userPlan.id, transactionType: "INTEREST" },
  });
  expect(controlInterestEntry).not.toBeNull();
  expect(Number(controlInterestEntry!.amount)).toBe(expectedControlInterest);
  // The control plan actually received a payment and therefore, unlike the
  // missed plan, is credited real interest — the pro-rata difference made concrete.
  expect(expectedControlInterest).toBeGreaterThan(0);

  // (c) No distinct "missed instalment" UI state: the dashboard shows a plain
  // MATURED badge for both plans, with no separate defaulted/missed indicator.
  await suppressPushOptIn(page);
  await loginViaUi(page, missed.email, missed.password);
  await page.waitForURL("**/dashboard");
  const missedCard = page.locator("article", { has: page.getByText(/Basic Growth Plan/i) }).first();
  await expect(missedCard.getByText("MATURED")).toBeVisible();
  await expect(missedCard.getByText(/missed/i)).toHaveCount(0);
  await expect(missedCard.getByText(/default/i)).toHaveCount(0);

  await adminContext.close();

  // --- Cleanup, in the confirmed FK-safe order. ---
  await prisma.ledgerEntry.deleteMany({ where: { userId: { in: [missed.user.id, control.user.id] } } });
  const paymentIds = [missedPayment.id, controlPayment.id];
  await prisma.paymentEvent.deleteMany({ where: { paymentId: { in: paymentIds } } });
  await prisma.payment.deleteMany({ where: { userPlanId: { in: [missed.userPlan.id, control.userPlan.id] } } });
  await prisma.paymentMandate.deleteMany({ where: { userPlanId: { in: [missed.userPlan.id, control.userPlan.id] } } });
  await prisma.userPlan.deleteMany({ where: { id: { in: [missed.userPlan.id, control.userPlan.id] } } });
  // The fixture users themselves are intentionally left in place, matching
  // this suite's established convention (tests/browser/fixtures.ts's
  // cleanupTestUser never deletes the User row either): by this point a real
  // UI login has created RefreshToken/LoginHistory/OtpCode rows, and no test
  // in this suite deletes those, so the dedicated pw-autopay-* fixture users
  // simply accumulate in the dev DB like every other cross-role test's users.
});
