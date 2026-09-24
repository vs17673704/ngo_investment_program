import { test, expect } from "playwright/test";
import { prisma, loginAsUser, loginAsAdmin, newRoleContexts, uniqueSuffix } from "../../helpers";
import { createUserWithRedeemableBalance } from "../fixtures";

// E2E-012 "Gadget Redemption With Shortfall, Offline Verification, and Admin
// Approval": a multi-item gadget cart exceeding Available Margin enters
// AWAITING_SHORTFALL_RESOLUTION with the catalogue inventory reserved (not
// yet deducted); the user may still revise the pending cart (old reservation
// released, not stacked, before the new one is taken); Admin verifies the
// offline shortfall evidence and then approves, converting the inventory
// reservation into a permanent stock deduction and posting a single ledger
// entry for only the internal (non-shortfall) portion — never a fictitious
// full-value or double debit.
//
// Note: E2E-012 step 7 ("Admin adds a message/concern against the enquiry
// during review") has no implemented UI or engine action anywhere in the
// app — RedemptionRequest.comments is a user-submission-time field only
// (see AmountRedeemForm.tsx / GadgetCartForm.tsx / actions.ts), and the
// admin redemptions screen has no comment/message affordance. Per this
// project's rule of never fabricating coverage for an unimplemented
// feature, that sub-step is intentionally not exercised here.
//
// Merged from the former redemption-gadgets-cart.spec.ts, which only
// covered the multi-item cart + modify-while-pending mechanics without ever
// exceeding the margin or completing an admin approval — this file
// preserves that mechanic inside the full shortfall->verify->approve->
// final-outcome chain instead of stopping partway.
test.describe.configure({ mode: "serial" });

test.afterAll(async () => {
  await prisma.$disconnect();
});

test("E2E-012: multi-item gadget cart exceeding margin enters shortfall, is revised while pending, then Admin verifies and approves it", async ({ browser }) => {
  const { userPage, adminPage, close } = await newRoleContexts(browser);

  try {
    const gadgetA = await prisma.gadgetItem.create({
      data: { category: "Accessories", name: `Cart Gadget A ${uniqueSuffix()}`, price: 1000, stockQuantity: 20, reservedQuantity: 0 },
    });
    const gadgetB = await prisma.gadgetItem.create({
      data: { category: "Accessories", name: `Cart Gadget B ${uniqueSuffix()}`, price: 2000, stockQuantity: 5, reservedQuantity: 0 },
    });

    // Preconditions per E2E-012: Actual Redeemable Balance = Available
    // Margin = ₹10,000, selected gadgets total ₹12,000 -> Shortfall ₹2,000.
    const { user, email, password } = await createUserWithRedeemableBalance(10000);

    await loginAsUser(userPage, email, password);
    await userPage.waitForURL("**/dashboard");
    await userPage.goto("/dashboard/redeem/gadgets");

    const rowA = userPage.locator("li", { has: userPage.getByText(gadgetA.name) });
    const rowB = userPage.locator("li", { has: userPage.getByText(gadgetB.name) });
    await rowA.getByRole("button", { name: `Increase ${gadgetA.name} quantity` }).click();
    await rowA.getByRole("button", { name: `Increase ${gadgetA.name} quantity` }).click();
    await rowB.getByRole("button", { name: `Increase ${gadgetB.name} quantity` }).click();

    await expect(userPage.getByText("Total requested amount:")).toBeVisible();
    await expect(userPage.getByText("₹4000.00")).toBeVisible(); // 2x1000 + 1x2000, no shortfall yet

    await Promise.all([
      userPage.waitForResponse((res) => res.request().method() === "POST"),
      userPage.getByRole("button", { name: "Submit request" }).click(),
    ]);
    await userPage.waitForURL("**/dashboard/redeem");

    let request = await prisma.redemptionRequest.findFirstOrThrow({
      where: { userId: user.id, category: "GADGETS" },
      include: { gadgetItems: true },
    });
    expect(request.status).toBe("PENDING");
    expect(request.gadgetItems).toHaveLength(2);
    expect(Number(request.requestedAmount)).toBe(4000);

    const gA1 = await prisma.gadgetItem.findUniqueOrThrow({ where: { id: gadgetA.id } });
    const gB1 = await prisma.gadgetItem.findUniqueOrThrow({ where: { id: gadgetB.id } });
    expect(gA1.reservedQuantity).toBe(2);
    expect(gB1.reservedQuantity).toBe(1);

    // Revise the still-pending cart to push the total to ₹12,000, exceeding
    // the ₹10,000 available margin: drop gadgetB, add enough of gadgetA to
    // cross the threshold. The old reservation (2xA + 1xB) must be released
    // before the new one (12xA) is taken, not stacked on top of it.
    await userPage.goto(`/dashboard/redeem/gadgets?edit=${request.id}`);
    await expect(userPage.getByText("Modify Gadget Redemption Request")).toBeVisible();

    const rowAEdit = userPage.locator("li", { has: userPage.getByText(gadgetA.name) });
    const rowBEdit = userPage.locator("li", { has: userPage.getByText(gadgetB.name) });
    for (let i = 0; i < 10; i++) {
      await rowAEdit.getByRole("button", { name: `Increase ${gadgetA.name} quantity` }).click();
    }
    await rowBEdit.getByRole("button", { name: `Decrease ${gadgetB.name} quantity` }).click();

    await Promise.all([
      userPage.waitForResponse((res) => res.request().method() === "POST"),
      userPage.getByRole("button", { name: "Update request" }).click(),
    ]);
    await userPage.waitForURL("**/dashboard/redeem");

    request = await prisma.redemptionRequest.findUniqueOrThrow({
      where: { id: request.id },
      include: { gadgetItems: true },
    });
    expect(request.status).toBe("AWAITING_SHORTFALL_RESOLUTION");
    expect(Number(request.requestedAmount)).toBe(12000);
    expect(Number(request.shortfallAmount)).toBe(2000);
    expect(request.gadgetItems).toHaveLength(1);
    expect(request.gadgetItems[0].quantity).toBe(12);

    // Old reservation fully released, new reservation applied — no double counting.
    const gA2 = await prisma.gadgetItem.findUniqueOrThrow({ where: { id: gadgetA.id } });
    const gB2 = await prisma.gadgetItem.findUniqueOrThrow({ where: { id: gadgetB.id } });
    expect(gA2.reservedQuantity).toBe(12);
    expect(gB2.reservedQuantity).toBe(0);
    // No financial processing / ledger debit while unresolved.
    const ledgerBefore = await prisma.ledgerEntry.count({
      where: { userId: user.id, transactionType: "REDEMPTION_GADGETS" },
    });
    expect(ledgerBefore).toBe(0);

    // Admin: approving before shortfall verification must be blocked.
    await loginAsAdmin(adminPage);
    await adminPage.waitForURL("**/admin");
    await adminPage.goto("/admin/redemptions");

    const row = adminPage.locator("li", { has: adminPage.getByText(user.email) });
    await expect(row).toBeVisible();
    await expect(row.getByRole("button", { name: "Approve" })).toBeDisabled();

    await Promise.all([
      adminPage.waitForResponse((res) => res.request().method() === "POST"),
      (async () => {
        await row.locator('input[name="reference"]').fill("BANK-TXN-REF-GADGET-1");
        await row.getByRole("button", { name: "Verify shortfall" }).click();
      })(),
    ]);

    const verified = await prisma.redemptionRequest.findUniqueOrThrow({ where: { id: request.id } });
    expect(verified.shortfallVerifiedAt).not.toBeNull();

    await adminPage.reload();
    const rowAfterVerify = adminPage.locator("li", { has: adminPage.getByText(user.email) });
    await Promise.all([
      adminPage.waitForResponse((res) => res.request().method() === "POST"),
      rowAfterVerify.getByRole("button", { name: "Approve" }).click(),
    ]);

    const approved = await prisma.redemptionRequest.findUniqueOrThrow({ where: { id: request.id } });
    expect(approved.status).toBe("APPROVED");

    // Reservation converts to a permanent stock deduction (both counters
    // decrement together); the shortfall itself is never debited.
    const gA3 = await prisma.gadgetItem.findUniqueOrThrow({ where: { id: gadgetA.id } });
    expect(gA3.stockQuantity).toBe(20 - 12);
    expect(gA3.reservedQuantity).toBe(0);

    const ledgerEntry = await prisma.ledgerEntry.findFirstOrThrow({
      where: { userId: user.id, transactionType: "REDEMPTION_GADGETS" },
    });
    expect(Number(ledgerEntry.amount)).toBe(-10000); // internal portion only (12,000 - 2,000 shortfall)
    expect(Number(ledgerEntry.balanceAfter)).toBe(0);

    // Final business outcome from the requesting user's own session.
    await userPage.goto("/dashboard/redeem");
    await expect(userPage.getByText("APPROVED").first()).toBeVisible();

    await prisma.redemptionGadgetItem.deleteMany({ where: { gadgetItemId: { in: [gadgetA.id, gadgetB.id] } } });
    await prisma.gadgetItem.deleteMany({ where: { id: { in: [gadgetA.id, gadgetB.id] } } });
  } finally {
    await close();
  }
});
