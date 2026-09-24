# VALIDATION ONLY — NOT APPLICATION INTEGRATION

This directory is a **temporary, isolated Firebase/FCM feasibility test harness**.

It exists solely to answer: *"are the Firebase details in `firebase_prerequisites`
sufficient to connect to the intended Firebase project and actually deliver a
browser notification via FCM?"*

It is **not** wired into the Next.js application, the Spring Boot service, or
PostgreSQL in any way:

- Nothing here is imported by `src/**`.
- No production code, schema, or notification service was touched.
- The service-account JSON and web config are read directly from
  `../../../firebase_prerequisites/` (outside this harness) and are never
  copied into application-visible paths or committed with secrets exposed.

## Contents

- `client/index.html`, `client/app.js`, `client/firebase-messaging-sw.js` —
  minimal static (non-Next.js) page that initializes the Firebase Web SDK,
  requests notification permission, registers its own service worker, and
  obtains an FCM registration token.
- `static-server.mjs` — trivial isolated static file server for the above
  (separate port from the app's dev server, no Next.js involved).
- `admin-connectivity-test.mjs` — server-side script using `firebase-admin`
  and the service-account credentials to prove connectivity to the project
  (read-only `listUsers(1)` call — no data is created/modified).
- `send-fcm-test.mjs` — sends one real FCM message via the Admin SDK to a
  token supplied on the command line.
- `run-validation.mjs` — orchestrates the full end-to-end test using
  Playwright (already a project devDependency) to drive a real Chromium
  instance: grants notification permission, loads the static page, retrieves
  a real FCM token, sends a real message to it via the Admin SDK, and
  verifies the page's foreground `onMessage` handler actually received it.
- `REPORT.md` — the final validation report (generated after running the
  test).

## Safe to delete

This entire directory can be deleted with zero effect on the application.
It creates no database rows, no application users, and sends no
notifications to real users.
