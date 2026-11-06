import type { NextFunction, Request, Response } from 'express';
import { hasScopedPermission } from '../../../shared/authorization/permission.engine.js';
import { getTenantRoleGrants } from '../services/tenant-access.service.js';
import { Subscription } from '../models/subscription.model.js';

export {
  getTenantRoleCatalog,
  getTenantRolePermissions,
  getTenantRoleGrants,
  TENANT_ROLE_PERMISSIONS,
} from '../services/tenant-access.service.js';

export function requireTenantPermission(permission: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const context = req.tenantContext;
      if (!context) {
        return res.status(403).json({
          success: false,
          error: { code: 'TENANT_PERMISSION_DENIED', message: `Missing tenant permission: ${permission}.` },
        });
      }

      // Resource identifiers may narrow the requested scope beyond the active
      // tenant context. Grants remain bound to the membership's authorized scope.
      const clinicId = String(req.params.clinicId ?? req.query.clinicId ?? context.clinicId ?? '') || null;
      const branchId = String(req.params.branchId ?? req.query.branchId ?? context.branchId ?? '') || null;
      const requestedScope = branchId
        ? { scope: 'branch' as const, clinicId, branchId }
        : clinicId
          ? { scope: 'clinic' as const, clinicId }
          : { scope: 'tenant' as const };

      const grants = getTenantRoleGrants(context.role, context);
      if (!hasScopedPermission(grants, permission, requestedScope)) {
        return res.status(403).json({
          success: false,
          error: { code: 'TENANT_PERMISSION_DENIED', message: `Missing tenant permission: ${permission} at the selected scope.` },
        });
      }

      return next();
    } catch (error) {
      return next(error);
    }
  };
}

export function requireTenantFeature(feature: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const context = req.tenantContext;
      if (!context) {
        return res.status(403).json({
          success: false,
          error: { code: 'TENANT_FEATURE_DENIED', message: `Subscription feature required: ${feature}.` },
        });
      }

      const subscription = await Subscription.findOne({
        tenantId: context.tenantId,
        status: { $in: ['active', 'trialing', 'past_due'] },
      }).select('plan.features status paymentRecovery.gracePeriodEndsAt').lean() as any;

      const gracePeriodEndsAt = subscription?.paymentRecovery?.gracePeriodEndsAt;
      const withinGrace = subscription?.status !== 'past_due'
        || Boolean(gracePeriodEndsAt && new Date(gracePeriodEndsAt).getTime() > Date.now());

      if (!subscription?.plan?.features?.includes(feature) || !withinGrace) {
        return res.status(403).json({
          success: false,
          error: {
            code: 'SUBSCRIPTION_FEATURE_REQUIRED',
            message: `The current plan does not include the ${feature} feature.`,
            details: { feature },
          },
        });
      }

      return next();
    } catch (error) {
      return next(error);
    }
  };
}
