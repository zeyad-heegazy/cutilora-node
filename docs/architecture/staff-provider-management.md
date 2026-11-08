# Staff & Provider Management

## Domain boundaries
- `Employee` is a clinic-owned staff profile and does not require a global `User` account.
- `Employee.userId` is an optional link to an existing global identity; linking does not create or grant a tenant membership.
- `Provider` is a clinical capability profile attached one-to-one to an Employee within a clinic.
- `Specialty` is clinic-scoped.
- Provider branch assignments are validated against active branches in the same tenant and clinic.
- Service IDs are stored as opaque references until the Services & Treatment Catalog module owns the Service model and lifecycle.

## Availability and eligibility
- Weekly schedules use local wall-clock HH:mm values and weekday numbers (0 Sunday through 6 Saturday); branch timezone remains authoritative for converting them to instants.
- One schedule entry per weekday; breaks must be ordered and contained within the shift.
- Booking integrations must call `clinicStaffService.assertProviderBookable` and also evaluate the provider's working hours, branch closures, service status, and appointment conflicts.
- The eligibility helper rejects inactive providers/employees, expired licenses, and missing branch/service assignments.

## Deferred integration decisions
- Cross-clinic employee identity/contract sharing is not supported in this phase.
- Service reference existence validation is deferred until the Services module is implemented.
- Credentialing rules and accepted license authorities/renewal grace periods require jurisdiction-specific business/legal approval; expired licenses are blocked, with no grace period.
- No appointment booking logic is implemented in this module.
