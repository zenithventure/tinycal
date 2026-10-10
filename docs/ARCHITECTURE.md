# TinyCal - Architecture & Implementation Reference

This document describes the **currently implemented** system. Planned features (e-signatures) live in the design docs under `docs/design/`.

> **History:** the product was originally called "SchedulSign" and ran on AWS (Amplify + RDS + Cognito + SES, provisioned with Terraform). That stack has been fully replaced. The old Terraform is archived, unused, in [`docs/legacy/terraform-aws/`](legacy/terraform-aws/README.md); see also [`docs/legacy/notes.md`](legacy/notes.md).

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 14 (App Router, SSR), React 18, TypeScript |
| Database | PostgreSQL on [Neon](https://neon.tech) (serverless) |
| ORM | Prisma 5 |
| Auth | Auth.js (NextAuth v5 beta), Google OAuth, JWT sessions |
| Payments | Stripe (Pro subscription + per-booking payments) |
| Calendar | `googleapis` (Google Calendar) / `@microsoft/microsoft-graph-client` (Outlook) |
| Video | Google Meet (via Calendar API) / Zoom (Server-to-Server OAuth) |
| Email | Resend |
| SMS | Twilio |
| Styling | Tailwind CSS + Lucide React icons |
| Testing | Vitest (unit) + Playwright (E2E) |
| Hosting | Vercel (production + preview), Vercel Cron |
| CI/CD | GitHub Actions (CI, DB migrations, GitHub Releases) |

---

## Deployment

```
Browser → Vercel (Next.js SSR + API routes, cron) → Neon PostgreSQL
                                                  → Stripe / Resend / Twilio
                                                  → Google Calendar / Microsoft Graph / Zoom
GitHub Actions → prisma migrate deploy → Neon
```

- **Vercel** builds with `prisma generate && next build` and auto-deploys: push to `main` → production; PR branches → preview deployments. Environment variables are managed in the Vercel dashboard (see `.env.example`).
- **Database migrations** are applied by `.github/workflows/deploy-migrations.yml` (`prisma migrate deploy`), triggered on pushes to `main` that touch `prisma/migrations/**` or `prisma/schema.prisma`, or manually via `workflow_dispatch`. Migrations are intentionally decoupled from app builds, so preview deployments never migrate production. Migrations are forward-only.
- **CI** (`.github/workflows/ci.yml`) runs `prisma generate`, type-check, lint and unit tests on PRs and `main`. **Releases** are published by `.github/workflows/releases.yml` (see [`RELEASING.md`](RELEASING.md)).
- **Cron** jobs are declared in `vercel.json` and authenticated with `Authorization: Bearer $CRON_SECRET` (`src/lib/cron-auth.ts`):
  - `/api/cron/reminders` (every 15 min) - email/SMS booking reminders
  - `/api/cron/webhook-retries` (every minute) - retry failed webhook deliveries
  - `/api/cron/calendar-sync` (every 15 min) - calendar sync
- A `Dockerfile` (Next.js standalone build) is provided for local/container runs.

---

## Authentication Architecture

- **Login:** Google OAuth only, via Auth.js (`src/auth.ts`). Sessions are stateless **JWTs**; no Auth.js database adapter or session tables are used.
- **User provisioning:** in the `jwt` callback, the first Google sign-in looks up `User` by email and creates one if absent (generating a unique `slug` and a default Mon-Fri 09:00-17:00 availability). The DB `User.id` is stored in the token and exposed as `session.user.id`.
- **Route protection:** `src/middleware.ts` wraps Auth.js `auth()`. Unauthenticated page requests redirect to `/login`; unauthenticated `/api/*` requests get `401`. Public routes (booking pages, `/api/slots`, `/api/bookings`, `/api/v1`, `/api/cron`, Stripe webhooks, etc.) bypass the session check and authenticate themselves in the handler (Bearer API key, `CRON_SECRET`, Stripe signature). See [`api-route-auth.md`](api-route-auth.md).
- **Server helper:** `getAuthenticatedUser()` in `src/lib/auth.ts` resolves the session to a `User` row and is used by session-authenticated API routes.
- **Public API:** `/api/v1/*` uses `tc_live_*` API keys (hashed at rest, per-key rate limiting, idempotency keys on mutating endpoints).
- **Calendar OAuth** (connecting Google/Outlook calendars) is separate from login and handled by `/api/auth/google*` and `/api/auth/outlook*`. Calendar access/refresh tokens are encrypted at rest with AES-256-GCM (`src/lib/crypto.ts`, key `CALENDAR_TOKEN_KEY`); without a key the code degrades safely to pass-through with a warning.

---

## Data Model

Defined in `prisma/schema.prisma` (Postgres). Key entities:

**User** - account, profile, subscription and branding
- `email` (unique), `name`, `image`, `timezone`, `slug` (unique public URL)
- Subscription: `plan` (FREE/PRO), `stripeCustomerId`, `stripeSubscriptionId`, `stripePriceId`, `stripeCurrentPeriodEnd`
- Branding: `brandColor`, `brandLogo`
- `emailOptOut` (release-announcement unsubscribe), `defaultAvailabilityScheduleId`

**EventType** - bookable meeting configuration
- `title`, `slug` (unique per user), `description`, `duration`, `location` (GOOGLE_MEET/ZOOM/IN_PERSON/PHONE/CUSTOM), `customLocation`, `color`, `active`
- Rules: `bufferBefore/After`, `dailyLimit`, `weeklyLimit`, `minNotice`, `maxFutureDays`, optional `availabilityScheduleId`
- Payment: `requirePayment`, `price`, `currency`
- Collective: `isCollective` plus co-hosts in the **EventCollectiveMember** join table (`eventTypeId`, `userId`, composite PK, FK to both with `ON DELETE CASCADE`). The API still exposes a flat `collectiveMembers: string[]` (see `src/lib/collective.ts`).
  - **User deletion strips membership:** deleting a co-host removes their membership rows only; the event type, its owner and its bookings are untouched. Deleting the owner deletes the event type (and its memberships). There is no blocked-delete path and no dangling user id.
  - Migration `20261009000000_event_collective_member` backfilled the old `String[]` column (dangling ids and duplicates dropped) and removed it. Verify with `scripts/verify-collective-migration.sh` against a scratch DB; DB-backed tests live in `src/__tests__/db/` (run with `TEST_DATABASE_URL`).

**CustomQuestion** - intake fields on an event type (`TEXT/TEXTAREA/SELECT/RADIO/CHECKBOX/PHONE/EMAIL`)

**Booking** - scheduled meeting
- `uid` (public id), `startTime/endTime`, `status` (PENDING, PENDING_CONFIRMATION, CONFIRMED, CANCELLED, RESCHEDULED, COMPLETED, NO_SHOW), `source` (BOOKING_PAGE/MEETING_LINK)
- Booker: `bookerName/Email/Timezone/Phone/Linkedin`; meeting: `location`, `meetingUrl`, `meetingId`
- Payment: `paid`, `paymentAmount`, `stripePaymentIntentId`; `answers` (JSON), `cancelReason`, `rescheduleUid`, `reminderSentAt`, `smsReminderSentAt`

**AvailabilitySchedule / AvailabilityRule** - named weekly schedules with per-day rules and date overrides (assignable to event types). The legacy per-user **Availability** table is still present and used for the default Mon-Fri seed.

**CalendarConnection** - Google/Outlook OAuth connection (`provider`, encrypted tokens, `isPrimary`, `checkConflicts`, `label`); unique per `[userId, provider, email]`

**Webhook / WebhookDelivery** - outgoing webhook subscriptions (HMAC-SHA256 `secret`) and persisted delivery attempts with retry state (`PENDING/SUCCEEDED/FAILED`, `nextAttemptAt`)

**Contact** - auto-populated from bookings (`source`: booking/signature/manual)

**ApiKey / ApiKeyUsage / IdempotencyKey** - public API keys (prefix + hashed secret, `revokedAt`, `expiresAt`), per-minute rate-limit counters, and idempotency cache for `/api/v1` mutations

**Document** - e-signature documents (schema only, feature not implemented)

---

## API Endpoints

Session = Auth.js session cookie. "Public" routes are exposed without a session and validate input / authenticate in the handler.

### Auth
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET/POST | `/api/auth/[...nextauth]` | - | Auth.js handlers (Google login, session, sign-out) |
| GET | `/api/auth/google` | Session | Start Google Calendar OAuth |
| GET | `/api/auth/google/callback` | - | Google Calendar OAuth callback |
| GET | `/api/auth/outlook` | Session | Start Outlook Calendar OAuth |
| GET | `/api/auth/outlook/callback` | Session | Outlook Calendar OAuth callback |

### User & Settings
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET/PATCH | `/api/user` | Session | Current user + calendar connections; update profile/branding |
| GET | `/api/users/lookup` | Session | Look up a user by email (name/email only) |
| POST | `/api/support` | Session | Support requests |
| GET/POST | `/api/api-keys`, POST `/api/api-keys/[id]/revoke` | Session | Manage API keys |
| GET/POST/DELETE | `/api/webhooks` | Session | Manage webhooks |
| GET | `/api/contacts` | Session | List contacts |

### Event Types, Availability, Slots
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET/POST | `/api/event-types` | Session | List / create (enforces plan limits) |
| GET/PATCH/DELETE | `/api/event-types/[id]` | Session | Single event type |
| GET/PUT | `/api/availability` | Session | Availability rules |
| GET/POST | `/api/availability/schedules` (+ `/[id]`) | Session | Named availability schedules |
| GET | `/api/slots` | Public | Available time slots for an event type |

### Bookings & Meeting Links
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET/POST | `/api/bookings` | Session (GET) / Public (POST) | List bookings; create booking (conflict check, calendar, email, webhook) |
| GET | `/api/bookings/[uid]` | Public | Booking details |
| POST | `/api/bookings/[uid]/cancel` | Public | Cancel |
| POST | `/api/bookings/[uid]/reschedule` | Public | Reschedule |
| POST, then `/[uid]`, `/[uid]/confirm`, `/[uid]/ics` | `/api/meeting-links` | Mixed | Shareable meeting links |

### Calendar Connections
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| PATCH/DELETE | `/api/calendar-connections/[id]` | Session | Update settings / disconnect |

### Payments
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/stripe/checkout` | Session | Subscription checkout |
| POST | `/api/stripe/portal` | Session | Billing portal |
| POST | `/api/stripe/webhook` | Stripe signature | Stripe events |
| POST | `/api/stripe/booking-payment` | Public | Per-booking payment session |

### Public API, Cron, Admin
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET/POST | `/api/v1/bookings` | API key | List / create bookings |
| GET/POST | `/api/v1/event-types` | API key | List / create event types |
| GET | `/api/cron/reminders`, `/webhook-retries`, `/calendar-sync` | Bearer `CRON_SECRET` | Scheduled jobs |
| GET/POST | `/api/admin/announce` | Session + admin email | Preview / send release announcements (Resend) |

---

## Calendar Integration

### Google Calendar
- OAuth via `/api/auth/google`; token auto-refresh (proactive + reactive on 401)
- Creates events with Google Meet `conferenceData`; conflict detection via `events.list`

### Outlook / Office 365
- OAuth via `/api/auth/outlook` (`Calendars.ReadWrite offline_access User.Read`)
- Creates events and detects conflicts via Microsoft Graph (`calendarView`)

### Multi-Calendar Support
- Multiple connected calendars per user, per-calendar conflict toggle, primary-calendar designation
- Events fetched in parallel (`Promise.allSettled`) with a short in-memory cache
- Details: [`features/multi-calendar-support.md`](features/multi-calendar-support.md)

### Slot Generation (`src/lib/availability.ts`)
1. Load availability rules, event-type config, calendar conflicts and existing bookings
2. Generate 15-minute-increment slots within each availability window
3. Filter by past times, min notice, buffers, and daily/weekly limits
4. For collective events, intersect all members' available slots

---

## Payment System

- **Pro plan:** $5/month or $48/year via Stripe Checkout; Stripe Customer Portal for management; plan state synced by `/api/stripe/webhook`
- **Per-booking payments:** event types with `requirePayment` create a Stripe Checkout session; booking stays PENDING until payment is confirmed

| Feature | Free | Pro |
|---------|------|-----|
| Event types | 1 | Unlimited |
| Calendar sync | Yes | Yes |
| Custom branding | No | Yes |
| SMS reminders | No | Yes |
| Payment collection | No | Yes |
| Webhooks & API | No | Yes |

---

## Email & Notifications

- **Email (Resend)** - `src/lib/email.ts` / `src/lib/email-service.ts`: booking confirmation, cancellation, reminders, and release announcements (with a safe unsubscribe flow). If `RESEND_API_KEY` is unset, sends are skipped with a warning.
- **SMS (Twilio, Pro plan)** - `src/lib/sms.ts`: booking reminders via cron.
- **Webhooks** - `booking.created|cancelled|rescheduled`, signed with HMAC-SHA256, retried by cron. See [`webhooks.md`](webhooks.md).

---

## Project Structure

```
src/
  auth.ts           # Auth.js config (Google, JWT sessions, user provisioning)
  middleware.ts     # Route protection
  app/
    (auth)/login    # Login page
    [username]/     # Public profile + booking pages
    cancel/[uid]/, reschedule/[uid]/, m/  # Booker self-service / meeting links
    dashboard/      # Authenticated dashboard
    changelog/, privacy/, terms/, unsubscribe*/
    api/            # API routes
  components/       # Reusable UI components
  lib/
    auth.ts         # getAuthenticatedUser()
    availability.ts # Slot generation
    bookings/       # Booking creation logic
    calendar/       # Google, Outlook, conflict detection, token handling
    crypto.ts       # AES-GCM encryption for calendar tokens
    email.ts, email-service.ts, sms.ts, stripe.ts, video.ts, webhooks*, api-keys/
    prisma.ts       # Prisma client singleton
prisma/             # schema.prisma + migrations/
e2e/                # Playwright E2E tests
docs/               # This doc, design docs, features, legacy/ (archived AWS Terraform)
.github/workflows/  # ci, deploy-migrations, releases
```

---

## What's Not Yet Implemented

- **E-Signature Module** - the `Document` model exists but no routes, pages or components. See `docs/design/04-user-flows-esignature.md`.
- **Embed JavaScript widget** - only iframe embed code is generated
- **Booking detail view** (only list view exists)

> Note: some `docs/design/` documents pre-date the migration and still mention Cognito/Amplify; they are historical design material. See [`legacy/notes.md`](legacy/notes.md).
