import { describe, expect, it } from 'vitest';
import { getTenantRolePermissions } from '../../src/modules/tenancy/services/tenant-access.service.js';

describe('branch manager permissions', () => {
  it('allows branch managers to read and update their own branch settings and schedule', () => {
    const permissions = getTenantRolePermissions('branch_manager');

    expect(permissions).toContain('branch.read');
    expect(permissions).toContain('branch.update');
    expect(permissions).toContain('branch.holidays.read');
    expect(permissions).toContain('branch.holidays.manage');
  });

  it('does not grant branch managers lifecycle or cross-branch management permissions', () => {
    const permissions = getTenantRolePermissions('branch_manager');

    expect(permissions).not.toContain('branch.lifecycle.manage');
    expect(permissions).not.toContain('branch.manage');
    expect(permissions).not.toContain('clinic.manage');
    expect(permissions).not.toContain('*');
  });
});
