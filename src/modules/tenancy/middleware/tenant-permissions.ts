import type { NextFunction, Request, Response } from 'express';
import { hasScopedPermission } from '../../../shared/authorization/permission.engine.js';
import { getTenantRoleGrants } from '../services/tenant-access.service.js';
export { getTenantRoleCatalog, getTenantRolePermissions, getTenantRoleGrants, TENANT_ROLE_PERMISSIONS } from '../services/tenant-access.service.js';

export function requireTenantPermission(permission: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const context = req.tenantContext;
    const grants = context ? getTenantRoleGrants(context.role, context) : [];
    const requestedScope = context?.branchId
      ? { scope: 'branch' as const, clinicId: context.clinicId, branchId: context.branchId }
      : context?.clinicId
        ? { scope: 'clinic' as const, clinicId: context.clinicId }
        : { scope: 'tenant' as const };

    if (!context || !hasScopedPermission(grants, permission, requestedScope)) {
      return res.status(403).json({
        success: false,
        error: { code: 'TENANT_PERMISSION_DENIED', message: `Missing tenant permission: ${permission}.` },
      });
    }
    next();
  };
}
