# Privacy, Audit & Compliance Foundation

## Implemented controls

- Tenant and clinic ownership is required for patient access logs, consent records, and privacy requests.
- Patient identifiers are opaque references. This module does not create the deferred patient domain.
- Patient access logs are append-only and indexed by tenant, clinic, patient, actor, and access time.
- Call `tenantPrivacyService.recordPatientAccess()` before returning a sensitive patient resource. Await the write; if the access-log write fails, do not return the sensitive resource.
- Consent records retain the exact accepted document snapshot, version, SHA-256 hash, actor, source, status, and timestamp. The API verifies the supplied hash and never returns the snapshot in ordinary read responses.
- Consent revocation creates a new immutable record; it does not overwrite the original grant.
- Privacy requests require an explicit legal review record and a separate decision-maker. Fulfillment is a manually confirmed status transition and does not itself export, correct, anonymize, or delete data.
- Retention proposals are inactive until an authorized user records a legal basis and approves them. Approval enables governance tracking only; no automated retention or deletion worker exists.
- Privacy actions write correlated entries to the existing append-only tenant audit-event model. Audit metadata redacts patient and clinical field names.

## Required integration before patient workflows ship

1. Invoke `recordPatientAccess` in every patient/clinical read path, including exports and attachments.
2. Ensure every sensitive read is scoped by tenant and clinic before data retrieval; never trust a patient ID by itself.
3. Include the request ID from the HTTP request context when calling privacy services.
4. Add patient-domain authorization checks for actor access to the patient record; privacy permissions alone do not grant access to clinical data.
5. Add transactional/outbox handling if audit-event delivery to downstream webhooks must be guaranteed. Current audit persistence and webhook delivery are not one atomic transaction.

## Legal decisions — must remain open pending qualified review

- Applicable controller/processor roles and legal bases by jurisdiction.
- Required consent categories, approved wording, language, signature/evidence requirements, and versioning rules.
- Retention periods for clinical, financial, identity, consent, access-log, and audit records.
- Erasure exceptions, legal holds, anonymization standards, and handling of backups.
- Data residency, cross-border transfers, subprocessors, and breach notification obligations in Egypt, Saudi Arabia, and each target GCC market.
- Whether and how minors, representatives, and withdrawn consent are handled.

Do not configure production retention periods or enable permanent deletion until these decisions are approved for each operating jurisdiction. A legal reference stored in this module is an auditable reference, not a substitute for legal approval.
