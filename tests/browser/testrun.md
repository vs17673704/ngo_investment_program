# Browser Test Runbook

Persistent runbook for the Playwright end-to-end/browser automation suite for
this referral/reward investment platform. Companion to
`Create Browser UI Automation Scripts and testrun.md` (the persistent
automation *instruction* file) — this document covers how to actually run,
debug, and interpret the suite.

## 1. Prerequisites

- Node.js (see `package.json` engines / repo README for the pinned version).
- Dependencies installed: `npm install`.
- Playwright browser binaries installed (one-time, or after a Playwright
  version bump):
  ```
  npx playwright install --with-deps chromium
  ```
- A local database reachable via the `DATABASE_URL` in `.env` (Prisma).
  Apply migrations and seed demo data before the first run:
  ```
  npx prisma migrate deploy
  npm run seed
  ```
  The seed script creates the demo accounts the suite logs in as:
  - Admin: `admin@demo.local` / `Admin@1234`
  - User: `user@demo.local` / `User@1234`

  These credentials are **hardcoded directly in the individual spec files**
  (e.g. `tests/auth.spec.ts`, `tests/browser/**/*.spec.ts`), not read from
  environment variables. This reflects the actual state of the project — if
  you change the seeded demo accounts, update the spec files that reference
  them.

## 2. Application Startup

You do not need to start the dev server manually. `playwright.config.ts`
defines a `webServer` block that runs `npm run dev` automatically and waits
for `http://localhost:3000` to respond before tests start
(`reuseExistingServer: !process.env.CI`, timeout 120s). If a dev server is
already running on port 3000 locally, Playwright reuses it instead of
starting a second one.

To start the app manually anyway (e.g. to watch it while tests run):
```
npm run dev
```

## 3. Environment

- `baseURL` is `http://localhost:3000` (hardcoded in `playwright.config.ts`).
- `DATABASE_URL` must point at a real, migrated, seeded database — tests that
  create fixture data directly via Prisma (`tests/browser/fixtures.ts`,
  `tests/browser/helpers.ts`) talk to this database, not a mock.
- No `.env.test` / test-specific environment file is required beyond the
  app's normal `.env`.
- `CI` env var, if set, disables dev-server reuse (forces a fresh server) and
  is otherwise unused by the suite.

## 4. Run All Tests

```
npm run test:e2e
```
(equivalent to `npx playwright test`, equivalent to `npm test`)

Runs headless, single worker (`workers: 1`, `fullyParallel: false` — required
because specs share one seeded database and several tests intentionally run
`serial` within a file), Chromium only, no retries.

## 5. Run Headed (watch the real browser)

```
npm run test:e2e:headed
```

## 6. Run a Single File or Directory

```
npx playwright test tests/browser/theme/admin-theme-lifecycle.spec.ts
npx playwright test tests/browser/redemption
npx playwright test tests/browser/regression/full-regression.spec.ts --reporter=list
```

Run a single test by name:
```
npx playwright test -g "admin can lock and unlock a user"
```

## 7. Debug Mode

```
npm run test:e2e:debug
```
Opens the Playwright Inspector, pauses before each action, and lets you step
through/replay. Add `--headed` is implied by debug mode.

For a single failing file:
```
npx playwright test tests/browser/redemption/redemption-shortfall.spec.ts --debug
```

## 8. Generate / Open the HTML Report

The HTML reporter is always generated (`reporter: [["list"], ["html", { open: "never" }]]`).
After any run:
```
npm run test:e2e:report
```
Opens the last report from `playwright-report/` in a browser.

## 9. Artifacts (screenshots, videos, traces)

Configured in `playwright.config.ts`: `screenshot: "on"`, `video: "on"`,
`trace: "on"` — every test run captures artifacts, not just failures.

- **Raw Playwright output** (all tests, unsorted) still lands under the
  top-level `test-results/<test-name>/` directory as usual (e.g.
  `test-results\browser-regression-full-re-...\trace.zip`,
  `video.webm`, `test-finished-1.png`). Open a trace with
  `npx playwright show-trace <path>`.
- **Sorted copies by outcome** are additionally written by the custom
  `tests/reporters/pass-fail-artifacts-reporter.ts` reporter (registered in
  `playwright.config.ts`) into:
  ```
  tests/browser/artifacts/passed/<test-name>-retry<N>/
  tests/browser/artifacts/failed/<test-name>-retry<N>/
  ```
  Each folder contains copies of that test's trace/screenshot/video
  attachments. This is what satisfies "retain passed scenarios as well as
  failed scenarios, in separate folders" — the top-level `test-results/`
  directory itself is not split by outcome (Playwright has no built-in way to
  do that), so use the `tests/browser/artifacts/{passed,failed}/` tree when
  you specifically need artifacts segregated by pass/fail. Both
  `test-results/` and `tests/browser/artifacts/` are gitignored and safe to
  delete between runs.

Note: `tests/browser/reports/`, `tests/browser/screenshots/`, and
`tests/browser/videos/` are pre-existing empty directories in this repo and
are **not** used by Playwright or by the custom reporter above. Leave them
as-is; do not point tooling at them.

## 10. Test Categories

| Area | Location |
|---|---|
| Auth (login, 2FA) | `tests/auth.spec.ts` |
| Admin payments (legacy suite) | `tests/admin-payments.spec.ts` |
| Reports | `tests/reports.spec.ts` |
| Admin workflows (lock/unlock user, plans, audit log, site settings) | `tests/browser/admin/admin-workflows.spec.ts` |
| Negative paths (invalid input, oversized payloads, unauthorized access) | `tests/browser/negative/negative-paths.spec.ts` |
| Redemption — partial & full | `tests/browser/redemption/redemption-partial-and-full.spec.ts` |
| Redemption — shortfall | `tests/browser/redemption/redemption-shortfall.spec.ts` |
| Redemption — shortfall cancellation | `tests/browser/redemption/redemption-shortfall-cancellation.spec.ts` |
| Referral & commission | `tests/browser/referral/referral-and-commission.spec.ts` |
| Full regression smoke walk | `tests/browser/regression/full-regression.spec.ts` |
| Responsive/visual (390x844, 768x1024, 1024x768, 1440x900) | `tests/browser/responsive/responsive.spec.ts` |
| Theme/branding lifecycle | `tests/browser/theme/admin-theme-lifecycle.spec.ts` |
| Live admin notifications (SSE) — redemption appears without reload | `tests/browser/realtime/admin-live-updates.spec.ts` |
| Background push notifications (Web Push) — admin opt-in stores a subscription | `tests/browser/realtime/admin-push-subscribe.spec.ts` |
| Admin Interest Methods management | `tests/browser/admin/admin-interest-methods.spec.ts` |
| About Us / Contact Us content (draft/publish) | `tests/browser/content/about-contact-content.spec.ts` |
| General Enquiry workflow (public submit → admin queue → retention) | `tests/browser/enquiries/general-enquiry.spec.ts` |
| Payments dashboard — AutoPay/Next Deduction, Change Payment Method, Transaction Graph, Payout Information | `tests/browser/payments/payment-details.spec.ts` |

## 11. Expected Result

A clean run reports all test files passing, `0 failed`, with the final
summary line from the `list` reporter showing the total pass count (71 tests
at last verified full-suite run, 2026-09-13) and no lingering `test-results/`
failure artifacts from that run. Any failure produces a screenshot + video +
trace under `test-results/` — inspect those first before re-running.

## 12. Troubleshooting

- **App not running / webServer timeout**: confirm nothing else already
  occupies port 3000 with an incompatible app; run `npm run dev` manually
  first to see the real startup error.
- **Database unavailable / Prisma errors**: verify `DATABASE_URL` in `.env`,
  that the DB server is reachable, and that migrations are applied
  (`npx prisma migrate deploy`).
- **Login failures in tests (seeded credentials missing)**: re-run
  `npm run seed`. If a prior test run mutated seeded users in a way that
  breaks login (e.g. locked a demo account), check `tests/helpers.ts`
  cleanup helpers and re-seed if necessary.
- **Browser binaries missing**: `npx playwright install --with-deps chromium`.
- **Port already in use**: stop the process holding port 3000, or set
  `reuseExistingServer` behavior by exporting `CI=1` to force Playwright to
  manage its own server instance.
- **Test data / fixture issues (theme draft, redemption balances)**: fixtures
  in `tests/browser/fixtures.ts` create data via direct Prisma calls scoped
  to a single test's own throwaway user records — they do not mutate shared
  seeded accounts. If shared state (e.g. the theme draft row) is suspected to
  be polluted from a previous manual/interrupted run, restore it via the
  admin UI at `/admin/theme` (Colors tab) rather than editing the database
  directly.
- **Flaky failures on first run only**: the `webServer` cold-start (Next.js
  dev server + Turbopack compile) can be slow; re-run once before treating a
  single-file timeout as a real regression.
