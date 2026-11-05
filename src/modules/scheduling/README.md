# Scheduling Module Placeholder

> Status: placeholder only. No appointment booking, availability calculation, calendar, or scheduling API is implemented here.

## Ownership

The future Scheduling module owns appointment availability and booking rules. The Tenancy module remains the source of truth for branch configuration; Scheduling must consume branch data through an explicit application/service contract and must not duplicate branch schedules or lifecycle state.

## Required integration contract

When Scheduling is implemented, availability evaluation must:

1. Resolve the branch using authenticated tenant and clinic scope; never trust a client-supplied branch ID without ownership checks.
2. Use the branch's IANA timezone for local dates, weekdays, opening windows, and exceptional hours.
3. Apply branch lifecycle:
   - `active`: eligible for availability.
   - `draft`, `temporarily_closed`, `suspended`, `closed`: no new appointment slots.
4. Apply weekly working hours, split shifts, and breaks.
5. Apply active holidays/closures and exceptional opening hours, with exceptional hours taking precedence only according to a documented rule.
6. Persist appointment instants in UTC while retaining the branch timezone context needed to explain local scheduling decisions.
7. Re-check availability atomically when booking/rescheduling to prevent double booking.

## Planned boundary

- Scheduling reads branch configuration; it does not mutate branch lifecycle or working hours.
- Branch closure/holiday changes must invalidate or recalculate cached availability.
- Existing appointments are historical/operational records and must not be silently deleted when a branch closes. A separate policy must define handling of already-booked appointments.
- All reads and writes must enforce tenant, clinic, and branch scope.
- Audit booking, cancellation, rescheduling, and administrative overrides.

## Explicitly not implemented

- Appointment, provider/resource, slot, calendar, or booking models.
- Availability/slot calculation.
- Booking, rescheduling, cancellation, waitlist, reminders, or calendar endpoints.
- Background jobs, cache invalidation, and appointment conflict prevention.

This file is an architectural placeholder only. Implement the module under a separately scoped Scheduling card after its domain rules, provider/resource model, booking policies, and existing-appointment closure behavior are agreed.
