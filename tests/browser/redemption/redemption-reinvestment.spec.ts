import { test, expect } from "playwright/test";
import { prisma, loginAsUser, loginAsAdmin, newRoleContexts } from "../../helpers";
import { createUserWithRedeemableBalance } from "../fixtures";

// Design.md 3.11: a REINVESTMENT redemption request lets the user pick a
// target ACTIVE Plan to enrol into once the request is approved. On
// approval, the internal portion is used to create a new UserPlan (snapshot
// fields copied from the target Plan, principalPaid = internal portion, no
// PaymentMandate) rather than a ledger-only debit.
//
// Cross-role E2E, interleaved: a preceding partial REFUND redemption is
// approved first, so the REINVESTMENT request below must be computed against
// an already-reduced redeemable balance (not the user's original principal),
// exercising the same interleaving getRedeemableBalance()/getAvailableMargin()
// arithmetic a real user hitting the Redeem Hub twice would produce.
test.describe.configure({ mode: "serial" });

test.afterAll(async () => {
  await prisma.$disconnect();
});

test("Design.md 3.11: reinvestment redemption with a target plan creates a new UserPlan on approval, after a preceding partial redemption", async ({ browser }) => {
  const { userPage, adminPage, close } = await newRoleContexts(browser);

  try {
    const { user, email, password } = await createUserWithRedeemableBalance(20000);
    const targetPlan = await prisma.plan.findUniqueOrThrow({ where: { id: "seed-plan-basic" } });

    await loginAsUser(userPage, email, password);
    await userPage.waitForURL("**/dashboard");
    await loginAsAdmin(adminPage);
    await adminPage.waitForURL("**/admin");

    // --- Preceding redemption: a partial refund of ₹5,000, submitted and
    // approved first, so it has already reduced the balance below. ---
    await userPage.goto("/dashboard/redeem/refund");
    await userPage.locator('input[name="amount"]').fill("5000");
    await Promise.all([
      userPage.waitForResponse((res) => res.request().method() === "POST"),
      userPage.getByRole("button", { name: "Submit request" }).click(),
    ]);
    await userPage.waitForURL("**/dashboard/redeem");

    const refundRequest = await prisma.redemptionRequest.findFirstOrThrow({
      where: { userId: user.id, category: "REFUND" },
    });

    await adminPage.goto("/admin/redemptions");
    const refundRow = adminPage.locator("li", { has: adminPage.getByText(user.email) });
    await expect(refundRow).toBeVisible();
    await Promise.all([
      adminPage.waitForResponse((res) => res.request().method() === "POST"),
      refundRow.getByRole("button", { name: "Approve" }).click(),
    ]);

    const approvedRefund = await prisma.redemptionRequest.findUniqueOrThrow({ where: { id: refundRequest.id } });
    expect(approvedRefund.status).toBe("APPROVED");

    // Balance is now ₹15,000 available before the reinvestment request below.
    await userPage.goto("/dashboard/redeem");
    await expect(userPage.getByText("₹15000.00").first()).toBeVisible();

    // --- Reinvestment request, computed against the already-reduced balance. ---
    await userPage.goto("/dashboard/redeem/reinvestment");
    await userPage.locator('input[name="amount"]').fill("5000");
    await userPage.locator('select[name="targetPlanId"]').selectOption(targetPlan.id);
    await Promise.all([
      userPage.waitForResponse((res) => res.request().method() === "POST"),
      userPage.getByRole("button", { name: "Submit request" }).click(),
    ]);
    await userPage.waitForURL("**/dashboard/redeem");

    const request = await prisma.redemptionRequest.findFirstOrThrow({
      where: { userId: user.id, category: "REINVESTMENT" },
    });
    expect(request.status).toBe("PENDING");
    expect(request.targetPlanId).toBe(targetPlan.id);

    await adminPage.goto("/admin/redemptions");
    const row = adminPage.locator("li", { has: adminPage.getByText(user.email) }).filter({ hasText: "REINVESTMENT" });
    await expect(row).toBeVisible();
    await expect(row.getByText(`Target plan: ${targetPlan.name}`)).toBeVisible();

    await Promise.all([
      adminPage.waitForResponse((res) => res.request().method() === "POST"),
      row.getByRole("button", { name: "Approve" }).click(),
    ]);

    const approved = await prisma.redemptionRequest.findUniqueOrThrow({ where: { id: request.id } });
    expect(approved.status).toBe("APPROVED");

    const newUserPlan = await prisma.userPlan.findFirstOrThrow({
      where: { userId: user.id, planId: targetPlan.id, principalPaid: 5000 },
    });
    expect(Number(newUserPlan.principalPaid)).toBe(5000);
    expect(Number(newUserPlan.remainingUnpaidPrincipal)).toBe(0);
    expect(newUserPlan.status).toBe("ACTIVE");

    const mandates = await prisma.paymentMandate.findMany({ where: { userPlanId: newUserPlan.id } });
    expect(mandates).toHaveLength(0);

    // Original redeemable balance's ledger is debited by the internal portion only.
    const ledgerEntry = await prisma.ledgerEntry.findFirstOrThrow({
      where: { userId: user.id, transactionType: "REDEMPTION_REINVESTMENT" },
    });
    expect(Number(ledgerEntry.amount)).toBe(-5000);

    // Final business outcome from the user's own session: the ledger has been
    // debited twice (20,000 -> 15,000 refund -> 10,000 reinvestment), but the
    // reinvestment's new UserPlan is ACTIVE (unmatured), so its ₹5,000
    // principal is immediately re-locked out of the redeemable balance per
    // getRedeemableBalance()/getLockedPrincipal() (BRD Rule III: principal in
    // an ACTIVE/DISCONTINUED plan is excluded until maturity). Net displayed
    // balance is therefore ₹5,000 (10,000 ledger balance - 5,000 newly-locked
    // principal), not the naive 10,000 one would get from the ledger alone.
    await userPage.goto("/dashboard/redeem");
    await expect(userPage.getByText("₹5000.00").first()).toBeVisible();
    await userPage.goto("/dashboard");
    await expect(userPage.getByText("Active Plans", { exact: false })).toBeVisible();
    await expect(
      userPage.locator("div", { has: userPage.getByText("Active Plans", { exact: false }) }).getByText("1", { exact: true })
    ).toBeVisible();

    await prisma.userPlan.deleteMany({ where: { id: newUserPlan.id } });
  } finally {
    await close();
  }
});
