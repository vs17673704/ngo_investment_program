import { test, expect } from "playwright/test";
import fs from "node:fs/promises";
import path from "node:path";
import { prisma, loginAsAdmin, uniqueSuffix, enableClickHighlight, viewportSlug } from "../../helpers";
import { createUser, createDuePaymentMandate, runAutoPayNow } from "../fixtures";

// =====================================================================
// ADMIN PRODUCT WALKTHROUGH — single-role, video-recorded demonstration
// =====================================================================
//
// Built per `prompts/Create Complete Playwright Product Walkthrough Tests
// with Video Recording.md`. Like user-walkthrough.spec.ts, this file
// follows exactly ONE actor throughout — the seeded admin — so it needs no
// camera-tracking/ffmpeg stitching machinery: the "walkthrough" Playwright
// project's own `use.video` config (see playwright.config.ts) auto-records
// the built-in `page` fixture. Run with:
//   npm run test:e2e:walkthrough:admin
// (see tests/browser/WALKTHROUGH.md for full instructions).
//
// The one moment this story needs a second identity — the anonymous
// general-enquiry submission — is handled by visiting the public /contact
// page in this SAME context, before logging in as admin. /contact requires
// no authentication, so no second BrowserContext is needed at all: logging
// in afterwards simply authenticates the same session as admin.
//
// Every action drives the real UI (or the app's own real AutoPay/maturity
// simulator buttons — there is no real payment gateway in this app; see
// tests/helpers.ts / tests/browser/fixtures.ts). Prisma is used only to
// prepare deterministic pre-existing state (a due AutoPay mandate, a
// dedicated user to lock/unlock) — never to fake the admin action itself.

const DELAY = Number(process.env.WALKTHROUGH_DELAY_MS ?? 600);
async function pause(page: import("playwright/test").Page) {
  await page.waitForTimeout(DELAY);
}

test.afterAll(async () => {
  await prisma.$disconnect();
});

test("ADMIN PRODUCT WALKTHROUGH — operating users, plans, payments, redemptions, enquiries, content, and theme", async ({
  page,
}, testInfo) => {
  test.setTimeout(600_000);

  await enableClickHighlight(page);

  const suffix = uniqueSuffix();
  const enquiryEmail = `admin-walkthrough-enquiry-${suffix}@example.com`;

  try {
    // ===== 1. PUBLIC ENQUIRY SUBMISSION (pre-login, same context) =====
    let enquiryId = "";
    await test.step("Public — submit a general enquiry before any admin session exists", async () => {
      await page.goto("/contact");
      await page.locator('input[name="name"]').fill("Walkthrough Visitor");
      await page.locator('input[name="email"]').fill(enquiryEmail);
      await page.locator('textarea[name="message"]').fill("What documents are needed to enrol in a plan?");
      await Promise.all([
        page.waitForResponse((res) => res.request().method() === "POST"),
        page.getByRole("button", { name: "Send enquiry" }).click(),
      ]);
      await expect(page.getByText("Thank you — your enquiry has been received.")).toBeVisible();

      const enquiry = await prisma.generalEnquiry.findFirstOrThrow({ where: { email: enquiryEmail } });
      enquiryId = enquiry.id;
      await pause(page);
    });

    // ===== 2. ADMIN LOGIN =====
    await test.step("Admin — sign in with mandatory 2FA", async () => {
      await loginAsAdmin(page);
      await page.waitForURL("**/admin");
      await pause(page);
    });

    // ===== 3. ADMIN DASHBOARD =====
    await test.step("Admin dashboard — operational overview", async () => {
      await expect(page).toHaveURL(/\/admin$/);
      await pause(page);
    });

    // ===== 4. USERS =====
    await test.step("Users — search the table, lock and unlock a dedicated fixture user", async () => {
      const { user, email } = await createUser();
      await page.goto("/admin/users");
      await expect(page.getByRole("heading", { name: "User Management" })).toBeVisible();
      const userRow = page.locator("tr", { has: page.getByText(email) });
      await expect(userRow).toBeVisible({ timeout: 30_000 });
      await pause(page);

      await Promise.all([
        page.waitForResponse((res) => res.request().method() === "POST"),
        userRow.getByRole("button", { name: "Lock" }).click(),
      ]);
      // The toggleUserLockAction server action commits immediately (verified
      // directly against the DB), but its revalidatePath does not reliably
      // trigger a client-side soft-navigation refresh of this table in the
      // recording browser — an explicit reload guarantees the UI reflects
      // the real, already-persisted state rather than waiting on a refresh
      // that may never arrive.
      await page.reload();
      await expect(userRow.getByText("Locked")).toBeVisible({ timeout: 30_000 });
      await pause(page);

      await Promise.all([
        page.waitForResponse((res) => res.request().method() === "POST"),
        userRow.getByRole("button", { name: "Unlock" }).click(),
      ]);
      await page.reload();
      await expect(userRow.getByText("Active")).toBeVisible({ timeout: 30_000 });
      void user;
      await pause(page);
    });

    // ===== 5. INTEREST METHODS (created before plan so it's selectable) =====
    const methodName = `Walkthrough Interest Method ${suffix}`;
    await test.step("Interest Methods — create a new calculation method", async () => {
      await page.goto("/admin/interest-methods");
      await page.getByRole("button", { name: "Create Interest Method", exact: true }).click();
      await page.locator('input[name="name"]').fill(methodName);
      await page.locator("#formulaType").selectOption("SIMPLE");
      await page.locator('input[name="ratePercent"]').fill("9");
      await page.locator('input[name="tenureMonths"]').fill("12");
      await Promise.all([
        page.waitForResponse((res) => res.request().method() === "POST"),
        page.getByRole("button", { name: "Create interest method", exact: true }).click(),
      ]);
      await expect(page.getByText(methodName)).toBeVisible({ timeout: 30_000 });
      await pause(page);
    });

    // ===== 6. PLANS =====
    const planName = `Walkthrough Admin Plan ${suffix}`;
    let planId = "";
    await test.step("Plans — create a new investment plan using the new interest method", async () => {
      const method = await prisma.interestCalculationMethod.findFirstOrThrow({ where: { name: methodName } });
      await page.goto("/admin/plans");
      await expect(page.getByRole("heading", { name: "Plan Management" })).toBeVisible();

      await page.getByRole("button", { name: "Create Plan", exact: true }).click();
      await page.locator('input[name="name"]').fill(planName);
      await page.locator("#interestMethodId").selectOption(method.id);
      await page.locator('input[name="tenureMonths"]').fill("12");
      await page.locator('input[name="presetAmounts"]').fill("2000,4000");
      await page.locator('input[name="rewardPercent"]').fill("5");
      await page.locator('input[name="commissionPercent"]').fill("8");
      await Promise.all([
        page.waitForResponse((res) => res.request().method() === "POST"),
        page.getByRole("button", { name: "Create plan", exact: true }).click(),
      ]);
      // createPlanAction's revalidatePath applies as a delayed client-side
      // re-navigation, not synchronously with the POST response. Under
      // headed/slowMo load the combined server render + client hydration +
      // delayed revalidation genuinely exceeds 30s — see the same fix in
      // tests/browser/walkthrough/product-walkthrough-e2e.spec.ts.
      await expect(page.getByRole("cell", { name: planName })).toBeVisible({ timeout: 60_000 });
      const plan = await prisma.plan.findFirstOrThrow({ where: { name: planName } });
      planId = plan.id;
      await pause(page);
    });

    // ===== 7. PAYMENTS =====
    await test.step("Payments — run the AutoPay simulator against a due fixture mandate", async () => {
      const { email: dueEmail } = await createDuePaymentMandate();
      await runAutoPayNow(page);
      await expect(page.getByRole("heading", { name: "Razorpay AutoPay Simulator" })).toBeVisible();
      const payment = await prisma.payment.findFirst({
        where: { userPlan: { user: { email: dueEmail } } },
        orderBy: { createdAt: "desc" },
      });
      expect(payment).not.toBeNull();
      await pause(page);
    });

    // ===== 8. REDEMPTIONS =====
    await test.step("Redemptions — approve a pending fixture-created request", async () => {
      const { user, email: redeemerEmail } = await createUser();
      const plan = await prisma.plan.findUniqueOrThrow({
        where: { id: "seed-plan-basic" },
        include: { interestMethod: true },
      });
      const userPlan = await prisma.userPlan.create({
        data: {
          userId: user.id,
          planId: plan.id,
          interestMethodId: plan.interestMethodId,
          interestMethodVersion: plan.interestMethod.version,
          rewardPercentSnapshot: plan.rewardPercent,
          commissionPercentSnapshot: plan.commissionPercent,
          paymentAmount: Number(plan.presetAmounts[0]),
          paymentFrequency: plan.paymentFrequency,
          status: "MATURED",
          principalPaid: 5000,
          startDate: new Date(Date.now() - 400 * 24 * 60 * 60 * 1000),
          maturityDate: new Date(Date.now() - 24 * 60 * 60 * 1000),
        },
      });
      await prisma.ledgerEntry.create({
        data: {
          userId: user.id,
          userPlanId: userPlan.id,
          transactionType: "INTEREST",
          amount: 5000,
          balanceBefore: 0,
          balanceAfter: 5000,
          description: "Walkthrough fixture: matured balance for admin redemption approval",
        },
      });
      const redemption = await prisma.redemptionRequest.create({
        data: {
          userId: user.id,
          category: "REFUND",
          requestedAmount: 2000,
          availableMarginAtRequest: 5000,
          status: "PENDING",
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
      });

      await page.goto("/admin/redemptions");
      const row = page.locator("li", { has: page.getByText(redeemerEmail) });
      await expect(row).toBeVisible({ timeout: 30_000 });
      await pause(page);
      await Promise.all([
        page.waitForResponse((res) => res.request().method() === "POST"),
        row.getByRole("button", { name: "Approve" }).click(),
      ]);
      const approved = await prisma.redemptionRequest.findUniqueOrThrow({ where: { id: redemption.id } });
      expect(approved.status).toBe("APPROVED");
      await pause(page);
    });

    // ===== 9. GENERAL ENQUIRIES — resolve the step-1 enquiry =====
    await test.step("General Enquiries — move the earlier enquiry through the queue to RESOLVED", async () => {
      await page.goto("/admin/enquiries/general");
      let row = page.locator("li", { has: page.getByText(enquiryEmail) });
      await expect(row).toBeVisible({ timeout: 30_000 });
      await pause(page);

      await row.locator('select[name="status"]').selectOption("IN_PROGRESS");
      await Promise.all([
        page.waitForResponse((res) => res.request().method() === "POST"),
        row.getByRole("button", { name: "Update" }).click(),
      ]);
      // changeGeneralEnquiryStatusAction's revalidatePath does not reliably
      // trigger a client-side refresh of this uncontrolled <select>'s
      // defaultValue in the recording browser (same class of issue as the
      // Users lock/unlock step above) — an explicit reload before the next
      // selection guarantees we're acting on the real, already-persisted
      // status rather than a stale or half-refreshed form.
      await page.reload();
      row = page.locator("li", { has: page.getByText(enquiryEmail) });
      await expect(row.locator('select[name="status"]')).toHaveValue("IN_PROGRESS", { timeout: 30_000 });
      await pause(page);

      await row.locator('select[name="status"]').selectOption("RESOLVED");
      await Promise.all([
        page.waitForResponse((res) => res.request().method() === "POST"),
        row.getByRole("button", { name: "Update" }).click(),
      ]);
      await page.reload();
      row = page.locator("li", { has: page.getByText(enquiryEmail) });
      await expect(row.locator('select[name="status"]')).toHaveValue("RESOLVED", { timeout: 30_000 });
      const resolved = await prisma.generalEnquiry.findUniqueOrThrow({ where: { id: enquiryId } });
      expect(resolved.status).toBe("RESOLVED");
      await pause(page);
    });

    // ===== 10. CATALOG =====
    // There is no consolidated "/admin/catalog" index page — the nav links
    // directly to each of these four sub-screens (see AdminShell.tsx).
    await test.step("Catalog — review universities & courses, gadgets, colleges, and franchisee mappings", async () => {
      await page.goto("/admin/catalog/universities-courses");
      await expect(page.getByRole("heading", { name: "Universities & Courses" })).toBeVisible();
      await pause(page);

      await page.goto("/admin/catalog/gadgets");
      await expect(page.getByRole("heading", { name: "Gadgets" })).toBeVisible();
      await pause(page);

      await page.goto("/admin/catalog/colleges");
      await expect(page.getByRole("heading", { name: "Colleges" })).toBeVisible();
      await pause(page);

      await page.goto("/admin/catalog/franchisee-plans");
      await expect(page.getByRole("heading", { name: "Franchisee Plans & College Mappings" })).toBeVisible();
      await pause(page);
    });

    // ===== 11. EMAILS =====
    await test.step("Emails — review the simulated outbox generated by the actions above", async () => {
      await page.goto("/admin/emails");
      await expect(page.getByText(/email\(s\) queued\/sent/)).toBeVisible();
      await pause(page);
    });

    // ===== 12. AUDIT LOG =====
    await test.step("Audit Log — review entries generated earlier in this session", async () => {
      await page.goto("/admin/audit-log");
      await expect(page.getByRole("heading", { name: "Audit Log" })).toBeVisible();
      // The audit log renders eventType + entityRef (the plan's id), not the
      // plan's name — see src/app/admin/audit-log/page.tsx. Scope to this
      // run's own plan id since PLAN_CREATED accumulates across every past
      // run of this repeatable walkthrough.
      await expect(page.locator("li", { hasText: planId }).getByText("PLAN_CREATED")).toBeVisible();
      await pause(page);
    });

    // ===== 13. REPORTS =====
    await test.step("Reports & Exports — browse available report downloads", async () => {
      await page.goto("/admin/reports");
      await expect(page.getByRole("heading", { name: "Reports & Exports" })).toBeVisible();
      await expect(page.locator('a[href^="/api/admin/reports/"]').first()).toBeVisible();
      await pause(page);
    });

    // ===== 14. SETTINGS =====
    await test.step("Settings — review program parameters and website content", async () => {
      await page.goto("/admin/settings");
      await expect(page.getByRole("heading", { name: "Site Settings" })).toBeVisible();
      await pause(page);

      await page.goto("/admin/settings/about-us");
      await pause(page);

      await page.goto("/admin/settings/contact-us");
      await pause(page);
    });

    // ===== 15. THEME MANAGEMENT (configure -> preview -> publish -> verify -> reset) =====
    await test.step("Theme — full draft, publish, verify-live, and reset lifecycle for the login screen", async () => {
      const themeTitle = `Walkthrough Theme ${suffix}`;
      await page.goto("/admin/theme");
      await page.getByRole("button", { name: "Login Screen" }).click();
      await page.locator("#loginTitle").fill(themeTitle);
      await Promise.all([
        page.waitForResponse((res) => res.request().method() === "POST"),
        page.getByRole("button", { name: "Save Draft" }).click(),
      ]);
      await expect(page.getByText("Draft saved.")).toBeVisible();
      await pause(page);

      // "Publish" only reveals a confirmation panel client-side — no server
      // action fires until "Confirm Publish" is clicked (see ThemeEditor.tsx
      // and product-walkthrough-e2e.spec.ts's identical note) — so this
      // first click must not be wrapped in waitForResponse.
      await page.getByRole("button", { name: "Publish" }).click();
      await expect(page.getByText("Publish will make the draft")).toBeVisible();
      await Promise.all([
        page.waitForResponse((res) => res.request().method() === "POST"),
        page.getByRole("button", { name: "Confirm Publish" }).click(),
      ]);
      await pause(page);

      // logoutAction (src/app/(auth)/actions.ts) redirects to "/", not
      // "/login" — and /login redirects an already-authenticated session
      // straight to /admin (see src/app/(auth)/login/page.tsx), so the
      // published theme can only be observed on the real login screen by
      // logging out first, then navigating to /login explicitly.
      await page.getByRole("button", { name: "Log out" }).click();
      await page.waitForURL((url) => url.pathname === "/");
      await page.goto("/login");
      // AuthShell's branding panel (which shows the published login title)
      // is `hidden lg:flex` by design — below Tailwind's `lg` breakpoint
      // (1024px) the login screen intentionally shows only the form, so this
      // visual check only applies at viewports at least that wide. Checking
      // the actual viewport width (rather than enumerating project names)
      // keeps this correct as new walkthrough viewport projects are added —
      // e.g. "walkthrough-tablet-portrait" is 768px wide and must be
      // excluded here even though it isn't the "-mobile" project.
      const viewportWidth = page.viewportSize()?.width ?? 0;
      if (viewportWidth >= 1024) {
        await expect(page.getByText(themeTitle)).toBeVisible();
      }
      await pause(page);

      await loginAsAdmin(page);
      await page.waitForURL("**/admin");
      await page.goto("/admin/theme");
      await page.getByRole("button", { name: "Login Screen" }).click();

      // Same reasoning as "Publish": "Reset to Default" only reveals its own
      // confirmation panel client-side.
      await page.getByRole("button", { name: "Reset to Default" }).click();
      await expect(page.getByText("Reset will discard all customization")).toBeVisible();
      // ThemeEditor's resetAction success handler calls
      // window.location.reload() asynchronously once the server action
      // resolves — attach this listener before clicking so it catches that
      // specific future reload rather than the page's already-settled "load"
      // state (see product-walkthrough-e2e.spec.ts's identical note).
      const themeReloaded = page.waitForEvent("load");
      await Promise.all([
        page.waitForResponse((res) => res.request().method() === "POST"),
        page.getByRole("button", { name: "Confirm Reset" }).click(),
      ]);
      await themeReloaded;
      await pause(page);
    });

    // ===== END STATE =====
    await test.step("Final state — the admin console reflects every action from this session", async () => {
      await page.goto("/admin");
      await expect(page).toHaveURL(/\/admin$/);
      await pause(page);
    });
  } finally {
    // Playwright only finalizes a page's video once that page (or its
    // context) closes — reading the video path before that point would
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
      const destPath = path.join(outDir, `admin-walkthrough-${viewportSlug(testInfo.project.name)}.webm`);
      await fs.copyFile(videoPath, destPath);
      await testInfo.attach("admin-walkthrough-video", { path: destPath, contentType: "video/webm" });
    }
  }
});
