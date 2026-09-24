import { test, expect, type Page } from "playwright/test";
import { prisma, loginViaUi } from "../../helpers";
import { createDuePaymentMandate, runAutoPayNow, runRetriesNow } from "../fixtures";
import { getSettings } from "../../../src/lib/config";
import { submitManualPayment } from "../../../src/lib/payment-engine";

// BRD payment-retry rules: a gateway-failed AutoPay charge enters a RETRYING
// state bounded by two independent exit conditions on the same
// RETRYING -> FAILED transition (src/lib/payment-engine.ts's retryDuePayment:
// retriesExhausted || gracePeriodExpired). Once FAILED, the user gets a
// self-service manual-payment fallback window (manualWindowEndsAt); outside
// that window, no self-service recovery exists and the UserPlan itself is
// never suspended (no LAPSED/CANCELLED/DEFAULTED status exists on UserPlan).
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

test("a FAILED AutoPay payment retries against its grace period, exhausts its retry count, and the user then manually completes it within the fallback window", async ({ page, browser }) => {
  test.setTimeout(120_000);
  const settings = await getSettings();
  const { user, email, password, userPlan } = await createDuePaymentMandate();

  await suppressPushOptIn(page);
  await loginViaUi(page, email, password);
  await page.waitForURL("**/dashboard");

  const adminContext = await browser.newContext();
  const adminPage = await adminContext.newPage();
  await suppressPushOptIn(adminPage);
  await loginViaUi(adminPage, "admin@demo.local", "Admin@1234");
  await adminPage.waitForURL("**/admin");

  // First scheduled charge fails at the gateway -> RETRYING, with both a
  // grace-period deadline and a next-retry timestamp recorded.
  await runAutoPayNow(adminPage, { forceOutcome: "FAILED" });

  const payment = await prisma.payment.findFirstOrThrow({ where: { userPlanId: userPlan.id } });
  expect(payment.status).toBe("RETRYING");
  expect(payment.gracePeriodEndsAt).not.toBeNull();
  expect(payment.nextRetryAt).not.toBeNull();
  expect(payment.retryCount).toBe(0);

  await page.goto("/dashboard/payments");
  const paymentRow = page.locator("li", { hasText: userPlan.paymentAmount.toString() });
  await expect(paymentRow.getByText("RETRYING")).toBeVisible();
  await expect(paymentRow.getByText(/automatically retry/i)).toBeVisible();

  // Keep retrying-and-failing until the app itself decides the retry budget
  // is exhausted (retriesExhausted || gracePeriodExpired inside
  // retryDuePayment) — backdating nextRetryAt each time so the batch job
  // always finds this payment "due" instead of waiting out the real
  // paymentRetryIntervalHours between attempts.
  let latest = payment;
  let attempts = 0;
  while (latest.status === "RETRYING" && attempts < settings.paymentRetryCount + 1) {
    await prisma.payment.update({ where: { id: latest.id }, data: { nextRetryAt: new Date(0) } });
    await runRetriesNow(adminPage, { forceOutcome: "FAILED" });
    latest = await prisma.payment.findUniqueOrThrow({ where: { id: latest.id } });
    attempts += 1;
  }

  expect(latest.status).toBe("FAILED");
  expect(latest.manualWindowEndsAt).not.toBeNull();
  expect(new Date(latest.manualWindowEndsAt as Date).getTime()).toBeGreaterThan(Date.now());
  expect(latest.retryCount).toBeGreaterThanOrEqual(settings.paymentRetryCount);

  const manualRequiredNotification = await prisma.notification.findFirstOrThrow({
    where: { userId: user.id, type: "PAYMENT_FAILURE", title: "Manual payment required" },
  });
  expect(manualRequiredNotification).not.toBeNull();

  // The UserPlan itself is never suspended by retry exhaustion — only the
  // Payment transitions terminal.
  const userPlanAfterExhaustion = await prisma.userPlan.findUniqueOrThrow({ where: { id: userPlan.id } });
  expect(userPlanAfterExhaustion.status).toBe("ACTIVE");

  // Final business outcome verified from the user's own session: the FAILED
  // payment now shows a self-service "Pay now" fallback, and using it
  // completes the instalment.
  await page.reload();
  const failedRow = page.locator("li", { hasText: userPlan.paymentAmount.toString() });
  await expect(failedRow.getByText("FAILED")).toBeVisible();
  await expect(failedRow.getByText(/Pay manually before/i)).toBeVisible();
  await Promise.all([
    page.waitForResponse((res) => res.request().method() === "POST"),
    failedRow.getByRole("button", { name: "Pay now" }).click(),
  ]);

  const completed = await prisma.payment.findUniqueOrThrow({ where: { id: latest.id } });
  expect(completed.status).toBe("SUCCESS");

  await adminContext.close();
});

test("once the manual payment fallback window itself expires, self-service recovery is no longer available and the UserPlan is still not suspended", async ({ page, browser }) => {
  const { user, email, password, userPlan } = await createDuePaymentMandate();

  const adminContext = await browser.newContext();
  const adminPage = await adminContext.newPage();
  await suppressPushOptIn(adminPage);
  await loginViaUi(adminPage, "admin@demo.local", "Admin@1234");
  await adminPage.waitForURL("**/admin");

  await runAutoPayNow(adminPage, { forceOutcome: "FAILED" });
  const payment = await prisma.payment.findFirstOrThrow({ where: { userPlanId: userPlan.id } });

  // Drive straight to the terminal FAILED state via the grace-period exit
  // condition (gracePeriodExpired), independent of the retry-count exit
  // condition already covered by the previous test.
  await prisma.payment.update({
    where: { id: payment.id },
    data: { gracePeriodEndsAt: new Date(0), nextRetryAt: new Date(0) },
  });
  await runRetriesNow(adminPage, { forceOutcome: "FAILED" });

  const failed = await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } });
  expect(failed.status).toBe("FAILED");
  expect(failed.manualWindowEndsAt).not.toBeNull();

  // Now let the manual fallback window itself lapse.
  await prisma.payment.update({ where: { id: failed.id }, data: { manualWindowEndsAt: new Date(0) } });

  await suppressPushOptIn(page);
  await loginViaUi(page, email, password);
  await page.waitForURL("**/dashboard");
  await page.goto("/dashboard/payments");

  const row = page.locator("li", { hasText: userPlan.paymentAmount.toString() });
  await expect(row.getByText("FAILED")).toBeVisible();
  await expect(row.getByText(/window has closed/i)).toBeVisible();
  await expect(row.getByRole("button", { name: "Pay now" })).toHaveCount(0);

  // The engine-level guard must reject the attempt even if invoked directly
  // (defense in depth beyond the UI simply hiding the button).
  await expect(submitManualPayment(failed.id, user.id)).rejects.toThrow(/expired/i);

  const stillFailed = await prisma.payment.findUniqueOrThrow({ where: { id: failed.id } });
  expect(stillFailed.status).toBe("FAILED");

  const userPlanAfter = await prisma.userPlan.findUniqueOrThrow({ where: { id: userPlan.id } });
  expect(userPlanAfter.status).toBe("ACTIVE");

  await adminContext.close();
});
