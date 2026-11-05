import type { NextFunction, Request, Response } from 'express';
import { hasPermission, hasScopedPermission, type PermissionGrant } from '../../../shared/authorization/permission.engine.js';
import { TenantMembership } from '../models/tenant-membership.model.js';
import { TenantRole } from '../models/tenant-role.model.js';
import { getTenantRolePermissions } from '../services/tenant-access.service.js';
export { getTenantRoleCatalog, getTenantRolePermissions, TENANT_ROLE_PERMISSIONS } from '../services/tenant-access.service.js';

export function requireTenantPermission(permission: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const context = req.tenantContext;
      if (!context || !req.auth?.userId) return res.status(403).json({
        success: false,
        error: { code: 'TENANT_PERMISSION_DENIED', message: `Missing tenant permission: ${permission}.` },
      });
      const membership = await TenantMembership.findOne({
        userId: req.auth.userId,
        tenantId: context.tenantId,
        status: 'active',
        ...(context.clinicId ? { $or: [{ clinicId: context.clinicId }, { clinicId: null }] } : { clinicId: null }),
      }).sort({ clinicId: context.clinicId ? -1 : 1 }).select('role roleId scope clinicId branchIds').lean() as any;
      if (!membership) return res.status(403).json({
        success: false,
        error: { code: 'TENANT_PERMISSION_DENIED', message: `Missing tenant permission: ${permission}.` },
      });
      if (membership.roleId) {
        const role = await TenantRole.findOne({ _id: membership.roleId, tenantId: context.tenantId, status: 'active' }).select('permissions scope').lean() as any;
        const requestedScope = context.branchId ? 'branch' : context.clinicId ? 'clinic' : 'tenant';
        const grants = (role?.permissions ?? []) as PermissionGrant[];
        if (!role || !hasScopedPermission(grants, permission, { scope: requestedScope, clinicId: context.clinicId, branchId: context.branchId })) {
          return res.status(403).json({
            success: false,
            error: { code: 'TENANT_PERMISSION_DENIED', message: `Missing tenant permission: ${permission} at the selected scope.` },
          });
        }
        return next();
      }
      if (!hasPermission(getTenantRolePermissions(membership.role), permission)) {
        return res.status(403).json({
          success: false,
          error: { code: 'TENANT_PERMISSION_DENIED', message: `Missing tenant permission: ${permission}.` },
        });
      }
      next();
    } catch (error) { next(error); }
  };
}
