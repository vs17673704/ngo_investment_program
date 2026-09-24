# Referral & Reward Program

## 1. Overview

This is a **prototype** implementation of the Referral & Reward / NGO Investment Program described in
`Master Prompt.md` and `BRD.md`. It runs on your local machine against a **Supabase PostgreSQL**
database, and **every external integration other than the database is simulated**:

- No real payment gateway is called. AutoPay charges, mandates, and webhook events are generated and
  stored in the database, and can be driven from an admin "simulator" screen.
- No real email or SMS is sent. Generated emails are persisted and viewable in the app.
- No real push notifications are sent. In-app notifications are persisted and shown in a notification
  feed.

Read `Master Prompt.md` and `BRD.md` in the repo root for the full functional specification and
business rules this prototype implements.

## 2. Node.js version

Node.js **>= 20.9.0** is required (see the `next` package's `engines.node`). Development on this
project has been done with Node `v24.20.0`. Check your version with:

```bash
node --version
```

## 3. Create a Supabase project

This project uses a [Supabase](https://supabase.com) PostgreSQL database (developed/tested against
Postgres 15/17 as provisioned by Supabase; anything Supabase currently ships should work fine with
the schema in `prisma/schema.prisma`).

1. Sign in at https://supabase.com/dashboard and click **New project**.
2. Pick an organization, name the project, set a database password (save it — you'll need it below),
   and choose a region close to you or your deployment target.
3. Wait for provisioning to finish (a couple of minutes).

## 4. Get your connection strings

In the Supabase dashboard: **Project Settings -> Database -> Connection string**.

Supabase gives you two connection strings you need — one pooled (for the running app), one direct
(for Prisma migrations):

- **Transaction pooler** (port `6543`, via `pgbouncer`) — used at runtime by the app. Prisma's query
  engine is short-lived per request in a serverless/edge context, so pooling avoids exhausting
  Postgres's connection limit.
- **Direct connection** (port `5432`, no pooler) — used only by `prisma migrate`/`prisma db push`,
  which need a session-level (non-pooled) connection to run DDL and advisory locks reliably.

## 5. Configure `DATABASE_URL` and `DIRECT_URL`

Copy `.env.example` to `.env` and fill in the values:

```bash
cp .env.example .env
```

Both variables use the standard PostgreSQL connection string format, with your project ref, password,
and region substituted in from step 4:

```
DATABASE_URL="postgresql://postgres.<project-ref>:<password>@aws-0-<region>.pooler.supabase.com:6543/postgres?pgbouncer=true&sslmode=require"
DIRECT_URL="postgresql://postgres.<project-ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres?sslmode=require"
```

`prisma/schema.prisma`'s `datasource db` block reads `url` from `DATABASE_URL` and `directUrl` from
`DIRECT_URL` — both must be set or `prisma migrate`/`prisma generate` will fail.

**Note:** Next.js loads `.env.local` with higher priority than `.env`. If you have a `.env.local`
file (not committed, used for local overrides), update `DATABASE_URL`/`DIRECT_URL` there too, or the
values in `.env` will be silently overridden.

`.env.example` also documents the other required variables: `JWT_SECRET`, an RS256 keypair
(`JWT_PRIVATE_KEY` / `JWT_PUBLIC_KEY`, generatable with `node scripts/generate-jwt-keys.mjs >> .env`),
the simulated-provider flags (`EMAIL_PROVIDER`, `PAYMENT_PROVIDER`, `NOTIFICATION_PROVIDER`), and
`RAZORPAY_WEBHOOK_SECRET` (a locally-generated secret used only to sign/verify the *simulated*
webhook payloads — never a real Razorpay credential).

## 6. Install dependencies

```bash
npm install
```

## 7. Run database migrations

Against a fresh, empty Supabase database, apply the existing migrations under `prisma/migrations/`
(this uses `DIRECT_URL`, not the pooled `DATABASE_URL`):

```bash
npx prisma migrate deploy
npx prisma generate
```

`npx prisma migrate deploy` applies existing migrations without trying to create a new one — use this
for first-time setup against Supabase. During day-to-day schema development (after editing
`prisma/schema.prisma` yourself) use `npx prisma migrate dev` instead, which also generates a new
migration file when the schema has changed. `npx prisma generate` on its own just regenerates the
Prisma client (useful after pulling changes to `prisma/schema.prisma` without a new migration).

## 8. Seed demo data

```bash
npm run seed
```

This runs `tsx prisma/seed.ts`, which creates demo users, interest calculation methods, plans,
university/college/course catalog data, a franchisee plan, and a gadget catalog item. See
[Demo credentials](#12-demo-credentials) below for the accounts it creates.

## 9. Start the app

```bash
npm run dev
```

The app runs at http://localhost:3000.

## 10. Run tests

```bash
npm test
```

This runs the Playwright end-to-end smoke suite in `tests/` (see `playwright.config.ts`). The config
will start `npm run dev` for you automatically if the dev server isn't already running on port 3000.

## 11. Demo/seeded credentials

From `prisma/seed.ts`:

| Role  | Email               | Password    |
|-------|---------------------|-------------|
| Admin | `admin@demo.local`  | `Admin@1234` |
| User  | `user@demo.local`   | `User@1234`  |

Both accounts are created with `isEmailVerified: true`. Logging in still goes through the simulated
2FA/OTP step described in `docs/integrations.md` (the login form redirects to `/verify-2fa`).

## 12. PWA testing

This app is installable as a Progressive Web App (manifest at `src/app/manifest.ts`, service worker at
`public/sw.js`, icons generated by `scripts/generate-pwa-icons.mjs`). See
[`docs/pwa-testing.md`](docs/pwa-testing.md) for step-by-step manual testing instructions covering
Android Chrome, iPhone Safari, and desktop Chrome/Edge — install prompts, standalone display mode,
service worker registration, offline behavior, and cache refresh.

## 13. Simulated integrations

Payments (Razorpay AutoPay), email, and notifications are all simulated — nothing in this prototype
talks to a real third-party service. See [`docs/integrations.md`](docs/integrations.md) for the exact
interfaces, where an admin can inspect simulated activity in the UI, and how the simulated Razorpay
webhook signature verification (BRD Rule XXXVI.5) works.

## 14. Prototype limitations

Be aware of what this project deliberately does **not** do, since it is a prototype built to a
functional spec rather than a production system:

- **No real payments.** `/admin/payments` is a Razorpay AutoPay *simulator*. All mandate IDs, order
  IDs, payment IDs, and event IDs are fake, sequential, and clearly prefixed (`SIM-...`) so they can
  never be confused with real Razorpay identifiers.
- **No real email delivery.** Emails are generated and stored in the database, viewable at
  `/admin/emails`, but never actually sent over SMTP or any provider API.
- **No real push/SMS notifications.** Notifications are stored and shown in an in-app notification
  feed only.
- **No production-grade job infrastructure.** There is no queue or cron scheduler. Recurring
  processes that would run automatically in production (AutoPay charge runs, payment retries, plan
  maturity transitions) are instead triggered on-demand by an admin from `/admin/payments`.
- **No containerization.** Per the project spec, there is intentionally no Dockerfile or
  docker-compose setup — the app is meant to run directly on the local machine.
- **Not hardened for production traffic.** There's no rate-limiting infrastructure, CDN, horizontal
  scaling, or production observability/monitoring stack beyond the in-app audit log.

## 15. Going from simulated to real integrations

If this prototype were to be extended into a production system, here's what each simulated piece
would need:

- **Payments (Razorpay):** Replace `src/lib/providers/razorpay.ts` with calls to the real Razorpay
  Orders/Subscriptions/AutoPay APIs using real API keys (`RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET`),
  register a real webhook endpoint URL in the Razorpay dashboard, and verify inbound webhooks using
  Razorpay's actual webhook secret (the HMAC-SHA256 verification mechanism already implemented here
  mirrors the real mechanism, so the verification *logic* mostly carries over — only the secret
  provisioning and the webhook transport change). Recurring charge/retry/maturity jobs would move from
  admin-triggered batch actions to a real scheduler (cron, a queue worker, etc.).
- **Email:** Replace `src/lib/providers/email.ts`'s `queueEmail` with a call to a real transactional
  email provider (SMTP, SendGrid, Amazon SES, etc.), keeping the same DB record as an audit trail of
  what was sent.
- **Notifications:** Replace `src/lib/providers/notification.ts`'s `createNotification` with delivery
  to a real push service (FCM for Android/web push, APNs for iOS) or SMS gateway, again keeping the DB
  record as the source of truth for the in-app notification feed.
