# Releasing and customer communication

## How releases are made

`.github/workflows/releases.yml` creates a GitHub Release tagged `tinycal-vX.Y.Z`.

- **On push to `main`:** bumps the patch of the latest `tinycal-v*` tag (or starts at `0.1.0`). Skipped if nothing new landed since that tag.
- **Manual:** `gh workflow run releases.yml -f release_version=1.2.0 -f with_notes_note="..."`. Both inputs are optional. If the tag already exists, its notes are updated rather than duplicated.
- **Notes:** merged PRs since the previous tag, grouped by title (`breaking`/`!:`, `feat`/`add`, `fix`, everything else), each linked, plus a **Notes** section for the manual note.
- Uses the built-in `GITHUB_TOKEN`; no extra secrets.

Customer-facing notes live in `data/changelog.json` (rendered at `/changelog`). The release's manual note must be the same text as the changelog entry, so the two do not drift. Write it once, paste it into both.

## The rule

**Any behavior-visible or breaking change requires an explicit, dated, customer-facing note** before or with the release. Each note states:

1. **What changed**
2. **Who is affected**
3. **What the customer should do** (or "nothing")

A PR title alone is not a note. If a PR changes API responses, auth, webhooks, billing, emails, or defaults a customer can observe, the PR is not ready to merge without its note drafted.

## Worked example 1: legacy bearer tokens removed (breaking)

> **2026-10-06 — Breaking: legacy API tokens no longer accepted**
> - **What changed:** The v1 API no longer accepts a bare user id as a bearer token (`Authorization: Bearer <user-id>`). Those requests now return `401`.
> - **Who is affected:** Anyone calling the v1 API with the old user-id token, including scripts and integrations written before API keys existed.
> - **What to do:** Create a key at `/dashboard/api-keys` and send it as `Authorization: Bearer tc_live_...`. Replace the old token everywhere it is used.

Why it needs a note: existing integrations fail hard with no code change on the customer's side. Its PR title should contain `breaking` so the release groups it under **Breaking changes**.

## Worked example 2: Stripe API version change (internal, needs pre-deploy check)

The `apiVersion` constant in `src/lib/stripe.ts` pins the Stripe API version used for our requests and for the shape of webhook payloads we parse. Changing it can alter webhook payloads and object fields.

**Before deploy (required):**
1. In the Stripe dashboard (Developers → Webhooks), confirm each endpoint's API version matches the new constant. A mismatch means webhooks are delivered in one shape and parsed in another.
2. Replay a recent webhook event from the dashboard against a preview/staging deploy.
3. Do not deploy until versions match; upgrade the dashboard version or the constant so they agree.

**Note (only if customers can see an effect, e.g. changed billing behavior or webhook payloads for integrators):**

> **2026-10-06 — Billing API version update**
> - **What changed:** We upgraded our Stripe API version.
> - **Who is affected:** Customers receiving our webhooks, or whose invoices/portal display depends on Stripe fields that changed in that version. Otherwise nobody.
> - **What to do:** Nothing for most customers. Integrators should re-check any parsing of billing fields.

If the check finds no customer-visible effect, record that in the PR description, and the release can omit a customer note. The dashboard parity check is still mandatory.

## Checklist for a release

- [ ] Every behavior-visible or breaking PR has a dated note (what / who / what to do)
- [ ] Note added to `data/changelog.json` and pasted as the release's manual note
- [ ] Breaking PR titles contain `breaking` (or use `type!:`)
- [ ] Stripe `apiVersion` change? Dashboard parity verified
