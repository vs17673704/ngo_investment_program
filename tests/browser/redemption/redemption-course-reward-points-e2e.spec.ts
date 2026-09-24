import { test, expect, type Page } from "playwright/test";
import { prisma, loginAsUser, loginAsAdmin, newRoleContexts, uniqueSuffix } from "../../helpers";
import { createUserWithRedeemableBalance, cleanupTestUser } from "../fixtures";

// See admin-notifications.spec.ts for the diagnosed reason this is needed:
// on this spec's accumulated dev database, both /dashboard/redeem/course and
// /admin/redemptions can grow long enough that the fixed-position PushOptIn
// "Enable notifications" banner ends up directly over this test's target
// row, and Playwright's click() retries actionability indefinitely (no
// actionTimeout configured) rather than throwing — silently hanging until
// the outer test timeout.
async function suppressPushOptIn(page: Page) {
  await page.addInitScript(() => sessionStorage.setItem("push-opt-in-dismissed", "1"));
}

// TEST_SCENARIOS.md section 13 (TS-096-100).
test.describe.configure({ mode: "serial" });

test.afterAll(async () => {
  await prisma.$disconnect();
});

async function createCourseFixture(fee: number) {
  const university = await prisma.university.create({ data: { name: `Test University ${uniqueSuffix()}` } });
  const course = await prisma.course.create({
    data: { universityId: university.id, name: `Test Course ${uniqueSuffix()}`, fee },
  });
  return { university, course };
}

test("BRD Rule XIII/XXXIII (TS-096/TS-099): course redemption debits the full fee and credits CEILING-rounded reward points", async ({ browser }) => {
  const { userPage, adminPage, close } = await newRoleContexts(browser);

  try {
    // seed-plan-basic's rewardPercent is 2 (prisma/seed.ts); a fee of 12345
    // produces a non-integer raw reward-points value (12345 * 0.02 = 246.9)
    // so the CEILING rule (not floor, per BRD's Client-Requested Deviation
    // (b)) is genuinely exercised: expected credited points = 247, not 246.
    const fee = 12345;
    const { user, email, password } = await createUserWithRedeemableBalance(20000);
    const { course } = await createCourseFixture(fee);

    await suppressPushOptIn(userPage);
    await loginAsUser(userPage, email, password);
    await userPage.waitForURL("**/dashboard");
    await userPage.goto("/dashboard/redeem/course");

    const courseRow = userPage.locator("li", { hasText: course.name });
    await expect(courseRow).toBeVisible();
    await expect(courseRow.getByText("Shortfall")).toHaveCount(0);
    await Promise.all([
      userPage.waitForResponse((res) => res.request().method() === "POST"),
      courseRow.getByRole("button", { name: "Request" }).click(),
    ]);

    const request = await prisma.redemptionRequest.findFirstOrThrow({
      where: { userId: user.id, category: "COURSE", relatedCourseId: course.id },
    });
    expect(request.status).toBe("PENDING");
    expect(Number(request.requestedAmount)).toBe(fee);

    await suppressPushOptIn(adminPage);
    await loginAsAdmin(adminPage);
    await adminPage.waitForURL("**/admin");
    await adminPage.goto("/admin/redemptions");

    const adminRow = adminPage.locator("li", { has: adminPage.getByText(user.email) });
    await expect(adminRow).toBeVisible();
    await Promise.all([
      adminPage.waitForResponse((res) => res.request().method() === "POST"),
      adminRow.getByRole("button", { name: "Approve" }).click(),
    ]);

    const approved = await prisma.redemptionRequest.findUniqueOrThrow({ where: { id: request.id } });
    expect(approved.status).toBe("APPROVED");

    const ledgerEntry = await prisma.ledgerEntry.findFirstOrThrow({
      where: { userId: user.id, transactionType: "REDEMPTION_COURSE" },
    });
    expect(Number(ledgerEntry.amount)).toBe(-fee);
    expect(Number(ledgerEntry.balanceAfter)).toBe(20000 - fee);

    const credited = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(credited.rewardPointsBalance).toBe(247);

    await userPage.goto("/dashboard");
    await expect(userPage.getByText("247 PTS")).toBeVisible();
  } finally {
    await close();
  }
});

test("BRD Rule XXII (TS-098): a course fee exceeding Available Margin requires shortfall verification before the fee is debited", async ({ page, browser }) => {
  const { user, email, password } = await createUserWithRedeemableBalance(10000);
  const fee = 15000;
  const { course } = await createCourseFixture(fee);

  await suppressPushOptIn(page);
  await loginAsUser(page, email, password);
  await page.waitForURL("**/dashboard");
  await page.goto("/dashboard/redeem/course");

  const courseRow = page.locator("li", { hasText: course.name });
  await expect(courseRow.getByText(/Shortfall ₹5000\.00/)).toBeVisible();
  await Promise.all([
    page.waitForResponse((res) => res.request().method() === "POST"),
    courseRow.getByRole("button", { name: "Request" }).click(),
  ]);

  const request = await prisma.redemptionRequest.findFirstOrThrow({
    where: { userId: user.id, category: "COURSE", relatedCourseId: course.id },
  });
  expect(request.status).toBe("AWAITING_SHORTFALL_RESOLUTION");
  expect(Number(request.shortfallAmount)).toBe(5000);

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
      await row.locator('input[name="reference"]').fill("BANK-TXN-COURSE-9001");
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

  const approved = await prisma.redemptionRequest.findUniqueOrThrow({ where: { id: request.id } });
  expect(approved.status).toBe("APPROVED");

  // Only the internal portion (fee - shortfall = 10,000) is debited; the
  // shortfall itself never touches the ledger.
  const ledgerEntry = await prisma.ledgerEntry.findFirstOrThrow({
    where: { userId: user.id, transactionType: "REDEMPTION_COURSE" },
  });
  expect(Number(ledgerEntry.amount)).toBe(-10000);
  expect(Number(ledgerEntry.balanceAfter)).toBe(0);

  await page.goto("/dashboard/redeem");
  await expect(page.getByText("APPROVED").first()).toBeVisible();

  await cleanupTestUser(user.id);
});

test("BRD Rule XIII (TS-097): a course redemption automatically pays part of the fee from previously-earned reward points, debiting only the remainder", async ({ browser }) => {
  test.setTimeout(120_000);
  const { userPage, adminPage, close } = await newRoleContexts(browser);

  try {
    // BRD.md Appendix A Scenario B: fee 15,000, existing points balance
    // 1,500 (all of it used automatically, matching 1 point = ₹1), leaving
    // 13,500 to be drawn from Redeemable Balance. seed-plan-basic's
    // rewardPercent is 2, so newly earned points = ceil(15000 * 0.02) = 300.
    const fee = 15000;
    const redeemableBalance = 20000;
    const existingRewardPoints = 1500;
    const { user, email, password } = await createUserWithRedeemableBalance(redeemableBalance);
    await prisma.user.update({ where: { id: user.id }, data: { rewardPointsBalance: existingRewardPoints } });
    const { course } = await createCourseFixture(fee);

    await suppressPushOptIn(userPage);
    await loginAsUser(userPage, email, password);
    await userPage.waitForURL("**/dashboard");
    await userPage.goto("/dashboard/redeem/course");

    const courseRow = userPage.locator("li", { hasText: course.name });
    await expect(courseRow).toBeVisible();
    await expect(courseRow.getByText("Shortfall")).toHaveCount(0);
    await Promise.all([
      userPage.waitForResponse((res) => res.request().method() === "POST"),
      courseRow.getByRole("button", { name: "Request" }).click(),
    ]);

    const request = await prisma.redemptionRequest.findFirstOrThrow({
      where: { userId: user.id, category: "COURSE", relatedCourseId: course.id },
    });
    expect(request.status).toBe("PENDING");
    expect(Number(request.requestedAmount)).toBe(fee);
    expect(request.rewardPointsApplied).toBe(existingRewardPoints);
    expect(Number(request.reservedAmount)).toBe(fee - existingRewardPoints);

    await suppressPushOptIn(adminPage);
    await loginAsAdmin(adminPage);
    await adminPage.waitForURL("**/admin");
    await adminPage.goto("/admin/redemptions");

    const adminRow = adminPage.locator("li", { has: adminPage.getByText(user.email) });
    await expect(adminRow).toBeVisible();
    await Promise.all([
      adminPage.waitForResponse((res) => res.request().method() === "POST"),
      adminRow.getByRole("button", { name: "Approve" }).click(),
    ]);

    const approved = await prisma.redemptionRequest.findUniqueOrThrow({ where: { id: request.id } });
    expect(approved.status).toBe("APPROVED");

    // Only the net amount (fee − reward points applied) is debited from the
    // ledger — the points portion never touches it.
    const ledgerEntry = await prisma.ledgerEntry.findFirstOrThrow({
      where: { userId: user.id, transactionType: "REDEMPTION_COURSE" },
    });
    expect(Number(ledgerEntry.amount)).toBe(-(fee - existingRewardPoints));
    expect(Number(ledgerEntry.balanceAfter)).toBe(redeemableBalance - (fee - existingRewardPoints));

    // Final balance = (existing points spent) + (newly earned on full fee).
    const finalUser = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(finalUser.rewardPointsBalance).toBe(0 + 300);
  } finally {
    await close();
  }
});
