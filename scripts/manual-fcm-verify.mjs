// Manual, one-off verification of the REAL Firebase Cloud Messaging pipeline
// against the actual running app (not a mock, not the isolated static-page
// harness under tests/infrastructure/firebase-notification-validation/).
//
// This is intentionally NOT a Playwright spec under tests/ and is NOT run by
// `npx playwright test`. It requires a real browser Push subscription with
// Google's push service, which does not reliably complete in Playwright's
// default sandboxed/CI browser context — see scripts/README.md for details
// and known limitations. Run it by hand, with your eyes on the machine, when
// you need to confirm genuine OS-level notification delivery end to end.
//
// Usage (from repo root, with the dev server already running on :3000):
//   node scripts/manual-fcm-verify.mjs
//
// Optional: keep the browser open after the run so you can watch the OS
// notification pop up live, and inspect the token/permission state yourself:
//   MFV_KEEP_ALIVE=60 node scripts/manual-fcm-verify.mjs
//
// What it does:
//   1. Creates a throwaway User + backdated UserPlan + active PaymentMandate
//      (mirrors tests/admin-payments.spec.ts's createDueAutoPayFixture) so
//      the plan is immediately due for an AutoPay charge.
//   2. Logs the user in through the real UI (real 2FA via the simulated
//      email outbox), opens a real (non-incognito) persistent browser
//      profile, grants notification permission, and lets PushOptIn.tsx
//      register a real FCM token via the real service worker.
//   3. Backgrounds that tab, logs in as admin in a second tab, and clicks
//      "Run due AutoPay charges now" on /admin/payments — a real business
//      event that flows through processScheduledPayment ->
//      postSuccessfulPayment -> createNotification -> sendFcmPush ->
//      Firebase Admin SDK's messaging.send().
//   4. Verifies the Payment row succeeded, the Notification row was
//      created, the PushSubscription was not revoked by the send, and
//      (best-effort) checks the service worker's showNotification() queue.
//   5. Cleans up all fixture data it created, in FK-safe order.
//
// Known limitation (see scripts/README.md): in some sandboxed environments,
// getToken() can report success without a genuinely live Google push
// subscription, causing Firebase to reject the token as unregistered when
// messaging.send() is called. That is an environment limitation, not a bug
// in this app's code — this script surfaces it clearly rather than hiding
// it, via the "push subscription not revoked after send" check.

import "dotenv/config";
import { chromium } from "playwright";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { addMonths, subMonths } from "date-fns";

const prisma = new PrismaClient();
const BASE_URL = process.env.MFV_BASE_URL ?? "http://localhost:3000";
const USER_PASSWORD = "Passw0rd!123";
const ADMIN_EMAIL = process.env.MFV_ADMIN_EMAIL ?? "admin@demo.local";
const ADMIN_PASSWORD = process.env.MFV_ADMIN_PASSWORD ?? "Admin@1234";

const results = [];
function log(stage, ok, detail) {
  results.push({ stage, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${stage}${detail ? ` — ${detail}` : ""}`);
}

// Mirrors tests/admin-payments.spec.ts's createDueAutoPayFixture(): a User +
// UserPlan whose startDate is backdated so autopay-scheduler.ts's
// findDuePlans() treats it as due for a charge immediately, instead of
// waiting a real month.
async function createDueAutoPayFixture() {
  const plan = await prisma.plan.findUniqueOrThrow({
    where: { id: "seed-plan-basic" },
    include: { interestMethod: true },
  });

  const email = `manual-fcm-${Date.now()}@example.com`;
  const passwordHash = await bcrypt.hash(USER_PASSWORD, 10);
  const referralCode = `MFV${Date.now().toString(36).toUpperCase().slice(-6)}`;

  const user = await prisma.user.create({
    data: { email, passwordHash, referralCode, role: "USER", isEmailVerified: true },
  });

  const amount = Number(plan.presetAmounts[0]);
  const startDate = subMonths(new Date(), 2);

  const userPlan = await prisma.userPlan.create({
    data: {
      userId: user.id,
      planId: plan.id,
      interestMethodId: plan.interestMethodId,
      interestMethodVersion: plan.interestMethod.version,
      rewardPercentSnapshot: plan.rewardPercent,
      commissionPercentSnapshot: plan.commissionPercent,
      paymentAmount: amount,
      paymentFrequency: plan.paymentFrequency,
      remainingUnpaidPrincipal: amount * plan.tenureMonths,
      startDate,
      maturityDate: addMonths(startDate, plan.tenureMonths),
    },
  });

  await prisma.paymentMandate.create({
    data: {
      userPlanId: userPlan.id,
      gatewayMandateId: `SIM-MANDATE-MFV-${userPlan.id}`,
      status: "ACTIVE",
    },
  });

  return { user, userPlan, email };
}

// Mirrors tests/helpers.ts's getLatestOtpCode() exactly: the simulated email
// outbox is the only place the plaintext OTP is readable (OtpCode only
// stores a bcrypt hash).
async function getLatestOtpCode(email, purpose) {
  const message = await prisma.emailMessage.findFirst({
    where: { recipient: email, templateType: purpose },
    orderBy: { createdAt: "desc" },
  });
  if (!message) throw new Error(`No simulated OTP email found for ${email} (${purpose})`);
  const match = message.body.match(/(\d{6})/);
  if (!match) throw new Error(`Could not find a 6-digit code in OTP email body: ${message.body}`);
  return match[1];
}

// Mirrors tests/helpers.ts's loginViaUi() exactly, against a real logged-in
// browser page rather than a Playwright test fixture.
async function loginViaUi(page, email, password) {
  await prisma.otpCode.deleteMany({ where: { user: { email }, purpose: "LOGIN_2FA" } });

  await page.goto(`${BASE_URL}/login`);
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(password);

  await Promise.all([
    page.waitForResponse((res) => res.request().method() === "POST"),
    page.getByRole("button", { name: "Log in" }).click(),
  ]);

  await page.waitForURL("**/verify-2fa");

  const code = await getLatestOtpCode(email, "LOGIN_2FA");
  await page.locator('input[name="code"]').fill(code);

  await Promise.all([
    page.waitForResponse((res) => res.request().method() === "POST"),
    page.getByRole("button", { name: "Verify" }).click(),
  ]);
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function cleanup(userId) {
  if (!userId) return;
  // FK-safe deletion order, discovered by following each RESTRICT violation
  // in turn: dependents of User first, then payment-cycle dependents, then
  // User itself.
  await prisma.socialAccount.deleteMany({ where: { userId } }).catch(() => {});
  await prisma.refreshToken.deleteMany({ where: { userId } }).catch(() => {});
  await prisma.pushSubscription.deleteMany({ where: { userId } }).catch(() => {});
  await prisma.otpCode.deleteMany({ where: { userId } }).catch(() => {});
  await prisma.loginHistory.deleteMany({ where: { userId } }).catch(() => {});
  await prisma.notification.deleteMany({ where: { userId } }).catch(() => {});
  await prisma.ledgerEntry.deleteMany({ where: { userId } }).catch(() => {});
  await prisma.franchiseeRedemptionEnquiry.deleteMany({ where: { userId } }).catch(() => {});
  await prisma.redemptionRequest.deleteMany({ where: { userId } }).catch(() => {});

  const userPlans = await prisma.userPlan.findMany({ where: { userId }, select: { id: true } });
  const userPlanIds = userPlans.map((p) => p.id);
  if (userPlanIds.length) {
    const payments = await prisma.payment.findMany({
      where: { userPlanId: { in: userPlanIds } },
      select: { id: true },
    });
    const paymentIds = payments.map((p) => p.id);
    if (paymentIds.length) {
      await prisma.paymentEvent.deleteMany({ where: { paymentId: { in: paymentIds } } }).catch(() => {});
    }
    await prisma.payment.deleteMany({ where: { userPlanId: { in: userPlanIds } } }).catch(() => {});
    await prisma.paymentMandate.deleteMany({ where: { userPlanId: { in: userPlanIds } } }).catch(() => {});
    await prisma.userPlan.deleteMany({ where: { userId } }).catch(() => {});
  }

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
  if (user) {
    await prisma.emailMessage.deleteMany({ where: { recipient: user.email } }).catch(() => {});
  }
  await prisma.user.delete({ where: { id: userId } }).catch(() => {});
}

async function main() {
  const profileDir = mkdtempSync(join(tmpdir(), "mfv-profile-"));
  let fixture;
  let context;

  try {
    fixture = await createDueAutoPayFixture();
    log("fixture created (due AutoPay user)", true, fixture.email);

    // Real (non-incognito) persistent profile: Chromium's Push API is
    // restricted in the default incognito-style context Playwright normally
    // uses (crbug.com/41124656). headless: false is required too — the
    // legacy Notification.permission property doesn't reliably reflect a
    // CDP-granted permission in headless mode.
    context = await chromium.launchPersistentContext(profileDir, {
      headless: false,
      permissions: ["notifications"],
      baseURL: BASE_URL,
    });

    const userPage = await context.newPage();
    userPage.on("pageerror", (err) => console.error("[user page error]", err));

    await loginViaUi(userPage, fixture.email, USER_PASSWORD);
    await userPage.waitForURL("**/dashboard");
    log("user logged in via real UI (real 2FA)", true);

    const enableButton = userPage.getByRole("button", { name: "Enable notifications" });
    if (await enableButton.isVisible().catch(() => false)) {
      await enableButton.click();
    }

    let subscription = null;
    for (let i = 0; i < 20; i++) {
      subscription = await prisma.pushSubscription.findFirst({
        where: { userId: fixture.user.id, revokedAt: null },
      });
      if (subscription) break;
      await sleep(1000);
    }
    log("real PushSubscription created", Boolean(subscription), subscription ? `token …${subscription.fcmToken.slice(-12)}` : "no row appeared within 20s");

    // Background the subscribed tab: only the sw.js onBackgroundMessage()
    // handler produces a genuine OS-level notification, and only fires when
    // the subscribed tab is not the focused/foreground document.
    const blankPage = await context.newPage();
    await blankPage.bringToFront();

    const adminPage = await context.newPage();
    await loginViaUi(adminPage, ADMIN_EMAIL, ADMIN_PASSWORD);
    await adminPage.waitForURL("**/admin");
    await adminPage.goto(`${BASE_URL}/admin/payments`);

    const runButton = adminPage.getByRole("button", { name: "Run due AutoPay charges now" });
    await Promise.all([
      adminPage.waitForResponse((res) => res.request().method() === "POST"),
      runButton.click(),
    ]);
    log("admin ran due AutoPay charges", true);

    let payment = null;
    let notification = null;
    for (let i = 0; i < 15; i++) {
      payment = await prisma.payment.findFirst({
        where: { userPlanId: fixture.userPlan.id },
        orderBy: { createdAt: "desc" },
      });
      notification = await prisma.notification.findFirst({
        where: { userId: fixture.user.id, type: "PAYMENT_SUCCESS" },
        orderBy: { createdAt: "desc" },
      });
      if (payment?.status === "SUCCESS" && notification) break;
      await sleep(1000);
    }
    log("real Payment succeeded", payment?.status === "SUCCESS", payment?.status);
    log("real Notification row created", Boolean(notification), notification?.title);

    const postSend = subscription
      ? await prisma.pushSubscription.findUnique({ where: { id: subscription.id } })
      : null;
    log(
      "push token not revoked after send (real FCM delivery succeeded)",
      Boolean(postSend && postSend.revokedAt === null),
      !postSend
        ? "no subscription to check (subscription step above failed)"
        : postSend.revokedAt
          ? `revoked: ${postSend.lastError ?? "no lastError set"}`
          : "not revoked",
    );

    if (process.env.MFV_KEEP_ALIVE) {
      const seconds = Number(process.env.MFV_KEEP_ALIVE);
      console.log(`\nKeeping browser open for ${seconds}s — watch for the OS notification now.`);
      await sleep(seconds * 1000);
    } else {
      await sleep(6000);
    }

    const swNotifications = await userPage
      .evaluate(async () => {
        const reg = await navigator.serviceWorker.ready;
        const list = await reg.getNotifications();
        return list.map((n) => ({ title: n.title, body: n.body }));
      })
      .catch((err) => `evaluate failed: ${err.message}`);
    log(
      "service worker notification queue inspected",
      true,
      Array.isArray(swNotifications) ? JSON.stringify(swNotifications) : swNotifications,
    );
  } finally {
    if (context) await context.close().catch(() => {});
    rmSync(profileDir, { recursive: true, force: true });
    await cleanup(fixture?.user?.id);
    await prisma.$disconnect();
  }

  console.log("\n=== Summary ===");
  for (const r of results) {
    console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.stage}`);
  }
  const anyFail = results.some((r) => !r.ok);
  process.exitCode = anyFail ? 1 : 0;
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exitCode = 1;
});
