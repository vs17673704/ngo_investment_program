# Complete Product Walkthrough (User + Admin)

> **Looking for shorter, single-role walkthrough videos instead?** This
> directory also contains two independent, faster recordings —
> `user-walkthrough.spec.ts` and `admin-walkthrough.spec.ts` — each a
> standalone, single-context story ("how a user uses the product" / "how an
> admin operates it") with no context-stitching machinery. See
> `tests/browser/WALKTHROUGH.md` for how to run them and where their videos
> land. The rest of this file documents the original combined, multi-role
> epic below.

This directory contains a single, narrative, video-recorded Playwright test
that demonstrates the entire product as one coherent cross-role business
journey — not a regression check. The original User A/Plan/referral
throughline (registration → subscription → real simulated payments → the
admin console → financial lifecycle to maturity → redemption → referral &
commission → a general enquiry → content publishing → notifications → final
account state) carries 12 chapters. It is then followed by 13 further
chapters — framed narratively as other members and admins using the
platform — covering gadget/franchisee/course redemption, shortfall
handling, payment retry, social login + 2FA, account locking, interest
method + plan versioning, theme customization, referral cancellation, plan
discontinuation, the reports center, and responsive navigation, so the
walkthrough now demonstrates the full breadth of the product, not just one
user's path through it.

## Why this is separate from the regression suite

The file runs under its own Playwright project, `"walkthrough"` (see
`playwright.config.ts`), so its recording settings (1280×720 video, matching
viewport, `slowMo: 300` for a watchable pace) never affect — and can never be
silently disabled by changes to — the regression suite's own `video: "on"`
setting. The regression `"chromium"` project explicitly ignores this
directory (`testIgnore: /walkthrough\//`) and this project explicitly
targets only it (`testMatch: /walkthrough\//`), so nothing runs twice.

## Prerequisites

1. Install dependencies and provision the database once, from
   `ngo_investment_program/`:
   ```
   npm install
   npx prisma migrate dev
   npx prisma generate
   npm run seed
   ```
   The walkthrough relies on the seed's demo `admin@demo.local` account and
   at least one seeded interest calculation method (used as the default
   selection on the Admin "Create plan" form).
2. Playwright browsers installed: `npx playwright install chromium`.

The dev server itself is started automatically by Playwright's `webServer`
config (`npm run dev:http`) — you do not need to start it manually.

## Running it

Debug run first, no recording (fast feedback loop while iterating):
```
npx playwright test tests/browser/walkthrough/ --project=walkthrough
```

Full recorded run (headed, slowed down, produces the actual demo video):
```
npx playwright test tests/browser/walkthrough/product-walkthrough-e2e.spec.ts --headed --project=walkthrough
```

### Why the video is stitched together

The spec creates ~13 additional `BrowserContext`s beyond the built-in
`page`/`context` fixture — one per role/chapter (`adminContext`,
`userAContext`, `referredContext`, `gadgetContext`, etc.) — because the story
needs several authenticated sessions active at once (an already-logged-in
context can't "log in as someone else"). The `"walkthrough"` project's
`use.video` config only auto-applies to the built-in `page`/`context`
fixture, not to contexts created manually via `browser.newContext()`, so
every one of those ~13 contexts records its own separate video file, and the
same two or three contexts (mainly `adminContext`/`userAContext`) are
reused non-contiguously across nearly every chapter of the story.

To end up with one watchable, chronologically-ordered video instead of over
a dozen scattered/interleaved clips, the spec tracks — via a lightweight
`registerCamera()`/`mark()` module in the test file itself — exactly which
context is "on camera" at every point in the narrative, then in
`test.afterAll` (after all contexts have closed and flushed their video to
disk) uses Playwright's bundled ffmpeg to trim each context's recording down
to just its actively-narrated window(s) and concatenate all of those
trimmed segments, in true chronological order, into one continuous file.

### Where the output lands

The stitched video is written to
`test-results/walkthrough-stitched/product-walkthrough-e2e.webm` (the
per-segment trims and intermediate concat list live alongside it in the same
folder, and can be ignored/deleted). Playwright only finalizes each
context's own recording once that context closes, and the stitch step only
runs in `test.afterAll` once the whole test has finished, so let the run
complete naturally — don't cancel it early. A stitching failure is logged
but never fails the test itself (it's best-effort post-processing on top of
the real business-logic assertions).

**Important:** Playwright clears `test-results/` at the start of every new
run (any project, any spec file), so a video left there is deleted the next
time you run *any* Playwright test. Copy it out immediately after the run:
```
cp test-results/walkthrough-stitched/product-walkthrough-e2e.webm tests/browser/walkthrough/recordings/product-walkthrough-e2e.webm
```
A known-good copy of the latest passing recording is committed at
`tests/browser/walkthrough/recordings/product-walkthrough-e2e.webm` — that's
the durable, permanent location to check the video into and to point anyone
at, not `test-results/`.

## Roles used

- **Admin** (`admin@demo.local`, seeded) — configures the product (creates a
  Plan), operates the AutoPay/maturity simulators, approves redemptions and
  commissions, resolves the general enquiry, and publishes site content.
- **Demo User** (created fresh each run, e.g. `walkthrough-primary-<suffix>@example.com`) —
  registers, subscribes to the Admin's plan, goes through two payment
  cycles and maturity, redeems part of the balance, and refers a second
  user.
- **Referred User** (created fresh each run) — registers via the Demo
  User's real referral code and subscribes to the same plan, triggering a
  real commission accrual for the Demo User.

The 12 chapters above carry this same Admin/Demo User/Referred User/Plan
throughline. The 13 chapters that follow each introduce their own
fresh, purpose-built fixture user (and, where needed, a fresh Plan) so
every sub-flow is self-contained — narratively framed as other members and
admins using the platform, rather than overloading the original three
entities with unrelated state.

All roles are driven through **separate authenticated browser
contexts** in the same test (`newRoleContexts`-style pattern), because an
already-authenticated session redirects away from `/login` — there is no
way to "log in as someone else" from a single context.

## Walkthrough Coverage Table

| Chapter | Actor | Business Flow | Main Route(s) | Cross-Role | Final Result |
|---|---|---|---|---|---|
| Public tour | Visitor | Browses plans, franchisee info, contact page before signing in | `/`, `/plans`, `/franchisee`, `/contact` | No | Confirms public catalog/marketing pages render pre-auth |
| Admin plan configuration | Admin | Creates a brand-new investment Plan via the real admin form | `/admin/plans` | No | New `Plan` row exists, visible to all users on `/plans` |
| User registration | Demo User | Registers a plain account (no referral) | `/register` | No | New `User` row, redirected straight to dashboard |
| Dashboard tour | Demo User | Reviews the Financial Summary metrics | `/dashboard` | No | Confirms all summary stats render for a fresh account |
| Plan discovery & subscription | Demo User | Finds the Admin's plan in the real catalog and subscribes with AutoPay | `/plans`, `/plans/:id/subscribe` | No | `UserPlan` created; first `Payment` processed for real |
| Admin observes | Admin | Confirms the same user/payment from the console | `/admin/users`, `/admin/plans` | **Yes** (same entities as prior chapter) | Confirms admin visibility into user-driven actions |
| Financial lifecycle | Admin (acting on Demo User's plan) | Runs a second AutoPay cycle, then fast-forwards the same plan to maturity | `/admin/payments` | **Yes** | `UserPlan.status` reaches `MATURED` |
| Redemption | Demo User + Admin | User submits a partial refund redemption; Admin approves it | `/dashboard/redeem/refund`, `/admin/redemptions` | **Yes** | `RedemptionRequest.status = APPROVED`; `UserPlan.status = PARTIALLY_REDEEMED` |
| Referral & commission | Demo User + Referred User + Admin | Referred User registers/subscribes via Demo User's code; Admin approves & credits the resulting commission; Demo User withdraws it | `/dashboard/referrals`, `/register?ref=...`, `/admin/commissions` | **Yes** (3 roles) | `Commission.status = WITHDRAWN` |
| General enquiry | Visitor + Admin | Anonymous enquiry submitted, then resolved by Admin | `/contact`, `/admin/enquiries/general` | **Yes** | `GeneralEnquiry.status = RESOLVED` |
| Content publishing | Admin + Visitor | Admin publishes a new About Us section; Visitor sees it live | `/admin/settings/about-us`, `/about` | **Yes** | Published section visible on the public page |
| Gadget redemption | Member | Redeems a gadget from the catalog against Redeemable Balance; Admin approves | `/dashboard/redeem/gadgets`, `/admin/redemptions` | **Yes** | `RedemptionRequest` (GADGET) reaches `APPROVED`; stock decremented |
| Franchisee redemption | Member | Enrols via a franchisee redemption within Available Margin; Admin approves | `/dashboard/redeem/franchisee`, `/admin/redemptions` | **Yes** | `RedemptionRequest` (FRANCHISEE) reaches `APPROVED` |
| Course / reward-points redemption | Member | Redeems a course fee, earns CEILING-rounded reward points; Admin approves | `/dashboard/redeem/course`, `/admin/redemptions` | **Yes** | `RedemptionRequest` (COURSE) `APPROVED`; reward points credited |
| Shortfall detection & resolution | Member + Admin | Redemption exceeding Available Margin is put on shortfall hold; Admin verifies and approves | `/dashboard/redeem/refund`, `/admin/redemptions` | **Yes** | Shortfall hold resolved to `APPROVED` |
| Payment retry / manual recovery | Member | A missed AutoPay payment exhausts retries and reaches manual recovery | `/dashboard/payments` | No | Payment reaches manual-recovery state after retry exhaustion |
| Social login + mandatory 2FA | New user | Signs in via simulated Google social login, still gated by OTP 2FA | `/login/social/google` | No | Login only completes after 2FA challenge is satisfied |
| Account lock / unlock | Admin + Member | Admin locks a member's account after suspicious activity; the member's own login is denied; Admin unlocks it | `/login`, `/admin/users` | **Yes** | Locked login denied; `User.locked` toggles false→true→false with real login attempts either side |
| Interest method + plan versioning | Admin | Creates a new interest calculation method; sees it snapshotted onto a new plan | `/admin/interest-methods`, `/admin/plans` | No | New `InterestCalculationMethod` correctly snapshotted on the new `Plan` |
| Theme customization lifecycle | Admin + Public | Full draft → publish → verify-live → reset cycle for the login screen theme | `/admin/theme`, `/login` | **Yes** | Published theme visible on the real `/login` screen; reset restores default |
| Referral cancellation | Admin | Cancels a referral relationship without affecting an already-earned commission | `/admin/users` | No | Referral link removed; prior `Commission` record untouched |
| Plan discontinuation cascade | Admin + Member | Discontinues a plan; the member's own dashboard reflects it; matured margin still unlocks for redemption | `/admin/plans`, `/dashboard` | **Yes** | `UserPlan.status` reaches `DISCONTINUED` then `MATURED`; margin unlocks |
| Reports & reconciliation center | Admin | Browses the admin reports/reconciliation views | `/admin/reports` | No | Confirms the reports center renders real aggregated data |
| Responsive hamburger navigation | Member | Navigates the dashboard via the mobile hamburger menu | `/dashboard` (mobile viewport) | No | Confirms responsive nav exposes the same routes on small screens |
| Final product state | Demo User + Admin | Reviews the cumulative state of the whole journey | `/dashboard`, `/admin/audit-log` | **Yes** | All prior business outcomes hold simultaneously on one account |

## Responsive viewport coverage (Cross-Role: Desktop / Tablet / Mobile)

Per `prompts/Claude_Cross_Role_Product_Walkthrough_Playwright_Desktop_Tablet_Mobile.md`,
this cross-role story must be demonstrable at all four required viewport
profiles (Desktop 1440x900-or-disclosed-deviation, Tablet Portrait 768x1024,
Tablet Landscape 1024x768, Mobile 390x844). Re-running the full 29-chapter,
~13-context epic above at three more viewports was judged impractical: its
own `registerCamera()`/ffmpeg stitching pipeline hardcodes a 1280x720 canvas
(`STITCH_WIDTH`/`STITCH_HEIGHT`), and repeating a ~16-30 minute serial run
three more times would add runtime without adding new evidence — §11A of the
governing spec explicitly permits not repeating every expensive transaction
at every viewport.

Instead, a second, shorter spec —
`tests/browser/walkthrough/product-walkthrough-responsive.spec.ts` — carries
the SAME cross-role, same-entity discipline (one user, one admin, one plan,
one redemption request, followed across both roles via two independent
`BrowserContext`s) through real navigation, one meaningful business action
(subscribing to a plan with AutoPay), one data-heavy screen (Payment
History), and one resulting state (an admin-approved redemption reflected
back in the user's own session) — at Tablet Portrait, Tablet Landscape, and
Mobile. Desktop cross-role coverage remains `product-walkthrough-e2e.spec.ts`
above, run under the `"walkthrough"` project (1280x720 — the same
disclosed deviation from the spec's suggested 1440x900 as
`tests/browser/WALKTHROUGH.md`'s two single-role specs, for architectural
consistency with the shared stitching canvas).

| Project | Viewport | Represents | Spec |
|---|---|---|---|
| `walkthrough` | 1280x720 | Desktop | `product-walkthrough-e2e.spec.ts` |
| `walkthrough-tablet-portrait` | 768x1024 | Tablet — portrait | `product-walkthrough-responsive.spec.ts` |
| `walkthrough-tablet-landscape` | 1024x768 | Tablet — landscape | `product-walkthrough-responsive.spec.ts` |
| `walkthrough-mobile` | 390x844 | Mobile | `product-walkthrough-responsive.spec.ts` |

### Responsive spec coverage table

| Chapter | Actor | Business Flow | Main Route(s) | Cross-Role | Final Result |
|---|---|---|---|---|---|
| Public tour | Visitor | Browses the landing page and plan catalog pre-auth (mobile: via the hamburger menu) | `/`, `/plans` | No | Confirms public pages render at this viewport |
| Registration + login | Member | Registers, logs out, logs back in | `/register`, `/dashboard` | No | New `User` row; explicit login flow demonstrated |
| Plan subscription | Member | Subscribes to the seeded plan with AutoPay | `/plans/:id/subscribe` | No | `UserPlan` created; first `Payment` processed for real |
| Payment history | Member | Reviews the data-heavy Payment History table | `/dashboard/payments` | No | Confirms the table renders correctly at this viewport |
| Admin observes | Admin | Opens the same user/plan from the console | `/admin/users` | **Yes** (same entities as prior chapters) | Confirms admin visibility into the member's actions |
| Maturity fast-forward | Admin | Runs the real plan-maturity check on the same plan | `/admin/payments` | **Yes** | `UserPlan.status` reaches `MATURED` |
| Redemption submission | Member | Submits a refund redemption against the matured balance | `/dashboard/redeem/refund` | **Yes** | `RedemptionRequest.status = PENDING` |
| Redemption approval | Admin | Opens the SAME redemption request and approves it | `/admin/redemptions` | **Yes** | `RedemptionRequest.status = APPROVED` |
| Resulting state | Member | Confirms the approved redemption and notification in their own session | `/dashboard/notifications`, `/dashboard/redeem` | **Yes** | Approved status and updated balance visible to the member |

### Running the responsive spec

```
npm run test:e2e:walkthrough:cross-role:desktop
npm run test:e2e:walkthrough:cross-role-responsive:tablet-portrait
npm run test:e2e:walkthrough:cross-role-responsive:tablet-landscape
npm run test:e2e:walkthrough:cross-role-responsive:mobile
```

Each run's videos land at
`test-results/walkthrough-videos/product-walkthrough-responsive-{user,admin}-<viewport>.webm`
(the desktop epic's own stitched output lands at
`test-results/walkthrough-stitched/product-walkthrough-e2e.webm`, per its own
section above). **Copy each one out immediately after its run finishes** —
`test-results/` is wiped at the start of the next Playwright run of any
project or spec.

### Final stitched deliverables

Kept under a dedicated `artifacts/walkthrough/cross-role/` subdirectory so
these never collide with the identically-named final videos already produced
under `artifacts/walkthrough/` (flat) by `scripts/stitch-walkthrough-videos.mjs`
for the two single-role specs documented in `tests/browser/WALKTHROUGH.md` —
that pair demonstrates two independent single-role journeys, while this
pair demonstrates genuine cross-role, same-entity continuity, which is a
materially different deliverable and is kept separate rather than merged or
overwritten:

```
artifacts/walkthrough/cross-role/
├── product-walkthrough-desktop-final.mp4
├── product-walkthrough-tablet-portrait-final.mp4
├── product-walkthrough-tablet-landscape-final.mp4
├── product-walkthrough-mobile-final.mp4
├── complete-product-walkthrough-final.mp4   (all four viewports, in order)
├── manifest.json
└── source-recordings/
    ├── desktop/product-walkthrough-e2e.webm
    ├── tablet-portrait/product-walkthrough-responsive-{user,admin}-tablet-portrait.webm
    ├── tablet-landscape/product-walkthrough-responsive-{user,admin}-tablet-landscape.webm
    └── mobile/product-walkthrough-responsive-{user,admin}-mobile.webm
```

Regenerate via:
```
npm run walkthrough:stitch:cross-role
```
which runs `scripts/stitch-cross-role-walkthrough.mjs` — the same
letterbox/pillarbox-onto-a-shared-1280x1024-canvas ffmpeg approach as
`scripts/stitch-walkthrough-videos.mjs`, and the same exists/non-empty/
duration>0 validation, so it fails loudly rather than silently producing a
broken video.

## Known limitations (intentionally out of scope for this walkthrough)

To keep this a single coherent, watchable story rather than an exhaustive
regression sweep, the following real, already-tested product areas are
*not* part of this walkthrough (they're covered by their own dedicated spec
files elsewhere in `tests/browser/`):

- Editing an interest method or plan in place after creation (only initial
  creation + snapshotting onto a new plan is shown here).
- The numeric AutoPay limit / breach-threshold configuration path.
- Mixing reward points as partial payment during course redemption.
- Commenting/annotation on a redemption during admin review.

These are all real, working features — they were left out here only to
keep this particular narrative focused and its recording a reasonable
length. Gadget/franchisee redemption, shortfall handling, payment retry,
social login/2FA, and course/reward-points redemption — previously listed
here as out of scope — are now covered above.
