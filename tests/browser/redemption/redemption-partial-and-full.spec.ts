import { test, expect } from "playwright/test";
import { prisma, loginAsUser, loginAsAdmin, newRoleContexts } from "../../helpers";
import { createUserWithRedeemableBalance } from "../fixtures";

// BRD Section 5 "Full vs Partial Redemption" worked examples:
//   Partial: Balance ₹50,000, Requested ₹15,000 -> Approved ₹15,000,
//            Remaining ₹35,000, plan status PARTIALLY_REDEEMED.
//   Full:    Balance ₹50,000, Requested ₹50,000 -> Approved ₹50,000,
//            Remaining ₹0, plan status REDEEMED.
// Cross-role E2E: the same redemption request is carried from the user's own
// submission through the admin's approval and back to the user's own session
// observing the final, real outcome (updated dashboard balance and request
// status) — not just a DB-side check of the admin's action.
test.describe.configure({ mode: "serial" });

test.afterAll(async () => {
  await prisma.$disconnect();
});

test("BRD: partial redemption (refund) approves the requested amount and leaves the remainder available", async ({ browser }) => {
  const { userPage, adminPage, close } = await newRoleContexts(browser);

  try {
    const { user, email, password } = await createUserWithRedeemableBalance(50000);

    await loginAsUser(userPage, email, password);
    await userPage.waitForURL("**/dashboard");

    await userPage.goto("/dashboard/redeem");
    await expect(userPage.getByText("Actual Redeemable Balance")).toBeVisible();
    await expect(userPage.getByText("₹50000.00").first()).toBeVisible();

    await userPage.getByRole("link", { name: /Refund/ }).click();
    await userPage.waitForURL("**/dashboard/redeem/refund");

    await userPage.locator('input[name="amount"]').fill("15000");
    await Promise.all([
      userPage.waitForResponse((res) => res.request().method() === "POST"),
      userPage.getByRole("button", { name: "Submit request" }).click(),
    ]);
    await userPage.waitForURL("**/dashboard/redeem");

    await expect(userPage.getByText(/REFUND · ₹15000\.00/)).toBeVisible();
    await expect(userPage.getByText("PENDING").first()).toBeVisible();

    const request = await prisma.redemptionRequest.findFirstOrThrow({
      where: { userId: user.id, category: "REFUND" },
    });
    expect(request.status).toBe("PENDING");
    expect(Number(request.shortfallAmount)).toBe(0);

    // Admin approves through the real UI, in its own isolated session.
    await loginAsAdmin(adminPage);
    await adminPage.waitForURL("**/admin");
    await adminPage.goto("/admin/redemptions");

    const row = adminPage.locator("li", { has: adminPage.getByText(user.email) });
    await expect(row).toBeVisible();
    await Promise.all([
      adminPage.waitForResponse((res) => res.request().method() === "POST"),
      row.getByRole("button", { name: "Approve" }).click(),
    ]);

    const approved = await prisma.redemptionRequest.findUniqueOrThrow({ where: { id: request.id } });
    expect(approved.status).toBe("APPROVED");
    expect(Number(approved.reservedAmount)).toBe(0);

    const ledgerEntry = await prisma.ledgerEntry.findFirstOrThrow({
      where: { userId: user.id, transactionType: "REDEMPTION_REFUND" },
    });
    expect(Number(ledgerEntry.amount)).toBe(-15000);
    expect(Number(ledgerEntry.balanceAfter)).toBe(35000);

    const plan = await prisma.userPlan.findFirstOrThrow({ where: { userId: user.id } });
    expect(plan.status).toBe("PARTIALLY_REDEEMED");

    // Final business outcome, verified from the requesting user's own
    // session: the approval is visible and the dashboard balance reflects it.
    await userPage.goto("/dashboard/redeem");
    await expect(userPage.getByText(/REFUND · ₹15000\.00/)).toBeVisible();
    await expect(userPage.getByText("APPROVED").first()).toBeVisible();
    await expect(userPage.getByText("₹35000.00").first()).toBeVisible();

    await userPage.goto("/dashboard");
    await expect(userPage.getByText("₹35000.00").first()).toBeVisible();
  } finally {
    await close();
  }
});

test("BRD: full redemption (refund of the entire balance) reduces the plan status to REDEEMED", async ({ browser }) => {
  const { userPage, adminPage, close } = await newRoleContexts(browser);

  try {
    const { user, email, password } = await createUserWithRedeemableBalance(50000);

    await loginAsUser(userPage, email, password);
    await userPage.waitForURL("**/dashboard");
    await userPage.goto("/dashboard/redeem/refund");

    await userPage.locator('input[name="amount"]').fill("50000");
    await Promise.all([
      userPage.waitForResponse((res) => res.request().method() === "POST"),
      userPage.getByRole("button", { name: "Submit request" }).click(),
    ]);
    await userPage.waitForURL("**/dashboard/redeem");

    const request = await prisma.redemptionRequest.findFirstOrThrow({
      where: { userId: user.id, category: "REFUND" },
    });
    expect(request.status).toBe("PENDING");

    await loginAsAdmin(adminPage);
    await adminPage.waitForURL("**/admin");
    await adminPage.goto("/admin/redemptions");

    const row = adminPage.locator("li", { has: adminPage.getByText(user.email) });
    await Promise.all([
      adminPage.waitForResponse((res) => res.request().method() === "POST"),
      row.getByRole("button", { name: "Approve" }).click(),
    ]);

    const approved = await prisma.redemptionRequest.findUniqueOrThrow({ where: { id: request.id } });
    expect(approved.status).toBe("APPROVED");

    const ledgerEntry = await prisma.ledgerEntry.findFirstOrThrow({
      where: { userId: user.id, transactionType: "REDEMPTION_REFUND" },
    });
    expect(Number(ledgerEntry.balanceAfter)).toBe(0);

    const plan = await prisma.userPlan.findFirstOrThrow({ where: { userId: user.id } });
    expect(plan.status).toBe("REDEEMED");

    // Final business outcome, verified from the requesting user's own
    // session: the plan now shows as fully redeemed with a zero balance.
    await userPage.goto("/dashboard/redeem");
    await expect(userPage.getByText(/REFUND · ₹50000\.00/)).toBeVisible();
    await expect(userPage.getByText("APPROVED").first()).toBeVisible();
    await expect(userPage.getByText("₹0.00").first()).toBeVisible();
  } finally {
    await close();
  }
});
