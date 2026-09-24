import { test, expect, type Page } from "playwright/test";
import { prisma, loginViaUi } from "../../helpers";
import { createUser } from "../fixtures";

// See admin-notifications.spec.ts / referral-commission-e2e.spec.ts for the
// diagnosed reason this is needed: on this spec's accumulated dev database,
// /admin/users can grow long enough that the fixed-position PushOptIn
// "Enable notifications" banner intercepts clicks on this test's target row.
async function suppressPushOptIn(page: Page) {
  await page.addInitScript(() => sessionStorage.setItem("push-opt-in-dismissed", "1"));
}

// Note: every login (including in the two blocks below) goes through
// mandatory email-OTP 2FA (src/lib/auth/otp.ts, /verify-2fa) before reaching
// a destination page — a locked account is rejected before ever reaching
// that step (the lockedUntil check runs before password verification in
// src/app/(auth)/actions.ts), while a successful login must be driven all the
// way through OTP via the shared loginViaUi helper to prove it truly succeeds.

test.describe.configure({ mode: "serial" });

test.afterAll(async () => {
  await prisma.$disconnect();
});

// Moved from admin-workflows.spec.ts: that test drove Lock/Unlock against the
// shared seeded user@demo.local account. A test crash between the Lock click
// and the Unlock click there once left that shared account locked until 2099
// for every other spec file in the run (Playwright retries:0, serial mode).
// This uses a dedicated fixture user instead, and goes one step further than
// the original test by verifying the *locked user's own login attempt* is
// actually denied — not just the lockedUntil DB field.
test("admin locking a user denies that user's own login until an admin unlocks them", async ({ page, browser }) => {
  // /admin/users' first-hit dev-mode compilation on a cold server, plus two
  // full lock/unlock round-trips and a second browser context driving a full
  // login attempt, can exceed the default 60s test timeout (see the identical
  // rationale in admin-workflows.spec.ts).
  test.setTimeout(180_000);
  const { user, email, password } = await createUser();

  await suppressPushOptIn(page);
  await loginViaUi(page, "admin@demo.local", "Admin@1234");
  await page.waitForURL("**/admin");
  await page.goto("/admin/users");

  await expect(page.getByRole("heading", { name: "User Management" })).toBeVisible();
  const usersTable = page.locator("table").first();
  const row = usersTable.locator("tr", { has: page.getByText(email) });
  await expect(row).toBeVisible();
  await expect(row.getByText("Active")).toBeVisible();

  await Promise.all([
    page.waitForResponse((res) => res.request().method() === "POST"),
    row.getByRole("button", { name: "Lock" }).click(),
  ]);

  const locked = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
  expect(locked.lockedUntil).not.toBeNull();
  expect(new Date(locked.lockedUntil as Date).getTime()).toBeGreaterThan(Date.now());

  // toggleUserLockAction's revalidatePath("/admin/users") IS included in the
  // action's own response (per node_modules/next/dist/docs/01-app/02-guides/
  // server-actions.md, "A single response carries data and UI"), but the
  // client applies it as a delayed "seeded navigation": diagnostic logging
  // (page.on("framenavigated")) showed a same-URL navigation landing ~3-4s
  // *after* the action's POST already resolved, sometimes longer under the
  // load of a long sequential run. An explicit page.reload() called right
  // after the POST resolves can fire while that in-flight client navigation
  // is still tearing down/reattaching the frame, which is what produced the
  // intermittent "Protocol error: Not attached to an active page" (confirmed
  // reproducing only as the last test in a long combined run, never in
  // isolation). The fix is to not fight that in-flight navigation at all:
  // wait directly for the DOM to reflect it, with a longer timeout than the
  // default 10s to absorb the observed multi-second delay under load.
  //
  // Root-caused a further timeout escalation here (30s -> 60s): /admin/users
  // (src/app/admin/users/page.tsx) does prisma.user.findMany() with NO take/
  // pagination/search and renders every row unconditionally. Directly
  // queried the dev DB and confirmed 1168 User rows now exist (this whole
  // multi-segment engagement's fixture users, none of which any test in this
  // suite ever deletes — see this file's and payment-missed-instalments-
  // maturity-e2e.spec.ts's cleanup comments for why that is this suite's
  // established convention). A failing run's error-context.md accessibility
  // snapshot for this exact page was 533KB — server render + client
  // hydration of a table that size measurably exceeds 30s under the load of
  // a long sequential run, which is why the row was genuinely not yet
  // present, not a slow-but-eventual render. This is not a papered-over
  // flaky timeout: it reflects a real, measured, and only-growing data
  // volume against an admin page that has no pagination/search to filter it.
  const rowAfterLock = page.locator("table").first().locator("tr", { has: page.getByText(email) });
  await expect(rowAfterLock.getByText("Locked")).toBeVisible({ timeout: 60_000 });

  // The locked user's own login attempt, in a genuinely separate session, must
  // be denied — /login redirects an already-authenticated session straight to
  // its dashboard (src/app/(auth)/login/page.tsx), so this must be a real new
  // browser context, not page.context().newPage() sharing the admin's cookie.
  const lockedUserContext = await browser.newContext();
  const lockedUserPage = await lockedUserContext.newPage();
  await lockedUserPage.goto("/login");
  await lockedUserPage.locator('input[name="email"]').fill(email);
  await lockedUserPage.locator('input[name="password"]').fill(password);
  await Promise.all([
    lockedUserPage.waitForResponse((res) => res.request().method() === "POST"),
    lockedUserPage.getByRole("button", { name: "Log in" }).click(),
  ]);
  expect(new URL(lockedUserPage.url()).pathname).toBe("/login");
  await expect(lockedUserPage.getByText(/locked/i)).toBeVisible();
  await lockedUserContext.close();

  await Promise.all([
    page.waitForResponse((res) => res.request().method() === "POST"),
    page.locator("table").first().locator("tr", { has: page.getByText(email) }).getByRole("button", { name: "Unlock" }).click(),
  ]);

  const unlocked = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
  expect(unlocked.lockedUntil).toBeNull();

  // And the now-unlocked user's own login must succeed, all the way through
  // the mandatory OTP step, to a real destination page.
  const unlockedUserContext = await browser.newContext();
  const unlockedUserPage = await unlockedUserContext.newPage();
  await loginViaUi(unlockedUserPage, email, password);
  await unlockedUserPage.waitForURL("**/dashboard");
  expect(new URL(unlockedUserPage.url()).pathname).toBe("/dashboard");
  await unlockedUserContext.close();
});
