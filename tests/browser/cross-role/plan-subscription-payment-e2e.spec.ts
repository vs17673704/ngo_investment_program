import { test, expect } from "playwright/test";
import { prisma, loginViaUi, loginAsUser } from "../../helpers";
import { createUser, TEST_PASSWORD } from "../fixtures";

// E2E-01 (Admin Plan Configuration -> User Subscription) chained straight
// into E2E-02 (User Payment -> Admin Monitoring -> User Notification): this
// app's subscribeToPlanAction (src/app/plans/[planId]/actions.ts) creates the
// UserPlan/PaymentMandate AND immediately calls processScheduledPayment for
// the first instalment in the same request, so a real Subscribe click always
// produces a genuine first payment with no separate AutoPay-run step needed.
// One admin-creates-plan -> user-subscribes -> admin-sees-payment ->
// user-sees-notification journey, driven end to end through the real UI in
// two separate browser contexts, therefore covers both fixed scenarios with
// one continuous entity (plan -> userPlan -> payment) rather than two
// disconnected tests.
test.describe.configure({ mode: "serial" });

test.afterAll(async () => {
  await prisma.$disconnect();
});

async function suppressPushOptIn(page: import("playwright/test").Page) {
  await page.addInitScript(() => sessionStorage.setItem("push-opt-in-dismissed", "1"));
}

test("E2E-01/E2E-02: admin publishes a Plan, a user subscribes and is auto-charged, admin sees it in Payment Monitoring, and the user is notified of the payment", async ({
  page,
  browser,
}) => {
  test.setTimeout(120_000);

  const { email, password } = await createUser();
  expect(password).toBe(TEST_PASSWORD);

  await suppressPushOptIn(page);
  await loginViaUi(page, "admin@demo.local", "Admin@1234");
  await page.waitForURL("**/admin");
  await page.goto("/admin/plans");
  await expect(page.getByRole("heading", { name: "Plan Management" })).toBeVisible();

  await page.getByRole("button", { name: "Create Plan", exact: true }).click();
  const planName = `QA E2E Plan ${Date.now()}`;
  await page.locator('input[name="name"]').fill(planName);
  await page.locator('input[name="tenureMonths"]').fill("6");
  // LUMPSUM: the Subscribe screen offers no duration/cadence dropdown for
  // this frequency (BRD Rule XLIX / XLVIII(d)), keeping the User step below
  // a single amount selection.
  await page.locator('select[name="paymentFrequency"]').selectOption("LUMPSUM");
  await page.locator('input[name="presetAmounts"]').fill("1500");
  await page.locator('input[name="rewardPercent"]').fill("3");
  await page.locator('input[name="commissionPercent"]').fill("2");

  await Promise.all([
    page.waitForResponse((res) => res.request().method() === "POST"),
    page.getByRole("button", { name: "Create plan", exact: true }).click(),
  ]);

  const plan = await prisma.plan.findFirstOrThrow({ where: { name: planName } });
  expect(plan.status).toBe("ACTIVE");
  // A successful submit closes the popup automatically; the subsequent
  // revalidatePath("/admin/plans") re-render that adds the row lands as a
  // delayed client-side navigation, not synchronously with the POST above.
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(page.getByRole("cell", { name: planName })).toBeVisible();

  // ----- Actor 2: User discovers the new ACTIVE plan and subscribes -----
  const userContext = await browser.newContext();
  const userPage = await userContext.newPage();
  await suppressPushOptIn(userPage);
  await loginAsUser(userPage, email, password);
  await userPage.waitForURL("**/dashboard");

  await userPage.goto("/plans");
  await expect(userPage.getByRole("heading", { name: "Available Investment Plans" })).toBeVisible();
  await expect(userPage.getByRole("heading", { name: planName })).toBeVisible();
  // Scope by the card's own subscribe href (unique per plan id) rather than
  // an ancestor "div" filter, which matches every nested wrapper div and
  // makes getByRole("link") within it ambiguous across the whole catalog.
  const subscribeLink = userPage.locator(`a[href="/plans/${plan.id}/subscribe"]`);

  await Promise.all([
    userPage.waitForResponse((res) => res.request().method() === "GET" && res.url().includes("/subscribe")),
    subscribeLink.click(),
  ]);
  await userPage.waitForURL(`**/plans/${plan.id}/subscribe`);
  await expect(userPage.locator("select[name=\"duration\"]")).toHaveCount(0);

  await Promise.all([
    userPage.waitForResponse((res) => res.request().method() === "POST"),
    userPage.getByRole("button", { name: "Confirm & Set Up AutoPay" }).click(),
  ]);
  await userPage.waitForURL("**/dashboard");

  const userPlan = await prisma.userPlan.findFirstOrThrow({ where: { planId: plan.id } });
  expect(Number(userPlan.paymentAmount)).toBe(1500);

  // subscribeToPlanAction's synchronous first-instalment charge: this is the
  // "User's AutoPay instalment is charged successfully" half of E2E-02,
  // driven by the real Subscribe submission above, not a separate fixture.
  const payment = await prisma.payment.findFirstOrThrow({ where: { userPlanId: userPlan.id } });
  expect(payment.status).toBe("SUCCESS");

  const ledgerEntry = await prisma.ledgerEntry.findFirstOrThrow({ where: { paymentId: payment.id } });
  expect(ledgerEntry.transactionType).toBe("PLAN_PAYMENT");

  const emailReceipt = await prisma.emailMessage.findFirstOrThrow({
    where: { recipient: email, templateType: "PAYMENT_RECEIPT" },
  });
  expect(emailReceipt.body).toContain("1500.00");

  // ----- Actor 1 (continued): Admin's Payment Monitoring dashboard -----
  const adminContext = await browser.newContext();
  const adminPage = await adminContext.newPage();
  await suppressPushOptIn(adminPage);
  await loginViaUi(adminPage, "admin@demo.local", "Admin@1234");
  await adminPage.waitForURL("**/admin");
  await adminPage.goto("/admin/payments");

  // Scope to the "Recent simulated payments" section specifically: the
  // "Active mandates" section above it renders the same
  // "<email> · <plan name>" text for its own <li> rows, which would
  // otherwise make a bare `li` + planName filter ambiguous.
  const recentPaymentsSection = adminPage.locator("section", {
    has: adminPage.getByRole("heading", { name: "Recent simulated payments" }),
  });
  const recentPaymentRow = recentPaymentsSection.locator("li", { hasText: planName });
  await expect(recentPaymentRow).toBeVisible();
  await expect(recentPaymentRow).toContainText(email);
  await expect(recentPaymentRow).toContainText("1500.00");

  // ----- Actor 2 (continued): User sees the payment-success notification -----
  const notification = await prisma.notification.findFirstOrThrow({
    where: { userId: userPlan.userId, type: "PAYMENT_SUCCESS" },
  });
  expect(notification.message).toContain("1500.00");

  await userPage.goto("/dashboard/notifications");
  await expect(userPage.getByRole("heading", { name: "Notifications" })).toBeVisible();
  await expect(userPage.getByText("Payment successful")).toBeVisible();

  await userContext.close();
  await adminContext.close();
});
