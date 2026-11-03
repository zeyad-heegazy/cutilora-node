import type { NextFunction, Request, Response } from 'express';
import { tenancyRepository } from '../repositories/tenancy.repository.js';
const deny = (res: Response, status: number, code: string, message: string) => res.status(status).json({ success: false, error: { code, message } });

export async function resolveTenantContext(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.auth) return deny(res, 401, 'UNAUTHENTICATED', 'Authentication required.');
    const tenantId = req.header('x-tenant-id'), clinicId = req.header('x-clinic-id') || null, branchId = req.header('x-branch-id') || null;
    if (!tenantId) return deny(res, 400, 'TENANT_CONTEXT_REQUIRED', 'Select a tenant using X-Tenant-Id.');
    const membership = await tenancyRepository.findMembership(req.auth.userId, tenantId, clinicId);
    if (!membership) return deny(res, 403, 'TENANT_ACCESS_DENIED', 'You do not have access to this tenant and scope.');
    if (!await tenancyRepository.findActiveTenant(tenantId)) return deny(res, 403, 'TENANT_UNAVAILABLE', 'This tenant is unavailable.');
    if (clinicId && !await tenancyRepository.findActiveClinic(clinicId, tenantId)) return deny(res, 404, 'CLINIC_NOT_FOUND', 'Clinic not found in this tenant.');
    if (branchId) {
      if (!clinicId) return deny(res, 400, 'CLINIC_CONTEXT_REQUIRED', 'A branch context requires X-Clinic-Id.');
      if (!await tenancyRepository.findActiveBranch(branchId, tenantId, clinicId)) return deny(res, 404, 'BRANCH_NOT_FOUND', 'Branch not found in this clinic.');
      const allowed = (membership.branchIds || []).map((id: unknown) => String(id));
      if (membership.scope === 'branch' && !allowed.includes(branchId)) return deny(res, 403, 'BRANCH_ACCESS_DENIED', 'You do not have access to this branch.');
    }
    req.tenantContext = { tenantId, clinicId, branchId, role: membership.role, scope: membership.scope };
    req.tenantId = tenantId; req.auth.activeClinicId = clinicId; req.auth.clinicRole = membership.role;
    next();
  } catch (error) { next(error); }
}
export function requireTenantRoles(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.tenantContext || !roles.includes(req.tenantContext.role)) return deny(res, 403, 'FORBIDDEN', 'Insufficient tenant permissions.');
    next();
  };
}