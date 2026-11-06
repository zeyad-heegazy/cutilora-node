# Cutilora financial domain boundaries

## Ownership

| Domain | Owns | API responsibility |
|---|---|---|
| Platform billing | Cutilora plans, tenant subscriptions, platform payment collection, provider events, subscription invoices/refunds/credits | Platform APIs own all subscription mutations. Tenant subscription endpoints are read-only. |
| Clinic Finance | Patient invoices, invoice line items, payments, refunds, expenses, currency and clinic/branch attribution | Clinic-scoped source ledger. Financial writes live under `/clinic/finance/*` and require `finance.manage`. |
| Tenant Finance | Consolidated reporting across a tenant's authorized clinics and branches | Read-only projection over Clinic Finance source entries. Tenant reports never create or mutate transactions. |

## Tenant reporting contract

- `GET /tenant/finance/summary`: totals by currency and aggregate outstanding patient balances.
- `GET /tenant/finance/clinic-comparison`: clinic and branch comparison, preserving currency separation.
- `GET /tenant/finance/revenue-trends`: monthly invoiced/collected/refunded trends, payment method mix and service/category mix when line items provide categories.
- `GET /tenant/finance/expense-summary`: expense category and clinic/branch comparison.
- `GET /tenant/finance/reports`: CSV export of consolidated clinic/branch aggregates.
- Filters support date range, clinic, branch and currency. Monthly trends use UTC.
- Tenant report payloads contain aggregate totals and clinic/branch identifiers/names only. They do not expose patient identifiers, invoice line details, medical records or payment references.
- Each report is scoped by active tenant context and `finance.read`; clinic- and branch-scoped memberships cannot widen their assigned scope.
- Multi-currency figures remain grouped by ISO currency. No conversion or blind summation is performed.
- The reporting projection preserves clinic and branch ownership. It does not imply that clinics share a central cash account or centralized accounting book.

## Clinic source ledger contract

- Clinic Finance owns immutable source entries for invoices, payments, refunds and expenses.
- Each source record is tenant-, clinic- and optionally branch-scoped.
- Invoice totals are calculated from line items; line items can carry an optional service/category label for revenue mix.
- Payments must match invoice currency and cannot exceed remaining invoice balance. Balance reservation uses an atomic conditional update.
- Refunds cannot exceed the unrefunded amount of the original payment. Refund reservation is atomic.
- Payment idempotency keys are unique per tenant and cannot be reused for a different payment.
- Source records include creator and occurrence timestamps; write operations emit tenant audit events.
- Clinic Finance source endpoints require `finance.manage`. The Tenant Finance routes are read-only.

## Explicit limitations / future integration points

- There is no patient master-data module wired into this finance source yet. `patientId` is an opaque optional reference; this module does not expose patient data.
- No payment gateway, cash drawer, bank reconciliation, tax calculation, VAT policy, double-entry general ledger, exchange-rate conversion, or central group cash transfer is implemented.
- Expenses and patient payments are manually recorded source entries; integrations can be added without changing Tenant Finance's read-model boundary.
- Historical transactions are not backfilled automatically. Reports show only source entries created through Clinic Finance.
- A report's invoiced, collected, refunded, expenses and net cash measures are distinct. Operating result is a simple source-data summary, not audited statutory accounting.

## Prohibited shortcuts

- Never store patient invoices or clinic payments in Tenant subscription payment collections.
- Never derive clinic revenue from Cutilora subscription charges.
- Never expose Platform payment-provider credentials or webhook state through Tenant APIs.
- Never duplicate clinic transactions in a Tenant-owned ledger.

## Platform subscription self-service boundary

- Tenant subscription records and SubscriptionPayment records belong to Platform billing. Tenant APIs scope every invoice/payment lookup by the active tenant and expose no Platform mutation operations.
- The subscription summary may expose a masked payment-method display (provider/type/brand/last four/expiry) and payment-recovery timeline (failure timestamp/code, retry timestamp/count, grace-period end and scheduled suspension).
- The gateway token reference is selected out of normal queries and is never returned to Tenant APIs. Tokenization, payment collection, retries, refunds and subscription suspension remain Platform-owned.
- Subscription change requests are review requests only; tenant users cannot directly change plan, price, payment state or lifecycle status.
- Clinic Finance entries use a separate model and collection. Tenant subscription invoice/payment history never queries Clinic Finance entries, and Tenant Finance never queries Platform subscription payments.

## TEN-12 verification boundary

- Regression tests verify tenant-scoped source invoice lookup, clinic/branch authorization, tenant-scoped aggregate report pipelines and the separation of Platform subscription records from Clinic Finance source records.
- Clinic Finance currently implements invoices, partial payments, refunds and expenses. Package/prepaid balance accounting, cash drawers, daily closing, staff commissions, suppliers/payables, tax/VAT, double-entry accounting, void/reversal workflows and bank/gateway reconciliation remain separate Clinic Finance implementation work; they are not silently represented as completed by this domain-boundary card.
- No Platform revenue reporting is derived from Clinic Finance records. Tenant consolidated reports remain a read-only projection and preserve currency boundaries.
