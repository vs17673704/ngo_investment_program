import { test, expect } from "playwright/test";
import { prisma, loginAsUser, loginAsAdmin, newRoleContexts } from "../../helpers";
import { createUserWithRedeemableBalance } from "../fixtures";

// BRD Section 5 worked example (Accessories/Gadgets & general amount redemption):
//   Actual Redeemable Balance ₹10,000, Available Margin ₹10,000,
//   Requested ₹12,000 -> Shortfall ₹2,000 -> request allowed to submit,
//   moves to AWAITING_SHORTFALL_RESOLUTION, no ledger debit yet.
// Offline resolution -> Admin verifies (reference) -> Admin approves ->
// financial processing -> ledger entry created for the internal portion only.
//
// Also covers user-initiated cancellation of both a shortfall request and a
// normal PENDING request (merged from the former
// redemption-shortfall-cancellation.spec.ts — same fixture/domain, no
// cross-role interaction needed for cancellation itself).
test.describe.configure({ mode: "serial" });

test.afterAll(async () => {
  await prisma.$disconnect();
});

test("BRD: a redemption request exceeding Available Margin is allowed to submit with a shortfall and requires Admin verification before approval", async ({ browser }) => {
  const { userPage, adminPage, close } = await newRoleContexts(browser);

  try {
    const { user, email, password } = await createUserWithRedeemableBalance(10000);

    await loginAsUser(userPage, email, password);
    await userPage.waitForURL("**/dashboard");
    await userPage.goto("/dashboard/redeem/refund");

    await userPage.locator('input[name="amount"]').fill("12000");
    await Promise.all([
      userPage.waitForResponse((res) => res.request().method() === "POST"),
      userPage.getByRole("button", { name: "Submit request" }).click(),
    ]);
    await userPage.waitForURL("**/dashboard/redeem");

    const request = await prisma.redemptionRequest.findFirstOrThrow({
      where: { userId: user.id, category: "REFUND" },
    });
    expect(request.status).toBe("AWAITING_SHORTFALL_RESOLUTION");
    expect(Number(request.shortfallAmount)).toBe(2000);
    // No financial processing / ledger debit while unresolved.
    const ledgerBefore = await prisma.ledgerEntry.count({
      where: { userId: user.id, transactionType: "REDEMPTION_REFUND" },
    });
    expect(ledgerBefore).toBe(0);

    await expect(userPage.getByTestId("request-status-badge")).toHaveText("AWAITING SHORTFALL RESOLUTION");
    await expect(userPage.getByText(/Shortfall ₹2000\.00/)).toBeVisible();

    // Admin: approving before shortfall verification must be blocked (button disabled).
    await loginAsAdmin(adminPage);
    await adminPage.waitForURL("**/admin");
    await adminPage.goto("/admin/redemptions");

    const row = adminPage.locator("li", { has: adminPage.getByText(user.email) });
    await expect(row).toBeVisible();
    await expect(row.getByRole("button", { name: "Approve" })).toBeDisabled();

    // Admin verifies the offline shortfall resolution.
    await Promise.all([
      adminPage.waitForResponse((res) => res.request().method() === "POST"),
      (async () => {
        await row.locator('input[name="reference"]').fill("BANK-TXN-REF-12345");
        await row.getByRole("button", { name: "Verify shortfall" }).click();
      })(),
    ]);

    const verified = await prisma.redemptionRequest.findUniqueOrThrow({ where: { id: request.id } });
    expect(verified.shortfallVerifiedAt).not.toBeNull();
    expect(verified.shortfallReference).toBe("BANK-TXN-REF-12345");

    await adminPage.reload();
    const rowAfterVerify = adminPage.locator("li", { has: adminPage.getByText(user.email) });
    await expect(rowAfterVerify.getByRole("button", { name: "Approve" })).toBeEnabled();

    await Promise.all([
      adminPage.waitForResponse((res) => res.request().method() === "POST"),
      rowAfterVerify.getByRole("button", { name: "Approve" }).click(),
    ]);

    const approved = await prisma.redemptionRequest.findUniqueOrThrow({ where: { id: request.id } });
    expect(approved.status).toBe("APPROVED");

    // Only the internal portion (requested - shortfall = 10,000) is debited;
    // the shortfall itself never touches the ledger.
    const ledgerEntry = await prisma.ledgerEntry.findFirstOrThrow({
      where: { userId: user.id, transactionType: "REDEMPTION_REFUND" },
    });
    expect(Number(ledgerEntry.amount)).toBe(-10000);
    expect(Number(ledgerEntry.balanceAfter)).toBe(0);

    // Final business outcome from the requesting user's own session.
    await userPage.goto("/dashboard/redeem");
    await expect(userPage.getByText("APPROVED").first()).toBeVisible();
  } finally {
    await close();
  }
});

test("BRD: cancelling a shortfall request releases the reservation with no ledger debit", async ({ page }) => {
  const { user, email, password } = await createUserWithRedeemableBalance(10000);

  await loginAsUser(page, email, password);
  await page.waitForURL("**/dashboard");
  await page.goto("/dashboard/redeem/refund");

  await page.locator('input[name="amount"]').fill("12000");
  await Promise.all([
    page.waitForResponse((res) => res.request().method() === "POST"),
    page.getByRole("button", { name: "Submit request" }).click(),
  ]);
  await page.waitForURL("**/dashboard/redeem");

  const request = await prisma.redemptionRequest.findFirstOrThrow({
    where: { userId: user.id, category: "REFUND" },
  });
  expect(request.status).toBe("AWAITING_SHORTFALL_RESOLUTION");

  const row = page.locator("li", { hasText: "REFUND · ₹12000.00" });
  await expect(row).toBeVisible();
  await Promise.all([
    page.waitForResponse((res) => res.request().method() === "POST"),
    row.getByRole("button", { name: "Cancel" }).click(),
  ]);

  const cancelled = await prisma.redemptionRequest.findUniqueOrThrow({ where: { id: request.id } });
  expect(cancelled.status).toBe("CANCELLED");
  expect(Number(cancelled.reservedAmount)).toBe(0);

  const ledgerCount = await prisma.ledgerEntry.count({
    where: { userId: user.id, transactionType: "REDEMPTION_REFUND" },
  });
  expect(ledgerCount).toBe(0);

  // Cancel button must disappear once cancelled (only PENDING/AWAITING states show it).
  await page.reload();
  const rowAfter = page.locator("li", { hasText: "REFUND · ₹12000.00" });
  await expect(rowAfter.getByRole("button", { name: "Cancel" })).toHaveCount(0);
  await expect(rowAfter.getByTestId("request-status-badge")).toHaveText("CANCELLED");
});

test("BRD: a normal PENDING (non-shortfall) request can also be cancelled by the user", async ({ page }) => {
  const { user, email, password } = await createUserWithRedeemableBalance(10000);

  await loginAsUser(page, email, password);
  await page.waitForURL("**/dashboard");
  await page.goto("/dashboard/redeem/refund");

  await page.locator('input[name="amount"]').fill("5000");
  await Promise.all([
    page.waitForResponse((res) => res.request().method() === "POST"),
    page.getByRole("button", { name: "Submit request" }).click(),
  ]);
  await page.waitForURL("**/dashboard/redeem");

  const request = await prisma.redemptionRequest.findFirstOrThrow({
    where: { userId: user.id, category: "REFUND" },
  });
  expect(request.status).toBe("PENDING");

  const row = page.locator("li", { hasText: "REFUND · ₹5000.00" });
  await Promise.all([
    page.waitForResponse((res) => res.request().method() === "POST"),
    row.getByRole("button", { name: "Cancel" }).click(),
  ]);

  const cancelled = await prisma.redemptionRequest.findUniqueOrThrow({ where: { id: request.id } });
  expect(cancelled.status).toBe("CANCELLED");
});
