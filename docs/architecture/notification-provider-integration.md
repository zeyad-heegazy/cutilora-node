# Notification provider integration boundary

## Status

The application has provider-neutral email and SMS contracts. No vendor SDK,
credentials, HTTP adapter, or delivery worker is configured yet. Provider
selection is intentionally pending the product/integration decision.

## Code boundary

- `src/shared/notifications/notification.types.ts` defines email/SMS message
  contracts, provider interfaces, and explicit delivery results.
- `src/shared/notifications/notification.service.ts` is the application-facing
  dispatcher. Register concrete providers during application composition.
- A missing provider returns `status: not_configured`; it never reports a
  successful send.
- Provider exceptions are propagated. Callers must handle failures and must
  not mark a message delivered unless the provider confirms it.

## Provider implementation contract

Implement `EmailNotificationProvider` and/or `SmsNotificationProvider` in
vendor-specific adapter files. Keep vendor SDKs and payload mapping inside
those adapters. Do not import vendor packages from domain services.

The application bootstrap/composition root should register the selected
adapters only when the required configuration is present. Secrets must remain
server-side and must not be committed.

## Invitation delivery

Tenant invitations remain on the existing manual-delivery flow for now:
the API returns the one-time invitation token to the authorized inviter and
does not claim that an email or SMS was sent. Do not wire automatic delivery
until the provider, sender identity, invitation URL strategy, retry policy,
and delivery/audit requirements are approved.

## Decisions required before adapter integration

1. Email provider and verified sender/domain.
2. SMS provider with Egypt and intended GCC country coverage, sender ID/OTP
   requirements, and commercial account.
3. Whether invitations are email-only, SMS-only, or channel-selectable.
4. Public invitation acceptance URL and link/token format.
5. Retry, timeout, idempotency, bounce/failure handling, and delivery status
   persistence requirements.
6. Whether messages are sent synchronously or through a durable queue/outbox.

## Safety and operational rules

- Never log invitation tokens, OTPs, message bodies containing secrets, or
  provider credentials.
- Do not expose provider credentials or raw provider errors to API clients.
- A provider timeout can be an ambiguous delivery; retries must be idempotent
  where supported.
- Keep email and SMS adapters independently configurable.
