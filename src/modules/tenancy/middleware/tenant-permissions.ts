import type { NextFunction, Request, Response } from 'express';

export const TENANT_ROLE_PERMISSIONS: Record<string, readonly string[]> = {
  tenant_owner: ['*'],
  tenant_admin: [
    'organization.manage', 'dashboard.read', 'clinic.manage', 'clinic.settings.read', 'clinic.settings.manage', 'branch.manage',
    'branch.update', 'branch.lifecycle.manage', 'branch.read', 'branch.holidays.read', 'branch.holidays.manage',
    'documents.manage', 'configuration.manage', 'memberships.manage', 'audit.read', 'billing.read',
  ],
  billing_admin: ['billing.read'],
  clinic_admin: ['clinic.settings.read', 'clinic.settings.manage', 'branch.read', 'branch.manage', 'branch.update', 'branch.holidays.read', 'branch.holidays.manage'],
  clinic_manager: ['clinic.settings.read', 'clinic.settings.manage', 'branch.read', 'branch.manage', 'branch.update', 'branch.holidays.read', 'branch.holidays.manage'],
  branch_manager: ['branch.read', 'branch.holidays.read', 'branch.holidays.manage'],
  staff: ['branch.read', 'branch.holidays.read'],
  provider: ['branch.read', 'branch.holidays.read'],
  receptionist: ['branch.read', 'branch.holidays.read'],
};

export function getTenantRolePermissions(role: string): string[] {
  const permissions = TENANT_ROLE_PERMISSIONS[role] ?? [];
  return permissions.includes('*') ? ['*'] : [...permissions];
}

export function requireTenantPermission(permission: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const role = req.tenantContext?.role;
    const permissions = role ? TENANT_ROLE_PERMISSIONS[role] ?? [] : [];
    if (!req.tenantContext || (!permissions.includes('*') && !permissions.includes(permission))) {
      return res.status(403).json({
        success: false,
        error: { code: 'TENANT_PERMISSION_DENIED', message: `Missing tenant permission: ${permission}.` },
      });
    }
    next();
  };
}
