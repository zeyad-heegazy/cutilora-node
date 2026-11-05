# Tenant Organization Management — Backend Readiness

This document tracks backend scope for Trello cards TEN-00 through TEN-12. It does not mark a Trello card complete: the cards include frontend workflows and acceptance criteria outside this backend branch.

## Card-by-card status

| Card | Backend status | Implemented | Remaining / dependency |
|---|---|---|---|
| TEN-00 — Tenant Portal Shell | Backend foundation only | Tenant context, permission endpoint, organization APIs used by a future portal | Sidebar, navigation, tenant switcher, route states and responsive shell are frontend work |
| TEN-01 — Dashboard & Overview | Partial | Dashboard summary, clinic directory, activity and alerts endpoints; tenant-scoped counts | Subscription entitlements/limits are absent from the subscription schema; some alert sources and report date-window definitions remain unavailable |
| TEN-02 — Profile, Preferences & Documents | Substantially implemented | Tenant profile/preferences, branding, private documents, expiry metadata, authorized download/archive, immutable replacement versions and version-history endpoint | Legal verification workflow and frontend preview/status UI remain |
| TEN-03 — Clinic Management | Partial | Tenant-scoped clinic CRUD, search/filter/pagination, activation/deactivation, settings inheritance and clinic branch listing | Subscription-limit enforcement requires Platform entitlements; initial manager assignment, clinic-owned documents and full clinic activity view remain |
| TEN-04 — Branch Management | Partial | Branch CRUD, tenant/clinic isolation, timezone, operating hours and breaks, holidays/closures, settings inheritance, activation/deactivation | Lifecycle is currently active/suspended; temporary-closure/closed states and exceptional opening hours need product confirmation; explicit manager assignment remains |
| TEN-05 — Users, Invitations & Memberships | Backend foundation implemented | Paginated user/invitation directories, scoped memberships, role assignment checks, single-use hashed invitations, expiry/resend/revoke, existing/new account acceptance, rollback/recovery, audit events and process-local acceptance rate limiting | Email/SMS delivery and recipient verification are not configured; rate limiting must move to a shared store before horizontal scaling; session/last-activity summaries and membership-history UI remain |
| TEN-06 — Roles, Permissions & Scope | Partial | Deny-by-default built-in permission map, role catalog, actor grantability, tenant-scoped effective-access preview, last-owner/self-change/privilege protections with an atomic tenant-scoped owner-change lease | Roles are static. No shared Platform RBAC engine or custom-role persistence exists in this repository; custom roles must wait for an agreed shared RBAC architecture |
| TEN-07 — Shared Catalog & Policies | Partial | Versioned tenant configuration, preview/confirmed bulk apply, clinic defaults, clinic/branch overrides, nested per-setting source labels and effective-value resolution | Typed service/treatment catalog templates, pricing templates and message templates need their owning Clinic catalog modules and schemas |
| TEN-08 — Tenant Finance | Blocked by source domain | No duplicate tenant ledger has been introduced | Repository has no Clinic financial transaction/source models to aggregate. Implement only after Clinic Finance ownership, source schemas, permissions and currency policy exist |
| TEN-09 — Subscription & Billing | Read-only self-service foundation | Tenant-scoped subscription overview, usage counts, invoice list/detail | Entitlement limits are not represented; billing profile, change requests and invoice downloads require Platform-owned billing capabilities and schemas |
| TEN-10 — Integrations | Not implemented | No speculative provider integration has been added | Requires provider selection, credential encryption/key management, connection scopes, webhook signing/retry/idempotency and plan-entitlement decisions |
| TEN-11 — Reports, Activity & Audit | Partial | Tenant-scoped append-only audit events, filters/pagination, dashboard activity and bounded CSV audit export with safe-field selection and spreadsheet-formula neutralization | Broader clinic/branch performance reports, report definitions/freshness and export workflows require source-domain data and permission decisions |
| TEN-12 — Financial Domain Separation | Architecture documented; implementation partial | Platform subscription records remain separate from Tenant reporting; architecture boundary documented | Clinic Finance source domain is not present, so Tenant consolidated finance cannot yet be implemented or reconciled |

## Security and architecture notes

- Tenant identity is resolved from authenticated membership and X-Tenant-Id; client-supplied tenant IDs are never sufficient authorization.
- Clinic and branch access is checked against membership scope and tenant ownership.
- Invitation tokens are stored as hashes, are single-use and expire. Acceptance has a processing lease so stale claims can be retried safely.
- Invitation acceptance rate limiting currently uses process memory. A shared store is required before running multiple API instances.
- Audit exports include only safe identifiers/action fields, are tenant-filtered, capped at 5,000 rows and neutralize spreadsheet formulas.
- Last Tenant Owner demotion/suspension is serialized with a short tenant-scoped database lease; stale leases expire automatically.
- Subscription data is exposed read-only to Tenant APIs. Plan catalog, entitlement calculation, invoice issuance and payment collection remain Platform-owned.
- Tenant finance must aggregate Clinic-owned records; it must not create a second transaction ledger.

## Verification

The feature branch CI runs:
1. npm test
2. npm run build
3. Redocly OpenAPI bundle

Only mark a backend acceptance item complete after these checks pass for the commit containing it. Do not mark a Trello card complete while its required frontend or dependent-domain acceptance criteria remain open.
