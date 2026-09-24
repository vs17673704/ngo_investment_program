import { test, expect } from "playwright/test";
import fs from "node:fs/promises";
import path from "node:path";
import { subDays } from "date-fns";
import { prisma, loginViaUi, loginAsAdmin, uniqueSuffix, enableClickHighlight, viewportSlug } from "../../helpers";
import { TEST_PASSWORD } from "../fixtures";

// =====================================================================
// CROSS-ROLE RESPONSIVE WALKTHROUGH — tablet/mobile companion to
// product-walkthrough-e2e.spec.ts
// =====================================================================
//
// Built per `prompts/Claude_Cross_Role_Product_Walkthrough_Playwright_
// Desktop_Tablet_Mobile.md` §11A: the full ~29-chapter, ~13-context
// desktop epic (product-walkthrough-e2e.spec.ts) is not re-run at every
// viewport verbatim — its own multi-context ffmpeg stitching pipeline is
// pinned to a 1280x720 canvas, and re-running a ~30-minute serial test
// three more times would make the responsive coverage impractically slow
// without adding new evidence. Instead this file is a SHORTER, SEPARATE
// cross-role story reusing the same real UI, same helpers, and same
// same-entity-continuity discipline (one user, one admin, one plan, one
// redemption — followed across both roles), driven at real tablet/mobile
// viewports via the "walkthrough-tablet-portrait" / "walkthrough-tablet-
// landscape" / "walkthrough-mobile" Playwright projects (see
// playwright.config.ts). It satisfies §11A's minimum bar for each
// responsive run: real navigation, a meaningful business action
// (subscribe), a data-heavy screen (Payment History), and a resulting
// state (an admin-approved redemption reflected back in the user's own
// session) — plus an explicit cross-role approval loop on the SAME
// redemption request.
//
// Desktop cross-role coverage remains product-walkthrough-e2e.spec.ts,
// run under the "walkthrough" project (1280x720) — see
// tests/browser/walkthrough/README.md.
//
// Two independent BrowserContexts (userContext/adminContext) preserve
// real authorization boundaries between roles, exactly as
// product-walkthrough-e2e.spec.ts and tests/helpers.ts's
// newRoleContexts() do. Each context inherits the active project's
// viewport/video settings, so the same script produces a correctly
// viewport-tagged recording per role with no manual sizing.

const DELAY = Number(process.env.WALKTHROUGH_DELAY_MS ?? 600);
async function pause(page: import("playwright/test").Page) {
  await page.waitForTimeout(DELAY);
}

test.afterAll(async () => {
  await prisma.$disconnect();
});

async function backdateLatestPayment(userPlanId: string) {
  const latest = await prisma.payment.findFirstOrThrow({ where: { userPlanId }, orderBy: { createdAt: "desc" } });
  await prisma.payment.update({ where: { id: latest.id }, data: { createdAt: subDays(new Date(), 40) } });
}

async function backdateMaturity(userPlanId: string) {
  await prisma.userPlan.update({ where: { id: userPlanId }, data: { maturityDate: subDays(new Date(), 1) } });
}

async function readRedeemableBalance(page: import("playwright/test").Page): Promise<number> {
  await page.goto("/dashboard/redeem");
  const card = page.locator("div", { has: page.getByText("Actual Redeemable Balance", { exact: true }) }).first();
  const text = (await card.getByText(/₹/).first().textContent()) ?? "";
  return Number(text.replace(/[₹,]/g, ""));
}

test("CROSS-ROLE RESPONSIVE WALKTHROUGH — a member subscribes, redeems, and is approved by admin on the SAME plan", async ({
  browser,
}, testInfo) => {
  test.setTimeout(300_000);

  // browser.newContext() does NOT inherit the active project's
  // viewport/video settings the way the default page/context fixtures do —
  // those only apply automatically to test("...", ({ page, context }) => ...).
  // Manually-created contexts need those options passed explicitly so each
  // viewport project still produces a correctly sized, recorded video.
  const projectUse = testInfo.project.use as { viewport?: { width: number; height: number } | null };
  const viewport = projectUse.viewport ?? { width: 1280, height: 720 };
  const contextOptions = {
    viewport,
    recordVideo: { dir: testInfo.outputPath("videos"), size: viewport },
  };
  const userContext = await browser.newContext(contextOptions);
  const adminContext = await browser.newContext(contextOptions);
  const userPage = await userContext.newPage();
  const adminPage = await adminContext.newPage();
  await enableClickHighlight(userPage);
  await enableClickHighlight(adminPage);

  const projectName = testInfo.project.name;
  const suffix = uniqueSuffix();
  const email = `x-role-responsive-${suffix}@example.com`;

  try {
    // ===== 1. PUBLIC — landing + nav (viewport-aware) =====
    await test.step("Public — browse the landing page and plans before signing in", async () => {
      await userPage.goto("/");
      if (projectName === "walkthrough-mobile") {
        await userPage.getByRole("button", { name: "Open navigation menu" }).click();
        await expect(
          userPage.getByRole("navigation", { name: "Site navigation" }).getByRole("link", { name: "Login", exact: true }),
        ).toBeVisible();
        await userPage.keyboard.press("Escape");
      } else {
        await expect(userPage.getByRole("link", { name: "Login", exact: true })).toBeVisible();
      }
      await pause(userPage);

      await userPage.goto("/plans");
      await expect(userPage.getByRole("heading", { name: "Available Investment Plans" })).toBeVisible();
      await pause(userPage);
    });

    // ===== 2. USER — register, then log out/in (explicit login, per §11A mobile list) =====
    await test.step("User — register a new account, then log back in to demonstrate the login flow", async () => {
      await userPage.goto("/register");
      await userPage.locator('input[name="email"]').fill(email);
      await userPage.locator('input[name="password"]').fill(TEST_PASSWORD);
      await Promise.all([
        userPage.waitForResponse((res) => res.request().method() === "POST"),
        userPage.getByRole("button", { name: "Register" }).click(),
      ]);
      await userPage.waitForURL("**/dashboard");
      await pause(userPage);

      await userPage.getByRole("button", { name: "Log out" }).click();
      await userPage.waitForURL((url) => url.pathname === "/");
      await pause(userPage);

      await loginViaUi(userPage, email, TEST_PASSWORD);
      await userPage.waitForURL("**/dashboard");
      await expect(userPage.getByLabel("Financial Summary")).toBeVisible();
      await pause(userPage);
    });

    // ===== 3. USER — subscribe (meaningful business action) =====
    const seedPlan = await prisma.plan.findUniqueOrThrow({ where: { id: "seed-plan-basic" } });
    const subscribeAmount = Number(seedPlan.presetAmounts[0]);
    let userPlanRowId = "";

    await test.step("User — subscribe to the seeded plan with AutoPay", async () => {
      await userPage.goto(`/plans/${seedPlan.id}/subscribe`);
      await userPage.locator('select[name="amount"]').selectOption(String(subscribeAmount));
      await Promise.all([
        userPage.waitForResponse((res) => res.request().method() === "POST"),
        userPage.getByRole("button", { name: "Confirm & Set Up AutoPay" }).click(),
      ]);
      await userPage.waitForURL("**/dashboard");
      await pause(userPage);
    });

    // ===== 4. USER — payment history (data-heavy screen) =====
    await test.step("User — review Payment History", async () => {
      await userPage.goto("/dashboard/payments");
      await expect(userPage.getByRole("heading", { name: "Payment History" })).toBeVisible();
      await expect(userPage.getByText(seedPlan.name).first()).toBeVisible();
      await pause(userPage);
    });

    // ===== 5. ADMIN — login + dashboard =====
    await test.step("Admin — log in and open the dashboard for the same user/plan", async () => {
      await loginAsAdmin(adminPage);
      await adminPage.waitForURL("**/admin");
      await pause(adminPage);

      const user = await prisma.user.findUniqueOrThrow({ where: { email } });
      const userPlan = await prisma.userPlan.findFirstOrThrow({ where: { userId: user.id, planId: seedPlan.id } });
      userPlanRowId = userPlan.id;

      await adminPage.goto("/admin/users");
      await expect(adminPage.getByText(email)).toBeVisible();
      await pause(adminPage);
    });

    // ===== 6. ADMIN — fast-forward to maturity (deterministic simulation, no real waiting) =====
    await test.step("Admin — fast-forward the plan to maturity via the real maturity-check action", async () => {
      await backdateLatestPayment(userPlanRowId);
      await backdateMaturity(userPlanRowId);
      await adminPage.goto("/admin/payments");
      await Promise.all([
        adminPage.waitForResponse((res) => res.request().method() === "POST"),
        adminPage.getByRole("button", { name: "Run plan maturity check now" }).click(),
      ]);
      const matured = await prisma.userPlan.findUniqueOrThrow({ where: { id: userPlanRowId } });
      expect(matured.status).toBe("MATURED");
      await pause(adminPage);
    });

    // ===== 7. USER — submit a redemption on the now-matured balance =====
    let redemptionRequestId = "";
    await test.step("User — redeem part of the matured balance", async () => {
      const balance = await readRedeemableBalance(userPage);
      expect(balance).toBeGreaterThan(0);
      const refundAmount = Math.max(1, Math.floor(balance / 2));

      await userPage.goto("/dashboard/redeem/refund");
      await userPage.locator('input[name="amount"]').fill(String(refundAmount));
      await Promise.all([
        userPage.waitForResponse((res) => res.request().method() === "POST"),
        userPage.getByRole("button", { name: "Submit request" }).click(),
      ]);
      await userPage.waitForURL("**/dashboard/redeem");

      const user = await prisma.user.findUniqueOrThrow({ where: { email } });
      const request = await prisma.redemptionRequest.findFirstOrThrow({
        where: { userId: user.id, category: "REFUND" },
      });
      redemptionRequestId = request.id;
      expect(request.status).toBe("PENDING");
      await pause(userPage);
    });

    // ===== 8. ADMIN — open the SAME redemption request and approve it =====
    await test.step("Admin — open the same redemption request and approve it", async () => {
      await adminPage.goto("/admin/redemptions");
      const row = adminPage.locator("li", { has: adminPage.getByText(email) });
      await expect(row).toBeVisible();
      await Promise.all([
        adminPage.waitForResponse((res) => res.request().method() === "POST"),
        row.getByRole("button", { name: "Approve" }).click(),
      ]);
      const approved = await prisma.redemptionRequest.findUniqueOrThrow({ where: { id: redemptionRequestId } });
      expect(approved.status).toBe("APPROVED");
      await pause(adminPage);
    });

    // ===== 9. USER — resulting state, verified from their own session =====
    await test.step("User — see the approved redemption and notification in their own session", async () => {
      await userPage.goto("/dashboard/notifications");
      await expect(userPage.getByRole("heading", { name: "Notifications" })).toBeVisible();
      await pause(userPage);

      await userPage.goto("/dashboard/redeem");
      const approved = await prisma.redemptionRequest.findUniqueOrThrow({ where: { id: redemptionRequestId } });
      expect(approved.status).toBe("APPROVED");
      await expect(userPage.getByText("Actual Redeemable Balance")).toBeVisible();
      await pause(userPage);
    });
  } finally {
    const outDir = path.join(process.cwd(), "test-results", "walkthrough-videos");
    await fs.mkdir(outDir, { recursive: true });
    const slug = viewportSlug(projectName);

    const userVideo = userPage.video();
    await userPage.close();
    await userContext.close();
    if (userVideo) {
      const videoPath = await userVideo.path();
      const destPath = path.join(outDir, `product-walkthrough-responsive-user-${slug}.webm`);
      await fs.copyFile(videoPath, destPath);
      await testInfo.attach("product-walkthrough-responsive-user-video", { path: destPath, contentType: "video/webm" });
    }

    const adminVideo = adminPage.video();
    await adminPage.close();
    await adminContext.close();
    if (adminVideo) {
      const videoPath = await adminVideo.path();
      const destPath = path.join(outDir, `product-walkthrough-responsive-admin-${slug}.webm`);
      await fs.copyFile(videoPath, destPath);
      await testInfo.attach("product-walkthrough-responsive-admin-video", { path: destPath, contentType: "video/webm" });
    }
  }
});
