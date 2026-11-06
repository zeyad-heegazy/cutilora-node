import { hasPermission, hasScopedPermission, type PermissionGrant } from '../../src/shared/authorization/permission.engine.js';
import { describe, expect, it } from 'vitest';

describe('shared authorization permission engine', () => {
  it('denies by default and supports explicit and wildcard grants', () => {
    expect(hasPermission([], 'tenant.users.read')).toBe(false);
    expect(hasPermission(['tenant.users.read'], 'tenant.users.read')).toBe(true);
    expect(hasPermission(['tenant.users.read'], 'tenant.users.manage')).toBe(false);
    expect(hasPermission(['*'], 'platform.tenants.manage')).toBe(true);
  });

  it('applies tenant, clinic and branch grant boundaries', () => {
    const grants: PermissionGrant[] = [
      { permission: 'reports.read', scope: 'tenant' },
      { permission: 'finance.read', scope: 'clinic', clinicId: 'clinic-a' },
      { permission: 'branch.settings.manage', scope: 'branch', clinicId: 'clinic-a', branchId: 'branch-a' },
    ];

    expect(hasScopedPermission(grants, 'reports.read', { scope: 'branch', clinicId: 'clinic-b', branchId: 'branch-b' })).toBe(true);
    expect(hasScopedPermission(grants, 'finance.read', { scope: 'clinic', clinicId: 'clinic-a' })).toBe(true);
    expect(hasScopedPermission(grants, 'finance.read', { scope: 'clinic', clinicId: 'clinic-b' })).toBe(false);
    expect(hasScopedPermission(grants, 'branch.settings.manage', { scope: 'branch', clinicId: 'clinic-a', branchId: 'branch-a' })).toBe(true);
    expect(hasScopedPermission(grants, 'branch.settings.manage', { scope: 'branch', clinicId: 'clinic-a', branchId: 'branch-b' })).toBe(false);
    expect(hasScopedPermission(grants, 'branch.settings.manage', { scope: 'clinic', clinicId: 'clinic-a' })).toBe(false);
  });

  it('does not allow a platform grant to be used as a tenant grant', () => {
    expect(hasScopedPermission([{ permission: '*', scope: 'platform' }], 'tenant.users.read', { scope: 'tenant' })).toBe(false);
  });
});
