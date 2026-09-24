# scripts/

Standalone Node scripts. None of these run as part of `npm run build`,
`npm test`, or `npx playwright test` — each is invoked manually with
`node scripts/<name>.mjs`.

## manual-fcm-verify.mjs

Manual, one-off verification that a **real** Firebase Cloud Messaging push
notification is delivered end to end against the actual running app —
real browser Push subscription, real business event (an AutoPay charge),
real `Notification` DB row, real `messaging.send()` call via the Firebase
Admin SDK.

This is deliberately **not** a Playwright spec under `tests/`, and is
**not** run by `npx playwright test`. It exists separately because:

- It requires a real, non-incognito, non-headless browser profile
  (`chromium.launchPersistentContext(..., { headless: false })`) — Chromium
  restricts the real Push API in the incognito-style context Playwright's
  `browser.newContext()` normally uses (crbug.com/41124656), and the legacy
  `Notification.permission` property doesn't reliably reflect a
  CDP-granted permission when headless.
- It needs a human watching the screen to actually confirm an OS-level
  notification popped up — that's not something an automated assertion can
  verify (see "Known limitation" below).
- It creates and tears down real fixture data (a throwaway user, plan
  subscription, mandate, payment) against whatever database `.env` points
  at — appropriate for a deliberate manual run, not for unattended CI.

For the fully mocked, CI-safe equivalent (opt-in/registration only, no real
Firebase calls), see `tests/browser/realtime/push-subscribe.spec.ts` and
`tests/browser/realtime/admin-push-subscribe.spec.ts`. For a real-Firebase
check against an isolated static test page (not this app), see
`tests/infrastructure/firebase-notification-validation/`.

### Prerequisites

- Dev server running: `npm run dev` (defaults to `http://localhost:3000`;
  override with `MFV_BASE_URL`).
- `.env` has real Firebase config (`NEXT_PUBLIC_FIREBASE_*`,
  `FIREBASE_SERVICE_ACCOUNT_PATH`) and `PUSH_NOTIFICATION_PROVIDER=FIREBASE_FCM`.
- The seeded admin account exists (`npx prisma db seed`), or pass
  `MFV_ADMIN_EMAIL` / `MFV_ADMIN_PASSWORD` for a different one.
- Run on your own machine, not inside a sandboxed/CI container — see below.

### Usage

```bash
node scripts/manual-fcm-verify.mjs
```

A real (non-headless) Chromium window will open. Watch it — the script
grants notification permission, subscribes to push, backgrounds that tab,
then triggers a real AutoPay charge as an admin in a second tab. If
delivery genuinely succeeds, the OS should show a notification a few
seconds later.

To keep the browser open longer so you can watch for the notification and
inspect the token yourself:

```bash
MFV_KEEP_ALIVE=60 node scripts/manual-fcm-verify.mjs
```

The script cleans up all fixture data it created (user, plan, mandate,
payments, push subscription, emails) on exit, success or failure.

### What it checks

1. A due AutoPay fixture (user + backdated plan + active mandate) is
   created — mirrors `tests/admin-payments.spec.ts`'s
   `createDueAutoPayFixture()`.
2. The user logs in through the real UI (real 2FA via the simulated email
   outbox) and a real `PushSubscription` row is created.
3. An admin runs "Run due AutoPay charges now" on `/admin/payments` — a
   real business event.
4. The `Payment` succeeds and a `Notification` row (`PAYMENT_SUCCESS`) is
   created.
5. The `PushSubscription` is still not revoked after the send (see below).
6. The service worker's notification queue is inspected as a best-effort
   final check.

### Known limitation

Steps 1–4 reliably prove the app's own pipeline is correct: subscription
storage, event handling, and the `sendFcmPush()` call all work. Step 5 is
the one that can legitimately fail in a sandboxed environment: Chrome's
`getToken()` can report a syntactically valid token even when the
browser's Push subscription with Google's push service hasn't genuinely
completed. When that happens, Firebase Admin's `messaging.send()` rejects
the token as unregistered/invalid, and `src/lib/push/fcm.ts` marks the
subscription `revokedAt` in response — which is exactly what step 5
reports as a `FAIL`.

That outcome means "this sandbox can't complete a real push
registration," not "the app is broken." To get a genuine end-to-end
result, run this script on a normal desktop machine (not a headless CI
runner or restricted container) with network access to Google's push
services.
