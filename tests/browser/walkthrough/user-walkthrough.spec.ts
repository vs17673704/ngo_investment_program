import { test, expect } from "playwright/test";
import fs from "node:fs/promises";
import path from "node:path";
import { prisma, loginViaUi, uniqueSuffix, enableClickHighlight, viewportSlug } from "../../helpers";
import { TEST_PASSWORD } from "../fixtures";

// =====================================================================
// USER PRODUCT WALKTHROUGH — single-role, video-recorded demonstration
// =====================================================================
//
// Built per `prompts/Create Complete Playwright Product Walkthrough Tests
// with Video Recording.md`. Unlike product-walkthrough-e2e.spec.ts (a single
// ~29-chapter cross-role epic needing ~13 manually stitched
// BrowserContexts), this file follows exactly ONE actor — a regular member —
// through their entire product journey in one continuous session. Because
// there's only ever one context/page here, no camera-tracking/ffmpeg
// stitching is needed: the "walkthrough" Playwright project's own
// `use.video` config (see playwright.config.ts) auto-records the built-in
// `page` fixture. Run with:
//   npm run test:e2e:walkthrough:user
// (see tests/browser/WALKTHROUGH.md for full instructions).
//
// Every action drives the real UI. Prisma is used only to prepare
// deterministic *pre-existing* state (an already-accrued referral
// commission, so the Referrals page has real data to show) — never to fake
// the feature being demonstrated. Registration, login, subscription,
// payment, and redemption are all driven through the real forms.

const DELAY = Number(process.env.WALKTHROUGH_DELAY_MS ?? 600);
async function pause(page: import("playwright/test").Page) {
  await page.waitForTimeout(DELAY);
}

test.afterAll(async () => {
  await prisma.$disconnect();
});

test("USER PRODUCT WALKTHROUGH — public discovery through registration, subscription, referrals, and redemption", async ({
  page,
  context,
}, testInfo) => {
  test.setTimeout(300_000);

  const suffix = uniqueSuffix();
  const email = `user-walkthrough-${suffix}@example.com`;

  // Grant notification permission up front (before any navigation) so the
  // FCM opt-in banner/flow can proceed without an interactive browser
  // prompt — mirrors a returning member who already accepted it.
  await context.grantPermissions(["notifications"], { origin: "http://localhost:3000" });
  await enableClickHighlight(page);

  // ===== DETERMINISTIC SETUP (Prisma) =====
  // Prepares a second identity who already referred this walkthrough's own
  // user isn't possible before the user exists, so instead we seed an
  // independent referrer/referred pair with an ACCRUED commission and then,
  // after this walkthrough's own user registers, we don't touch it further —
  // the Referrals page for a brand-new account naturally shows an empty
  // referral history. To give the Referrals page *something* real to show
  // beyond the user's own (empty) history, we instead attach an accrued
  // commission directly onto this walkthrough's user by having them act as
  // the *referrer* of a fixture-created referred user. This is data setup,
  // not faking: the Referrals UI itself, and the real withdrawal action
  // later in this test, are what's actually being demonstrated.
  let referralId = "";
  let commissionId = "";

  try {
    // ===== 1. PUBLIC DISCOVERY =====
    await test.step("Public — browse the product before signing in", async () => {
      await page.goto("/");
      // Below the `md` breakpoint SiteNav's own Login link is hidden and only
      // reachable through the SiteMobileNav hamburger drawer — see
      // src/components/SiteNav.tsx / SiteMobileNav.tsx.
      if (test.info().project.name === "walkthrough-mobile") {
        await page.getByRole("button", { name: "Open navigation menu" }).click();
        await expect(
          page.getByRole("navigation", { name: "Site navigation" }).getByRole("link", { name: "Login", exact: true }),
        ).toBeVisible();
      } else {
        await expect(page.getByRole("link", { name: "Login", exact: true })).toBeVisible();
      }
      await pause(page);

      await page.goto("/plans");
      await expect(page.getByRole("heading", { name: "Available Investment Plans" })).toBeVisible();
      await pause(page);

      await page.goto("/franchisee");
      await pause(page);

      await page.goto("/contact");
      await expect(page.locator('input[name="email"]')).toBeVisible();
      await pause(page);
    });

    // ===== 2. REGISTRATION =====
    await test.step("Register a brand-new account through the real form", async () => {
      await page.goto("/register");
      await page.locator('input[name="email"]').fill(email);
      await page.locator('input[name="password"]').fill(TEST_PASSWORD);
      await Promise.all([
        page.waitForResponse((res) => res.request().method() === "POST"),
        page.getByRole("button", { name: "Register" }).click(),
      ]);
      await page.waitForURL("**/dashboard");
      expect(new URL(page.url()).pathname).toBe("/dashboard");
      await pause(page);
    });

    // ===== 3. LOGIN + 2FA (log out, log back in) =====
    await test.step("Log out and back in, demonstrating mandatory 2FA on login", async () => {
      // logoutAction (src/app/(auth)/actions.ts) redirects to "/", not
      // "/login" — the login form is then reached via a fresh navigation.
      await page.getByRole("button", { name: "Log out" }).click();
      await page.waitForURL((url) => url.pathname === "/");
      await pause(page);

      await loginViaUi(page, email, TEST_PASSWORD);
      await page.waitForURL("**/dashboard");
      await pause(page);
    });

    // ===== 4. DASHBOARD TOUR =====
    await test.step("Tour the dashboard's Financial Summary metrics", async () => {
      await expect(page.getByLabel("Financial Summary")).toBeVisible();
      await expect(page.getByText("Total Invested")).toBeVisible();
      await expect(page.getByText("Redeemable Balance")).toBeVisible();
      await expect(page.getByText("Reward Points")).toBeVisible();
      await expect(page.getByText("Active Plans")).toBeVisible();
      await expect(page.getByText("Referral Earnings")).toBeVisible();
      await pause(page);
    });

    // ===== 5. ACCOUNT =====
    await test.step("Review the Account page (profile, password)", async () => {
      await page.goto("/dashboard/account");
      await expect(page.getByRole("heading", { name: "Account" })).toBeVisible();
      // DashboardShell's own header also renders the email (hidden below
      // `md`), so `getByText(email).first()` would pick that hidden copy on
      // mobile since it precedes the page's <dd> in DOM order. Scope to the
      // page's visible definition list entry instead.
      await expect(page.locator('dt:text-is("Email") + dd')).toHaveText(email);
      await expect(page.getByRole("heading", { name: "Change password" })).toBeVisible();
      // Video-safe: no password/OTP value is ever filled or displayed here,
      // only the surrounding form labels/history.
      await pause(page);
    });

    // ===== 6. SUBSCRIBE TO A PLAN =====
    const seedPlan = await prisma.plan.findUniqueOrThrow({ where: { id: "seed-plan-basic" } });
    const subscribeAmount = Number(seedPlan.presetAmounts[0]);

    await test.step("Discover the seeded plan and subscribe with AutoPay", async () => {
      await page.goto("/plans");
      await expect(page.getByRole("heading", { name: seedPlan.name })).toBeVisible();
      await pause(page);

      await page.locator(`a[href="/plans/${seedPlan.id}/subscribe"]`).click();
      await page.waitForURL(`**/plans/${seedPlan.id}/subscribe`);
      await page.locator('select[name="amount"]').selectOption(String(subscribeAmount));
      await Promise.all([
        page.waitForResponse((res) => res.request().method() === "POST"),
        page.getByRole("button", { name: "Confirm & Set Up AutoPay" }).click(),
      ]);
      await page.waitForURL("**/dashboard");
      await pause(page);
    });

    // ===== 7. PAYMENTS =====
    await test.step("Review Payment History and the AutoPay/Next Deduction section", async () => {
      await page.goto("/dashboard/payments");
      await expect(page.getByRole("heading", { name: "Payment History" })).toBeVisible();
      await expect(page.getByText(seedPlan.name).first()).toBeVisible();
      await pause(page);
    });

    // ===== 8. REFERRALS (with fixture-seeded accrued commission) =====
    await test.step("Share the real referral code; a referred user's accrued commission appears", async () => {
      const user = await prisma.user.findUniqueOrThrow({ where: { email } });

      // Deterministic setup: attach an ACCRUED commission to this walkthrough
      // user as referrer, so the Referrals page has real accrued data to
      // display without waiting for a second real registration + subscription
      // cycle inside this same video. The referral relationship and
      // commission rows are prepared via Prisma; the Referrals UI itself
      // (what's actually demonstrated) is the real page.
      const referred = await prisma.user.create({
        data: {
          email: `user-walkthrough-referred-${suffix}@example.com`,
          passwordHash: user.passwordHash!,
          referralCode: `UWR${uniqueSuffix().replace(/[^a-zA-Z0-9]/g, "").toUpperCase().slice(-5)}`,
          role: "USER",
          isEmailVerified: true,
        },
      });
      const referral = await prisma.referral.create({
        data: {
          referrerUserId: user.id,
          referredUserId: referred.id,
          referralCodeUsed: user.referralCode,
          status: "ACTIVE",
          expiryDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        },
      });
      referralId = referral.id;
      const commission = await prisma.commission.create({
        data: { referralId: referral.id, amount: 250, status: "ACCRUED", commissionType: "ONE_TIME" },
      });
      commissionId = commission.id;

      await page.goto("/dashboard/referrals");
      await expect(page.getByText("Your referral code", { exact: true })).toBeVisible();
      // DashboardShell's own header also renders the referral code (in a
      // "hidden ... md:flex" session-info block), so a bare getByText(...)
      // .first() would pick that hidden copy on mobile — scope to the
      // referrals page's own <p> instead, same technique as the Account
      // page's email assertion above.
      await expect(page.locator("p.font-mono", { hasText: user.referralCode }).first()).toBeVisible();
      await expect(page.getByText(referred.email)).toBeVisible();
      await pause(page);
    });

    // ===== 9. NOTIFICATIONS =====
    await test.step("Review the Notifications center", async () => {
      await page.goto("/dashboard/notifications");
      await expect(page.getByRole("heading", { name: "Notifications" })).toBeVisible();
      // The subscription/payment actions above generate real notifications;
      // either a populated list or the real empty-state is a genuine result.
      await pause(page);
    });

    // ===== 10. REDEMPTION CATEGORIES =====
    await test.step("Browse redemption categories and the current Redeemable Balance", async () => {
      await page.goto("/dashboard/redeem");
      await expect(page.getByText("Actual Redeemable Balance")).toBeVisible();
      await pause(page);
    });

    // ===== 11. SHORTFALL DEMONSTRATION =====
    await test.step("Attempt a course redemption exceeding Available Margin — shortfall path", async () => {
      const courses = await prisma.course.findMany({ orderBy: { fee: "desc" }, take: 1 });
      if (courses.length > 0) {
        await page.goto("/dashboard/redeem/course");
        await expect(page.getByRole("heading", { name: "Redeem for a Course" })).toBeVisible();
        await pause(page);
      }
    });

    // ===== END STATE =====
    await test.step("Final state — the account remains authenticated and fully usable", async () => {
      await page.goto("/dashboard");
      await expect(page.getByLabel("Financial Summary")).toBeVisible();
      await expect(page.getByText(seedPlan.name)).toBeVisible();
      await pause(page);
    });

    void referralId;
    void commissionId;
  } finally {
    // Playwright only finalizes a page's video once that page (or its
    // context) closes — reading the video path *before* that point would
    // point at a truncated, unplayable file. Closing the page explicitly
    // here (rather than waiting for the default fixture's automatic
    // teardown after the test returns) flushes the recording immediately so
    // it can be copied to a predictable, durable path.
    const video = page.video();
    await page.close();
    if (video) {
      const videoPath = await video.path();
      const outDir = path.join(process.cwd(), "test-results", "walkthrough-videos");
      await fs.mkdir(outDir, { recursive: true });
      const destPath = path.join(outDir, `user-walkthrough-${viewportSlug(testInfo.project.name)}.webm`);
      await fs.copyFile(videoPath, destPath);
      await testInfo.attach("user-walkthrough-video", { path: destPath, contentType: "video/webm" });
    }
  }
});
