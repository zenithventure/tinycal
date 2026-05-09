# Webhooks

TinyCal posts JSON to your configured webhook URLs whenever a booking is
created, cancelled, or rescheduled. Each delivery is signed with HMAC-SHA256
so you can verify it came from TinyCal.

## Setup

1. Go to **Dashboard → Webhooks**.
2. Add a URL and select which events to subscribe to.
3. Copy the auto-generated `secret` for that webhook — you'll use it to verify
   the signature.

## Delivery

- **Method**: `POST`
- **Headers**:
  - `Content-Type: application/json`
  - `X-Webhook-Signature: <hex>` — HMAC-SHA256 of the request body, hex-encoded.
    **Note**: this is a bare hex string, not the `sha256=<hex>` format used by
    GitHub/Stripe.

### Request body

```json
{
  "event": "booking.created",
  "data": { ... },
  "timestamp": "2026-05-09T15:30:00.000Z"
}
```

`data` is the same shape across all `booking.*` events — see the
[Payload reference](#payload-reference) below. `timestamp` is the moment
TinyCal sent the webhook (not the booking time).

### Retries

Currently **none** — a delivery is attempted exactly once. Failed deliveries
are logged on the server but not retried. Build receivers to be tolerant of
duplicate or missed events; ack with a 2xx as soon as you've enqueued the work.

## Verifying signatures

The signature is `HMAC_SHA256(secret, raw_request_body)` as a lowercase hex
string. Verify it against the **raw body bytes** before parsing JSON, since
re-serializing parsed JSON can produce different bytes.

### Node.js

```ts
import crypto from "crypto"

function verify(rawBody: string, signatureHeader: string, secret: string): boolean {
  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex")
  const a = Buffer.from(expected, "hex")
  const b = Buffer.from(signatureHeader, "hex")
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}
```

### Python

```python
import hmac
import hashlib

def verify(raw_body: bytes, signature_header: str, secret: str) -> bool:
    expected = hmac.new(secret.encode(), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature_header)
```

## Events

| Event                  | Trigger                                                             |
|------------------------|---------------------------------------------------------------------|
| `booking.created`      | A booking is created (booking page POST or meeting-link confirm)    |
| `booking.cancelled`    | A booking is cancelled by booker or host                            |
| `booking.rescheduled`  | A booking's start time changes; payload includes the previous time  |

## Payload reference

The `data` field of every `booking.*` event has this shape:

```jsonc
{
  "booking": {
    "id":          "ckabc123…",          // internal id
    "uid":         "ckdef456…",          // public uid (used in /reschedule, /cancel URLs)
    "status":      "CONFIRMED",          // PENDING | PENDING_CONFIRMATION | CONFIRMED | CANCELLED | RESCHEDULED | COMPLETED | NO_SHOW
    "title":       "Discovery call",
    "startTime":   "2026-06-01T15:00:00.000Z",  // ISO 8601 UTC
    "endTime":     "2026-06-01T15:30:00.000Z",
    "location":    "GOOGLE_MEET",        // GOOGLE_MEET | ZOOM | IN_PERSON | PHONE | CUSTOM
    "meetingUrl":  "https://meet.google.com/abc-defg-hij",  // null for IN_PERSON/PHONE
    "source":      "BOOKING_PAGE",       // BOOKING_PAGE | MEETING_LINK
    "booker": {
      "name":      "Alex Doe",
      "email":     "alex@example.com",
      "timezone":  "America/Los_Angeles",
      "phone":     "+15551234567"        // null if not collected
    },
    "answers":     { "q_1": "..." },     // booker's answers to custom questions; null if none
    "cancelReason": null,                // populated for booking.cancelled if booker provided one
    "confirmedAt":  null,                // ISO timestamp; populated for MEETING_LINK bookings on confirm
    "createdAt":    "2026-05-09T15:25:00.000Z"
  },
  "eventType": {
    "id":           "ckxyz789…",
    "slug":         "discovery-call",
    "title":        "Discovery call",
    "duration":     30,                  // minutes
    "isCollective": true                 // true if multiple hosts must be available
  },
  "host": {
    "id":    "ckhost123…",
    "name":  "Sze",
    "email": "sze@example.com"
  },

  // booking.rescheduled only:
  "previous": {
    "startTime": "2026-06-01T14:00:00.000Z",
    "endTime":   "2026-06-01T14:30:00.000Z"
  }
}
```

### Notes

- All datetimes are ISO 8601 with explicit UTC offset (`Z`). Use the
  `booker.timezone` field to render local times for the booker.
- For collective event types, the `host` field is the *event-type owner*, not
  every co-host. If you need every host's email, fetch the event type via
  `/api/v1/event-types?slug=<slug>` and read `collectiveMembers`.
- `answers` is opaque to the schema — the keys come from the custom-question
  IDs configured on the event type. To resolve them to question labels, fetch
  the event type's `questions` via the API.
- Internal fields (Stripe payment intent IDs, raw token data) are deliberately
  excluded from webhook payloads.
