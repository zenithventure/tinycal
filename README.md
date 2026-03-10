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

All API requests require `Authorization: Bearer <user-id>` header.

#### Event Types
- `GET /api/v1/event-types` — List all event types
- `POST /api/v1/event-types` — Create event type

#### Bookings
- `GET /api/v1/bookings` — List bookings (supports `?status=`, `?from=`, `?to=` filters)

#### Calendar Connections
- `PATCH /api/calendar-connections/:id` — Update connection settings (label, checkConflicts, isPrimary)
- `DELETE /api/calendar-connections/:id` — Disconnect a calendar

See [Multi-Calendar Support](docs/features/multi-calendar-support.md) for details.

#### Webhooks

Configure webhooks in the dashboard. Events:
- `booking.created`
- `booking.cancelled`
- `booking.rescheduled`

Webhook payloads include `X-Webhook-Signature` header (HMAC-SHA256).

## Deployment

### AWS Amplify (Production)

SchedulSign deploys on AWS Amplify with Neon serverless PostgreSQL:

**Infrastructure:**
- **AWS Amplify** — Next.js SSR hosting with auto-scaling
- **Neon** — Serverless PostgreSQL database

**Deployment:**
```bash
# Amplify automatically deploys on:
# - Push to main -> Dev
# - Tag v1.2.3-qa -> QA
# - Tag v1.2.3 -> Prod (requires approval)
```

**Account Structure:**
| Environment | Deploy Trigger | Account |
|-------------|----------------|---------|
| Dev | Push to `main` | SchedulSign-Dev |
| QA | Tag `v*-qa` | SchedulSign-QA |
| Prod | Tag `v*` | SchedulSign-Prod |

### Local Development with Docker

```bash
docker build -t schedulsign .
docker run -p 3000:3000 --env-file .env schedulsign
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
