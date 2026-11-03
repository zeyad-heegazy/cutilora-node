import type { NextFunction, Request, Response } from 'express';
import { Tenant, Clinic, Branch } from './tenancy.models.js';
import { TenantMembership } from '../auth/auth.models.js';

const deny = (res: Response, status: number, code: string, message: string) =>
  res.status(status).json({ success: false, error: { code, message } });

export async function resolveTenantContext(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.auth) return deny(res, 401, 'UNAUTHENTICATED', 'Authentication required.');
    const tenantId = req.header('x-tenant-id');
    const clinicId = req.header('x-clinic-id') || null;
    const branchId = req.header('x-branch-id') || null;
    if (!tenantId) return deny(res, 400, 'TENANT_CONTEXT_REQUIRED', 'Select a tenant using X-Tenant-Id.');

    const membership = await TenantMembership.findOne({
      userId: req.auth.userId,
      tenantId,
      status: 'active',
      ...(clinicId ? { $or: [{ clinicId }, { clinicId: null }] } : { clinicId: null }),
    }).sort({ clinicId: clinicId ? -1 : 1 }).select('role scope tenantId clinicId branchIds');
    if (!membership) return deny(res, 403, 'TENANT_ACCESS_DENIED', 'You do not have access to this tenant and scope.');

    const tenant = await Tenant.findOne({ _id: tenantId, status: 'active' }).select('_id');
    if (!tenant) return deny(res, 403, 'TENANT_UNAVAILABLE', 'This tenant is unavailable.');

    if (clinicId) {
      const clinic = await Clinic.findOne({ _id: clinicId, tenantId, status: 'active' }).select('_id');
      if (!clinic) return deny(res, 404, 'CLINIC_NOT_FOUND', 'Clinic not found in this tenant.');
    }
    if (branchId) {
      if (!clinicId) return deny(res, 400, 'CLINIC_CONTEXT_REQUIRED', 'A branch context requires X-Clinic-Id.');
      const branch = await Branch.findOne({ _id: branchId, tenantId, clinicId, status: 'active' }).select('_id');
      if (!branch) return deny(res, 404, 'BRANCH_NOT_FOUND', 'Branch not found in this clinic.');
      const allowedBranches = (membership.branchIds || []).map((id: unknown) => String(id));
      if (membership.scope === 'branch' && !allowedBranches.includes(branchId)) return deny(res, 403, 'BRANCH_ACCESS_DENIED', 'You do not have access to this branch.');
    }

    req.tenantContext = { tenantId: String(tenantId), clinicId, branchId, role: membership.role, scope: membership.scope };
    req.tenantId = String(tenantId);
    req.auth.activeClinicId = clinicId;
    req.auth.clinicRole = membership.role;
    next();
  } catch (error) { next(error); }
}

export function requireTenantRoles(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.tenantContext || !roles.includes(req.tenantContext.role)) return deny(res, 403, 'FORBIDDEN', 'Insufficient tenant permissions.');
    next();
  };
}
