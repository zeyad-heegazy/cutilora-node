import type { Request, Response, NextFunction } from 'express';
import { grantSchema, createRoleSchema, updateRoleSchema, cloneRoleSchema, assignRoleSchema } from '../validation/tenant-roles.validation.js';
import { tenantRolesService, TENANT_PERMISSION_CATALOG, TENANT_ROLE_TEMPLATES } from '../services/tenant-roles.service.js';
import { getTenantRoleCatalog } from '../services/tenant-access.service.js';

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
    try { res.json({ success: true, data: { templates: getTenantRoleCatalog(req.tenantContext!.role), suggestedTemplates: TENANT_ROLE_TEMPLATES.map((template) => ({ id: `template:${template.key}`, ...template })), customRoles: await tenantRolesService.list(req.tenantContext!.tenantId) } }); }
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
