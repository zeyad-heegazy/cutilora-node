# Tenant integrations architecture

## Provider decisions

| Capability | Initial provider adapter | Scope |
|---|---|---|
| Email | Resend | Tenant default or clinic override |
| SMS | Twilio | Tenant default or clinic override |
| WhatsApp | Meta WhatsApp Cloud API (Graph API v26.0 by default; version override is configurable) | Tenant default or clinic override |
| Calendar | Google Calendar OAuth | Tenant default or clinic override |
| Card gateway reference | Stripe | Clinic merchant configuration; Tenant may only view supported configuration metadata |
| Egypt payment gateway reference | Paymob | Clinic merchant configuration; Tenant may only view supported configuration metadata |

Provider configuration routes require the `integrations` subscription feature; webhook routes additionally require the `webhooks` feature and `integrations.manage` permission. Provider identifiers are stored as stable keys and adapter code is isolated in `integration-providers.ts`. Provider selection can change without changing domain services. The current payment gateway adapters verify credentials only; they do not charge cards, settle funds or receive patient payments.

## Configuration lifecycle

- Tenant record (`clinicId = null`) is the default.
- Clinic record overrides the tenant record for that provider.
- A disabled clinic override suppresses tenant fallback.
- Secrets are JSON-encoded and encrypted with AES-256-GCM, random 96-bit IV and authentication tag.
- `INTEGRATION_ENCRYPTION_KEY` is dedicated and required in production. The legacy JWT secret fallback is development-only.
- Secret values are never returned. Rotation replaces the full credential set; revocation clears credentials and disables the connection.
- Provider health is only `connected` after a successful live credential check.

## Webhooks

- Tenant endpoints must be HTTPS and resolve to public addresses; localhost, IP literals and private/link-local DNS targets are rejected.
- Payloads contain only tenant governance metadata (actor, action, target, clinic/branch IDs, result and request ID), never patient or clinical content.
- HMAC-SHA256 signature format is `v1=<hex>`, calculated over `<unix timestamp>.<raw JSON body>`. Headers: `x-cutilora-timestamp`, `x-cutilora-signature`, `x-cutilora-event`, `x-cutilora-delivery`.
- Consumers must compare signatures in constant time and reject timestamps outside a short replay window.
- Delivery records are unique per endpoint/event, claimed atomically, and retried up to eight attempts with backoff. Delivery history omits payload content.
- Apply network-level egress allowlists / metadata-service blocks in production; application DNS checks are defense in depth, not a replacement for egress policy.

## Operations

The API starts a bounded webhook worker after database connection and stops it during graceful shutdown. Monitor failed delivery counts and provider connection health. For high-volume deployments, move the worker to a separately deployed process using the same atomic MongoDB claims.

## Runtime boundary and readiness

- The Resend, Twilio, Meta WhatsApp Cloud API, Google Calendar, Stripe and Paymob adapters currently perform credential/connection checks. They do not yet send email/SMS/WhatsApp messages, synchronize calendar events, or process patient payment settlements.
- The shared notification dispatcher remains provider-neutral and has no concrete email/SMS adapter registered. Tenant invitation channels are persisted, but invitation delivery remains manual until a separate durable notification outbox and provider adapters are implemented.
- Google Calendar currently validates a configured OAuth access token. OAuth consent/callback handling, refresh-token rotation and calendar event synchronization are not part of this backend increment; access tokens must be rotated through the credential management API.
- Webhook delivery retries are automatic with exponential-style backoff, capped at eight attempts. Terminal failures can be manually requeued by an authorized tenant integration manager; the original event ID and payload are retained.
- Webhook queue creation is driven by append-only audit events. Delivery records are unique per endpoint/event, and the worker uses atomic claims. Monitor queue insert errors and failed delivery counts; a durable transactional outbox/reconciliation process remains a hardening item before high-volume production.
