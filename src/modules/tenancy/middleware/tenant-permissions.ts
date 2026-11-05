import type { NextFunction, Request, Response } from 'express';
import { hasPermission } from '../../../shared/authorization/permission.engine.js';
import { getTenantRolePermissions } from '../services/tenant-access.service.js';
export { getTenantRoleCatalog, getTenantRolePermissions, TENANT_ROLE_PERMISSIONS } from '../services/tenant-access.service.js';

export function requireTenantPermission(permission: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const role = req.tenantContext?.role;
    const permissions = role ? getTenantRolePermissions(role) : [];
    if (!req.tenantContext || !hasPermission(permissions, permission)) {
      return res.status(403).json({
        success: false,
        error: { code: 'TENANT_PERMISSION_DENIED', message: `Missing tenant permission: ${permission}.` },
      });
    }
    next();
  };
}
