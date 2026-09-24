import { test, expect } from "playwright/test";
import { prisma, loginViaUi } from "../../helpers";

// Verifies the FCM opt-in path for both Users and Admins (Master Prompt.md
// §33: push goes to regular Users for 8 event types, and to Admins for
// General Enquiry Received) — a granted browser notification permission
// ends up with an active PushSubscription row in the DB
// (src/components/PushOptIn.tsx -> src/app/api/push/subscribe/route.ts).
//
// Two things are stubbed at their real environment boundary, not inside our
// own code:
// 1. Chrome does not support the real Push API in Playwright's browser
//    contexts at all (they are incognito-like — see
//    https://crbug.com/41124656; confirmed during development,
//    PushManager.subscribe() always rejects with "Registration failed -
//    permission denied" there, regardless of granted permissions). This is a
//    Chromium platform restriction our code can't work around, so
//    PushManager.prototype.subscribe/getSubscription are stubbed via
//    addInitScript.
// 2. Firebase's getToken() call (src/components/PushOptIn.tsx) makes a real
//    network request to Google's FCM registration endpoint
//    (fcmregistrations.googleapis.com) to mint a token. Hitting a live
//    external Google API from the test suite would be flaky/unreliable and
//    is unrelated to what this test verifies, so that one request is
//    intercepted and given a fake token in the exact shape the Firebase SDK
//    expects — everything downstream of it (the real POST to
//    /api/push/subscribe and the real DB write) runs unmodified.
//
// Actual background delivery while no tab is open (src/lib/push/fcm.ts,
// public/sw.js's onBackgroundMessage handler) isn't practical to assert from
// Playwright either, since there is no automation context once a tab is
// closed — that is covered by manual verification instead.

test.afterAll(async () => {
  await prisma.$disconnect();
});

async function stubFcmTokenMinting(page: import("playwright/test").Page) {
  await page.addInitScript(() => {
    if (!("PushManager" in window)) return;
    // Firebase's getToken() calls pushSubscription.getKey("p256dh"/"auth") to
    // build the registration request body — a plain object without that
    // method throws "pushSubscription.getKey is not a function", so the fake
    // subscription must implement it (returning any fixed-length buffer; the
    // actual key material is never checked since the registration network
    // call itself is stubbed below).
    const fakeSubscription = {
      endpoint: `https://fake.push.service/test-endpoint-${Math.random().toString(36).slice(2)}`,
      getKey: (name: string) => new Uint8Array(name === "auth" ? 16 : 65).buffer,
      toJSON: () => ({}),
    };
    // @ts-expect-error stubbing a browser-restricted API for the test environment
    window.PushManager.prototype.subscribe = async () => fakeSubscription;
    window.PushManager.prototype.getSubscription = async () => null;

    // Firebase Messaging's own getToken() gates on the legacy
    // Notification.permission property (not the live permissions.query()
    // state src/components/PushOptIn.tsx otherwise prefers), and that legacy
    // property does not reflect a permission granted via
    // context.grantPermissions()/CDP in headless Chromium — it stays
    // "default"/"denied" there regardless. That is the same automation gap
    // documented in PushOptIn.tsx's currentPermissionState(), just hit by a
    // second consumer, so it is stubbed the same way: only this one
    // browser-restricted property, nothing in our own code.
    Object.defineProperty(Notification, "permission", { get: () => "granted", configurable: true });
  });

  await page.route("https://fcmregistrations.googleapis.com/**", async (route) => {
    const fakeToken = `fake-fcm-token-${Math.random().toString(36).slice(2)}`;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ token: fakeToken }),
    });
  });
}

test("admin can enable push notifications and an FCM registration is stored", async ({ page, context }) => {
  test.setTimeout(60_000);

  await stubFcmTokenMinting(page);

  // admin@demo.local is a shared seeded fixture: other sessions (manual
  // testing, other spec files) may have flipped its pushNotificationsEnabled
  // preference, and prisma/seed.ts's upsert (`update: {}`) never resets it on
  // re-seed. This test verifies the opt-in/subscribe path specifically, so it
  // asserts its own precondition rather than trusting the schema default.
  await prisma.user.update({
    where: { email: "admin@demo.local" },
    data: { pushNotificationsEnabled: true },
  });

  // Mirrors a returning admin who already accepted the browser prompt in a
  // prior session — PushOptIn.tsx detects the "granted" permission state
  // and subscribes automatically, without showing the opt-in banner/button.
  await context.grantPermissions(["notifications"], { origin: "http://localhost:3000" });

  await loginViaUi(page, "admin@demo.local", "Admin@1234");
  await page.waitForURL("**/admin");

  await expect
    .poll(
      async () => {
        const admin = await prisma.user.findUniqueOrThrow({ where: { email: "admin@demo.local" } });
        return prisma.pushSubscription.count({ where: { userId: admin.id, revokedAt: null } });
      },
      { timeout: 15_000 },
    )
    .toBeGreaterThan(0);
});

test("a regular user can enable push notifications and an FCM registration is stored", async ({ page, context }) => {
  test.setTimeout(60_000);

  await stubFcmTokenMinting(page);

  // See the equivalent reset in the admin test above: user@demo.local is
  // also a shared seeded fixture whose pushNotificationsEnabled preference
  // can drift false from unrelated sessions, which prisma/seed.ts's
  // `update: {}` upsert never restores on re-seed.
  await prisma.user.update({
    where: { email: "user@demo.local" },
    data: { pushNotificationsEnabled: true },
  });

  await context.grantPermissions(["notifications"], { origin: "http://localhost:3000" });

  await loginViaUi(page, "user@demo.local", "User@1234");
  await page.waitForURL("**/dashboard");

  await expect
    .poll(
      async () => {
        const user = await prisma.user.findUniqueOrThrow({ where: { email: "user@demo.local" } });
        return prisma.pushSubscription.count({ where: { userId: user.id, revokedAt: null } });
      },
      { timeout: 15_000 },
    )
    .toBeGreaterThan(0);
});
