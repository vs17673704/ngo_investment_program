import { test, expect, type Page } from "playwright/test";
import { prisma, loginAsUser, loginAsAdmin, newRoleContexts, uniqueSuffix } from "../../helpers";
import { createUserWithRedeemableBalance, createFranchiseePlanWithColleges, cleanupTestUser } from "../fixtures";

// See admin-notifications.spec.ts for the diagnosed reason this is needed:
// on this spec's accumulated dev database, /admin/redemptions' list can grow
// long enough that the fixed-position PushOptIn "Enable notifications"
// banner ends up directly under this test's target row, and Playwright's
// click() retries actionability indefinitely (no actionTimeout configured)
// rather than throwing — silently hanging until the outer test timeout.
async function suppressPushOptIn(page: Page) {
  await page.addInitScript(() => sessionStorage.setItem("push-opt-in-dismissed", "1"));
}

// TEST_SCENARIOS.md section 15 (TS-107-112) + E2E-07 (P1): FranchiseeRedemptionEnquiry
// is a structurally SEPARATE Prisma model from RedemptionRequest (the
// RedemptionCategory.FRANCHISEE enum value is not used by this code path) —
// it has no statusEvents timeline, no reservedAmount, no comments field, and
// no cancel action, so its coverage cannot simply reuse the normal
// redemption specs. E2E-07 requires covering BOTH the approval and rejection
// outcomes ("no scenario stops at 'under review'").
test.describe.configure({ mode: "serial" });

test.afterAll(async () => {
  await prisma.$disconnect();
});

test("E2E-07/TS-108: a franchisee enquiry within Available Margin is approved and debits the ledger with a plan/college-referencing description", async ({ browser }) => {
  const { userPage, adminPage, close } = await newRoleContexts(browser);

  try {
    const { user, email, password } = await createUserWithRedeemableBalance(30000);
    const { franchiseePlan, college } = await createFranchiseePlanWithColleges({ oneTimeDeductiblePrice: 20000 });

    await suppressPushOptIn(userPage);
    await loginAsUser(userPage, email, password);
    await userPage.waitForURL("**/dashboard");
    await userPage.goto("/dashboard/redeem/franchisee");

    // hasText matches every ancestor div up to the page shell too, so scope
    // to the innermost match (the actual plan card) with .last(), mirroring
    // the fix applied to the dashboard stat-tile assertions in the donation file.
    const planCard = userPage
      .locator("div")
      .filter({ hasText: franchiseePlan.name })
      .filter({ has: userPage.locator('select[name="collegeId"]') })
      .last();
    await expect(planCard).toBeVisible();
    await expect(planCard.getByText("Shortfall")).toHaveCount(0);
    await planCard.locator('select[name="collegeId"]').selectOption({ label: college.name });
    await Promise.all([
      userPage.waitForResponse((res) => res.request().method() === "POST"),
      planCard.getByRole("button", { name: "Submit enquiry" }).click(),
    ]);

    const enquiry = await prisma.franchiseeRedemptionEnquiry.findFirstOrThrow({
      where: { userId: user.id, franchiseePlanId: franchiseePlan.id },
    });
    expect(enquiry.status).toBe("PENDING");
    expect(Number(enquiry.requestedAmount)).toBe(20000);

    await suppressPushOptIn(adminPage);
    await loginAsAdmin(adminPage);
    await adminPage.waitForURL("**/admin");
    await adminPage.goto("/admin/redemptions");

    const row = adminPage.locator("li", { has: adminPage.getByText(user.email) });
    await expect(row).toBeVisible();
    await Promise.all([
      adminPage.waitForResponse((res) => res.request().method() === "POST"),
      row.getByRole("button", { name: "Approve" }).click(),
    ]);

    const approved = await prisma.franchiseeRedemptionEnquiry.findUniqueOrThrow({ where: { id: enquiry.id } });
    expect(approved.status).toBe("APPROVED");

    const ledgerEntry = await prisma.ledgerEntry.findFirstOrThrow({
      where: { userId: user.id, transactionType: "REDEMPTION_FRANCHISEE" },
    });
    expect(Number(ledgerEntry.amount)).toBe(-20000);
    expect(Number(ledgerEntry.balanceAfter)).toBe(10000);
    // TS-111: the ledger/audit trail retains a reference to this specific
    // enquiry only via the description string (no structured FK exists).
    expect(ledgerEntry.description).toBe(`Franchisee redemption approved (${enquiry.id})`);

    // TS-110: franchisee redemption draws only from Redeemable Balance/Available
    // Margin and never touches UserPlan/Plan status — confirmed by construction
    // (approveFranchiseeEnquiryAction never writes to UserPlan), verified here
    // by checking the plan is still MATURED, not flipped to REDEEMED/PARTIALLY_REDEEMED.
    const userPlan = await prisma.userPlan.findFirstOrThrow({ where: { userId: user.id } });
    expect(userPlan.status).toBe("MATURED");

    const notification = await prisma.notification.findFirstOrThrow({
      where: { userId: user.id, type: "REFUND_PROCESSED" },
    });
    expect(notification.title).toBe("Franchisee enquiry approved");

    await userPage.goto("/dashboard/redeem");
    await expect(userPage.getByText(`FRANCHISEE · ${franchiseePlan.name} (${college.name})`)).toBeVisible();
  } finally {
    await close();
  }
});

test("BRD Appendix A worked example (TS-109): a franchisee price exceeding Available Margin requires shortfall verification before approval", async ({ page, browser }) => {
  // BRD Appendix A: price ₹80,000, available margin ₹50,000 -> shortfall ₹30,000.
  const { user, email, password } = await createUserWithRedeemableBalance(50000);
  const { franchiseePlan, college } = await createFranchiseePlanWithColleges({ oneTimeDeductiblePrice: 80000 });

  await suppressPushOptIn(page);
  await loginAsUser(page, email, password);
  await page.waitForURL("**/dashboard");
  await page.goto("/dashboard/redeem/franchisee");

  const planCard = page
    .locator("div")
    .filter({ hasText: franchiseePlan.name })
    .filter({ has: page.locator('select[name="collegeId"]') })
    .last();
  await expect(planCard.getByText(/Shortfall ₹30000\.00/)).toBeVisible();
  await planCard.locator('select[name="collegeId"]').selectOption({ label: college.name });
  await Promise.all([
    page.waitForResponse((res) => res.request().method() === "POST"),
    planCard.getByRole("button", { name: "Submit enquiry" }).click(),
  ]);

  const enquiry = await prisma.franchiseeRedemptionEnquiry.findFirstOrThrow({
    where: { userId: user.id, franchiseePlanId: franchiseePlan.id },
  });
  expect(enquiry.status).toBe("AWAITING_SHORTFALL_RESOLUTION");
  expect(Number(enquiry.shortfallAmount)).toBe(30000);

  const adminContext = await browser.newContext();
  const adminPage = await adminContext.newPage();
  await suppressPushOptIn(adminPage);
  await loginAsAdmin(adminPage);
  await adminPage.waitForURL("**/admin");
  await adminPage.goto("/admin/redemptions");

  const row = adminPage.locator("li", { has: adminPage.getByText(user.email) });
  await expect(row.getByRole("button", { name: "Approve" })).toBeDisabled();

  await Promise.all([
    adminPage.waitForResponse((res) => res.request().method() === "POST"),
    (async () => {
      await row.locator('input[name="reference"]').fill("BANK-TXN-FRANCHISEE-7001");
      await row.getByRole("button", { name: "Verify shortfall" }).click();
    })(),
  ]);

  await adminPage.reload();
  const rowAfterVerify = adminPage.locator("li", { has: adminPage.getByText(user.email) });
  await expect(rowAfterVerify.getByRole("button", { name: "Approve" })).toBeEnabled();

  await Promise.all([
    adminPage.waitForResponse((res) => res.request().method() === "POST"),
    rowAfterVerify.getByRole("button", { name: "Approve" }).click(),
  ]);
  await adminContext.close();

  const approved = await prisma.franchiseeRedemptionEnquiry.findUniqueOrThrow({ where: { id: enquiry.id } });
  expect(approved.status).toBe("APPROVED");

  const ledgerEntry = await prisma.ledgerEntry.findFirstOrThrow({
    where: { userId: user.id, transactionType: "REDEMPTION_FRANCHISEE" },
  });
  expect(Number(ledgerEntry.amount)).toBe(-50000);
  expect(Number(ledgerEntry.balanceAfter)).toBe(0);

  await cleanupTestUser(user.id);
});

test("E2E-07: a rejected franchisee enquiry notifies the user with a generic templated message (no admin-authored reason field exists)", async ({ browser }) => {
  const { userPage, adminPage, close } = await newRoleContexts(browser);

  try {
    const { user, email, password } = await createUserWithRedeemableBalance(25000);
    const { franchiseePlan, college } = await createFranchiseePlanWithColleges({ oneTimeDeductiblePrice: 15000 });

    await suppressPushOptIn(userPage);
    await loginAsUser(userPage, email, password);
    await userPage.waitForURL("**/dashboard");
    await userPage.goto("/dashboard/redeem/franchisee");

    // hasText matches every ancestor div up to the page shell too, so scope
    // to the innermost match (the actual plan card) with .last(), mirroring
    // the fix applied to the dashboard stat-tile assertions in the donation file.
    const planCard = userPage
      .locator("div")
      .filter({ hasText: franchiseePlan.name })
      .filter({ has: userPage.locator('select[name="collegeId"]') })
      .last();
    await planCard.locator('select[name="collegeId"]').selectOption({ label: college.name });
    await Promise.all([
      userPage.waitForResponse((res) => res.request().method() === "POST"),
      planCard.getByRole("button", { name: "Submit enquiry" }).click(),
    ]);

    const enquiry = await prisma.franchiseeRedemptionEnquiry.findFirstOrThrow({
      where: { userId: user.id, franchiseePlanId: franchiseePlan.id },
    });

    await suppressPushOptIn(adminPage);
    await loginAsAdmin(adminPage);
    await adminPage.waitForURL("**/admin");
    await adminPage.goto("/admin/redemptions");

    const row = adminPage.locator("li", { has: adminPage.getByText(user.email) });
    await expect(row).toBeVisible();
    // Unlike normal redemptions' RejectForm (input[name="reason"] + Reject),
    // the franchisee reject action is a bare button with no reason input.
    await expect(row.locator('input[name="reason"]')).toHaveCount(0);
    await Promise.all([
      adminPage.waitForResponse((res) => res.request().method() === "POST"),
      row.getByRole("button", { name: "Reject" }).click(),
    ]);

    const rejected = await prisma.franchiseeRedemptionEnquiry.findUniqueOrThrow({ where: { id: enquiry.id } });
    expect(rejected.status).toBe("REJECTED");

    const notification = await prisma.notification.findFirstOrThrow({
      where: { userId: user.id, type: "ADMIN_MESSAGE" },
    });
    expect(notification.title).toBe("Franchisee enquiry rejected");
    expect(notification.message).toBe(
      `Your franchisee redemption enquiry of ₹${Number(enquiry.requestedAmount).toFixed(2)} was rejected by the Admin.`,
    );

    // No ledger entry must ever have been created for a rejected enquiry.
    const ledgerCount = await prisma.ledgerEntry.count({
      where: { userId: user.id, transactionType: "REDEMPTION_FRANCHISEE" },
    });
    expect(ledgerCount).toBe(0);

    await userPage.goto("/dashboard/redeem");
    await expect(userPage.getByText(`FRANCHISEE · ${franchiseePlan.name} (${college.name})`)).toBeVisible();
  } finally {
    await close();
  }
});

test("FranchiseeForm only ever offers colleges mapped to that specific plan (structurally impossible to select an unmapped one)", async ({ page }) => {
  const { user, email, password } = await createUserWithRedeemableBalance(10000);
  const { franchiseePlan, college } = await createFranchiseePlanWithColleges({ oneTimeDeductiblePrice: 5000 });
  const unmappedCollege = await prisma.college.create({ data: { name: `Unmapped College ${uniqueSuffix()}` } });

  await loginAsUser(page, email, password);
  await page.waitForURL("**/dashboard");
  await page.goto("/dashboard/redeem/franchisee");

  const planCard = page
    .locator("div")
    .filter({ hasText: franchiseePlan.name })
    .filter({ has: page.locator('select[name="collegeId"]') })
    .last();
  const select = planCard.locator('select[name="collegeId"]');
  await expect(select.locator("option", { hasText: college.name })).toHaveCount(1);
  await expect(select.locator("option", { hasText: unmappedCollege.name })).toHaveCount(0);

  await prisma.college.delete({ where: { id: unmappedCollege.id } });
  await cleanupTestUser(user.id);
});
