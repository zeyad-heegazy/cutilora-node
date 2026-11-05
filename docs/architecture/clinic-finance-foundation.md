# Clinic Finance backend foundation

## Ownership
Clinic invoices, patient collections/refunds and operating expenses are owned by the Clinic financial domain. They are separate from Platform subscription invoices/payments and are not copied into Tenant Finance. Every record is scoped by tenantId + clinicId and optionally branchId.

## Implemented slice
- Draft invoices with customer and line-item snapshots.
- Server-calculated subtotal, discount, tax and total in integer minor currency units.
- Clinic-local-calendar-year invoice numbering on issue.
- Full and partial manual payment recording, payment references and partial refunds.
- Idempotency keys for payment and refund retries.
- Draft-only edits; voiding is allowed only before any collection.
- Expense recording, payment marking and voiding before payment.
- Cash sessions with opening balances, cash-in/out movements, expected-vs-counted close, variance reasons and independent reviewer approval.
- Cash collections, cash refunds and cash expense payments are linked to an open cash session; closing computes the expected drawer balance from those linked records.
- Approved cash sessions are immutable/locked; opener and closer cannot approve their own close.
- Immutable financial event history embedded in invoice/expense records.
- Currency-separated summary with invoiced, collected, refunded, outstanding, expense and cash operating result totals.
- Clinic/branch scope derived from authenticated membership context, never request body ownership fields.

## API
- GET /api/v1/clinic/finance/summary
- GET/POST /api/v1/clinic/invoices
- GET/PATCH /api/v1/clinic/invoices/:invoiceId
- POST /api/v1/clinic/invoices/:invoiceId/issue
- POST /api/v1/clinic/invoices/:invoiceId/payments
- POST /api/v1/clinic/invoices/:invoiceId/payments/:paymentId/refunds
- POST /api/v1/clinic/invoices/:invoiceId/void
- GET/POST /api/v1/clinic/expenses
- POST /api/v1/clinic/expenses/:expenseId/pay
- POST /api/v1/clinic/expenses/:expenseId/void
- GET /api/v1/clinic/cash-sessions/open
- POST /api/v1/clinic/cash-sessions
- POST /api/v1/clinic/cash-sessions/:sessionId/movements
- POST /api/v1/clinic/cash-sessions/:sessionId/close
- POST /api/v1/clinic/cash-sessions/:sessionId/approve

## Explicit boundaries
- The current repository has no Patient, Service, Provider, Supplier, Inventory, or accounting-period source modules. Invoice customer and service details are snapshots; externalPatientReference is an opaque optional integration reference and is not validated against a Patient collection.
- Payment capture is manual record-keeping only. No gateway, terminal, webhook, settlement or bank reconciliation integration is claimed.
- This slice does not implement credit notes, reversals after posting, packages/prepaid liabilities, supplier payable lifecycle, commissions, tax registration/configuration, or accounting-period locks.
- The summary's operating result is a cash-basis operational indicator (net collections less paid expenses), not statutory/accrual profit.
- Amounts are integer minor units. Currency totals are never combined across currencies; no FX conversion is performed.
- Do not use these records as Platform subscription payment records.
