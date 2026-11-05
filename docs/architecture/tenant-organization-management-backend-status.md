# Tenant Organization Management — Backend Readiness

This document tracks backend scope for Trello cards TEN-00 through TEN-12. It does not mark a Trello card complete: the cards include frontend workflows and acceptance criteria outside this backend branch.

## Card-by-card status

| Card | Backend status | Implemented | Remaining / dependency |
|---|---|---|---|
| TEN-00 — Tenant Portal Shell | Backend foundation only | Tenant context, permission endpoint, organization APIs used by a future portal | Sidebar, navigation, tenant switcher, route states and responsive shell are frontend work |
| TEN-01 — Dashboard & Overview | Partial | Dashboard summary, clinic directory, activity and alerts endpoints; tenant-scoped counts | Subscription entitlements/limits are absent from the subscription schema; some alert sources and report date-window definitions remain unavailable |
| TEN-02 — Profile, Preferences & Documents | Substantially implemented | Tenant profile/preferences, branding, private documents, expiry metadata, authorized download/archive, immutable replacement versions and version-history endpoint | Legal verification workflow and frontend preview/status UI remain |
| TEN-03 — Clinic Management | Backend API scope implemented | Tenant-scoped clinic CRUD, unique tenant clinic code/slug, search/filter/pagination, activation/deactivation with audit events, settings inheritance, clinic branch listing, clinic-scoped private documents with version history/download/archive, assigned-user directory and clinic-filtered activity feed. Initial clinic managers can be invited through POST /tenant/invitations with clinic scope, or an existing tenant member can be moved to clinic scope through PATCH /tenant/memberships/{membershipId}. The first branch is optional and can be created separately through the Branch API. | Create wizard, review/confirm flow, initial manager picker, optional-first-branch orchestration and clinic details tabs remain frontend work. Invitation delivery is manual until an email provider is configured. |
| TEN-04 — Branch Management | Backend API scope implemented | Branch CRUD and tenant/clinic isolation; IANA timezone validation; seven-day schedules, split shifts and contained breaks; holiday/closure/modified-hours records with overlapping date-range rejection; settings inheritance; assigned-user directory; branch activity; activation, suspension, temporary closure and terminal permanent closure with reason + audit events. Lifecycle states are active, temporarily_closed, suspended and closed. | Temporary closures are manually reopened (no scheduled auto-reopen job); draft state is not used because branch creation is immediately active. Branch status does not yet feed appointment availability because scheduling is a later domain. Explicit manager assignment uses branch-scoped membership/invitation APIs. |
| TEN-05 — Users, Invitations & Memberships | Backend foundation implemented | Paginated user/invitation directories, tenant-scoped user details, scoped memberships, membership audit history, role assignment checks, single-use hashed invitations, expiry/resend/revoke, existing/new account acceptance, rollback/recovery, audit events and process-local acceptance rate limiting | Email/SMS delivery and recipient verification are not configured; session summaries and activity beyond last-login tracking remain |
| TEN-06 — Roles, Permissions & Scope | Partial | Shared deny-by-default permission evaluator, Platform and Tenant authorization adapters, route-level permission checks for Platform tenant/geo/monitoring APIs, built-in Tenant role catalog, tenant-scoped effective-access preview, last-owner/self-change/privilege protections with an atomic tenant-scoped owner-change lease | Roles remain static and Platform currently has only the platform_admin role; custom-role persistence, role versioning, assignment scopes and delegated grant limits remain |
| TEN-07 — Shared Catalog & Policies | Partial | Versioned tenant configuration, preview/confirmed bulk apply, clinic defaults, clinic/branch overrides, nested per-setting source labels and effective-value resolution | Typed service/treatment catalog templates, pricing templates and message templates need their owning Clinic catalog modules and schemas |
| TEN-08 — Tenant Finance | Blocked by source domain | No duplicate tenant ledger has been introduced | Repository has no Clinic financial transaction/source models to aggregate. Implement only after Clinic Finance ownership, source schemas, permissions and currency policy exist |
| TEN-09 — Subscription & Billing | Partial read-only self-service | Tenant-scoped subscription overview, usage counts, Platform-configured plan limits/features, quota enforcement for clinic/branch/user provisioning using a tenant-scoped lease, invoice list/detail | Storage metering/limit enforcement, feature entitlement gates, billing profile, change requests and invoice downloads require Platform-owned capabilities and schemas |
| TEN-10 — Integrations | Not implemented | No speculative provider integration has been added | Requires provider selection, credential encryption/key management, connection scopes, webhook signing/retry/idempotency and plan-entitlement decisions |
| TEN-11 — Reports, Activity & Audit | Partial | Tenant-scoped append-only audit events, filters/pagination, dashboard activity and bounded CSV audit export with safe-field selection and spreadsheet-formula neutralization | Broader clinic/branch performance reports, report definitions/freshness and export workflows require source-domain data and permission decisions |
| TEN-12 — Financial Domain Separation | Architecture documented; implementation partial | Platform subscription records remain separate from Tenant reporting; architecture boundary documented | Clinic Finance source domain is not present, so Tenant consolidated finance cannot yet be implemented or reconciled |

## Security and architecture notes

- Tenant identity is resolved from authenticated membership and X-Tenant-Id; client-supplied tenant IDs are never sufficient authorization.
- Branch schedules are evaluated in the branch's IANA timezone. Weekly replacement requires exactly seven weekday entries; split shifts must not overlap, and breaks must fit inside their shift.
- Platform and Tenant adapters use the same shared permission evaluator; role catalogs and domain-specific grants remain isolated. Platform and Tenant routes must declare explicit permission keys.
- Clinic and branch access is checked against membership scope and tenant ownership. Clinic documents are separately scoped by tenantId and clinicId; tenant-level document queries exclude clinic-owned files.
- Invitation tokens are stored as hashes, are single-use and expire. Acceptance has a processing lease so stale claims can be retried safely.
- Invitation acceptance rate limiting uses an atomic MongoDB counter with a TTL index, shared across API instances; if the store is unavailable, acceptance fails closed with HTTP 503. IP addresses are HMAC-SHA-256 keyed with the server secret before persistence.
- Audit exports include only safe identifiers/action fields, are tenant-filtered, capped at 5,000 rows and neutralize spreadsheet formulas.
- Last Tenant Owner demotion/suspension is serialized with a short tenant-scoped database lease; stale leases expire automatically.
- Subscription data is exposed read-only to Tenant APIs. Platform owns plan limits/features, entitlement assignment, invoice issuance and payment collection. Clinic/branch/user quota checks are serialized per tenant; storage metering is not implemented.
- Tenant finance must aggregate Clinic-owned records; it must not create a second transaction ledger.

## Verification

The feature branch CI runs:
1. npm test
2. npm run build
3. Redocly OpenAPI bundle

Only mark a backend acceptance item complete after these checks pass for the commit containing it. Do not mark a Trello card complete while its required frontend or dependent-domain acceptance criteria remain open.
