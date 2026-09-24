import { test, expect } from "playwright/test";
import { prisma, loginAsUser, loginAsAdmin, newRoleContexts } from "../../helpers";
import { createUserWithRedeemableBalance, createDonationRecipient, cleanupTestUser } from "../fixtures";

// BRD "Donation Processing" gap coverage: Admin-curated recipient selection,
// required user consent, system-generated transaction reference on approval,
// and downloadable PDF receipt generation. Complements the core
// partial/full ledger-processing coverage in
// redemption-donation-refund-e2e.spec.ts.
test.describe.configure({ mode: "serial" });

test.afterAll(async () => {
  await prisma.$disconnect();
});

test("donation recipient dropdown lists only active admin-curated recipients", async ({ page }) => {
  const { user, email, password } = await createUserWithRedeemableBalance(2000);
  const active = await createDonationRecipient({ active: true });
  const inactive = await createDonationRecipient({ active: false });

  try {
    await loginAsUser(page, email, password);
    await page.waitForURL("**/dashboard");
    await page.goto("/dashboard/redeem/donation");

    const options = page.locator('select[name="donationRecipientId"] option');
    await expect(options.filter({ hasText: active.name })).toHaveCount(1);
    await expect(options.filter({ hasText: inactive.name })).toHaveCount(0);
  } finally {
    await cleanupTestUser(user.id);
  }
});

test("submitting a donation without consent is rejected server-side and creates no request", async ({ page }) => {
  const { user, email, password } = await createUserWithRedeemableBalance(2000);
  const recipient = await createDonationRecipient();

  try {
    await loginAsUser(page, email, password);
    await page.waitForURL("**/dashboard");
    await page.goto("/dashboard/redeem/donation");

    await page.locator('input[name="amount"]').fill("500");
    await page.locator('select[name="donationRecipientId"]').selectOption(recipient.id);
    // Consent checkbox is native `required`, which blocks client-side
    // submission; bypass it with formnovalidate-equivalent JS removal so the
    // server-side check (the actual BRD requirement) is what's exercised.
    await page.evaluate(() => {
      document.querySelector('input[name="consent"]')?.removeAttribute("required");
    });
    await Promise.all([
      page.waitForResponse((res) => res.request().method() === "POST"),
      page.getByRole("button", { name: "Submit request" }).click(),
    ]);

    await expect(page.getByText("You must consent to this donation being processed before submitting.")).toBeVisible();

    const request = await prisma.redemptionRequest.findFirst({
      where: { userId: user.id, category: "DONATION" },
    });
    expect(request).toBeNull();
  } finally {
    await cleanupTestUser(user.id);
  }
});

test("approved donation records recipient/consent, generates a reference, and produces a downloadable receipt", async ({ browser }) => {
  const { userPage, adminPage, close } = await newRoleContexts(browser);

  try {
    const { user, email, password } = await createUserWithRedeemableBalance(4000);
    const recipient = await createDonationRecipient();

    await loginAsUser(userPage, email, password);
    await userPage.waitForURL("**/dashboard");
    await userPage.goto("/dashboard/redeem/donation");

    await userPage.locator('input[name="amount"]').fill("1500");
    await userPage.locator('select[name="donationRecipientId"]').selectOption(recipient.id);
    await userPage.locator('input[name="consent"]').check();
    await Promise.all([
      userPage.waitForResponse((res) => res.request().method() === "POST"),
      userPage.getByRole("button", { name: "Submit request" }).click(),
    ]);
    await userPage.waitForURL("**/dashboard/redeem");

    const request = await prisma.redemptionRequest.findFirstOrThrow({
      where: { userId: user.id, category: "DONATION" },
    });
    expect(request.donationRecipientId).toBe(recipient.id);
    expect(request.consentGiven).toBe(true);
    expect(request.consentGivenAt).not.toBeNull();
    expect(request.donationReference).toBeNull();

    await loginAsAdmin(adminPage);
    await adminPage.waitForURL("**/admin");
    await adminPage.goto("/admin/redemptions");

    const row = adminPage.locator("li", { has: adminPage.getByText(user.email) });
    await expect(row).toBeVisible();
    await expect(row.getByText(recipient.name)).toBeVisible();
    await expect(row.getByText("Consent given")).toBeVisible();
    await Promise.all([
      adminPage.waitForResponse((res) => res.request().method() === "POST"),
      row.getByRole("button", { name: "Approve" }).click(),
    ]);

    const approved = await prisma.redemptionRequest.findUniqueOrThrow({ where: { id: request.id } });
    expect(approved.status).toBe("APPROVED");
    expect(approved.donationReference).toMatch(/^DON-/);

    const ledgerEntry = await prisma.ledgerEntry.findFirstOrThrow({
      where: { userId: user.id, transactionType: "REDEMPTION_DONATION" },
    });
    expect(Number(ledgerEntry.amount)).toBe(-1500);

    // Receipt download, driven through the authenticated user session's own
    // cookies (Playwright's request context shares the page's cookie jar).
    const receiptResponse = await userPage.request.get(`/api/redemptions/${request.id}/receipt`);
    expect(receiptResponse.status()).toBe(200);
    expect(receiptResponse.headers()["content-type"]).toBe("application/pdf");
    const body = await receiptResponse.body();
    expect(body.length).toBeGreaterThan(100);

    const afterReceipt = await prisma.redemptionRequest.findUniqueOrThrow({ where: { id: request.id } });
    expect(afterReceipt.receiptGeneratedAt).not.toBeNull();

    // The user's own Redeem Hub surfaces the download action for an approved
    // donation request.
    await userPage.goto("/dashboard/redeem");
    await expect(userPage.getByRole("link", { name: "Download receipt" }).first()).toBeVisible();
  } finally {
    await close();
  }
});

test("receipt download is forbidden for a user who does not own the request", async ({ browser }) => {
  const { userPage, adminPage, close } = await newRoleContexts(browser);
  const otherContext = await browser.newContext();
  const otherPage = await otherContext.newPage();

  try {
    const { user: ownerUser, email: ownerEmail, password: ownerPassword } = await createUserWithRedeemableBalance(2000);
    const { user: otherUser, email: otherEmail, password: otherPassword } = await createUserWithRedeemableBalance(2000);
    const recipient = await createDonationRecipient();

    await loginAsUser(userPage, ownerEmail, ownerPassword);
    await userPage.waitForURL("**/dashboard");
    await userPage.goto("/dashboard/redeem/donation");
    await userPage.locator('input[name="amount"]').fill("500");
    await userPage.locator('select[name="donationRecipientId"]').selectOption(recipient.id);
    await userPage.locator('input[name="consent"]').check();
    await Promise.all([
      userPage.waitForResponse((res) => res.request().method() === "POST"),
      userPage.getByRole("button", { name: "Submit request" }).click(),
    ]);
    await userPage.waitForURL("**/dashboard/redeem");

    const request = await prisma.redemptionRequest.findFirstOrThrow({
      where: { userId: ownerUser.id, category: "DONATION" },
    });

    // Not yet approved: even the owner is refused a receipt at this point.
    const preApprovalResponse = await userPage.request.get(`/api/redemptions/${request.id}/receipt`);
    expect(preApprovalResponse.status()).toBe(400);

    await loginAsAdmin(adminPage);
    await adminPage.waitForURL("**/admin");
    await adminPage.goto("/admin/redemptions");
    const row = adminPage.locator("li", { has: adminPage.getByText(ownerUser.email) });
    await Promise.all([
      adminPage.waitForResponse((res) => res.request().method() === "POST"),
      row.getByRole("button", { name: "Approve" }).click(),
    ]);

    await loginAsUser(otherPage, otherEmail, otherPassword);
    await otherPage.waitForURL("**/dashboard");
    const forbiddenResponse = await otherPage.request.get(`/api/redemptions/${request.id}/receipt`);
    expect(forbiddenResponse.status()).toBe(403);

    await cleanupTestUser(otherUser.id);
  } finally {
    await otherContext.close();
    await close();
  }
});
