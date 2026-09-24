import { PrismaClient } from "@prisma/client";
import type { Browser, BrowserContext, Page } from "playwright/test";

// Node-context Prisma client for the Playwright test suite. Reading DB state
// directly (e.g. to pull a simulated OTP code out of the simulated email
// outbox) is the pragmatic approach for this prototype, which has no real
// SMS/email delivery to intercept — per this project's own testing
// convention, Playwright spec files run in Node, so a direct Prisma import
// here is legitimate.
export const prisma = new PrismaClient();

export type OtpPurpose = "LOGIN_2FA" | "EMAIL_VERIFY" | "PASSWORD_RESET";

/**
 * Reads the most recent simulated OTP code for a user out of the simulated
 * email outbox (EmailMessage table) — see src/lib/auth/otp.ts, which embeds
 * the plaintext code in the body of the email it queues (the OtpCode table
 * itself only stores a bcrypt hash, so the email body is the only place the
 * plaintext code is readable).
 */
export async function getLatestOtpCode(email: string, purpose: OtpPurpose): Promise<string> {
  const message = await prisma.emailMessage.findFirst({
    where: { recipient: email, templateType: purpose },
    orderBy: { createdAt: "desc" },
  });
  if (!message) {
    throw new Error(`No simulated OTP email found for ${email} (${purpose})`);
  }
  const match = message.body.match(/(\d{6})/);
  if (!match) {
    throw new Error(`Could not find a 6-digit code in OTP email body: ${message.body}`);
  }
  return match[1];
}

/**
 * Logs in through the real UI (email/password -> /verify-2fa -> OTP pulled
 * from the DB -> destination page), following the project's established
 * convention of Promise.all([page.waitForResponse(...), locator.click()])
 * for server-action submissions instead of the unreliable
 * page.waitForLoadState("networkidle").
 */
export async function loginViaUi(page: Page, email: string, password: string): Promise<void> {
  // The seeded demo accounts (admin@demo.local / user@demo.local) are shared
  // across this whole test run (and potentially concurrent manual testing
  // against the same dev DB), and src/lib/auth/otp.ts caps LOGIN_2FA OTP
  // issuance to a handful of resends per 15-minute window (BRD OTP resend
  // limit). Clear prior OTPs for this user before logging in so an unrelated
  // burst of earlier login attempts against the same seeded account can't
  // make createOtp() throw "Too many OTP requests" and break this test.
  // createOtp() counts ALL OtpCode rows created in the resend window
  // regardless of consumedAt, so all of them (not just unconsumed ones) must
  // go to actually reset the count.
  await prisma.otpCode.deleteMany({
    where: { user: { email }, purpose: "LOGIN_2FA" },
  });

  await page.goto("/login");
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

/** Thin wrapper over loginViaUi for the seeded admin demo account. */
export async function loginAsAdmin(page: Page): Promise<void> {
  await loginViaUi(page, "admin@demo.local", "Admin@1234");
}

/** Thin wrapper over loginViaUi for a USER-role account. */
export async function loginAsUser(page: Page, email: string, password: string): Promise<void> {
  await loginViaUi(page, email, password);
}

/**
 * Returns a suffix unique enough to avoid collisions in emails/referral codes
 * created by concurrent/sequential test fixtures within a single run.
 */
export function uniqueSuffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * Cross-role E2E tests must never share a single BrowserContext between two
 * logged-in roles: /login redirects an already-authenticated session straight
 * to its own dashboard (see src/app/(auth)/login/page.tsx), so a second
 * `page.context().newPage()` in the same context can never reach the login
 * form for a different account. Each role gets its own isolated
 * BrowserContext (separate cookie jars) instead, matching how two different
 * people would actually use the app in two different browser sessions.
 */
/**
 * Injects a visual click indicator (a brief expanding ripple at the pointer
 * position) into every page created from `target`. Purely cosmetic — it
 * exists so the walkthrough videos/screenshots make it visually obvious
 * where the demonstration is clicking, since Playwright's own headed/video
 * output otherwise shows no cursor feedback at all. Must be registered
 * before the first navigation (via `page.addInitScript`/
 * `context.addInitScript`) since it re-runs on every subsequent navigation
 * but does not apply retroactively to an already-loaded document.
 */
export async function enableClickHighlight(target: Page | BrowserContext): Promise<void> {
  await target.addInitScript(() => {
    // `document.documentElement` is null at the moment an init script runs
    // (it executes before the document has been parsed at all) — appending
    // anything to it here throws and silently kills the whole script. All DOM
    // writes are deferred to inside the pointerdown handler instead, which
    // only ever fires once the page is actually interactive (and therefore
    // has a real <html> element).
    document.addEventListener(
      "pointerdown",
      (event) => {
        const html = document.documentElement;
        if (!html) return;
        const ripple = document.createElement("div");
        ripple.style.cssText = `
          position: fixed;
          left: ${event.clientX}px;
          top: ${event.clientY}px;
          z-index: 2147483647;
          pointer-events: none;
          width: 36px;
          height: 36px;
          margin-left: -18px;
          margin-top: -18px;
          border-radius: 50%;
          background: rgba(255, 61, 0, 0.35);
          border: 2px solid rgba(255, 61, 0, 0.9);
          transform: scale(0.4);
          opacity: 1;
          transition: transform 450ms ease-out, opacity 450ms ease-out;
        `;
        html.appendChild(ripple);
        requestAnimationFrame(() => {
          ripple.style.transform = "scale(1.5)";
          ripple.style.opacity = "0";
        });
        setTimeout(() => ripple.remove(), 500);
      },
      { capture: true },
    );
  });
}

/**
 * Maps a Playwright project name (see playwright.config.ts's "walkthrough*"
 * projects) to the short viewport slug used in walkthrough video/screenshot
 * filenames, so desktop/tablet/mobile runs of the same spec never overwrite
 * each other's output in test-results/walkthrough-videos/.
 */
export function viewportSlug(projectName: string): string {
  switch (projectName) {
    case "walkthrough-mobile":
      return "mobile";
    case "walkthrough-tablet-portrait":
      return "tablet-portrait";
    case "walkthrough-tablet-landscape":
      return "tablet-landscape";
    case "walkthrough":
    default:
      return "desktop";
  }
}

export async function newRoleContexts(browser: Browser) {
  const userContext = await browser.newContext();
  const adminContext = await browser.newContext();
  const userPage = await userContext.newPage();
  const adminPage = await adminContext.newPage();
  const close = async () => {
    await userContext.close();
    await adminContext.close();
  };
  return { userContext, adminContext, userPage, adminPage, close };
}
