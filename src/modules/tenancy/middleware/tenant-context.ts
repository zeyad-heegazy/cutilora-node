import type { NextFunction, Request, Response } from 'express';
import { Types } from 'mongoose';
import { tenancyRepository } from '../repositories/tenancy.repository.js';

const deny = (res: Response, status: number, code: string, message: string) =>
  res.status(status).json({ success: false, error: { code, message } });

const isValidId = (value: string) => Types.ObjectId.isValid(value) && /^[a-f\d]{24}$/i.test(value);

export async function resolveTenantContext(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.auth) return deny(res, 401, 'UNAUTHENTICATED', 'Authentication required.');

    const tenantId = req.header('x-tenant-id');
    const clinicId = req.header('x-clinic-id') || null;
    const branchId = req.header('x-branch-id') || null;

    if (!tenantId) return deny(res, 400, 'TENANT_CONTEXT_REQUIRED', 'Select a tenant using X-Tenant-Id.');
    if (!isValidId(tenantId)) return deny(res, 400, 'INVALID_TENANT_ID', 'X-Tenant-Id must be a valid identifier.');
    if (clinicId && !isValidId(clinicId)) return deny(res, 400, 'INVALID_CLINIC_ID', 'X-Clinic-Id must be a valid identifier.');
    if (branchId && !isValidId(branchId)) return deny(res, 400, 'INVALID_BRANCH_ID', 'X-Branch-Id must be a valid identifier.');
    if (branchId && !clinicId) return deny(res, 400, 'CLINIC_CONTEXT_REQUIRED', 'A branch context requires X-Clinic-Id.');

    const membership = await tenancyRepository.findMembership(req.auth.userId, tenantId, clinicId);
    if (!membership) return deny(res, 403, 'TENANT_ACCESS_DENIED', 'You do not have access to this tenant and scope.');
    if (!await tenancyRepository.findActiveTenant(tenantId)) return deny(res, 403, 'TENANT_UNAVAILABLE', 'This tenant is unavailable.');

    // Tenant memberships may select any clinic. Clinic and branch memberships must
    // explicitly select the clinic they belong to.
    if (membership.scope !== 'tenant') {
      if (!clinicId || String(membership.clinicId) !== clinicId) {
        return deny(res, 403, 'CLINIC_ACCESS_DENIED', 'You do not have access to this clinic scope.');
      }
    }

    if (clinicId && !await tenancyRepository.findActiveClinic(clinicId, tenantId)) {
      return deny(res, 404, 'CLINIC_NOT_FOUND', 'Clinic not found in this tenant.');
    }

    if (membership.scope === 'branch') {
      if (!branchId) return deny(res, 400, 'BRANCH_CONTEXT_REQUIRED', 'Select an authorized branch using X-Branch-Id.');
      const allowed = (membership.branchIds || []).map((id: unknown) => String(id));
      if (!allowed.includes(branchId)) return deny(res, 403, 'BRANCH_ACCESS_DENIED', 'You do not have access to this branch.');
    }

    if (branchId) {
      if (!await tenancyRepository.findActiveBranch(branchId, tenantId, clinicId!)) {
        return deny(res, 404, 'BRANCH_NOT_FOUND', 'Branch not found in this clinic.');
      }
    }

    let customPermissions: string[] | undefined;
    if (membership.role === 'custom') {
      if (!membership.customRoleId) return deny(res, 403, 'CUSTOM_ROLE_UNAVAILABLE', 'The assigned custom role is unavailable.');
      const customRole = await tenancyRepository.findActiveTenantRoleById(tenantId, String(membership.customRoleId));
      if (!customRole || customRole.scope !== membership.scope) return deny(res, 403, 'CUSTOM_ROLE_UNAVAILABLE', 'The assigned custom role is unavailable for this membership scope.');
      customPermissions = customRole.permissions ?? [];
    }
    req.tenantContext = {
      tenantId, clinicId, branchId, role: membership.role, scope: membership.scope,
      membershipId: String(membership._id),
      customRoleId: membership.customRoleId ? String(membership.customRoleId) : null,
      ...(customPermissions ? { customPermissions } : {}),
      permissionOverrides: { allow: membership.permissionOverrides?.allow ?? [], deny: membership.permissionOverrides?.deny ?? [] },
    };
    req.tenantId = tenantId;
    req.auth.activeClinicId = clinicId;
    req.auth.clinicRole = membership.role;
    next();
  } catch (error) {
    next(error);
  }
}

export function requireTenantRoles(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.tenantContext || !roles.includes(req.tenantContext.role)) {
      return deny(res, 403, 'FORBIDDEN', 'Insufficient tenant permissions.');
    }
    next();
  };
}

export function requireTenantScope(req: Request, res: Response, next: NextFunction) {
  if (!req.tenantContext || req.tenantContext.scope !== 'tenant') {
    return deny(res, 403, 'TENANT_SCOPE_REQUIRED', 'This operation requires tenant-wide access.');
  }
  next();
}
