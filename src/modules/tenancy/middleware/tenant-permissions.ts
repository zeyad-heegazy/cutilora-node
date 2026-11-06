import type { NextFunction, Request, Response } from 'express';
import { hasPermission, hasScopedPermission, type PermissionGrant } from '../../../shared/authorization/permission.engine.js';
import { TenantMembership } from '../models/tenant-membership.model.js';
import { TenantRole } from '../models/tenant-role.model.js';
import { Branch } from '../models/branch.model.js';
import { Subscription } from '../models/subscription.model.js';
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
      let resourceClinicId = String(req.params.clinicId ?? req.query.clinicId ?? context.clinicId ?? membership.clinicId ?? '') || null;
      let resourceBranchId = String(req.params.branchId ?? req.query.branchId ?? context.branchId ?? '') || null;
      if (resourceBranchId) {
        const branch = await Branch.findOne({ _id: resourceBranchId, tenantId: context.tenantId }).select('clinicId').lean() as any;
        if (!branch) return res.status(404).json({ success: false, error: { code: 'BRANCH_NOT_FOUND', message: 'Branch not found in this tenant.' } });
        const branchClinicId = String(branch.clinicId);
        if (resourceClinicId && resourceClinicId !== branchClinicId) return res.status(403).json({ success: false, error: { code: 'BRANCH_SCOPE_DENIED', message: 'The selected branch does not belong to the requested clinic.' } });
        resourceClinicId = branchClinicId;
      }
      if (membership.scope === 'clinic' && resourceClinicId && String(membership.clinicId) !== resourceClinicId) {
        return res.status(403).json({ success: false, error: { code: 'CLINIC_ACCESS_DENIED', message: 'You do not have access to this clinic resource.' } });
      }
      if (membership.scope === 'branch') {
        const allowedBranches = (membership.branchIds ?? []).map((id: unknown) => String(id));
        if (!resourceClinicId || String(membership.clinicId) !== resourceClinicId || !resourceBranchId || !allowedBranches.includes(resourceBranchId)) {
          return res.status(403).json({ success: false, error: { code: 'BRANCH_ACCESS_DENIED', message: 'You do not have access to this branch resource.' } });
        }
      }
      if (membership.roleId) {
        const role = await TenantRole.findOne({ _id: membership.roleId, tenantId: context.tenantId, status: 'active' }).select('permissions scope').lean() as any;
        const requestedScope = resourceBranchId ? 'branch' : resourceClinicId ? 'clinic' : 'tenant';
        const grants = (role?.permissions ?? []) as PermissionGrant[];
        if (!role || !hasScopedPermission(grants, permission, { scope: requestedScope, clinicId: resourceClinicId, branchId: resourceBranchId })) {
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

export function requireTenantFeature(feature: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const context = req.tenantContext;
      if (!context) return res.status(403).json({
        success: false,
        error: { code: 'TENANT_FEATURE_DENIED', message: `Subscription feature required: ${feature}.` },
      });
      const subscription = await Subscription.findOne({ tenantId: context.tenantId }).select('plan.features').lean() as any;
      if (!subscription?.plan?.features?.includes(feature)) return res.status(403).json({
        success: false,
        error: { code: 'SUBSCRIPTION_FEATURE_REQUIRED', message: `The current plan does not include the ${feature} feature.`, details: { feature } },
      });
      next();
    } catch (error) { next(error); }
  };
}
