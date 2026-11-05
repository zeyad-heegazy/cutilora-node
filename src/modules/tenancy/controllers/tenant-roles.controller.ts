import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { tenantRolesService, TENANT_PERMISSION_CATALOG } from '../services/tenant-roles.service.js';
import { getTenantRoleCatalog } from '../services/tenant-access.service.js';

const grantSchema = z.object({
  permission: z.string().trim().min(3).max(120),
  scope: z.enum(['tenant', 'clinic', 'branch']),
  clinicId: z.string().regex(/^[a-fA-F0-9]{24}$/).nullable().optional(),
  branchId: z.string().regex(/^[a-fA-F0-9]{24}$/).nullable().optional(),
});
const createRoleSchema = z.object({
  key: z.string().trim().min(2).max(80).optional(),
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(500).optional(),
  scope: z.enum(['tenant', 'clinic', 'branch']),
  permissions: z.array(grantSchema).max(200),
});
const updateRoleSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  description: z.string().trim().max(500).optional(),
  scope: z.enum(['tenant', 'clinic', 'branch']).optional(),
  permissions: z.array(grantSchema).max(200).optional(),
}).refine((value) => Object.keys(value).length > 0, 'At least one role field must be provided.');
const cloneRoleSchema = z.object({
  key: z.string().trim().min(2).max(80),
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(500).optional(),
});
const assignRoleSchema = z.object({ roleId: z.string().regex(/^[a-fA-F0-9]{24}$/) });

function actor(req: Request) {
  return {
    tenantId: req.tenantContext!.tenantId,
    actorId: req.auth!.userId,
    clinicId: req.tenantContext!.clinicId ?? null,
    actorRole: req.tenantContext!.role,
  };
}

export const tenantRolesController = {
  async catalog(_req: Request, res: Response) {
    res.json({ success: true, data: TENANT_PERMISSION_CATALOG });
  },
  async list(req: Request, res: Response, next: NextFunction) {
    try { res.json({ success: true, data: { templates: getTenantRoleCatalog(req.tenantContext!.role), customRoles: await tenantRolesService.list(req.tenantContext!.tenantId) } }); }
    catch (error) { next(error); }
  },
  async get(req: Request, res: Response, next: NextFunction) {
    try {
      const role = await tenantRolesService.get(req.tenantContext!.tenantId, String(req.params.roleId ?? ''));
      if (!role) return res.status(404).json({ success: false, error: { code: 'ROLE_NOT_FOUND', message: 'Role not found.' } });
      res.json({ success: true, data: role });
    } catch (error) { next(error); }
  },
  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const input = createRoleSchema.parse(req.body);
      const a = actor(req);
      res.status(201).json({ success: true, data: await tenantRolesService.create(a.tenantId, a.actorId, a.clinicId, input) });
    } catch (error) { next(error); }
  },
  async update(req: Request, res: Response, next: NextFunction) {
    try {
      const input = updateRoleSchema.parse(req.body);
      const a = actor(req);
      const role = await tenantRolesService.update(a.tenantId, a.actorId, a.clinicId, String(req.params.roleId ?? ''), input);
      if (!role) return res.status(404).json({ success: false, error: { code: 'ROLE_NOT_FOUND', message: 'Active role not found.' } });
      res.json({ success: true, data: role });
    } catch (error) { next(error); }
  },
  async clone(req: Request, res: Response, next: NextFunction) {
    try {
      const input = cloneRoleSchema.parse(req.body);
      const a = actor(req);
      const role = await tenantRolesService.clone(a.tenantId, a.actorId, a.clinicId, String(req.params.roleId ?? ''), input);
      if (!role) return res.status(404).json({ success: false, error: { code: 'ROLE_NOT_FOUND', message: 'Active source role not found.' } });
      res.status(201).json({ success: true, data: role });
    } catch (error) { next(error); }
  },
  async deactivate(req: Request, res: Response, next: NextFunction) {
    try {
      const a = actor(req);
      const role = await tenantRolesService.deactivate(a.tenantId, a.actorId, String(req.params.roleId ?? ''));
      if (!role) return res.status(404).json({ success: false, error: { code: 'ROLE_NOT_FOUND', message: 'Active role not found.' } });
      res.json({ success: true, data: role });
    } catch (error) { next(error); }
  },
  async assign(req: Request, res: Response, next: NextFunction) {
    try {
      const input = assignRoleSchema.parse(req.body);
      const a = actor(req);
      const result = await tenantRolesService.assign(a.tenantId, a.actorId, a.actorRole, String(req.params.membershipId ?? ''), input.roleId);
      if (!result) return res.status(404).json({ success: false, error: { code: 'MEMBERSHIP_OR_ROLE_NOT_FOUND', message: 'Membership or role not found.' } });
      res.json({ success: true, data: result });
    } catch (error) { next(error); }
  },
  async currentAccess(req: Request, res: Response, next: NextFunction) {
    try {
      const a = actor(req);
      const access = await tenantRolesService.currentAccess(a.tenantId, a.actorId, a.clinicId, req.tenantContext!.branchId ?? null);
      if (!access) return res.status(404).json({ success: false, error: { code: 'TENANT_ACCESS_NOT_FOUND', message: 'Active tenant access not found.' } });
      res.json({ success: true, data: access });
    } catch (error) { next(error); }
  },
  async effectiveAccess(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await tenantRolesService.effectiveAccess(req.tenantContext!.tenantId, String(req.params.userId ?? ''));
      if (!result) return res.status(404).json({ success: false, error: { code: 'TENANT_USER_NOT_FOUND', message: 'User has no membership in this tenant.' } });
      res.json({ success: true, data: result });
    } catch (error) { next(error); }
  },
};
