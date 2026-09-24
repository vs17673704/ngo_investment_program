import { test, expect, type Page, type BrowserContext } from "playwright/test";
import { subDays, subMonths } from "date-fns";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import fs from "node:fs/promises";
import ffmpegPath from "ffmpeg-static";
import {
  prisma,
  loginAsAdmin,
  loginAsUser,
  getLatestOtpCode,
  uniqueSuffix,
  enableClickHighlight,
} from "../../helpers";
import {
  TEST_PASSWORD,
  createUserWithRedeemableBalance,
  createGadgetStock,
  createFranchiseePlanWithColleges,
  createDuePaymentMandate,
  createUser,
  createPlan,
  createReferralWithAccruedCommission,
  runAutoPayNow,
  runRetriesNow,
  runMaturityCheckNow,
} from "../fixtures";
import { getSettings } from "../../../src/lib/config";
import { getAvailableMargin } from "../../../src/lib/redemption-engine";

const execFileAsync = promisify(execFile);

// =====================================================================
// VIDEO STITCHING — see tests/browser/walkthrough/README.md
// =====================================================================
//
// Playwright's `use.video` project config only applies to the built-in
// page/context fixtures, not to the ~13 additional BrowserContexts this
// walkthrough creates manually (one per role/chapter). Each of those gets
// its own recordVideo config below, and this module tracks, in wall-clock
// order, which context is "on camera" at every point in the story via
// registerCamera()/mark(). test.afterAll() then trims each context's
// video to just its actively-narrated window(s) with ffmpeg and
// concatenates all segments in chronological order into one continuous
// narrative video — because a naive whole-context concatenation would
// scramble the story (adminContext/userAContext are reused
// non-contiguously across nearly every chapter).
type CamEntry = { label: string; context: BrowserContext; page: Page; startedAt: number };
type Segment = { label: string; start: number; end?: number };
const cameras: CamEntry[] = [];
const segments: Segment[] = [];
let currentLabel: string | null = null;

async function registerCamera(label: string, context: BrowserContext, page: Page) {
  cameras.push({ label, context, page, startedAt: Date.now() });
  // Registration always happens before that camera's first navigation, so
  // this reliably applies to every subsequent page.goto() on it.
  await enableClickHighlight(page);
}

/** Marks a change of "on camera" actor. Safe to call liberally — a call
 * with the same label as the currently-active one is a no-op, so callers
 * don't need to track whether a switch actually happened. */
function mark(label: string) {
  if (label === currentLabel) return;
  if (currentLabel) segments[segments.length - 1].end = Date.now();
  segments.push({ label, start: Date.now() });
  currentLabel = label;
}

// Playwright's own bundled ffmpeg (ms-playwright/ffmpeg-*) is a severely
// stripped-down build compiled for exactly one purpose — turning its own
// JPEG screencast frames into a webm (`--disable-everything` plus a
// handful of `--enable-*` flags for that pipeline only). It has no
// `concat` demuxer *or* filter, and no PNG decoder, so there is no way to
// trim-and-concatenate arbitrary existing webm files with it. Rather than
// fight that binary, this uses `ffmpeg-static` (installed as a devDependency
// solely for this post-processing step) — a normal full-featured build —
// to do the actual trimming/concatenation.
const FFMPEG_BIN = ffmpegPath as unknown as string;
const STITCH_WIDTH = 1280;
const STITCH_HEIGHT = 720;
// Final stitched video plays back slower than it was recorded (easier to
// follow as a demo). setpts=PTS/0.7 stretches each frame's timestamp by
// 1/0.7, which is what actually makes playback run at 70% speed.
const PLAYBACK_SPEED = 0.7;

async function stitchWalkthroughVideo() {
  if (currentLabel) segments[segments.length - 1].end = Date.now();

  const outDir = path.join(process.cwd(), "test-results", "walkthrough-stitched");
  await fs.mkdir(outDir, { recursive: true });

  const usableSegments = segments.filter((s) => s.label !== "__end__" && s.end && s.end - s.start >= 200);

  // Trim each segment to its own normalized file first (re-encoding, not
  // stream-copying, so the cut lands exactly on the intended timestamp
  // rather than snapping to the nearest keyframe), then concatenate all of
  // the trimmed files — now uniform in resolution/codec — via ffmpeg's
  // concat demuxer, which can stream-copy since no further re-encoding is
  // needed at that point. Trims are independent of each other (each reads
  // its own source video, writes its own output file), so they run with
  // bounded concurrency rather than one-at-a-time — sequential re-encoding
  // of ~30+ segments at ~15-20s each blew past even a 10-minute afterAll
  // hook timeout.
  type TrimJob = { index: number; label: string; videoPath: string; offsetSec: number; durationSec: number };
  const jobs: TrimJob[] = [];
  for (const seg of usableSegments) {
    const camera = cameras.find((c) => c.label === seg.label);
    if (!camera) {
      console.warn(`[walkthrough-video] no camera registered for segment label "${seg.label}", skipping`);
      continue;
    }
    const videoPath = await camera.page.video()?.path();
    if (!videoPath) {
      console.warn(`[walkthrough-video] no video recorded for camera "${seg.label}", skipping segment`);
      continue;
    }
    jobs.push({
      index: jobs.length,
      label: seg.label,
      videoPath,
      offsetSec: Math.max(0, (seg.start - camera.startedAt) / 1000),
      durationSec: (seg.end! - seg.start) / 1000,
    });
  }

  if (jobs.length === 0) {
    console.warn("[walkthrough-video] no segments to stitch, skipping");
    return;
  }

  const trimmedPaths: string[] = new Array(jobs.length);
  async function runTrimJob(job: TrimJob) {
    // The "mobile" camera records at 390x844 and must be letterboxed to
    // match the rest — the concat demuxer requires identical
    // resolution/codec across every segment it stitches.
    const scaleFilter =
      job.label === "mobile"
        ? `scale=w=-2:h=${STITCH_HEIGHT}:force_original_aspect_ratio=decrease,pad=${STITCH_WIDTH}:${STITCH_HEIGHT}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1`
        : `scale=${STITCH_WIDTH}:${STITCH_HEIGHT},setsar=1`;

    const trimmedPath = path.join(outDir, `segment-${String(job.index).padStart(3, "0")}-${job.label}.webm`);
    // `-t` here lands after `-i` with nothing after it, so ffmpeg treats it
    // as an OUTPUT duration cap — applied post-filter, i.e. in the
    // slowed-down timebase setpts produces. Left at the original
    // durationSec, it would stop encoding once that many seconds of
    // *stretched* output had been written, silently truncating most of the
    // segment instead of playing all of it back slower. Scaling it by
    // 1/PLAYBACK_SPEED keeps the cap matched to the segment's full
    // (now-longer) stretched length.
    await execFileAsync(FFMPEG_BIN, [
      "-y",
      "-ss",
      job.offsetSec.toFixed(3),
      "-i",
      job.videoPath,
      "-t",
      (job.durationSec / PLAYBACK_SPEED).toFixed(3),
      "-vf",
      `${scaleFilter},format=yuv420p,setpts=PTS/${PLAYBACK_SPEED}`,
      "-c:v",
      "libvpx",
      "-crf",
      "28",
      "-b:v",
      "1M",
      "-an",
      trimmedPath,
    ]);
    trimmedPaths[job.index] = trimmedPath;
  }

  const CONCURRENCY = 4;
  let cursor = 0;
  async function worker() {
    while (cursor < jobs.length) {
      const job = jobs[cursor];
      cursor += 1;
      await runTrimJob(job);
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, jobs.length) }, () => worker()));

  const listPath = path.join(outDir, "concat-list.txt");
  const listContents = trimmedPaths
    .map((p) => `file '${p.replace(/\\/g, "/").replace(/'/g, "'\\''")}'`)
    .join("\n");
  await fs.writeFile(listPath, listContents, "utf-8");

  const finalPath = path.join(outDir, "product-walkthrough-e2e.webm");
  await execFileAsync(FFMPEG_BIN, ["-y", "-f", "concat", "-safe", "0", "-i", listPath, "-c", "copy", finalPath]);
  console.log(`[walkthrough-video] stitched video written to ${finalPath}`);
}

// =====================================================================
// COMPLETE PRODUCT WALKTHROUGH — USER + ADMIN END-TO-END
// =====================================================================
//
// A single, narrative, video-recorded demonstration of the product as a
// real cross-role business journey, built per the spec in
// `prompts/Create Complete Cross-Role Product Walkthrough Playwright Test
// with Video Recording.md`. This is NOT a regression test: it is a demo.
// It follows one Demo User (and one referred second user) and one
// Admin-created Plan through registration, subscription, a real simulated
// payment, the admin console, the financial lifecycle to maturity, a
// redemption, a referral/commission cycle, a general enquiry, and a
// content-publish flow — ending on the final state of both the User's
// dashboard and the Admin's records.
//
// Recording: this file runs under the dedicated "walkthrough" Playwright
// project (see playwright.config.ts), which is the ONLY project that
// records video for it, at 1280x720 with a matching viewport. Run with:
//   npx playwright test --project=walkthrough --headed
// (see tests/browser/walkthrough/README.md for full instructions).
//
// Every action below drives the real UI (or the app's own supported
// simulation buttons, e.g. AutoPay/maturity — there is no real payment
// gateway in this app; see tests/helpers.ts / fixtures.ts). No step here
// invents functionality that isn't real: optional/secondary flows (gadget
// redemption, franchisee enquiries, shortfall handling) are intentionally
// left out of this primary walkthrough and called out in the README's
// Known Limitations rather than faked.

test.describe.configure({ mode: "serial" });

test.afterAll(async ({}, testInfo) => {
  // Runs after the test's page/context fixtures have torn down (flushing
  // their video to disk), so this is the earliest safe point to stitch —
  // doing it inside the test body would race the default fixture's video
  // finalization. A stitching failure is logged, never rethrown: a bug in
  // this best-effort post-processing must not flip a business-logic-passing
  // run to failed.
  //
  // afterAll hooks default to the project's `timeout` (60s here), which is
  // nowhere near enough to re-encode ~25 trimmed segments plus the final
  // concat — extend it generously rather than risk the hook itself timing
  // out mid-stitch.
  testInfo.setTimeout(600_000);
  try {
    await stitchWalkthroughVideo();
  } catch (err) {
    console.error("[walkthrough-video] stitching failed:", err);
  }
  await prisma.$disconnect();
});

async function suppressPushOptIn(page: Page) {
  await page.addInitScript(() => sessionStorage.setItem("push-opt-in-dismissed", "1"));
}

async function registerViaUi(page: Page, opts: { email: string; password: string; referralCode?: string }) {
  const url = opts.referralCode ? `/register?ref=${opts.referralCode}` : "/register";
  await page.goto(url);
  if (opts.referralCode) {
    await expect(page.locator('input[name="referralCode"]')).toHaveValue(opts.referralCode);
  }
  await page.locator('input[name="email"]').fill(opts.email);
  await page.locator('input[name="password"]').fill(opts.password);
  await Promise.all([
    page.waitForResponse((res) => res.request().method() === "POST"),
    page.getByRole("button", { name: "Register" }).click(),
  ]);
  await page.waitForURL("**/dashboard");
}

async function subscribeToPlan(page: Page, planId: string, amount: number) {
  await page.goto(`/plans/${planId}/subscribe`);
  await page.locator('select[name="amount"]').selectOption(String(amount));
  await Promise.all([
    page.waitForResponse((res) => res.request().method() === "POST"),
    page.getByRole("button", { name: "Confirm & Set Up AutoPay" }).click(),
  ]);
  await page.waitForURL("**/dashboard");
}

/** Same backdating convention as referral-commission-e2e.spec.ts: anchors
 * the next AutoPay due date on the most recent Payment so the next
 * "Run due AutoPay charges now" click simulates the next monthly cycle
 * without waiting a real month. */
async function backdateLatestPayment(userPlanId: string) {
  const latest = await prisma.payment.findFirstOrThrow({
    where: { userPlanId },
    orderBy: { createdAt: "desc" },
  });
  await prisma.payment.update({
    where: { id: latest.id },
    data: { createdAt: subDays(subMonths(new Date(), 1), 1) },
  });
}

/** Deterministic maturity simulation: backdates the UserPlan's own
 * maturityDate to yesterday (same convention as
 * fixtures.ts's createUserWithRedeemableBalance) so the admin's real
 * "Run plan maturity check now" button processes real maturity business
 * logic immediately, instead of the walkthrough waiting for the plan's
 * real multi-month tenure to elapse. */
async function backdateMaturity(userPlanId: string) {
  await prisma.userPlan.update({
    where: { id: userPlanId },
    data: { maturityDate: subDays(new Date(), 1) },
  });
}

async function readRedeemableBalance(page: Page): Promise<number> {
  await page.goto("/dashboard/redeem");
  const card = page.locator("div", { has: page.getByText("Actual Redeemable Balance", { exact: true }) }).first();
  const text = (await card.getByText(/₹/).first().textContent()) ?? "";
  return Number(text.replace(/[₹,]/g, ""));
}

async function createCourseFixture(fee: number, suffix: string) {
  const university = await prisma.university.create({ data: { name: `Walkthrough University ${suffix}` } });
  const course = await prisma.course.create({
    data: { universityId: university.id, name: `Walkthrough Course ${suffix}`, fee },
  });
  return course;
}

test("COMPLETE PRODUCT WALKTHROUGH — a real cross-role business journey from public visitor to withdrawn commission", async ({
  page,
  context,
  browser,
}) => {
  // Debug-mode run of the full 29-chapter walkthrough (16 original + 13
  // added to broaden product coverage) took 16.2 minutes against the
  // accumulated dev DB (1800+ User rows and growing). The headed/recorded
  // run adds slowMo pacing on top of that, so this needs real headroom, not
  // just enough to match the last observed run.
  test.setTimeout(1_800_000);

  // The default page/context fixture is the "public" camera — it already
  // records via the walkthrough project's use.video config. startedAt here
  // slightly lags the fixture's true recording start (by fixture/browser
  // launch time, typically well under a second) — negligible at this
  // slowMo pace.
  await registerCamera("public", context, page);

  const suffix = uniqueSuffix();
  const primaryEmail = `walkthrough-primary-${suffix}@example.com`;
  const referredEmail = `walkthrough-referred-${suffix}@example.com`;
  const planName = `Walkthrough Growth Plan ${suffix}`;
  const subscribeAmount = 4000;

  const adminContext = await browser.newContext({
    recordVideo: { dir: test.info().outputPath("videos"), size: { width: STITCH_WIDTH, height: STITCH_HEIGHT } },
  });
  const adminPage = await adminContext.newPage();
  await registerCamera("admin", adminContext, adminPage);
  await suppressPushOptIn(adminPage);

  const userAContext = await browser.newContext({
    recordVideo: { dir: test.info().outputPath("videos"), size: { width: STITCH_WIDTH, height: STITCH_HEIGHT } },
  });
  const userAPage = await userAContext.newPage();
  await registerCamera("userA", userAContext, userAPage);
  await suppressPushOptIn(userAPage);

  let planId = "";
  let userAPlanRowId = "";

  try {
    // ===== PUBLIC EXPERIENCE =====
    await test.step("Public — a visitor explores the product before signing in", async () => {
      mark("public");
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

      await page.goto("/plans");
      await expect(page.getByRole("heading", { name: "Available Investment Plans" })).toBeVisible();

      await page.goto("/franchisee");
      await page.goto("/contact");
    });

    // ===== ADMIN EXPERIENCE =====
    await test.step("Admin — sign in and create a new investment plan", async () => {
      mark("admin");
      await loginAsAdmin(adminPage);
      await adminPage.waitForURL("**/admin");

      await adminPage.goto("/admin/plans");
      await expect(adminPage.getByRole("heading", { name: "Plan Management" })).toBeVisible();

      await adminPage.getByRole("button", { name: "Create Plan", exact: true }).click();
      await adminPage.locator('input[name="name"]').fill(planName);
      await adminPage.locator('input[name="tenureMonths"]').fill("6");
      await adminPage.locator('input[name="presetAmounts"]').fill(`${subscribeAmount},6000`);
      await adminPage.locator('input[name="rewardPercent"]').fill("5");
      await adminPage.locator('input[name="commissionPercent"]').fill("10");
      await Promise.all([
        adminPage.waitForResponse((res) => res.request().method() === "POST"),
        adminPage.getByRole("button", { name: "Create plan", exact: true }).click(),
      ]);

      const created = await prisma.plan.findFirstOrThrow({ where: { name: planName } });
      planId = created.id;
      // createPlanAction's revalidatePath is applied as a delayed client-side
      // re-navigation (same root cause as the /admin/users table — see
      // account-lock-e2e.spec.ts), not synchronously with the POST response.
      // Under headed/slowMo load the default 10s expect timeout isn't enough.
      // Escalated 30s -> 60s: reproduced twice in a row at exactly this step
      // in a full sequential cross-role run (this suite's fixture Plan rows
      // never get deleted between runs — same established convention as the
      // User table in account-lock-e2e.spec.ts — 298 rows at the time of this
      // fix), where the combined server render + client hydration + delayed
      // revalidation genuinely exceeds 30s.
      await expect(adminPage.getByRole("cell", { name: planName })).toBeVisible({ timeout: 60_000 });
    });

    // ===== USER EXPERIENCE =====
    await test.step("User — register a new account (no referral yet)", async () => {
      mark("userA");
      await registerViaUi(userAPage, { email: primaryEmail, password: TEST_PASSWORD });
      expect(new URL(userAPage.url()).pathname).toBe("/dashboard");
    });

    await test.step("User — tour the dashboard's key metrics", async () => {
      await expect(userAPage.getByLabel("Financial Summary")).toBeVisible();
      await expect(userAPage.getByText("Total Invested")).toBeVisible();
      await expect(userAPage.getByText("Redeemable Balance")).toBeVisible();
      await expect(userAPage.getByText("Reward Points")).toBeVisible();
      await expect(userAPage.getByText("Active Plans")).toBeVisible();
      await expect(userAPage.getByText("Referral Earnings")).toBeVisible();
    });

    await test.step("User — discover the admin-created plan and subscribe with AutoPay", async () => {
      await userAPage.goto("/plans");
      await expect(userAPage.getByRole("heading", { name: planName })).toBeVisible();
      await userAPage.locator(`a[href="/plans/${planId}/subscribe"]`).click();
      await userAPage.waitForURL(`**/plans/${planId}/subscribe`);

      await userAPage.locator('select[name="amount"]').selectOption(String(subscribeAmount));
      await Promise.all([
        userAPage.waitForResponse((res) => res.request().method() === "POST"),
        userAPage.getByRole("button", { name: "Confirm & Set Up AutoPay" }).click(),
      ]);
      await userAPage.waitForURL("**/dashboard");
    });

    // ===== USER + ADMIN — SAME-ENTITY CONTINUITY =====
    await test.step("User — see the first payment reflected on the dashboard", async () => {
      // getByText(planName) is a substring match that can also hit Next.js's
      // route announcer (#__next-route-announcer__), which transiently holds
      // "Subscribe to <planName>..." right after this navigation — causing an
      // intermittent strict-mode violation. Scope to the heading role instead.
      await expect(userAPage.getByRole("heading", { name: planName })).toBeVisible();
    });

    let referredUserId = "";
    let userAId = "";

    await test.step("Admin — observe the same subscription and payment from the console", async () => {
      mark("admin");
      const primaryUser = await prisma.user.findUniqueOrThrow({ where: { email: primaryEmail } });
      userAId = primaryUser.id;
      const userPlan = await prisma.userPlan.findFirstOrThrow({ where: { userId: primaryUser.id, planId } });
      userAPlanRowId = userPlan.id;
      const payment = await prisma.payment.findFirstOrThrow({ where: { userPlanId: userPlan.id } });
      expect(payment.status).toBe("SUCCESS");

      await adminPage.goto("/admin/users");
      await expect(adminPage.getByText(primaryEmail)).toBeVisible();

      await adminPage.goto("/admin/plans");
      const planRow = adminPage.locator("tr", { has: adminPage.getByText(planName) });
      await expect(planRow.locator("td").nth(6)).toHaveText("1");
    });

    // ===== FINANCIAL LIFECYCLE (deterministic simulation, no real waiting) =====
    await test.step("Admin — run a second AutoPay cycle, then fast-forward the plan to maturity", async () => {
      await backdateLatestPayment(userAPlanRowId);
      await adminPage.goto("/admin/payments");
      await Promise.all([
        adminPage.waitForResponse((res) => res.request().method() === "POST"),
        adminPage.getByRole("button", { name: "Run due AutoPay charges now" }).click(),
      ]);

      const payments = await prisma.payment.findMany({ where: { userPlanId: userAPlanRowId } });
      expect(payments.length).toBeGreaterThanOrEqual(2);

      await backdateMaturity(userAPlanRowId);
      await adminPage.goto("/admin/payments");
      await Promise.all([
        adminPage.waitForResponse((res) => res.request().method() === "POST"),
        adminPage.getByRole("button", { name: "Run plan maturity check now" }).click(),
      ]);

      const matured = await prisma.userPlan.findUniqueOrThrow({ where: { id: userAPlanRowId } });
      expect(matured.status).toBe("MATURED");
    });

    // ===== REDEMPTION =====
    await test.step("User — redeem part of the matured balance; Admin approves it", async () => {
      mark("userA");
      const balance = await readRedeemableBalance(userAPage);
      expect(balance).toBeGreaterThan(0);
      const refundAmount = Math.max(1, Math.floor(balance / 2));

      await userAPage.goto("/dashboard/redeem/refund");
      await userAPage.locator('input[name="amount"]').fill(String(refundAmount));
      await Promise.all([
        userAPage.waitForResponse((res) => res.request().method() === "POST"),
        userAPage.getByRole("button", { name: "Submit request" }).click(),
      ]);
      await userAPage.waitForURL("**/dashboard/redeem");

      const request = await prisma.redemptionRequest.findFirstOrThrow({
        where: { userId: userAId, category: "REFUND" },
      });
      expect(request.status).toBe("PENDING");

      mark("admin");
      await adminPage.goto("/admin/redemptions");
      const row = adminPage.locator("li", { has: adminPage.getByText(primaryEmail) });
      await expect(row).toBeVisible();
      await Promise.all([
        adminPage.waitForResponse((res) => res.request().method() === "POST"),
        row.getByRole("button", { name: "Approve" }).click(),
      ]);

      const approved = await prisma.redemptionRequest.findUniqueOrThrow({ where: { id: request.id } });
      expect(approved.status).toBe("APPROVED");

      // Final business outcome, verified from the requesting user's own session.
      mark("userA");
      await userAPage.goto("/dashboard/redeem");
      await expect(userAPage.getByText("APPROVED").first()).toBeVisible();
    });

    // ===== REFERRAL & COMMISSION (cross-role) =====
    let referralId = "";
    const referredContext = await browser.newContext({
      recordVideo: { dir: test.info().outputPath("videos"), size: { width: STITCH_WIDTH, height: STITCH_HEIGHT } },
    });
    const referredPage = await referredContext.newPage();
    await registerCamera("referred", referredContext, referredPage);
    await suppressPushOptIn(referredPage);

    await test.step("User — share the real referral code from the Referrals page", async () => {
      mark("userA");
      await userAPage.goto("/dashboard/referrals");
      await expect(userAPage.getByText("Your referral code", { exact: true })).toBeVisible();

      const primaryUser = await prisma.user.findUniqueOrThrow({ where: { email: primaryEmail } });
      await expect(userAPage.getByText(primaryUser.referralCode).first()).toBeVisible();

      // A second person registers using it and subscribes to the same plan —
      // the "one continuous business story" carried across a new role.
      mark("referred");
      await registerViaUi(referredPage, {
        email: referredEmail,
        password: TEST_PASSWORD,
        referralCode: primaryUser.referralCode,
      });

      const referredUser = await prisma.user.findUniqueOrThrow({ where: { email: referredEmail } });
      referredUserId = referredUser.id;
      const referral = await prisma.referral.findUniqueOrThrow({ where: { referredUserId: referredUser.id } });
      referralId = referral.id;
      expect(referral.referrerUserId).toBe(primaryUser.id);

      await subscribeToPlan(referredPage, planId, subscribeAmount);

      const commission = await prisma.commission.findFirstOrThrow({ where: { referralId } });
      expect(commission.commissionType).toBe("ONE_TIME");
      expect(commission.status).toBe("ACCRUED");
    });

    await test.step("Admin — approve and credit the resulting commission", async () => {
      mark("admin");
      await adminPage.goto("/admin/commissions");
      const accruedRow = adminPage.locator("li", { has: adminPage.getByText(primaryEmail) });
      await expect(accruedRow).toBeVisible();
      await Promise.all([
        adminPage.waitForResponse((res) => res.request().method() === "POST"),
        accruedRow.getByRole("button", { name: "Approve" }).click(),
      ]);

      const approvedRow = adminPage.locator("li", { has: adminPage.getByText(primaryEmail) });
      await expect(approvedRow.getByRole("button", { name: "Credit to ledger" })).toBeVisible({ timeout: 30_000 });
      await Promise.all([
        adminPage.waitForResponse((res) => res.request().method() === "POST"),
        approvedRow.getByRole("button", { name: "Credit to ledger" }).click(),
      ]);

      const commission = await prisma.commission.findFirstOrThrow({ where: { referralId } });
      expect(commission.status).toBe("AVAILABLE_FOR_WITHDRAWAL");
    });

    await test.step("User — see the earned commission and withdraw it", async () => {
      mark("userA");
      const bell = userAPage.getByRole("link", { name: /Notifications \(\d+ unread\)/ });
      await userAPage.goto("/dashboard");
      await expect(bell).toBeVisible();
      await bell.click();
      await userAPage.waitForURL("**/dashboard/notifications");
      await expect(userAPage.getByText("Referral commission credited")).toBeVisible();

      await userAPage.goto("/dashboard/referrals");
      const withdrawSection = userAPage.locator("section", {
        has: userAPage.getByRole("heading", { name: "Available for withdrawal" }),
      });
      const withdrawRow = withdrawSection.locator("li").first();
      await expect(withdrawRow).toBeVisible();
      await Promise.all([
        userAPage.waitForResponse((res) => res.request().method() === "POST"),
        withdrawRow.getByRole("button", { name: "Withdraw" }).click(),
      ]);

      const commission = await prisma.commission.findFirstOrThrow({ where: { referralId } });
      expect(commission.status).toBe("WITHDRAWN");
    });

    await referredContext.close();

    // ===== OTHER MEMBERS — THE REST OF THE PRODUCT'S BREADTH =====
    // The financial/referral throughline above (User A + the referred user)
    // stays intact; each of the following chapters introduces its own
    // fresh, purpose-built member or admin action to demonstrate a real,
    // self-contained flow that doesn't compose with User A's already
    // partially-redeemed state. Framed as "other members using the
    // platform" rather than forcing every feature onto one account.
    await test.step("Member — redeem a gadget from the catalog against their Redeemable Balance", async () => {
      const gadgetContext = await browser.newContext({
        recordVideo: { dir: test.info().outputPath("videos"), size: { width: STITCH_WIDTH, height: STITCH_HEIGHT } },
      });
      const gadgetPage = await gadgetContext.newPage();
      await registerCamera("gadget", gadgetContext, gadgetPage);
      await suppressPushOptIn(gadgetPage);

      const gadget = await createGadgetStock({ stockQuantity: 3, price: 2000 });
      const { user, email, password } = await createUserWithRedeemableBalance(10000);

      mark("gadget");
      await loginAsUser(gadgetPage, email, password);
      await gadgetPage.waitForURL("**/dashboard");
      await gadgetPage.goto("/dashboard/redeem/gadgets");

      const gadgetRow = gadgetPage.locator("li", { has: gadgetPage.getByText(gadget.name) });
      await expect(gadgetRow).toBeVisible();
      await gadgetRow.getByRole("button", { name: `Increase ${gadget.name} quantity` }).click();
      await Promise.all([
        gadgetPage.waitForResponse((res) => res.request().method() === "POST"),
        gadgetPage.getByRole("button", { name: "Submit request" }).click(),
      ]);

      const request = await prisma.redemptionRequest.findFirstOrThrow({
        where: { userId: user.id, category: "GADGETS" },
      });
      expect(request.status).toBe("PENDING");

      mark("admin");
      await adminPage.goto("/admin/redemptions");
      const row = adminPage.locator("li", { has: adminPage.getByText(email) });
      await expect(row).toBeVisible();
      await Promise.all([
        adminPage.waitForResponse((res) => res.request().method() === "POST"),
        row.getByRole("button", { name: "Approve" }).click(),
      ]);

      const approved = await prisma.redemptionRequest.findUniqueOrThrow({ where: { id: request.id } });
      expect(approved.status).toBe("APPROVED");

      await gadgetContext.close();
    });

    await test.step("Member — enrol via a franchisee redemption within Available Margin", async () => {
      const franchiseeContext = await browser.newContext({
        recordVideo: { dir: test.info().outputPath("videos"), size: { width: STITCH_WIDTH, height: STITCH_HEIGHT } },
      });
      const franchiseePage = await franchiseeContext.newPage();
      await registerCamera("franchisee", franchiseeContext, franchiseePage);
      await suppressPushOptIn(franchiseePage);

      const { user, email, password } = await createUserWithRedeemableBalance(30000);
      const { franchiseePlan, college } = await createFranchiseePlanWithColleges({ oneTimeDeductiblePrice: 20000 });

      mark("franchisee");
      await loginAsUser(franchiseePage, email, password);
      await franchiseePage.waitForURL("**/dashboard");
      await franchiseePage.goto("/dashboard/redeem/franchisee");

      const planCard = franchiseePage
        .locator("div")
        .filter({ hasText: franchiseePlan.name })
        .filter({ has: franchiseePage.locator('select[name="collegeId"]') })
        .last();
      await expect(planCard).toBeVisible();
      await planCard.locator('select[name="collegeId"]').selectOption({ label: college.name });
      await Promise.all([
        franchiseePage.waitForResponse((res) => res.request().method() === "POST"),
        planCard.getByRole("button", { name: "Submit enquiry" }).click(),
      ]);

      const enquiry = await prisma.franchiseeRedemptionEnquiry.findFirstOrThrow({
        where: { userId: user.id, franchiseePlanId: franchiseePlan.id },
      });
      expect(enquiry.status).toBe("PENDING");

      mark("admin");
      await adminPage.goto("/admin/redemptions");
      const row = adminPage.locator("li", { has: adminPage.getByText(email) });
      await expect(row).toBeVisible();
      await Promise.all([
        adminPage.waitForResponse((res) => res.request().method() === "POST"),
        row.getByRole("button", { name: "Approve" }).click(),
      ]);

      const approved = await prisma.franchiseeRedemptionEnquiry.findUniqueOrThrow({ where: { id: enquiry.id } });
      expect(approved.status).toBe("APPROVED");

      await franchiseeContext.close();
    });

    await test.step("Member — redeem a course fee and earn CEILING-rounded reward points", async () => {
      const courseContext = await browser.newContext({
        recordVideo: { dir: test.info().outputPath("videos"), size: { width: STITCH_WIDTH, height: STITCH_HEIGHT } },
      });
      const coursePage = await courseContext.newPage();
      await registerCamera("course", courseContext, coursePage);
      await suppressPushOptIn(coursePage);

      const fee = 12345;
      const { user, email, password } = await createUserWithRedeemableBalance(20000);
      const course = await createCourseFixture(fee, suffix);

      mark("course");
      await loginAsUser(coursePage, email, password);
      await coursePage.waitForURL("**/dashboard");
      await coursePage.goto("/dashboard/redeem/course");

      const courseRow = coursePage.locator("li", { hasText: course.name });
      await expect(courseRow).toBeVisible();
      await Promise.all([
        coursePage.waitForResponse((res) => res.request().method() === "POST"),
        courseRow.getByRole("button", { name: "Request" }).click(),
      ]);

      const request = await prisma.redemptionRequest.findFirstOrThrow({
        where: { userId: user.id, category: "COURSE", relatedCourseId: course.id },
      });
      expect(request.status).toBe("PENDING");

      mark("admin");
      await adminPage.goto("/admin/redemptions");
      const row = adminPage.locator("li", { has: adminPage.getByText(email) });
      await expect(row).toBeVisible();
      await Promise.all([
        adminPage.waitForResponse((res) => res.request().method() === "POST"),
        row.getByRole("button", { name: "Approve" }).click(),
      ]);

      const approved = await prisma.redemptionRequest.findUniqueOrThrow({ where: { id: request.id } });
      expect(approved.status).toBe("APPROVED");

      await courseContext.close();
    });

    await test.step("Member — a redemption exceeding Available Margin is put on shortfall hold; Admin verifies and approves", async () => {
      const shortfallContext = await browser.newContext({
        recordVideo: { dir: test.info().outputPath("videos"), size: { width: STITCH_WIDTH, height: STITCH_HEIGHT } },
      });
      const shortfallPage = await shortfallContext.newPage();
      await registerCamera("shortfall", shortfallContext, shortfallPage);
      await suppressPushOptIn(shortfallPage);

      const { email, password } = await createUserWithRedeemableBalance(10000);

      mark("shortfall");
      await loginAsUser(shortfallPage, email, password);
      await shortfallPage.waitForURL("**/dashboard");
      await shortfallPage.goto("/dashboard/redeem/refund");
      await shortfallPage.locator('input[name="amount"]').fill("12000");
      await Promise.all([
        shortfallPage.waitForResponse((res) => res.request().method() === "POST"),
        shortfallPage.getByRole("button", { name: "Submit request" }).click(),
      ]);
      await shortfallPage.waitForURL("**/dashboard/redeem");

      const request = await prisma.redemptionRequest.findFirstOrThrow({
        where: { userId: (await prisma.user.findUniqueOrThrow({ where: { email } })).id, category: "REFUND" },
      });
      expect(request.status).toBe("AWAITING_SHORTFALL_RESOLUTION");
      expect(Number(request.shortfallAmount)).toBe(2000);

      mark("admin");
      await adminPage.goto("/admin/redemptions");
      const row = adminPage.locator("li", { has: adminPage.getByText(email) });
      await expect(row).toBeVisible();
      await expect(row.getByRole("button", { name: "Approve" })).toBeDisabled();

      await Promise.all([
        adminPage.waitForResponse((res) => res.request().method() === "POST"),
        (async () => {
          await row.locator('input[name="reference"]').fill("WALKTHROUGH-BANK-REF");
          await row.getByRole("button", { name: "Verify shortfall" }).click();
        })(),
      ]);

      await adminPage.reload();
      const verifiedRow = adminPage.locator("li", { has: adminPage.getByText(email) });
      await Promise.all([
        adminPage.waitForResponse((res) => res.request().method() === "POST"),
        verifiedRow.getByRole("button", { name: "Approve" }).click(),
      ]);

      const approved = await prisma.redemptionRequest.findUniqueOrThrow({ where: { id: request.id } });
      expect(approved.status).toBe("APPROVED");

      await shortfallContext.close();
    });

    await test.step("Member — a missed AutoPay payment exhausts retries and reaches manual recovery", async () => {
      const retryContext = await browser.newContext({
        recordVideo: { dir: test.info().outputPath("videos"), size: { width: STITCH_WIDTH, height: STITCH_HEIGHT } },
      });
      const retryPage = await retryContext.newPage();
      await registerCamera("retry", retryContext, retryPage);
      await suppressPushOptIn(retryPage);

      const { email, password, userPlan } = await createDuePaymentMandate();

      mark("admin");
      await runAutoPayNow(adminPage, { forceOutcome: "FAILED" });

      const settings = await getSettings();
      let latest = await prisma.payment.findFirstOrThrow({
        where: { userPlanId: userPlan.id },
        orderBy: { createdAt: "desc" },
      });
      let attempts = 0;
      while (latest.status === "RETRYING" && attempts < settings.paymentRetryCount + 1) {
        await prisma.payment.update({ where: { id: latest.id }, data: { nextRetryAt: new Date(0) } });
        await runRetriesNow(adminPage, { forceOutcome: "FAILED" });
        latest = await prisma.payment.findUniqueOrThrow({ where: { id: latest.id } });
        attempts += 1;
      }
      expect(latest.status).toBe("FAILED");

      mark("retry");
      await loginAsUser(retryPage, email, password);
      await retryPage.waitForURL("**/dashboard");
      await retryPage.goto("/dashboard/payments");
      const payRow = retryPage.locator("li", { hasText: userPlan.paymentAmount.toString() }).first();
      await expect(payRow.getByRole("button", { name: "Pay now" })).toBeVisible();

      await retryContext.close();
    });

    await test.step("Member — sign in via simulated Google social login, still gated by mandatory 2FA", async () => {
      const socialContext = await browser.newContext({
        recordVideo: { dir: test.info().outputPath("videos"), size: { width: STITCH_WIDTH, height: STITCH_HEIGHT } },
      });
      const socialPage = await socialContext.newPage();
      await registerCamera("social", socialContext, socialPage);
      await suppressPushOptIn(socialPage);

      const { email } = await createUser();

      mark("social");
      await socialPage.goto("/login/social/google");
      await socialPage.locator('input[name="email"]').fill(email);
      await socialPage.getByRole("button", { name: "Authorize" }).click();
      await socialPage.waitForURL("**/verify-2fa");

      const code = await getLatestOtpCode(email, "LOGIN_2FA");
      await socialPage.locator('input[name="code"]').fill(code);
      await Promise.all([
        socialPage.waitForResponse((res) => res.request().method() === "POST"),
        socialPage.getByRole("button", { name: "Verify" }).click(),
      ]);
      await socialPage.waitForURL("**/dashboard");

      await socialContext.close();
    });

    await test.step("Admin — lock a member's account after suspicious activity; the member's login is denied, then Admin unlocks it", async () => {
      const lockedUserContext = await browser.newContext({
        recordVideo: { dir: test.info().outputPath("videos"), size: { width: STITCH_WIDTH, height: STITCH_HEIGHT } },
      });
      const lockedUserPage = await lockedUserContext.newPage();
      await registerCamera("lockeduser", lockedUserContext, lockedUserPage);
      await suppressPushOptIn(lockedUserPage);

      const { email, password } = await createUser();

      // A wrong-password attempt first, recording a FAILED LoginHistory row.
      mark("lockeduser");
      await lockedUserPage.goto("/login");
      await lockedUserPage.locator('input[name="email"]').fill(email);
      await lockedUserPage.locator('input[name="password"]').fill("WrongPassword!1");
      await lockedUserPage.getByRole("button", { name: "Log in" }).click();

      mark("admin");
      await adminPage.goto("/admin/users");
      const userRow = adminPage.locator("table").first().locator("tr", { has: adminPage.getByText(email) });
      await expect(userRow).toBeVisible({ timeout: 60_000 });
      await Promise.all([
        adminPage.waitForResponse((res) => res.request().method() === "POST"),
        userRow.getByRole("button", { name: "Lock" }).click(),
      ]);
      // toggleUserLockAction's revalidatePath is applied as a delayed
      // client-side re-navigation (several seconds after the POST resolves
      // under load) — see account-lock-e2e.spec.ts for the full diagnosis.
      // That file calibrated a 60s timeout against ~1168 accumulated User
      // rows on this suite's unpaginated /admin/users page; by the time this
      // walkthrough (which itself creates dozens more fixture users earlier
      // in the same run) reaches this chapter, the dev DB has grown well
      // past 1800 rows, and the server-render + hydration of that table can
      // exceed 60s. Escalating further here for the same root cause, not
      // papering over a different problem.
      await expect(userRow.getByText("Locked")).toBeVisible({ timeout: 120_000 });

      mark("lockeduser");
      await lockedUserPage.goto("/login");
      await lockedUserPage.locator('input[name="email"]').fill(email);
      await lockedUserPage.locator('input[name="password"]').fill(password);
      await lockedUserPage.getByRole("button", { name: "Log in" }).click();
      await expect(lockedUserPage.getByText(/locked/i)).toBeVisible();

      mark("admin");
      await Promise.all([
        adminPage.waitForResponse((res) => res.request().method() === "POST"),
        userRow.getByRole("button", { name: "Unlock" }).click(),
      ]);
      await expect(userRow.getByText("Active")).toBeVisible({ timeout: 120_000 });

      await lockedUserContext.close();
    });

    await test.step("Admin — create a new interest calculation method and see it snapshotted onto a new plan", async () => {
      mark("admin");
      const methodName = `Walkthrough Interest Method ${suffix}`;
      await adminPage.goto("/admin/interest-methods");
      await adminPage.getByRole("button", { name: "Create Interest Method", exact: true }).click();
      await adminPage.locator('input[name="name"]').fill(methodName);
      await adminPage.locator("#formulaType").selectOption("SIMPLE");
      await adminPage.locator('input[name="ratePercent"]').fill("9");
      await adminPage.locator('input[name="tenureMonths"]').fill("12");
      await Promise.all([
        adminPage.waitForResponse((res) => res.request().method() === "POST"),
        adminPage.getByRole("button", { name: "Create interest method", exact: true }).click(),
      ]);

      const method = await prisma.interestCalculationMethod.findFirstOrThrow({ where: { name: methodName } });

      await adminPage.goto("/admin/plans");
      await adminPage.getByRole("button", { name: "Create Plan", exact: true }).click();
      await expect(adminPage.locator("#interestMethodId")).toContainText(methodName);

      const versionedPlanName = `Walkthrough Versioned Plan ${suffix}`;
      await adminPage.locator('input[name="name"]').fill(versionedPlanName);
      await adminPage.locator("#interestMethodId").selectOption(method.id);
      await adminPage.locator('input[name="tenureMonths"]').fill("12");
      await adminPage.locator('input[name="presetAmounts"]').fill("1000,2000");
      await adminPage.locator('input[name="rewardPercent"]').fill("5");
      await adminPage.locator('input[name="commissionPercent"]').fill("5");
      await Promise.all([
        adminPage.waitForResponse((res) => res.request().method() === "POST"),
        adminPage.getByRole("button", { name: "Create plan", exact: true }).click(),
      ]);

      const versionedPlan = await prisma.plan.findFirstOrThrow({ where: { name: versionedPlanName } });
      expect(versionedPlan.interestMethodId).toBe(method.id);
    });

    await test.step("Admin — customize the login screen theme end to end (draft, publish, verify, reset)", async () => {
      mark("admin");
      const themeTitle = `Walkthrough Theme ${suffix}`;
      await adminPage.goto("/admin/theme");
      await adminPage.getByRole("button", { name: "Login Screen" }).click();
      await adminPage.locator("#loginTitle").fill(themeTitle);
      await Promise.all([
        adminPage.waitForResponse((res) => res.request().method() === "POST"),
        adminPage.getByRole("button", { name: "Save Draft" }).click(),
      ]);
      await expect(adminPage.getByText("Draft saved.")).toBeVisible();

      // "Publish" only reveals the confirmation panel client-side (no
      // server action fires until "Confirm Publish" — see ThemeEditor.tsx),
      // so it must not be wrapped in a waitForResponse or the wait hangs
      // forever.
      await adminPage.getByRole("button", { name: "Publish" }).click();
      await expect(adminPage.getByText("Publish will make the draft")).toBeVisible();
      await Promise.all([
        adminPage.waitForResponse((res) => res.request().method() === "POST"),
        adminPage.getByRole("button", { name: "Confirm Publish" }).click(),
      ]);

      const themeCheckContext = await browser.newContext({
        recordVideo: { dir: test.info().outputPath("videos"), size: { width: STITCH_WIDTH, height: STITCH_HEIGHT } },
      });
      const themeCheckPage = await themeCheckContext.newPage();
      await registerCamera("themecheck", themeCheckContext, themeCheckPage);
      mark("themecheck");
      await themeCheckPage.goto("/login");
      // AuthShell's branding panel (which shows the published login title)
      // is `hidden lg:flex` by design — below the `lg` breakpoint the login
      // screen intentionally shows only the form, so this visual check only
      // applies on wider viewports.
      if (test.info().project.name !== "walkthrough-mobile") {
        await expect(themeCheckPage.getByText(themeTitle)).toBeVisible();
      }
      await themeCheckContext.close();

      // Same reasoning as "Publish" above: "Reset to Default" only reveals
      // its own confirmation panel client-side.
      mark("admin");
      await adminPage.getByRole("button", { name: "Reset to Default" }).click();
      await expect(adminPage.getByText("Reset will discard all customization")).toBeVisible();
      // ThemeEditor's resetAction success handler calls window.location.reload()
      // asynchronously once the server action resolves — a real navigation
      // that lands after the POST response the test already waits for. Attach
      // this listener before clicking so it catches that specific future
      // reload rather than resolving against the page's already-settled
      // "load" state; without it the next test.step's adminPage.goto races
      // the in-flight reload and Playwright aborts it as an interrupted
      // navigation.
      const themeReloaded = adminPage.waitForEvent("load");
      await Promise.all([
        adminPage.waitForResponse((res) => res.request().method() === "POST"),
        adminPage.getByRole("button", { name: "Confirm Reset" }).click(),
      ]);
      await themeReloaded;
    });

    await test.step("Admin — cancel a referral relationship without affecting an already-earned commission", async () => {
      mark("admin");
      const { referred, referral, commission } = await createReferralWithAccruedCommission(150);

      await adminPage.goto("/admin/referrers");
      const referralSection = adminPage.locator("section", {
        has: adminPage.getByRole("heading", { name: "Active Referral Relationships" }),
      });
      const referralRow = referralSection.locator("tr", { has: adminPage.getByText(referred.email) });
      await expect(referralRow).toBeVisible({ timeout: 60_000 });
      await referralRow.locator('input[name="reason"]').fill("Walkthrough demonstration cancellation");
      await Promise.all([
        adminPage.waitForResponse((res) => res.request().method() === "POST"),
        referralRow.getByRole("button", { name: "Cancel referral" }).click(),
      ]);

      const cancelled = await prisma.referral.findUniqueOrThrow({ where: { id: referral.id } });
      expect(cancelled.status).toBe("CANCELLED");

      const unaffectedCommission = await prisma.commission.findUniqueOrThrow({ where: { id: commission.id } });
      expect(unaffectedCommission.status).toBe("ACCRUED");
    });

    await test.step("Admin — discontinue a plan; the member's matured margin still unlocks for redemption", async () => {
      const discontinueContext = await browser.newContext({
        recordVideo: { dir: test.info().outputPath("videos"), size: { width: STITCH_WIDTH, height: STITCH_HEIGHT } },
      });
      const discontinuePage = await discontinueContext.newPage();
      await registerCamera("discontinue", discontinueContext, discontinuePage);
      await suppressPushOptIn(discontinuePage);

      const { user, email, password } = await createUser();
      const discontinuedPlan = await createPlan({ presetAmounts: [3000], tenureMonths: 6 });

      mark("discontinue");
      await loginAsUser(discontinuePage, email, password);
      await discontinuePage.waitForURL("**/dashboard");
      await subscribeToPlan(discontinuePage, discontinuedPlan.id, 3000);

      const userPlan = await prisma.userPlan.findFirstOrThrow({
        where: { userId: user.id, planId: discontinuedPlan.id },
      });

      mark("admin");
      await adminPage.goto("/admin/plans");
      const planRow = adminPage.locator("tr", { has: adminPage.getByText(discontinuedPlan.name) });
      await Promise.all([
        adminPage.waitForResponse((res) => res.request().method() === "POST"),
        planRow.getByRole("button", { name: "Discontinue" }).click(),
      ]);

      const discontinued = await prisma.userPlan.findUniqueOrThrow({ where: { id: userPlan.id } });
      expect(discontinued.status).toBe("DISCONTINUED");
      expect(await getAvailableMargin(user.id)).toBe(0);

      mark("discontinue");
      await discontinuePage.goto("/dashboard");
      // Exact match: the loose text also matches the unrelated helper caption
      // "Matured, redeemed or discontinued" elsewhere on the dashboard.
      await expect(discontinuePage.getByText("DISCONTINUED", { exact: true })).toBeVisible();

      mark("admin");
      await prisma.userPlan.update({ where: { id: userPlan.id }, data: { maturityDate: subDays(new Date(), 1) } });
      await runMaturityCheckNow(adminPage);

      const matured = await prisma.userPlan.findUniqueOrThrow({ where: { id: userPlan.id } });
      expect(matured.status).toBe("MATURED");
      expect(await getAvailableMargin(user.id)).toBeGreaterThan(0);

      mark("discontinue");
      await discontinuePage.goto("/dashboard");
      // Exact match: same strict-mode collision as DISCONTINUED above, with
      // the dashboard's "Matured, redeemed or discontinued" helper caption.
      await expect(discontinuePage.getByText("MATURED", { exact: true })).toBeVisible();

      await discontinueContext.close();
    });

    await test.step("Admin — browse the reports & reconciliation center", async () => {
      mark("admin");
      await adminPage.goto("/admin/reports");
      await expect(adminPage.locator('a[href^="/api/admin/reports/"]').first()).toBeVisible();
    });

    await test.step("Member — navigate the dashboard via the responsive hamburger menu on mobile", async () => {
      const mobileContext = await browser.newContext({
        viewport: { width: 390, height: 844 },
        recordVideo: { dir: test.info().outputPath("videos"), size: { width: 390, height: 844 } },
      });
      const mobilePage = await mobileContext.newPage();
      await registerCamera("mobile", mobileContext, mobilePage);
      await suppressPushOptIn(mobilePage);

      const { email, password } = await createUser();
      mark("mobile");
      await loginAsUser(mobilePage, email, password);
      await mobilePage.waitForURL("**/dashboard");

      const trigger = mobilePage.getByRole("button", { name: "Open navigation menu" });
      await expect(trigger).toBeVisible();
      await trigger.click();
      const drawer = mobilePage.getByRole("navigation", { name: "Dashboard Navigation" });
      await expect(drawer).toBeVisible();
      await drawer.getByRole("link", { name: "Referrals" }).click();
      await mobilePage.waitForURL("**/dashboard/referrals");

      await mobileContext.close();
    });

    // ===== GENERAL ENQUIRY =====
    let enquiryId = "";
    await test.step("Public — submit a general enquiry", async () => {
      mark("public");
      const enquiryEmail = `walkthrough-enquiry-${suffix}@example.com`;
      await page.goto("/contact");
      await page.locator('input[name="name"]').fill("Walkthrough Visitor");
      await page.locator('input[name="email"]').fill(enquiryEmail);
      await page.locator('textarea[name="message"]').fill("I'd like to know more about the referral program.");
      await Promise.all([
        page.waitForResponse((res) => res.request().method() === "POST"),
        page.getByRole("button", { name: "Send enquiry" }).click(),
      ]);
      await expect(page.getByText("Thank you — your enquiry has been received.")).toBeVisible();

      const enquiry = await prisma.generalEnquiry.findFirstOrThrow({ where: { email: enquiryEmail } });
      enquiryId = enquiry.id;
    });

    await test.step("Admin — resolve the enquiry through the queue", async () => {
      mark("admin");
      await adminPage.goto("/admin/enquiries/general");
      const row = adminPage.locator("li", { has: adminPage.getByText(`walkthrough-enquiry-${suffix}@example.com`) });
      await expect(row).toBeVisible();
      await row.locator('select[name="status"]').selectOption("RESOLVED");
      await Promise.all([
        adminPage.waitForResponse((res) => res.request().method() === "POST"),
        row.getByRole("button", { name: "Update" }).click(),
      ]);

      const resolved = await prisma.generalEnquiry.findUniqueOrThrow({ where: { id: enquiryId } });
      expect(resolved.status).toBe("RESOLVED");
    });

    // ===== CONTENT MANAGEMENT =====
    await test.step("Admin — publish an About Us section; Public sees it live", async () => {
      mark("admin");
      const heading = `Our Walkthrough Mission ${suffix}`;
      await adminPage.goto("/admin/settings/about-us");
      await adminPage.locator('input[name="heading"]').last().fill(heading);
      await adminPage.locator('textarea[name="body"]').last().fill("We help members grow their savings responsibly.");
      await Promise.all([
        adminPage.waitForResponse((res) => res.request().method() === "POST"),
        adminPage.getByRole("button", { name: "Add section" }).click(),
      ]);
      await Promise.all([
        adminPage.waitForResponse((res) => res.request().method() === "POST"),
        adminPage.getByRole("button", { name: "Publish" }).click(),
      ]);

      mark("public");
      await page.goto("/about");
      await expect(page.getByRole("heading", { name: heading })).toBeVisible();
    });

    // ===== FINAL PRODUCT STATE =====
    await test.step("Final state — User's full dashboard and Admin's records", async () => {
      mark("userA");
      await userAPage.goto("/dashboard");
      // Same route-announcer substring-match hazard as the earlier same-entity
      // continuity check — scope to the heading role.
      await expect(userAPage.getByRole("heading", { name: planName })).toBeVisible();

      const finalCommission = await prisma.commission.findFirstOrThrow({ where: { referralId } });
      expect(finalCommission.status).toBe("WITHDRAWN");
      const finalUserPlan = await prisma.userPlan.findUniqueOrThrow({ where: { id: userAPlanRowId } });
      expect(finalUserPlan.status).toBe("PARTIALLY_REDEEMED");

      mark("admin");
      await adminPage.goto("/admin/audit-log");
      await expect(adminPage.getByRole("heading", { name: "Audit Log" })).toBeVisible();
    });

    void referredUserId;
    mark("__end__");
  } finally {
    await adminContext.close();
    await userAContext.close();
  }
});
