import { test, expect, type Page } from "playwright/test";
import { subDays, subMonths } from "date-fns";
import { prisma, loginAsAdmin, uniqueSuffix } from "../../helpers";
import { createUser, createPlan, runAutoPayNow, TEST_PASSWORD } from "../fixtures";

// E2E-018 (Complete Cross-Role E2E Flows.md) / BRD Rule XIX. This entire flow
// rests on Rule XIX's "Drafted Clarification -- pending client confirmation"
// language (mirrored from Rule XX), so per TEST_SCENARIOS.md's header note it
// is informational rather than a hard release-blocking pass/fail criterion
// until re-validated with the client. The underlying mechanism is fully
// implemented in the app (src/lib/config.ts's admin-configurable
// referralValidityDays setting, the expiry-date snapshot taken at referral
// creation in src/app/(auth)/actions.ts and .../login/social/google/actions.ts,
// and the expiry check in src/lib/commission-engine.ts), so this test drives
// the real flow end-to-end rather than being skipped or stubbed; it is
// excluded from the pass/fail rollup via the annotation below instead.
test.describe.configure({ mode: "serial" });

test.afterAll(async () => {
  // Restore the two SiteSetting overrides this file changes back to their
  // schema defaults so later spec files in the same sequential full-suite run
  // (e.g. referral-commission-e2e.spec.ts, which assumes the default 4-payment
  // recurring cycle length) are unaffected.
  await prisma.siteSetting.deleteMany({
    where: { key: { in: ["referralValidityDays", "commissionRecurringCycleLength"] } },
  });
  await prisma.$disconnect();
});

// See admin-notifications.spec.ts / referral-commission-e2e.spec.ts for the
// diagnosed reason this is needed: on this spec's accumulated dev database,
// /admin/commissions can grow long enough that the fixed-position PushOptIn
// "Enable notifications" banner intercepts clicks on this test's target row,
// and Playwright's click() retries actionability indefinitely (no
// actionTimeout configured) rather than throwing -- silently hanging until
// the outer test timeout.
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

/** See referral-commission-e2e.spec.ts for why backdating the latest Payment
 * by just over a month makes the userPlan due again on the next
 * runAutoPayNow() click. */
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

/** Drives the real Site Settings form (src/app/admin/settings/SettingsForm.tsx). */
async function updateSiteSetting(adminPage: Page, fieldId: string, value: number) {
  await adminPage.goto("/admin/settings");
  await adminPage.locator(`input#${fieldId}`).fill(String(value));
  await Promise.all([
    adminPage.waitForResponse((res) => res.request().method() === "POST"),
    adminPage.getByRole("button", { name: "Save settings" }).click(),
  ]);
  await expect(adminPage.getByText("Settings saved.")).toBeVisible();
}

test(
  "E2E-018 / BRD Rule XIX: a referral relationship's expiry is fixed at creation time, immune to later global-period changes, and halts future commission accrual without disturbing commissions accrued before expiry",
  async ({ page, browser }) => {
    test.info().annotations.push({
      type: "pending-clarification",
      description:
        "BRD Rule XIX is 'Drafted Clarification -- pending client confirmation' (mirrored from Rule XX). This flow is fully implemented and exercised for real, but excluded from the release-blocking pass/fail rollup until the rule is confirmed with the client (Complete Cross-Role E2E Flows.md, E2E-018).",
    });

    const adminContext = await browser.newContext();
    const adminPage = await adminContext.newPage();
    await suppressPushOptIn(adminPage);
    await loginAsAdmin(adminPage);
    await adminPage.waitForURL("**/admin");

    // Step 1: Admin configures the (schema-minimum) global validity period
    // before the relationship is created.
    await updateSiteSetting(adminPage, "referralValidityDays", 30);

    const { user: referrer } = await createUser();
    const plan = await createPlan({ presetAmounts: [1000], commissionPercent: 10 });

    // Step 2: Referred User (B) registers using A's code -> relationship
    // created with expiry anchored to creation time + the then-current
    // 30-day setting.
    const beforeCreate = new Date();
    const referredEmail = await registerReferredUser(page, referrer.referralCode);
    const referredUser = await prisma.user.findUniqueOrThrow({ where: { email: referredEmail } });
    const referral = await prisma.referral.findUniqueOrThrow({ where: { referredUserId: referredUser.id } });
    expect(referral.status).toBe("ACTIVE");

    const expectedExpiry = new Date(beforeCreate);
    expectedExpiry.setDate(expectedExpiry.getDate() + 30);
    const deltaMs = Math.abs(referral.expiryDate.getTime() - expectedExpiry.getTime());
    expect(deltaMs, "expiryDate should be ~30 days from creation time").toBeLessThan(5 * 60 * 1000);

    // Step 3: Admin later changes the global period to 90 days.
    await updateSiteSetting(adminPage, "referralValidityDays", 90);

    // Step 3 (result): A -> B's expiry remains anchored to the original
    // 30-day period, not the new 90-day one.
    const afterSettingChange = await prisma.referral.findUniqueOrThrow({ where: { id: referral.id } });
    expect(afterSettingChange.expiryDate.getTime()).toBe(referral.expiryDate.getTime());

    // A payment made while the referral is still active (sequence 1) accrues
    // a normal ONE_TIME commission.
    await subscribeToPlan(page, plan.id, 1000);
    const userPlan = await prisma.userPlan.findFirstOrThrow({ where: { userId: referredUser.id, planId: plan.id } });

    const oneTimeCommission = await prisma.commission.findFirstOrThrow({ where: { referralId: referral.id } });
    expect(oneTimeCommission.commissionType).toBe("ONE_TIME");
    expect(oneTimeCommission.status).toBe("ACCRUED");

    // Step 6 result (checked ahead of steps 4/5 below, while still pre-expiry
    // data): a commission accrued before expiry continues through normal
    // approval and is not cancelled/reversed once the referral later expires.
    await adminPage.goto("/admin/commissions");
    const accruedRow = adminPage.locator("li", { hasText: referredEmail }).filter({ hasText: "cycle #1" });
    await expect(accruedRow).toBeVisible();
    await Promise.all([
      adminPage.waitForResponse((res) => res.request().method() === "POST"),
      accruedRow.getByRole("button", { name: "Approve" }).click(),
    ]);
    await adminPage.reload();
    const approvedRow = adminPage.locator("li", { hasText: referredEmail }).filter({ hasText: "cycle #1" });
    await Promise.all([
      adminPage.waitForResponse((res) => res.request().method() === "POST"),
      approvedRow.getByRole("button", { name: "Credit to ledger" }).click(),
    ]);
    const creditedCommission = await prisma.commission.findUniqueOrThrow({ where: { id: oneTimeCommission.id } });
    expect(creditedCommission.status).toBe("AVAILABLE_FOR_WITHDRAWAL");

    // Force every subsequent payment to be a recurring-cycle accrual point,
    // isolating the expiry check below from the unrelated cycle-length skip
    // logic that the default cycle length of 4 would otherwise trigger on
    // payment sequence 2 regardless of expiry.
    await prisma.siteSetting.upsert({
      where: { key: "commissionRecurringCycleLength" },
      create: { key: "commissionRecurringCycleLength", value: "1" },
      update: { value: "1" },
    });

    // Steps 4/5: reach A -> B's expiry date/time (backdated via Prisma, per
    // this suite's established time-manipulation convention, rather than
    // waiting 30 real days).
    await prisma.referral.update({ where: { id: referral.id }, data: { expiryDate: subDays(new Date(), 1) } });

    // Payment sequence 2, after expiry: with the cycle length forced to 1
    // this would ordinarily be a recurring accrual point, so the absence of
    // any new commission demonstrates the expiry check itself rather than an
    // incidental cycle-length skip.
    await backdateLatestPayment(userPlan.id);
    await runAutoPayNow(adminPage);

    const commissionsAfterExpiry = await prisma.commission.findMany({ where: { referralId: referral.id } });
    expect(commissionsAfterExpiry, "no new commission should accrue once the referral has expired").toHaveLength(1);
    expect(commissionsAfterExpiry[0]!.id).toBe(oneTimeCommission.id);

    // The payment itself still succeeds -- BRD Rule XIX step 5 only halts
    // NEW commission accrual, not the referred user's own payments.
    const paymentsAfterExpiry = await prisma.payment.findMany({
      where: { userPlanId: userPlan.id },
      orderBy: { createdAt: "asc" },
    });
    expect(paymentsAfterExpiry).toHaveLength(2);
    expect(paymentsAfterExpiry[1]!.status).toBe("SUCCESS");

    await adminContext.close();
  },
);
