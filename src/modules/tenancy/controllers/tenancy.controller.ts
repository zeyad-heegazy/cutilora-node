import type { Request, Response, NextFunction } from 'express';
import { tenancyService } from '../services/tenancy.service.js';
import { createBranchSchema, createClinicSchema, createTenantSchema, tenantStatusSchema } from '../validations/tenancy.validation.js';

export const tenancyController = {
  async listTenants(_req: Request, res: Response, next: NextFunction) { try { res.json({ success: true, data: await tenancyService.listTenants() }); } catch (error) { next(error); } },
  async createTenant(req: Request, res: Response, next: NextFunction) {
    try { const input = createTenantSchema.parse(req.body); res.status(201).json({ success: true, data: await tenancyService.createTenant(input) }); }
    catch (error) { next(error); }
  },
  async updateTenantStatus(req: Request, res: Response, next: NextFunction) {
    try {
      const { status } = tenantStatusSchema.parse(req.body);
      const tenant = await tenancyService.updateTenantStatus(String(req.params.tenantId ?? ''), status);
      if (!tenant) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Tenant not found.' } });
      res.json({ success: true, data: tenant });
    } catch (error) { next(error); }
  },
  async context(req: Request, res: Response, next: NextFunction) {
    try { const [tenant, clinic, branch] = await tenancyService.getContext(req.tenantContext!); res.json({ success: true, data: { tenant, clinic, branch, access: req.tenantContext } }); }
    catch (error) { next(error); }
  },
  async listClinics(req: Request, res: Response, next: NextFunction) {
    try { res.json({ success: true, data: await tenancyService.listClinics(req.tenantContext!.tenantId) }); } catch (error) { next(error); }
  },
  async createClinic(req: Request, res: Response, next: NextFunction) {
    try { const input = createClinicSchema.parse(req.body); res.status(201).json({ success: true, data: await tenancyService.createClinic(input, req.tenantContext!.tenantId) }); }
    catch (error) { next(error); }
  },
  async listBranches(req: Request, res: Response, next: NextFunction) {
    try {
      const context = req.tenantContext!;
      if (!context.clinicId) return res.status(400).json({ success: false, error: { code: 'CLINIC_CONTEXT_REQUIRED', message: 'Select a clinic using X-Clinic-Id.' } });
      res.json({ success: true, data: await tenancyService.listBranches(context.tenantId, context.clinicId, context.branchId) });
    } catch (error) { next(error); }
  },
  async createBranch(req: Request, res: Response, next: NextFunction) {
    try {
      const context = req.tenantContext!;
      if (!context.clinicId) return res.status(400).json({ success: false, error: { code: 'CLINIC_CONTEXT_REQUIRED', message: 'Select a clinic using X-Clinic-Id.' } });
      const input = createBranchSchema.parse(req.body);
      res.status(201).json({ success: true, data: await tenancyService.createBranch(input, context.tenantId, context.clinicId) });
    } catch (error) { next(error); }
  },
};