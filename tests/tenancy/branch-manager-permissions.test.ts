import { describe, expect, it } from 'vitest';
import { getTenantRolePermissions } from '../../src/modules/tenancy/services/tenant-access.service.js';

describe('branch manager permissions', () => {
  it('allows branch managers to read and manage their own branch schedule and settings', () => {
    const permissions = getTenantRolePermissions('branch_manager');

    expect(permissions).toContain('branch.read');
    expect(permissions).toContain('branch.schedule.manage');
    expect(permissions).toContain('branch.settings.manage');
    expect(permissions).toContain('branch.members.read');
    expect(permissions).not.toContain('branch.update');
    expect(permissions).toContain('branch.holidays.read');
    expect(permissions).toContain('branch.holidays.manage');
  });

  it('grants clinic managers branch schedule and settings management', () => {
    expect(getTenantRolePermissions('clinic_admin')).toContain('branch.schedule.manage');
    expect(getTenantRolePermissions('clinic_admin')).toContain('branch.settings.manage');
    expect(getTenantRolePermissions('clinic_manager')).toContain('branch.schedule.manage');
    expect(getTenantRolePermissions('clinic_manager')).toContain('branch.settings.manage');
  });

  it('grants clinic and branch activity feeds only to scoped managers', () => {
    expect(getTenantRolePermissions('tenant_admin')).toContain('clinic.activity.read');
    expect(getTenantRolePermissions('clinic_admin')).toContain('clinic.activity.read');
    expect(getTenantRolePermissions('clinic_manager')).toContain('clinic.activity.read');
    expect(getTenantRolePermissions('branch_manager')).not.toContain('clinic.activity.read');
    expect(getTenantRolePermissions('branch_manager')).toContain('branch.activity.read');
    expect(getTenantRolePermissions('staff')).not.toContain('branch.activity.read');
  });

  it('grants clinic-wide assigned-user visibility to clinic admins and managers', () => {
    expect(getTenantRolePermissions('clinic_admin')).toContain('clinic.members.read');
    expect(getTenantRolePermissions('clinic_manager')).toContain('clinic.members.read');
    expect(getTenantRolePermissions('tenant_admin')).toContain('clinic.members.read');
    expect(getTenantRolePermissions('branch_manager')).not.toContain('clinic.members.read');
  });

  it('grants clinic document access only to clinic administrators and managers', () => {
    expect(getTenantRolePermissions('clinic_admin')).toContain('clinic.documents.manage');
    expect(getTenantRolePermissions('clinic_manager')).toContain('clinic.documents.read');
    expect(getTenantRolePermissions('tenant_admin')).toContain('clinic.documents.manage');
    expect(getTenantRolePermissions('staff')).not.toContain('clinic.documents.read');
    expect(getTenantRolePermissions('branch_manager')).not.toContain('clinic.documents.read');
  });

  it('does not grant branch managers lifecycle or cross-branch management permissions', () => {
    const permissions = getTenantRolePermissions('branch_manager');

    expect(permissions).not.toContain('branch.lifecycle.manage');
    expect(permissions).not.toContain('branch.manage');
    expect(permissions).not.toContain('clinic.manage');
    expect(permissions).not.toContain('*');
  });
});
