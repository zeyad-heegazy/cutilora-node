import { beforeEach, describe, expect, it, vi } from 'vitest';

const { membershipFindOne, roleFindOne, branchFindOne } = vi.hoisted(() => ({ membershipFindOne: vi.fn(), roleFindOne: vi.fn(), branchFindOne: vi.fn() }));
vi.mock('../../src/modules/tenancy/models/tenant-membership.model.js', () => ({
  TenantMembership: { findOne: (...args: any[]) => membershipFindOne(...args) },
}));
vi.mock('../../src/modules/tenancy/models/tenant-role.model.js', () => ({
  TenantRole: { findOne: (...args: any[]) => roleFindOne(...args) },
}));
vi.mock('../../src/modules/tenancy/models/branch.model.js', () => ({
  Branch: { findOne: (...args: any[]) => branchFindOne(...args) },
}));

import { getTenantRoleCatalog, getTenantRolePermissions, requireTenantPermission } from '../../src/modules/tenancy/middleware/tenant-permissions.js';

function runPermission(role: string, permission: string, context: Record<string, unknown> = {}) {
  const defaultScope = ['tenant_owner', 'tenant_admin', 'billing_admin'].includes(role) ? 'tenant' : ['clinic_admin', 'clinic_manager'].includes(role) ? 'clinic' : 'branch';
  const req = { tenantContext: { role, scope: defaultScope, clinicId: defaultScope === 'tenant' ? null : 'clinic-a', branchId: defaultScope === 'branch' ? 'branch-a' : null, ...context } } as any;
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

  it('evaluates grants against the active tenant, clinic, and branch scope', () => {
    expect(runPermission('clinic_manager', 'branch.read', { scope: 'clinic', clinicId: 'clinic-a', branchId: 'branch-a' }).next).toHaveBeenCalledOnce();
    expect(runPermission('branch_manager', 'branch.read', { scope: 'branch', clinicId: 'clinic-a', branchId: 'branch-a' }).next).toHaveBeenCalledOnce();
    expect(runPermission('branch_manager', 'clinic.settings.manage', { scope: 'branch', clinicId: 'clinic-a', branchId: 'branch-a' }).next).not.toHaveBeenCalled();
  });

  it('uses tenant custom-role permissions and enforces their declared scope', () => {
    expect(runPermission('custom', 'branch.read', { scope: 'branch', customPermissions: ['branch.read'] }).next).toHaveBeenCalledOnce();
    expect(runPermission('custom', 'clinic.settings.manage', { scope: 'branch', customPermissions: ['branch.read'] }).next).not.toHaveBeenCalled();
    expect(runPermission('custom', 'branch.read', { scope: 'branch', customPermissions: [] }).next).not.toHaveBeenCalled();
  });

  it('applies direct grants and denials without escaping the membership scope', () => {
    expect(runPermission('staff', 'branch.schedule.manage', {
      scope: 'branch', permissionOverrides: { allow: ['branch.schedule.manage'], deny: [] },
    }).next).toHaveBeenCalledOnce();
    expect(runPermission('branch_manager', 'branch.read', {
      scope: 'branch', permissionOverrides: { allow: [], deny: ['branch.read'] },
    }).next).not.toHaveBeenCalled();
  });

  it('does not grant permissions to unknown roles', () => {
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
    const allowed = await run('custom_role', 'branch.holidays.read', { roleId: 'role-a', clinicId: 'clinic-a', branchId: 'branch-a' });
    expect(allowed.next).toHaveBeenCalledOnce();
    const denied = await run('custom_role', 'branch.holidays.read', { roleId: 'role-a', clinicId: 'clinic-b', branchId: 'branch-a' });
    expect(denied.next).not.toHaveBeenCalled();
    expect(denied.res.status).toHaveBeenCalledWith(403);
  });

  it('prevents clinic-scoped memberships from addressing another clinic by route parameter', async () => {
    const denied = await run('clinic_manager', 'clinic.settings.read', { clinicId: 'clinic-a', membershipScope: 'clinic', membershipClinicId: 'clinic-a', resourceClinicId: 'clinic-b' });
    expect(denied.next).not.toHaveBeenCalled();
    expect(denied.res.status).toHaveBeenCalledWith(403);
  });

  it('rejects a branch resource that does not belong to the active tenant', async () => {
    membershipFindOne.mockReturnValue(query({ role: 'tenant_owner', roleId: null, scope: 'tenant', clinicId: null }));
    branchFindOne.mockReturnValue(query(null));
    const req = {
      auth: { userId: 'user-a' }, params: { branchId: 'branch-from-another-tenant' }, query: {},
      tenantContext: { tenantId: 'tenant-a', clinicId: null, branchId: null },
    } as any;
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as any;
    const next = vi.fn();
    await requireTenantPermission('branch.read')(req, res, next);
    expect(branchFindOne).toHaveBeenCalledWith({
      _id: 'branch-from-another-tenant', tenantId: 'tenant-a',
    });
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('denies a custom role without an active role record', async () => {
    membershipFindOne.mockReturnValue(query({ role: 'custom_role', roleId: 'role-a', scope: 'branch', clinicId: 'clinic-a' }));
    roleFindOne.mockReturnValue(query(null));
    branchFindOne.mockReturnValue(query({ clinicId: 'clinic-a' }));
    const req = { auth: { userId: 'user-a' }, params: {}, query: {}, tenantContext: { tenantId: 'tenant-a', clinicId: 'clinic-a', branchId: 'branch-a' } } as any;
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as any;
    const next = vi.fn();
    await requireTenantPermission('branch.read')(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
  });
});
