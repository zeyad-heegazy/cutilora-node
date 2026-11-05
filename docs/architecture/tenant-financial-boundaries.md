# Cutilora tenant financial boundaries

## Ownership

| Domain | Owns | Tenant API access |
|---|---|---|
| Platform billing | Plan catalog, prices, subscription lifecycle, payment collection, provider events, subscription invoices, refunds and credits | Read-only subscription and invoice-history projections |
| Clinic finance | Patient invoices, patient payments, refunds, expenses, clinic cash movements and accounting source records | Not yet available; the Clinic Finance source domain is not implemented in this backend |
| Tenant finance | Consolidated reporting across clinics belonging to one tenant | Must be a read model over Clinic Finance records; it must not create a second ledger |

## Enforced API boundary

- Tenant routes expose GET /tenant/subscription, GET /tenant/subscription/usage, and tenant subscription invoice-history reads only.
- No Tenant route creates, edits, cancels or collects a Platform subscription.
- Platform subscription/payment APIs remain under the Platform API namespace and authorization.
- Tenant invoice history is filtered by the active tenantId and contains only subscription payment/invoice records. It is not patient invoice history.
- Tenant usage currently reports counts only. Plan limits are explicitly unavailable until Platform entitlements are represented in the subscription schema.

## Requirements before Tenant Finance reporting

1. Implement Clinic Finance as the source of truth for clinic transactions and balances.
2. Ensure every source record is tenant-, clinic- and, where relevant, branch-scoped.
3. Build tenant finance as a projection/aggregation over those source records.
4. Preserve source record IDs and currency/period semantics in every aggregate.
5. Reconcile aggregate totals against source ledgers; never duplicate or mutate clinic transactions from the Tenant module.

## Prohibited shortcuts

- Do not store patient invoices or clinic payments in Tenant subscription payment collections.
- Do not derive clinic revenue from Cutilora subscription charges.
- Do not expose Platform payment-provider credentials or webhook state through Tenant APIs.
- Do not mark tenant finance reporting complete until the Clinic Finance source ledger and reconciliation tests exist.
