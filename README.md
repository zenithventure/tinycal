# TinyCal

Book meetings. Get signatures. One tool, $5/mo.

## Features

### Scheduling (Calendly-parity)
- Shareable booking pages with custom branding
- Multiple event types (different durations, locations, custom questions)
- Google Calendar OAuth + 2-way sync (avoid double-booking)
- Outlook/Office 365 calendar sync (Microsoft Graph API)
- Multi-calendar conflict detection — connect multiple calendars, prevent double-booking across all of them ([docs](docs/features/multi-calendar-support.md))
- Availability engine — working hours, day-specific rules, buffer time, daily/weekly limits
- Timezone auto-detection + display for bookers
- Video conferencing — auto-generate Zoom & Google Meet links
- Email confirmations + reminders (Amazon SES)
- SMS reminders (Twilio)
- Reschedule/cancel — self-service links for bookers
- Custom intake questions on booking page
- Embed widget (iframe + JS snippet)
- Custom branding (logo, colors)
- Payment collection via Stripe for paid bookings
- Webhooks + REST API
- Collective scheduling (find time across multiple hosts)

### Infrastructure
- Next.js 14 (App Router, TypeScript)
- Neon serverless PostgreSQL + Prisma ORM
- Auth.js v5 (Google OAuth)
- Stripe subscription billing ($5/mo or $48/yr)
- Landing page (conversion-focused)
- User dashboard + settings

## Tech Stack

- **Frontend:** Next.js 14, React, Tailwind CSS
- **Backend:** Next.js API routes
- **Database:** Neon serverless PostgreSQL + Prisma
- **Auth:** Auth.js v5 (Google OAuth)
- **Payments:** Stripe
- **Email:** Amazon SES via Nodemailer
- **SMS:** Twilio
- **Calendar:** Google Calendar API, Microsoft Graph API
- **Video:** Zoom API, Google Meet (via Calendar API)

## Getting Started

```bash
# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Fill in your API keys

# Set up database
npx prisma migrate dev

# Generate Prisma client
npx prisma generate

# Run development server
npm run dev
```

## Environment Variables

See `.env.example` for all required variables. Key variables:

- `AUTH_SECRET` — Auth.js session encryption key (generate with `npx auth secret`)
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` — Google OAuth credentials
- `DATABASE_URL` — Neon PostgreSQL connection string
- `NEXTAUTH_URL` — App URL for Auth.js callbacks

## API Documentation

### REST API (v1)

All API requests require `Authorization: Bearer <api-key>` header.

API keys are minted in **Dashboard → API Keys** (or via
`npx tsx scripts/create-api-key.ts <userIdOrEmail> "<name>"` for ops automation).
Keys have the form `tc_live_<prefix>_<secret>` and are only shown once at creation.

Per-key rate limit: **60 requests/minute**. Responses include
`X-RateLimit-Limit`, `X-RateLimit-Remaining`, and `X-RateLimit-Reset`
(epoch seconds) headers; `429` responses include `Retry-After` (seconds).

> **Deprecated:** passing your raw `User.id` as the Bearer token still works
> but returns a `Warning: 299 - "tc-legacy-api-key"` header. This path will
> be removed in a future release — migrate to a real API key.

#### Event Types
- `GET /api/v1/event-types` — List all event types (supports `?slug=<slug>` filter)
- `POST /api/v1/event-types` — Create event type

#### Bookings
- `GET /api/v1/bookings` — List bookings (supports `?status=`, `?from=`, `?to=` filters)
- `POST /api/v1/bookings` — Create a booking on one of your event types. Body: `{ eventTypeId, startTime (ISO 8601), bookerName, bookerEmail, bookerTimezone, bookerPhone?, answers? }`. Returns `201` with `{ data: <booking> }` including `meetingUrl`. The event type must belong to the API key's owner (otherwise `403`). Pass `Idempotency-Key: <opaque>` (e.g. UUID) to safely retry on network errors — repeats with the same key + body within 24h replay the original response (with `X-Idempotent-Replay: true` header); same key + different body returns `409`.

#### Calendar Connections
- `PATCH /api/calendar-connections/:id` — Update connection settings (label, checkConflicts, isPrimary)
- `DELETE /api/calendar-connections/:id` — Disconnect a calendar

See [Multi-Calendar Support](docs/features/multi-calendar-support.md) for details.

#### Webhooks

Configure webhooks in the dashboard. Events:
- `booking.created`
- `booking.cancelled`
- `booking.rescheduled`

Webhook payloads include `X-Webhook-Signature` header (HMAC-SHA256, bare hex).
See [docs/webhooks.md](docs/webhooks.md) for the payload schema and signature
verification examples.

## Deployment

Production runs on **Vercel** (Next.js SSR + Fluid Compute) with **Neon** serverless PostgreSQL.

**Auto-deploy:**
- Push to `main` → production deploy at `tinycal.zenithstudio.app`
- PR branch → preview deployment URL on the PR

**Build pipeline** (`package.json` `build` script):
```
prisma generate && next build
```

**Database migrations** are applied separately by `.github/workflows/deploy-migrations.yml` — a GitHub Action that triggers on push to `main` when `prisma/**` changes. This intentionally decouples schema changes from app builds: deploys without schema changes skip the migrate step, and Vercel preview deployments never run migrations against production. The action can also be triggered manually from the Actions UI for ad-hoc runs.

**Environment variables** are managed via the Vercel dashboard (Project → Settings → Environment Variables), or pulled locally with:
```bash
vercel env pull .env.local --environment=production
```

**Rolling back:** Vercel dashboard → Deployments → pick a previous build → "Promote to Production". Note this rolls back code only — Prisma migrations are forward-only, so a rollback to a build that predates a migration won't undo the schema change. If you need to revert a migration, write a new one.

### Local Development with Docker

```bash
docker build -t tinycal .
docker run -p 3000:3000 --env-file .env tinycal
```

## Embed on Your Website

### iframe
```html
<iframe src="https://your-domain.com/your-slug"
  style="width:100%;height:700px;border:none;"
  loading="lazy"></iframe>
```

### JavaScript snippet
```html
<script src="https://your-domain.com/embed.js"
  data-user="your-slug"></script>
```

## License

MIT
