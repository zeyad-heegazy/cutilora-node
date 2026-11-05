import { describe, expect, it, vi } from 'vitest';
import { getTenantRolePermissions, requireTenantPermission } from '../../src/modules/tenancy/middleware/tenant-permissions.js';

function runPermission(role: string, permission: string) {
  const req = { tenantContext: { role } } as any;
  const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as any;
  const next = vi.fn();
  requireTenantPermission(permission)(req, res, next);
  return { req, res, next };
}

describe('tenant permission matrix', () => {
  it('grants all permissions to the Tenant Owner', () => {
    expect(getTenantRolePermissions('tenant_owner')).toEqual(['*']);
    expect(runPermission('tenant_owner', 'any.permission').next).toHaveBeenCalledOnce();
  });

  it('limits billing administrators to subscription and invoice access', () => {
    expect(runPermission('billing_admin', 'billing.read').next).toHaveBeenCalledOnce();
    const denied = runPermission('billing_admin', 'clinic.manage');
    expect(denied.next).not.toHaveBeenCalled();
    expect(denied.res.status).toHaveBeenCalledWith(403);
  });

  it('allows branch managers to read and manage branch holidays but not edit branch identity', () => {
    expect(runPermission('branch_manager', 'branch.holidays.read').next).toHaveBeenCalledOnce();
    expect(runPermission('branch_manager', 'branch.holidays.manage').next).toHaveBeenCalledOnce();
    expect(runPermission('branch_manager', 'branch.update').next).not.toHaveBeenCalled();
  });

  it('does not grant permissions to unknown roles', () => {
    expect(getTenantRolePermissions('custom_unknown_role')).toEqual([]);
    expect(runPermission('custom_unknown_role', 'organization.manage').next).not.toHaveBeenCalled();
  });
});
