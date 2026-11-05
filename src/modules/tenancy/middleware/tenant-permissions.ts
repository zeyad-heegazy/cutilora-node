import type { NextFunction, Request, Response } from 'express';
import { TENANT_ROLE_PERMISSIONS } from '../services/tenant-access.service.js';
export { getTenantRoleCatalog, getTenantRolePermissions, TENANT_ROLE_PERMISSIONS } from '../services/tenant-access.service.js';

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
