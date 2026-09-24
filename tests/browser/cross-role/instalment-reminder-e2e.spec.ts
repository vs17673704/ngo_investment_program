import { addMonths, subDays } from "date-fns";
import { test, expect } from "playwright/test";
import { prisma, loginAsUser, loginAsAdmin, newRoleContexts } from "../../helpers";
import { createUser, createPlan, runAutoPayNow, TEST_PASSWORD } from "../fixtures";

// E2E-12: the reminder must be demonstrably connected to a successful
// on-time collection outcome, not just tested in isolation as a bare
// notification event (TEST_SCENARIOS.md E2E-12 Objective). This app had no
// reminder generation at all before this test (BRD Rule XXXVIII / Design.md
// §6.18): src/lib/instalment-reminder.ts + the "Run instalment reminders
// now" admin trigger on /admin/payments were added to close that gap,
// following the same "admin explicitly triggers the batch, standing in for
// a scheduled job" convention already used for AutoPay/Retry/Maturity.
test.describe.configure({ mode: "serial" });

test.afterAll(async () => {
  await prisma.$disconnect();
});

test("E2E-12: a user is reminded of an upcoming instalment ahead of the due date, then the instalment is collected on time with admin observing no delinquency", async ({
  browser,
}) => {
  const { userPage, adminPage, close } = await newRoleContexts(browser);

  try {
    const plan = await createPlan({ presetAmounts: [1000] });
    const { user, email, password } = await createUser();
    expect(password).toBe(TEST_PASSWORD);

    // computeNextDeduction (src/lib/dashboard.ts) derives the next due date
    // as startDate + (instalmentsPaid + 1) months. With 0 payments made yet,
    // backdating startDate by (1 month - 2 days) puts the first instalment's
    // due date 2 days from now -- inside the default 3-day reminder lead
    // window, but not yet due for AutoPay itself.
    const startDate = subDays(addMonths(new Date(), -1), -2);
    const amount = Number(plan.presetAmounts[0]);
    const interestMethod = await prisma.interestCalculationMethod.findUniqueOrThrow({
      where: { id: plan.interestMethodId },
    });
    const userPlan = await prisma.userPlan.create({
      data: {
        userId: user.id,
        planId: plan.id,
        interestMethodId: plan.interestMethodId,
        interestMethodVersion: interestMethod.version,
        rewardPercentSnapshot: plan.rewardPercent,
        commissionPercentSnapshot: plan.commissionPercent,
        paymentAmount: amount,
        paymentFrequency: plan.paymentFrequency,
        remainingUnpaidPrincipal: amount * plan.tenureMonths,
        startDate,
        maturityDate: addMonths(startDate, plan.tenureMonths),
      },
    });
    await prisma.paymentMandate.create({
      data: { userPlanId: userPlan.id, gatewayMandateId: `SIM-MANDATE-REMINDER-${userPlan.id}`, status: "ACTIVE" },
    });

    // ----- Actor 2 (system-triggered by Admin): reminder is sent -----
    await loginAsAdmin(adminPage);
    await adminPage.waitForURL("**/admin");
    await adminPage.goto("/admin/payments");
    await expect(adminPage.getByText(/instalment.*due for an upcoming-reminder notification/)).toBeVisible();

    await Promise.all([
      adminPage.waitForResponse((res) => res.request().method() === "POST"),
      adminPage.getByRole("button", { name: "Run instalment reminders now" }).click(),
    ]);

    const notification = await prisma.notification.findFirstOrThrow({
      where: { userId: user.id, type: "INSTALMENT_REMINDER" },
    });
    expect(notification.message).toContain(plan.name);
    expect(notification.message).toContain("1000.00");

    const reminderEmail = await prisma.emailMessage.findFirstOrThrow({
      where: { recipient: email, templateType: "INSTALMENT_REMINDER" },
    });
    expect(reminderEmail.body).toContain(plan.name);

    // ----- Actor 1: User receives and acts on the reminder -----
    await loginAsUser(userPage, email, password);
    await userPage.waitForURL("**/dashboard");
    await userPage.goto("/dashboard/notifications");
    await expect(userPage.getByRole("heading", { name: "Notifications" })).toBeVisible();
    await expect(userPage.getByText("Upcoming instalment reminder")).toBeVisible();

    // Simulate the due date arriving: the reminder already fired for this
    // instalment (dedup key is the derived due date, not "now"), so
    // backdating further to make it due for AutoPay does not re-trigger or
    // duplicate the reminder just sent above.
    await prisma.userPlan.update({
      where: { id: userPlan.id },
      data: { startDate: subDays(startDate, 3) },
    });

    await runAutoPayNow(adminPage, { forceOutcome: "SUCCESS" });

    const payment = await prisma.payment.findFirstOrThrow({ where: { userPlanId: userPlan.id } });
    expect(payment.status).toBe("SUCCESS");
    expect(payment.retryCount).toBe(0);

    // ----- Actor 2 (continued): Admin's monitoring shows on-time collection, no delinquency -----
    // Scoped to the "Recent simulated payments" section specifically: the
    // "Active mandates" section above it also renders an
    // "<email> · <plan name>" <li> row for this same still-ACTIVE mandate.
    await adminPage.goto("/admin/payments");
    const recentPaymentsSection = adminPage.locator("section", {
      has: adminPage.getByRole("heading", { name: "Recent simulated payments" }),
    });
    const paymentRow = recentPaymentsSection.locator("li", { hasText: plan.name }).filter({ hasText: email });
    await expect(paymentRow).toBeVisible();
    await expect(paymentRow.getByText("SUCCESS", { exact: true })).toBeVisible();
    await expect(paymentRow).not.toContainText("retry attempt");
  } finally {
    await close();
  }
});
