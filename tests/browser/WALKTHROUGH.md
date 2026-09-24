# Product Walkthrough Videos

This project ships two independent, video-recorded Playwright tests that each
tell one coherent, single-role product story end-to-end against the real UI:

- `tests/browser/walkthrough/user-walkthrough.spec.ts` — **User Product
  Walkthrough**: a member's journey from public discovery through
  registration, mandatory 2FA, the dashboard, account settings, subscribing
  to a plan, reviewing payment history, referrals (with a fixture-seeded
  accrued commission), notifications, and browsing redemption categories.
- `tests/browser/walkthrough/admin-walkthrough.spec.ts` — **Admin Product
  Walkthrough**: an operator's journey through a submitted general enquiry,
  admin login with 2FA, the admin dashboard, user management (search,
  lock/unlock), creating an interest method and a plan, running the AutoPay
  simulator, approving a redemption, resolving the general enquiry, the
  catalog, the email outbox, the audit log, reports, settings, and the full
  login-screen theme lifecycle (draft → publish → verify-live → reset).

These are **separate** from the existing combined
`tests/browser/walkthrough/product-walkthrough-e2e.spec.ts`, which is a much
longer, multi-role, multi-context epic covering additional ground (see its
own `README.md` in the same directory). The two files here are simpler,
faster, single-context recordings meant to be regenerated quickly and shared
individually as "how a user uses the product" / "how an admin operates it."

## Why no context/video stitching is needed

Both specs follow exactly **one** actor for their entire duration, using
Playwright's default `page`/`context` fixture. The `"walkthrough"` Playwright
project (see `playwright.config.ts`) already configures that fixture to
record video automatically (1280×720, `slowMo: 300` for a watchable pace), so
recording requires no extra plumbing — unlike the combined spec, which needs
~13 manually created `BrowserContext`s and a post-hoc ffmpeg stitch step.

The one place the admin walkthrough needs a second identity — the anonymous
general-enquiry submission — is handled by visiting the public `/contact`
page in the *same* context, before logging in as admin. `/contact` requires
no authentication, so no context switch is needed.

## Prerequisites

1. From `ngo_investment_program/`, install dependencies and provision the
   database once:
   ```
   npm install
   npx prisma migrate dev
   npx prisma generate
   npm run seed
   ```
   Both walkthroughs rely on the seed's demo `admin@demo.local` account and
   the seeded plan `seed-plan-basic`.
2. Playwright browsers installed: `npx playwright install chromium`.

The dev server is started automatically by Playwright's `webServer` config
(`npm run dev:http`) — no need to start it manually.

## Running

Debug run, no recording (fast feedback while iterating), desktop viewport:
```
npm run test:e2e:walkthrough:user
npm run test:e2e:walkthrough:admin
```

Both together:
```
npm run test:e2e:walkthrough
```

Full headed recorded run (slowed down, produces the actual demo videos):
```
npm run test:e2e:walkthrough:headed
```

Adjust the pacing between steps (default 600ms) with an environment
variable, e.g. to slow it down for a smoother recording:
```
WALKTHROUGH_DELAY_MS=1200 npm run test:e2e:walkthrough:headed
```

## Responsive viewport coverage (Desktop / Tablet / Mobile)

Per `prompts/Claude_Playwright_Product_Walkthrough_Tests_Desktop_Tablet_Mobile.md`,
both `user-walkthrough.spec.ts` and `admin-walkthrough.spec.ts` run unmodified
against four dedicated Playwright projects (see `playwright.config.ts`) that
each pin a real browser viewport — nothing is achieved by resizing
screenshots after the fact:

| Project                          | Viewport   | Represents        |
|-----------------------------------|-----------|--------------------|
| `walkthrough`                     | 1280x720  | Desktop            |
| `walkthrough-tablet-portrait`     | 768x1024  | Tablet — portrait  |
| `walkthrough-tablet-landscape`    | 1024x768  | Tablet — landscape |
| `walkthrough-mobile`              | 390x844   | Mobile             |

(Desktop is 1280x720 rather than the source prompt's suggested 1440x900 —
this matches the pre-existing `walkthrough` project already shared with
`product-walkthrough-e2e.spec.ts`, whose own multi-context ffmpeg stitching
pipeline hardcodes a 1280px-wide canvas; introducing a second, differently
sized desktop project purely for these two specs was judged not worth the
duplication.)

Per-role, per-viewport commands:
```
npm run test:e2e:walkthrough:user:desktop
npm run test:e2e:walkthrough:user:tablet-portrait
npm run test:e2e:walkthrough:user:tablet-landscape
npm run test:e2e:walkthrough:user:mobile

npm run test:e2e:walkthrough:admin:desktop
npm run test:e2e:walkthrough:admin:tablet-portrait
npm run test:e2e:walkthrough:admin:tablet-landscape
npm run test:e2e:walkthrough:admin:mobile
```

All four viewports for one role, sequentially (never in parallel — see
"Video output" below for why):
```
npm run test:e2e:walkthrough:user:all-viewports
npm run test:e2e:walkthrough:admin:all-viewports
```

The same spec file drives every viewport — there is no separate
mobile-only implementation. The one viewport-conditional branch in each spec
(the mobile hamburger menu on the public landing page, and the
`AuthShell` login branding panel that Tailwind hides below its `lg`
(1024px) breakpoint) checks the actual runtime viewport/project rather than
assuming "mobile vs. everything else," so it resolves correctly at all four
sizes — this was caught and fixed after the tablet-portrait (768px, below
`lg`) run first surfaced it as a real failure.

## Video output

Each spec closes its own page in a `finally` block once the test completes
(pass or fail) so Playwright finalizes the recording, then copies it to a
predictable, viewport-tagged path:

- `test-results/walkthrough-videos/user-walkthrough-desktop.webm`
- `test-results/walkthrough-videos/user-walkthrough-tablet-portrait.webm`
- `test-results/walkthrough-videos/user-walkthrough-tablet-landscape.webm`
- `test-results/walkthrough-videos/user-walkthrough-mobile.webm`
- `test-results/walkthrough-videos/admin-walkthrough-desktop.webm`
- `test-results/walkthrough-videos/admin-walkthrough-tablet-portrait.webm`
- `test-results/walkthrough-videos/admin-walkthrough-tablet-landscape.webm`
- `test-results/walkthrough-videos/admin-walkthrough-mobile.webm`

The videos are also attached to the Playwright HTML report
(`npm run test:e2e:report`) under the attachment names
`user-walkthrough-video` / `admin-walkthrough-video`.

**Important:** Playwright clears `test-results/` at the start of every new
run (any project, any spec) — so running the four viewports for a role
back-to-back (e.g. via `:all-viewports`) will delete the previous viewport's
video before you've copied it out. Copy each one to a durable location
immediately after it finishes, before starting the next:
```
cp test-results/walkthrough-videos/user-walkthrough-desktop.webm somewhere/durable/
```

On failure, Playwright's own default video/screenshot/trace attachments are
still preserved for the failed test under `test-results/<test-name>/`, in
addition to the always-copied full-session recording above.

## Final stitched walkthrough videos

The eight per-viewport recordings above are temporary Playwright artifacts
(wiped by the next `test-results/` clear). The **durable, shareable
deliverables** live under `artifacts/walkthrough/`, which is never touched
by Playwright:

```
artifacts/walkthrough/
├── user-walkthrough-final.mp4               (Desktop → Tablet Portrait → Tablet Landscape → Mobile)
├── admin-walkthrough-final.mp4              (same viewport order)
├── complete-product-walkthrough-final.mp4   (User+Admin interleaved per viewport)
├── manifest.json                            (source recordings, order, duration, base URL)
└── source-recordings/
    ├── user/{desktop,tablet-portrait,tablet-landscape,mobile}/*.webm
    └── admin/{desktop,tablet-portrait,tablet-landscape,mobile}/*.webm
```

Each of the three final `.mp4` files is produced by
`scripts/stitch-walkthrough-videos.mjs` (uses the project's existing
`ffmpeg-static` dependency — no new tooling). Since the four viewport
recordings for a role have different resolutions, the script letterboxes/
pillarboxes every segment onto a shared 1280x1024 black canvas before
concatenating (never stretches or crops), so tablet-portrait's 768x1024
frame and desktop's 1280x720 frame both remain fully visible, undistorted,
and centered in their respective segments.

To regenerate everything from scratch:
```
npm run test:e2e:walkthrough:user:all-viewports    # and copy each .webm into
                                                    # artifacts/walkthrough/source-recordings/user/<viewport>/
                                                    # immediately after it finishes
npm run test:e2e:walkthrough:admin:all-viewports   # same, into .../admin/<viewport>/
npm run walkthrough:stitch                         # rebuilds the 3 final .mp4s + manifest.json
```

`walkthrough:stitch` validates each output file (exists, non-empty,
ffprobe-reported duration > 0) and fails loudly rather than silently
producing a broken video.

Do not commit the recordings or final videos to Git — they are large binary
artifacts. If the project later needs to share them, use an external
artifact store (release asset, cloud drive) rather than the repository.

## Deterministic, repeatable demo data

Both specs are safe to run repeatedly without `prisma migrate reset`:

- Every fixture record they create (users, interest methods, plans,
  redemption requests, enquiries) uses `uniqueSuffix()` in its identifying
  strings, so re-runs never collide with earlier runs.
- Real UI interaction drives every feature being demonstrated (registration,
  login, subscription, admin CRUD, approvals, theme publish/reset). Prisma is
  used **only** to prepare deterministic pre-existing state that would
  otherwise require a second, redundant full registration/subscription cycle
  to set up in front of the camera — e.g. an already-accrued referral
  commission for the user walkthrough, or a matured plan balance for the
  admin walkthrough's redemption-approval step — never to fake the feature
  the video is actually demonstrating.
- The admin walkthrough's theme step resets the login screen back to default
  at the end, so it doesn't leave a themed login page for other tests or
  demo viewers.

## Known limitations

- FCM push notifications: only permission-grant, DB-registration, and the
  in-app notification list are exercised. Real OS/browser push delivery
  cannot be verified in a headless/CI browser session, so it is not claimed
  here.
- Each walkthrough demonstrates one representative redemption category
  (refund), not every category (gadget/franchisee/course) — those, along
  with shortfall handling, payment retry, and social login, are covered by
  the combined `product-walkthrough-e2e.spec.ts` and by dedicated specs
  elsewhere under `tests/browser/`.
- Mobile/responsive viewport navigation is intentionally out of scope for
  these two recordings.
