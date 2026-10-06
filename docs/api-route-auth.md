# API route auth inventory

Every handler under `src/app/api/**`, its auth class, and where auth is enforced.
This is mirrored by the manifest in `src/__tests__/api/route-auth-manifest.test.ts`,
which fails if a route/method is added without being classified here.

Classes:

- **PUBLIC** — intentionally open (no caller identity needed).
- **SESSION** — Auth.js session via `getAuthenticatedUser()` in the handler. Routes not in the
  middleware allow-list are *also* gated by `src/middleware.ts` (401 without a session).
- **API-KEY** — `Authorization: Bearer <key>` via `authenticateApiKey` (`lib/api-keys`) in the handler.
- **CRON** — `Authorization: Bearer $CRON_SECRET` via `isAuthorizedCronRequest` (`lib/cron-auth`) in the handler.

"Allow-listed" = the path prefix is in `publicRoutes` in `src/middleware.ts`, so middleware does **not**
authenticate it and the handler must.

| Route | Methods | Class | Allow-listed | Where auth is enforced |
|---|---|---|---|---|
| `/api/admin/announce` | GET, POST | SESSION (admin only via `ADMIN_EMAILS`) | no | handler (403 for non-admins) |
| `/api/api-keys` | GET, POST | SESSION | no | middleware + handler |
| `/api/api-keys/[id]/revoke` | POST | SESSION | no | middleware + handler |
| `/api/auth/[...nextauth]` | GET, POST | PUBLIC | yes | Auth.js handlers (login/session/csrf) |
| `/api/auth/google` | GET | SESSION | yes | handler (redirects to /login) |
| `/api/auth/google/callback` | GET | SESSION | yes | handler — **fixed in #92**; also requires `state === session user id` |
| `/api/auth/outlook` | GET | SESSION | yes | handler |
| `/api/auth/outlook/callback` | GET | SESSION | yes | handler |
| `/api/availability` | GET, PUT | SESSION | yes | handler |
| `/api/availability/schedules` | GET, POST | SESSION | yes | handler |
| `/api/availability/schedules/[id]` | GET, PUT, DELETE | SESSION | yes | handler |
| `/api/bookings` | GET | SESSION | yes | handler |
| `/api/bookings` | POST | PUBLIC | yes | public booking creation (booker flow) |
| `/api/bookings/[uid]` | GET | PUBLIC | yes | none; unguessable booking `uid` (cuid) is the capability |
| `/api/bookings/[uid]/cancel` | POST | PUBLIC | yes | none; booking `uid` capability |
| `/api/bookings/[uid]/reschedule` | POST | PUBLIC | yes | none; booking `uid` capability |
| `/api/calendar-connections/[id]` | PATCH, DELETE | SESSION | no | middleware + handler |
| `/api/contacts` | GET | SESSION | no | middleware + handler |
| `/api/cron/calendar-sync` | GET | CRON | yes | handler (`isAuthorizedCronRequest`) |
| `/api/cron/reminders` | GET | CRON | yes | handler |
| `/api/cron/webhook-retries` | GET | CRON | yes | handler |
| `/api/event-types` | GET, POST | SESSION | no | middleware + handler |
| `/api/event-types/[id]` | GET, PATCH, DELETE | SESSION | no | middleware + handler |
| `/api/meeting-links` | POST | SESSION | yes | handler |
| `/api/meeting-links/[uid]` | GET | PUBLIC | yes | none; booking `uid` capability (recipient link) |
| `/api/meeting-links/[uid]/confirm` | POST | PUBLIC | yes | none; booking `uid` capability |
| `/api/meeting-links/[uid]/ics` | GET | PUBLIC | yes | none; booking `uid` capability |
| `/api/slots` | GET | PUBLIC | yes | none (booking page availability) |
| `/api/stripe/booking-payment` | POST | PUBLIC | yes | none; booker flow, keyed by booking id (**allow-listed in #92**, see below) |
| `/api/stripe/checkout` | POST | SESSION | no | middleware + handler |
| `/api/stripe/portal` | POST | SESSION | no | middleware + handler |
| `/api/stripe/webhook` | POST | PUBLIC | yes | Stripe signature (`constructEvent`) |
| `/api/support` | POST | SESSION | no | middleware + handler |
| `/api/user` | GET, PATCH | SESSION | no | middleware + handler |
| `/api/users/lookup` | GET | SESSION | no | middleware + handler |
| `/api/v1/bookings` | GET, POST | API-KEY | yes | handler (`authenticateApiKey`) |
| `/api/v1/event-types` | GET, POST | API-KEY | yes | handler (`authenticateApiKey`) |
| `/api/webhooks` | GET, POST, DELETE | SESSION | yes | handler |

## Findings from the audit (#92)

1. **`/api/auth/google/callback` had no auth** (allow-listed under `/api/auth`). It trusted the `state`
   query param as a user id and attached the Google account to that user, so anyone could link an
   arbitrary Google calendar to any known user id. Fixed: requires a session and `state === user.id`.
2. **`/api/stripe/booking-payment` was not allow-listed** though the anonymous booking widget calls it,
   so paid bookings by logged-out bookers got a middleware 401. Added an explicit entry (not a wildcard).
   Residual risk: it is open, gated only by an unguessable booking id and the event type requiring payment.

## Follow-ups (not done here)

- The `[uid]` booking routes (cancel/reschedule/read) rely purely on cuid secrecy; consider signed tokens.
- `/api/auth` and `/api/bookings`, `/api/availability` prefixes are broad; `/api/auth/*` and
  `/api/availability/*` handlers all self-auth today and the test enforces it for every listed route.
- The test is a static source check, not a runtime 401/403 matrix.
