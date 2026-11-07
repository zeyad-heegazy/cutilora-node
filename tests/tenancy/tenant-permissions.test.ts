import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getTenantRoleCatalog, getTenantRolePermissions, requireTenantPermission } from '../../src/modules/tenancy/middleware/tenant-permissions.js';

async function run(role: string, permission: string, context: Record<string, unknown> = {}, query: Record<string, unknown> = {}) {
  const defaultScope = ['tenant_owner', 'tenant_admin', 'billing_admin'].includes(role) ? 'tenant' : ['clinic_admin', 'clinic_manager'].includes(role) ? 'clinic' : 'branch';
  const req = { params: {}, query, tenantContext: { role, scope: defaultScope, clinicId: defaultScope === 'tenant' ? null : 'clinic-a', branchId: defaultScope === 'branch' ? 'branch-a' : null, ...context } } as any;
  const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as any;
  const next = vi.fn();
  await requireTenantPermission(permission)(req, res, next);
  return { res, next };
}

describe('tenant permission matrix and scoped custom roles', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('grants all permissions to the Tenant Owner', async () => {
    expect(getTenantRolePermissions('tenant_owner')).toEqual(['*']);
    expect((await run('tenant_owner', 'any.permission')).next).toHaveBeenCalledOnce();
  });

  it('limits billing administrators to subscription and invoice access', async () => {
    expect((await run('billing_admin', 'billing.read')).next).toHaveBeenCalledOnce();
    const denied = await run('billing_admin', 'clinic.manage');
    expect(denied.next).not.toHaveBeenCalled();
    expect(denied.res.status).toHaveBeenCalledWith(403);
  });

  it('allows branch managers to read and manage branch holidays but not edit branch identity', async () => {
    expect((await run('branch_manager', 'branch.holidays.read')).next).toHaveBeenCalledOnce();
    expect((await run('branch_manager', 'branch.holidays.manage')).next).toHaveBeenCalledOnce();
    expect((await run('branch_manager', 'branch.update')).next).not.toHaveBeenCalled();
  });

  it('evaluates grants against the active tenant, clinic, and branch scope', async () => {
    expect((await run('clinic_manager', 'branch.read', { scope: 'clinic', clinicId: 'clinic-a', branchId: 'branch-a' })).next).toHaveBeenCalledOnce();
    expect((await run('branch_manager', 'branch.read', { scope: 'branch', clinicId: 'clinic-a', branchId: 'branch-a' })).next).toHaveBeenCalledOnce();
    expect((await run('branch_manager', 'clinic.settings.manage', { scope: 'branch', clinicId: 'clinic-a', branchId: 'branch-a' })).next).not.toHaveBeenCalled();
  });

  it('uses tenant custom-role permissions and enforces their declared scope', async () => {
    expect((await run('custom', 'branch.read', { scope: 'branch', customPermissions: ['branch.read'] })).next).toHaveBeenCalledOnce();
    expect((await run('custom', 'clinic.settings.manage', { scope: 'branch', customPermissions: ['branch.read'] })).next).not.toHaveBeenCalled();
    expect((await run('custom', 'branch.read', { scope: 'branch', customPermissions: [] })).next).not.toHaveBeenCalled();
  });

  it('applies direct grants and denials without escaping the membership scope', async () => {
    expect((await run('staff', 'branch.schedule.manage', {
      scope: 'branch', permissionOverrides: { allow: ['branch.schedule.manage'], deny: [] },
    })).next).toHaveBeenCalledOnce();
    expect((await run('branch_manager', 'branch.read', {
      scope: 'branch', permissionOverrides: { allow: [], deny: ['branch.read'] },
    })).next).not.toHaveBeenCalled();
  });

  it('does not grant permissions to unknown roles', async () => {
    expect(getTenantRolePermissions('custom_unknown_role')).toEqual([]);
    expect((await run('custom_unknown_role', 'organization.manage')).next).not.toHaveBeenCalled();
  });

  it('exposes built-in templates and marks actor-grantable roles', () => {
    const ownerCatalog = getTenantRoleCatalog('tenant_owner');
    const adminCatalog = getTenantRoleCatalog('tenant_admin');
    const ownerRole = ownerCatalog.find((role) => role.role === 'tenant_owner');
    const clinicAdmin = adminCatalog.find((role) => role.role === 'clinic_admin');
    const tenantAdmin = adminCatalog.find((role) => role.role === 'tenant_admin');
    expect(ownerRole).toMatchObject({ scopes: ['tenant'], customizable: false, assignableByCurrentUser: false });
    expect(clinicAdmin).toMatchObject({ scopes: ['clinic'], assignableByCurrentUser: true });
    expect(tenantAdmin?.assignableByCurrentUser).toBe(false);
  });

  it('enforces custom grants at the selected branch and rejects cross-clinic use', async () => {
    const allowed = await run('custom_role', 'branch.holidays.read', { roleId: 'role-a', clinicId: 'clinic-a', branchId: 'branch-a', customPermissions: ['branch.holidays.read'] });
    expect(allowed.next).toHaveBeenCalledOnce();
    const denied = await run('custom_role', 'branch.holidays.read', { roleId: 'role-a', clinicId: 'clinic-b', branchId: 'branch-a', customPermissions: ['branch.holidays.read'] });
    expect(denied.next).not.toHaveBeenCalled();
    expect(denied.res.status).toHaveBeenCalledWith(403);
  });

  it('prevents clinic-scoped memberships from addressing another clinic by route parameter', async () => {
    const denied = await run('clinic_manager', 'clinic.settings.read', { scope: 'clinic', clinicId: 'clinic-a' }, { clinicId: 'clinic-b' });
    expect(denied.next).not.toHaveBeenCalled();
    expect(denied.res.status).toHaveBeenCalledWith(403);
  });

  it('rejects a clinic-scoped permission when the requested clinic differs from the grant', async () => {
    const denied = await run('clinic_manager', 'clinic.settings.read', {
      scope: 'clinic',
      clinicId: 'clinic-a',
    }, { clinicId: 'clinic-b' });
    expect(denied.next).not.toHaveBeenCalled();
    expect(denied.res.status).toHaveBeenCalledWith(403);
  });
});
