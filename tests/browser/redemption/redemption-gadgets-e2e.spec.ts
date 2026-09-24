import { test, expect } from "playwright/test";
import { prisma, loginAsUser, loginAsAdmin, newRoleContexts, uniqueSuffix } from "../../helpers";
import { createUserWithRedeemableBalance } from "../fixtures";

// E2E-06 "User Gadget Request -> Admin Approval -> Inventory Result": the
// straightforward within-margin path (no shortfall). Complements
// redemption-gadgets-shortfall-e2e.spec.ts (E2E-012), which only exercises
// the over-margin/shortfall-verification branch and therefore never proves
// the plain approve -> inventory-deducted -> user-sees-final-order-and-
// reduced-catalog-stock outcome that E2E-06's Expected Results call for.
test.describe.configure({ mode: "serial" });

test.afterAll(async () => {
  await prisma.$disconnect();
});

test("E2E-06: a gadget request within Available Margin is approved, deducts inventory only on approval, and the user sees the final order, balance, and reduced catalog stock", async ({
  browser,
}) => {
  const { userPage, adminPage, close } = await newRoleContexts(browser);

  try {
    const gadget = await prisma.gadgetItem.create({
      data: { category: "Accessories", name: `Plain Gadget ${uniqueSuffix()}`, price: 1500, stockQuantity: 10, reservedQuantity: 0 },
    });
    const { user, email, password } = await createUserWithRedeemableBalance(5000);

    await loginAsUser(userPage, email, password);
    await userPage.waitForURL("**/dashboard");
    await userPage.goto("/dashboard/redeem/gadgets");

    const row = userPage.locator("li", { has: userPage.getByText(gadget.name) });
    await expect(row).toContainText("10 in stock");
    await row.getByRole("button", { name: `Increase ${gadget.name} quantity` }).click();
    await row.getByRole("button", { name: `Increase ${gadget.name} quantity` }).click();
    await expect(userPage.getByText("₹3000.00")).toBeVisible();

    await Promise.all([
      userPage.waitForResponse((res) => res.request().method() === "POST"),
      userPage.getByRole("button", { name: "Submit request" }).click(),
    ]);
    await userPage.waitForURL("**/dashboard/redeem");

    const request = await prisma.redemptionRequest.findFirstOrThrow({
      where: { userId: user.id, category: "GADGETS" },
      include: { gadgetItems: true },
    });
    expect(request.status).toBe("PENDING");
    expect(Number(request.requestedAmount)).toBe(3000);
    expect(Number(request.shortfallAmount ?? 0)).toBe(0);

    // Reserved, but not yet deducted from sellable stock, at submission time.
    const reserved = await prisma.gadgetItem.findUniqueOrThrow({ where: { id: gadget.id } });
    expect(reserved.reservedQuantity).toBe(2);
    expect(reserved.stockQuantity).toBe(10);

    await loginAsAdmin(adminPage);
    await adminPage.waitForURL("**/admin");
    await adminPage.goto("/admin/redemptions");

    const adminRow = adminPage.locator("li", { has: adminPage.getByText(user.email) });
    await expect(adminRow).toBeVisible();
    await expect(adminRow.getByRole("button", { name: "Approve" })).toBeEnabled();

    await Promise.all([
      adminPage.waitForResponse((res) => res.request().method() === "POST"),
      adminRow.getByRole("button", { name: "Approve" }).click(),
    ]);

    const approved = await prisma.redemptionRequest.findUniqueOrThrow({ where: { id: request.id } });
    expect(approved.status).toBe("APPROVED");

    // Inventory is deducted for real only now, on approval.
    const deducted = await prisma.gadgetItem.findUniqueOrThrow({ where: { id: gadget.id } });
    expect(deducted.stockQuantity).toBe(8);
    expect(deducted.reservedQuantity).toBe(0);

    const ledgerEntry = await prisma.ledgerEntry.findFirstOrThrow({
      where: { userId: user.id, transactionType: "REDEMPTION_GADGETS" },
    });
    expect(Number(ledgerEntry.amount)).toBe(-3000);
    expect(Number(ledgerEntry.balanceAfter)).toBe(2000);

    // User's final view: approved order, updated balance, and the catalog's
    // reduced stock count — not merely an "approved" status flip.
    await userPage.goto("/dashboard/redeem");
    await expect(userPage.getByText("APPROVED").first()).toBeVisible();

    await userPage.goto("/dashboard/redeem/gadgets");
    await expect(userPage.getByText("Available Margin: ₹2000.00", { exact: true })).toBeVisible();
    await expect(userPage.locator("li", { has: userPage.getByText(gadget.name) })).toContainText("8 in stock");

    await prisma.redemptionGadgetItem.deleteMany({ where: { gadgetItemId: gadget.id } });
    await prisma.gadgetItem.delete({ where: { id: gadget.id } });
  } finally {
    await close();
  }
});
