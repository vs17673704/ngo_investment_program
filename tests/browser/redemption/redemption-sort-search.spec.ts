import { test, expect } from "playwright/test";
import { prisma, loginAsUser, loginAsAdmin, uniqueSuffix } from "../../helpers";
import { createUserWithRedeemableBalance } from "../fixtures";

// BRD Rule XL / Design.md §5.7: the admin redemption queue supports sorting
// by date (asc/desc) or by user email (asc/desc, since User has no separate
// "name" field), and free-text case-insensitive search by user email.
// Sorting/searching must never change which requests are eligible for
// approval or touch any financial/ledger state.
//
// Three real, isolated sessions are needed (user A, user B, admin): /login
// redirects an already-authenticated session straight to its own dashboard
// (see src/app/(auth)/login/page.tsx), so reusing one BrowserContext/Page
// across logins — even sequentially, one user after another — makes the
// second and third loginViaUi calls redirect instead of reaching the login
// form.
test.describe.configure({ mode: "serial" });

test.afterAll(async () => {
  await prisma.$disconnect();
});

test("BRD Rule XL: admin can sort the redemption queue by date/name and search by user email", async ({ browser }) => {
  const userAContext = await browser.newContext();
  const userBContext = await browser.newContext();
  const adminContext = await browser.newContext();
  const userAPage = await userAContext.newPage();
  const userBPage = await userBContext.newPage();
  const adminPage = await adminContext.newPage();

  try {
    const suffix = uniqueSuffix();
    const emailA = `sortsearch-${suffix}-aaa@example.com`;
    const emailB = `sortsearch-${suffix}-bbb@example.com`;

    const fixtureA = await createUserWithRedeemableBalance(5000);
    const fixtureB = await createUserWithRedeemableBalance(5000);
    await prisma.user.update({ where: { id: fixtureA.user.id }, data: { email: emailA } });
    await prisma.user.update({ where: { id: fixtureB.user.id }, data: { email: emailB } });

    // Submit A's refund request first, then B's, through the real UI, each
    // in its own isolated session.
    await loginAsUser(userAPage, emailA, fixtureA.password);
    await userAPage.waitForURL("**/dashboard");
    await userAPage.goto("/dashboard/redeem/refund");
    await userAPage.locator('input[name="amount"]').fill("1000");
    await Promise.all([
      userAPage.waitForResponse((res) => res.request().method() === "POST"),
      userAPage.getByRole("button", { name: "Submit request" }).click(),
    ]);
    await userAPage.waitForURL("**/dashboard/redeem");

    await loginAsUser(userBPage, emailB, fixtureB.password);
    await userBPage.waitForURL("**/dashboard");
    await userBPage.goto("/dashboard/redeem/refund");
    await userBPage.locator('input[name="amount"]').fill("1000");
    await Promise.all([
      userBPage.waitForResponse((res) => res.request().method() === "POST"),
      userBPage.getByRole("button", { name: "Submit request" }).click(),
    ]);
    await userBPage.waitForURL("**/dashboard/redeem");

    const requestA = await prisma.redemptionRequest.findFirstOrThrow({ where: { userId: fixtureA.user.id } });
    const requestB = await prisma.redemptionRequest.findFirstOrThrow({ where: { userId: fixtureB.user.id } });

    // Force a deterministic date ordering regardless of how fast the UI ran.
    const now = new Date();
    await prisma.redemptionRequest.update({
      where: { id: requestA.id },
      data: { createdAt: new Date(now.getTime() - 60_000) },
    });
    await prisma.redemptionRequest.update({
      where: { id: requestB.id },
      data: { createdAt: now },
    });

    const searchTerm = `sortsearch-${suffix}`;

    await loginAsAdmin(adminPage);
    await adminPage.waitForURL("**/admin");

    const requestsSection = adminPage.locator("section", {
      has: adminPage.getByRole("heading", { name: "Redemption requests" }),
    });

    async function orderedEmails() {
      const rows = requestsSection.locator("li", { has: adminPage.getByText(searchTerm) });
      const count = await rows.count();
      const emails: string[] = [];
      for (let i = 0; i < count; i++) {
        const text = await rows.nth(i).innerText();
        emails.push(text.includes(emailA) ? emailA : emailB);
      }
      return emails;
    }

    // Default sort (date_asc, oldest first): A before B.
    await adminPage.goto(`/admin/redemptions?q=${encodeURIComponent(searchTerm)}`);
    await expect(requestsSection.getByText(emailA, { exact: false })).toBeVisible();
    await expect(requestsSection.getByText(emailB, { exact: false })).toBeVisible();
    expect(await orderedEmails()).toEqual([emailA, emailB]);

    // date_desc: B before A.
    await adminPage.goto(`/admin/redemptions?q=${encodeURIComponent(searchTerm)}&sort=date_desc`);
    expect(await orderedEmails()).toEqual([emailB, emailA]);

    // name_asc: aaa before bbb.
    await adminPage.goto(`/admin/redemptions?q=${encodeURIComponent(searchTerm)}&sort=name_asc`);
    expect(await orderedEmails()).toEqual([emailA, emailB]);

    // name_desc: bbb before aaa.
    await adminPage.goto(`/admin/redemptions?q=${encodeURIComponent(searchTerm)}&sort=name_desc`);
    expect(await orderedEmails()).toEqual([emailB, emailA]);

    // Search narrows to only the matching user.
    await adminPage.goto(`/admin/redemptions?q=${encodeURIComponent(emailA)}`);
    await expect(requestsSection.getByText(emailA, { exact: false })).toBeVisible();
    await expect(requestsSection.getByText(emailB, { exact: false })).not.toBeVisible();

    // Search with no match shows a search-aware empty state.
    const noMatch = `no-such-user-${suffix}`;
    await adminPage.goto(`/admin/redemptions?q=${encodeURIComponent(noMatch)}`);
    await expect(requestsSection.getByText(`No pending redemption requests match "${noMatch}".`)).toBeVisible();

    const userIds = [fixtureA.user.id, fixtureB.user.id];
    await prisma.redemptionRequest.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.ledgerEntry.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.userPlan.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.refreshToken.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.loginHistory.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.otpCode.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  } finally {
    await userAContext.close();
    await userBContext.close();
    await adminContext.close();
  }
});
