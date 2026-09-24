import { test, expect } from "playwright/test";
import { prisma, loginAsUser, loginAsAdmin, newRoleContexts } from "../../helpers";
import { createUserWithRedeemableBalance, createDonationRecipient, cleanupTestUser } from "../fixtures";

// TEST_SCENARIOS.md section 16-17 (TS-113-120): REFUND is already thoroughly
// covered cross-role by redemption-partial-and-full.spec.ts,
// redemption-status-timeline.spec.ts and redemption-shortfall.spec.ts, so
// this file focuses on the DONATION gap.
//
// TS-118 (REQ-DONATE-02, admin-configured/recorded donation recipient) and
// TS-120 (REQ-DONATE-04, donation receipt/document generation) are now
// implemented — see redemption-donation-recipient-e2e.spec.ts for dedicated
// coverage of recipient selection, consent enforcement, transaction
// reference generation and receipt download. This file continues to cover
// the core partial/full donation ledger-processing scenarios.
test.describe.configure({ mode: "serial" });

test.afterAll(async () => {
  await prisma.$disconnect();
});

test("BRD Rule XXXIV (TS-117): a partial donation is approved and debits only the internal portion", async ({ browser }) => {
  const { userPage, adminPage, close } = await newRoleContexts(browser);

  try {
    const { user, email, password } = await createUserWithRedeemableBalance(10000);
    const recipient = await createDonationRecipient();

    await loginAsUser(userPage, email, password);
    await userPage.waitForURL("**/dashboard");
    await userPage.goto("/dashboard/redeem/donation");

    await userPage.locator('input[name="amount"]').fill("3000");
    await userPage.locator('select[name="donationRecipientId"]').selectOption(recipient.id);
    await userPage.locator('textarea[name="comments"]').fill("Please donate to the education fund.");
    await userPage.locator('input[name="consent"]').check();
    await Promise.all([
      userPage.waitForResponse((res) => res.request().method() === "POST"),
      userPage.getByRole("button", { name: "Submit request" }).click(),
    ]);
    await userPage.waitForURL("**/dashboard/redeem");

    const request = await prisma.redemptionRequest.findFirstOrThrow({
      where: { userId: user.id, category: "DONATION" },
    });
    expect(request.status).toBe("PENDING");
    expect(Number(request.requestedAmount)).toBe(3000);
    expect(Number(request.shortfallAmount)).toBe(0);

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

    const ledgerEntry = await prisma.ledgerEntry.findFirstOrThrow({
      where: { userId: user.id, transactionType: "REDEMPTION_DONATION" },
    });
    expect(Number(ledgerEntry.amount)).toBe(-3000);
    expect(Number(ledgerEntry.balanceAfter)).toBe(7000);

    const notification = await prisma.notification.findFirstOrThrow({
      where: { userId: user.id, type: "REFUND_PROCESSED" },
    });
    expect(notification.title).toBe("Redemption approved");
    expect(notification.message).toContain("donation redemption of ₹3000.00");

    // Final business outcome from the requesting user's own session: approved
    // status and the reduced Redeemable Balance, both driven through the real UI.
    await userPage.goto("/dashboard/redeem");
    await expect(userPage.getByText("APPROVED").first()).toBeVisible();
    await userPage.goto("/dashboard");
    // Scoped to the specific stat tile: Total Interest can independently
    // coincide with the same rupee figure, so a bare getByText(amount) is a
    // strict-mode violation once more than one tile shares a value.
    // Scoped to the "Financial Summary" region's tiles: Total Interest can
    // independently coincide with the same rupee figure, so a bare
    // getByText(amount) is a strict-mode violation once more than one tile
    // shares a value. hasText on a single locator requires both substrings
    // to appear in the SAME element's combined text content, which for these
    // flex tiles is the tile div itself (label span + value span siblings).
    const balanceTile = userPage
      .getByRole("region", { name: "Financial Summary" })
      .locator("div")
      .filter({ hasText: "Redeemable Balance" })
      .filter({ hasText: "₹7000.00" });
    await expect(balanceTile.last()).toBeVisible();
  } finally {
    await close();
  }
});

test("REQ-DONATE-03 (TS-119): donating the full redeemable balance reduces it to exactly ₹0", async ({ page, browser }) => {
  const { user, email, password } = await createUserWithRedeemableBalance(5000);
  const recipient = await createDonationRecipient();

  await loginAsUser(page, email, password);
  await page.waitForURL("**/dashboard");
  await page.goto("/dashboard/redeem/donation");

  await page.locator('input[name="amount"]').fill("5000");
  await page.locator('select[name="donationRecipientId"]').selectOption(recipient.id);
  await page.locator('input[name="consent"]').check();
  await Promise.all([
    page.waitForResponse((res) => res.request().method() === "POST"),
    page.getByRole("button", { name: "Submit request" }).click(),
  ]);
  await page.waitForURL("**/dashboard/redeem");

  const request = await prisma.redemptionRequest.findFirstOrThrow({
    where: { userId: user.id, category: "DONATION" },
  });
  expect(request.status).toBe("PENDING");
  expect(Number(request.shortfallAmount)).toBe(0);

  const adminContext = await browser.newContext();
  const adminPage = await adminContext.newPage();
  await loginAsAdmin(adminPage);
  await adminPage.waitForURL("**/admin");
  await adminPage.goto("/admin/redemptions");

  const row = adminPage.locator("li", { has: adminPage.getByText(user.email) });
  await Promise.all([
    adminPage.waitForResponse((res) => res.request().method() === "POST"),
    row.getByRole("button", { name: "Approve" }).click(),
  ]);
  await adminContext.close();

  const ledgerEntry = await prisma.ledgerEntry.findFirstOrThrow({
    where: { userId: user.id, transactionType: "REDEMPTION_DONATION" },
  });
  expect(Number(ledgerEntry.amount)).toBe(-5000);
  expect(Number(ledgerEntry.balanceAfter)).toBe(0);

  // A fully-drained MATURED plan must flip to REDEEMED (BRD "Full vs Partial
  // Redemption"), and the user's own dashboard must reflect ₹0 balance.
  const userPlan = await prisma.userPlan.findFirstOrThrow({ where: { userId: user.id } });
  expect(userPlan.status).toBe("REDEEMED");

  await page.goto("/dashboard");
  // Scoped to the specific stat tile: a fully-drained account can coincide
  // with other tiles (e.g. Total Interest) also reading ₹0.00, which would
  // otherwise be a strict-mode violation.
  const balanceTile = page
    .getByRole("region", { name: "Financial Summary" })
    .locator("div")
    .filter({ hasText: "Redeemable Balance" })
    .filter({ hasText: "₹0.00" });
  await expect(balanceTile.last()).toBeVisible();

  await cleanupTestUser(user.id);
});
