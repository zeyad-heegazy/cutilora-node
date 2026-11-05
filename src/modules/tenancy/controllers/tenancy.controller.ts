import type { Request, Response, NextFunction } from 'express';
import { tenancyService } from '../services/tenancy.service.js';
import { createBranchSchema, createClinicSchema, updateBranchSchema, updateClinicSchema, updateTenantSchema, updateTenantPreferencesSchema } from '../validations/tenancy.validation.js';
import { clinicGeoListSchema, geoResourceSchema } from '../../geo/validations/geo.validation.js';

export const tenancyController = {
  async getProfile(req: Request, res: Response, next: NextFunction) {
    try {
      const item = await tenancyService.getProfile(req.tenantContext!.tenantId);
      if (!item) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Tenant profile not found.' } });
      res.json({ success: true, data: item });
    } catch (e) { next(e); }
  },
  async updateProfile(req: Request, res: Response, next: NextFunction) {
    try {
      const input = updateTenantSchema.parse(req.body);
      if (req.tenantContext!.role !== 'tenant_owner' && ('legalName' in input || 'legal' in input)) {
        return res.status(403).json({ success: false, error: { code: 'LEGAL_PROFILE_PERMISSION_REQUIRED', message: 'Only the Tenant Owner can change legal identity details.' } });
      }
      const item = await tenancyService.updateProfile(req.tenantContext!.tenantId, req.auth!.userId, input);
      if (!item) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Tenant profile not found.' } });
      res.json({ success: true, data: item });
    } catch (e) { next(e); }
  },
  async getPreferences(req: Request, res: Response, next: NextFunction) {
    try {
      const item = await tenancyService.getProfile(req.tenantContext!.tenantId);
      if (!item) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Tenant profile not found.' } });
      res.json({ success: true, data: item.preferences });
    } catch (e) { next(e); }
  },
  async updatePreferences(req: Request, res: Response, next: NextFunction) {
    try {
      const input = updateTenantPreferencesSchema.parse(req.body);
      if (!input.preferences) return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Preferences are required.' } });
      const item = await tenancyService.updatePreferences(req.tenantContext!.tenantId, req.auth!.userId, input.preferences);
      if (!item) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Tenant profile not found.' } });
      res.json({ success: true, data: item.preferences });
    } catch (e) { next(e); }
  },
  async listGeo(req: Request, res: Response, next: NextFunction) {
    try {
      const resource = geoResourceSchema.parse(req.params.resource);
      const query = clinicGeoListSchema.parse(req.query);
      res.json({ success: true, ...await tenancyService.listGeo(resource, query) });
    } catch (e) { next(e); }
  },
  async context(req: Request, res: Response, next: NextFunction) {
    try {
      const [tenant, clinic, branch] = await tenancyService.getContext(req.tenantContext!);
      res.json({ success: true, data: { tenant, clinic, branch, access: req.tenantContext } });
    } catch (e) { next(e); }
  },
  async listClinics(req: Request, res: Response, next: NextFunction) {
    try { res.json({ success: true, data: await tenancyService.listClinics(req.tenantContext!.tenantId) }); } catch (e) { next(e); }
  },
  async getClinic(req: Request, res: Response, next: NextFunction) {
    try {
      const item = await tenancyService.getClinic(String(req.params.clinicId ?? ''), req.tenantContext!.tenantId);
      if (!item) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Clinic not found.' } });
      res.json({ success: true, data: item });
    } catch (e) { next(e); }
  },
  async createClinic(req: Request, res: Response, next: NextFunction) {
    try {
      const input = createClinicSchema.parse(req.body);
      res.status(201).json({ success: true, data: await tenancyService.createClinic(input, req.tenantContext!.tenantId) });
    } catch (e) { next(e); }
  },
  async updateClinic(req: Request, res: Response, next: NextFunction) {
    try {
      const input = updateClinicSchema.parse(req.body);
      const item = await tenancyService.updateClinic(String(req.params.clinicId ?? ''), input, req.tenantContext!.tenantId);
      if (!item) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Clinic not found.' } });
      res.json({ success: true, data: item });
    } catch (e) { next(e); }
  },
  async listBranches(req: Request, res: Response, next: NextFunction) {
    try {
      const context = req.tenantContext!;
      if (!context.clinicId) return res.status(400).json({ success: false, error: { code: 'CLINIC_CONTEXT_REQUIRED', message: 'Select a clinic using X-Clinic-Id.' } });
      res.json({ success: true, data: await tenancyService.listBranches(context.tenantId, context.clinicId, context.branchId) });
    } catch (e) { next(e); }
  },
  async getBranch(req: Request, res: Response, next: NextFunction) {
    try {
      const context = req.tenantContext!;
      if (!context.clinicId) return res.status(400).json({ success: false, error: { code: 'CLINIC_CONTEXT_REQUIRED', message: 'Select a clinic using X-Clinic-Id.' } });
      const branchId = String(req.params.branchId ?? '');
      if (context.scope === 'branch' && context.branchId !== branchId) {
        return res.status(403).json({ success: false, error: { code: 'BRANCH_ACCESS_DENIED', message: 'You do not have access to this branch.' } });
      }
      const item = await tenancyService.getBranch(branchId, context.tenantId, context.clinicId);
      if (!item) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Branch not found.' } });
      res.json({ success: true, data: item });
    } catch (e) { next(e); }
  },
  async createBranch(req: Request, res: Response, next: NextFunction) {
    try {
      const context = req.tenantContext!;
      if (!context.clinicId) return res.status(400).json({ success: false, error: { code: 'CLINIC_CONTEXT_REQUIRED', message: 'Select a clinic using X-Clinic-Id.' } });
      const input = createBranchSchema.parse(req.body);
      const item = await tenancyService.createBranch(input, context.tenantId, context.clinicId);
      if (!item) return res.status(404).json({ success: false, error: { code: 'CLINIC_NOT_FOUND', message: 'Clinic not found.' } });
      res.status(201).json({ success: true, data: item });
    } catch (e) { next(e); }
  },
  async updateBranch(req: Request, res: Response, next: NextFunction) {
    try {
      const context = req.tenantContext!;
      if (!context.clinicId) return res.status(400).json({ success: false, error: { code: 'CLINIC_CONTEXT_REQUIRED', message: 'Select a clinic using X-Clinic-Id.' } });
      const branchId = String(req.params.branchId ?? '');
      if (context.scope === 'branch' && context.branchId !== branchId) {
        return res.status(403).json({ success: false, error: { code: 'BRANCH_ACCESS_DENIED', message: 'You do not have access to this branch.' } });
      }
      const input = updateBranchSchema.parse(req.body);
      if (context.scope === 'branch' && 'status' in input) {
        return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Branch managers cannot change branch lifecycle status.' } });
      }
      const item = await tenancyService.updateBranch(branchId, input, context.tenantId, context.clinicId);
      if (!item) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Branch not found.' } });
      res.json({ success: true, data: item });
    } catch (e) { next(e); }
  },
};
