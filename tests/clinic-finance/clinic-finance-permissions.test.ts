import { describe, expect, it } from 'vitest';
import { getTenantRolePermissions, TENANT_PERMISSION_CATALOG } from '../../src/modules/tenancy/services/tenant-access.service.js';

describe('clinic finance permissions', () => {
  it('keeps the built-in Billing Admin role read-only for clinic finance', () => {
    const permissions = getTenantRolePermissions('billing_admin');
    expect(permissions).toContain('finance.read');
    expect(permissions).toContain('finance.invoices.read');
    expect(permissions).toContain('finance.expenses.read');
    expect(permissions).toContain('finance.receivables.read');
    expect(permissions).toContain('finance.reports.read');
    expect(permissions).not.toContain('finance.invoices.manage');
    expect(permissions).not.toContain('finance.payments.manage');
    expect(permissions).not.toContain('finance.refunds.manage');
    expect(permissions).not.toContain('finance.expenses.manage');
  });

  it('makes all finance permissions assignable through custom roles', () => {
    expect(TENANT_PERMISSION_CATALOG).toEqual(expect.arrayContaining([
      'finance.read', 'finance.invoices.read', 'finance.invoices.manage',
      'finance.payments.manage', 'finance.refunds.manage',
      'finance.expenses.read', 'finance.expenses.manage', 'finance.credit-notes.manage',
    ]));
  });
});
