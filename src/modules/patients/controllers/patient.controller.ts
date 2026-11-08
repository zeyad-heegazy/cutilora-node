import type { Request, Response, NextFunction } from 'express';
import { getTenantRolePermissions } from '../../tenancy/services/tenant-access.service.js';
import { patientService } from '../services/patient.service.js';
import * as v from '../validation/patient.validation.js';

const scope = (req: Request) => {
  if (!req.tenantContext?.clinicId) throw { status: 400, code: 'CLINIC_CONTEXT_REQUIRED', message: 'Select a clinic using X-Clinic-Id.' };
  const rolePermissions = req.tenantContext.customPermissions ?? getTenantRolePermissions(req.tenantContext.role);
  const permissions = new Set([
    ...rolePermissions,
    ...(req.tenantContext.permissionOverrides?.allow ?? []),
  ]);
  for (const denied of req.tenantContext.permissionOverrides?.deny ?? []) permissions.delete(denied);
  return {
    tenantId: req.tenantContext.tenantId,
    clinicId: req.tenantContext.clinicId,
    branchId: req.tenantContext.branchId,
    accessScope: req.tenantContext.scope,
    userId: req.auth!.userId,
    permissions: [...permissions],
  };
};
const id = (req: Request) => v.patientIdSchema.parse(req.params.patientId);
const missing = (res: Response) => res.status(404).json({ success: false, error: { code: 'PATIENT_NOT_FOUND', message: 'Patient not found in this clinic.' } });
const run = (fn: (req: Request, res: Response) => Promise<any>) =>
  (req: Request, res: Response, next: NextFunction) => { Promise.resolve(fn(req, res)).catch(next); };

export const patientController = {
  list: run(async (req, res) => { const r = await patientService.list(scope(req), v.listPatientsSchema.parse(req.query)); res.json({ success: true, data: r.items, pagination: r.pagination }); }),
  create: run(async (req, res) => { const r = await patientService.create(scope(req), v.createPatientSchema.parse(req.body)); res.status(201).json({ success: true, data: r.patient, meta: { possibleDuplicate: r.possibleDuplicate } }); }),
  get: run(async (req, res) => { const p = await patientService.get(scope(req), id(req)); if (!p) return missing(res); res.json({ success: true, data: p }); }),
  update: run(async (req, res) => { const p = await patientService.update(scope(req), id(req), v.updatePatientSchema.parse(req.body)); if (!p) return missing(res); res.json({ success: true, data: p }); }),
  contacts: run(async (req, res) => { const p = await patientService.get(scope(req), id(req)); if (!p) return missing(res); res.json({ success: true, data: p.contacts }); }),
  replaceContacts: run(async (req, res) => { const r = await patientService.replaceContacts(scope(req), id(req), v.contactsSchema.parse(req.body).contacts); if (!r.patient) return missing(res); res.json({ success: true, data: r.patient.contacts, meta: { possibleDuplicate: r.possibleDuplicate } }); }),
  replaceAddresses: run(async (req, res) => { const p = await patientService.replaceAddresses(scope(req), id(req), v.addressesSchema.parse(req.body).addresses); if (!p) return missing(res); res.json({ success: true, data: p.addresses }); }),
  replaceEmergencyContacts: run(async (req, res) => { const p = await patientService.replaceEmergencyContacts(scope(req), id(req), v.emergencyContactsSchema.parse(req.body).emergencyContacts); if (!p) return missing(res); res.json({ success: true, data: p.emergencyContacts }); }),
  tags: run(async (req, res) => { const p = await patientService.get(scope(req), id(req)); if (!p) return missing(res); res.json({ success: true, data: p.tags }); }),
  setTags: run(async (req, res) => { const p = await patientService.setTags(scope(req), id(req), v.tagsSchema.parse(req.body).tags); if (!p) return missing(res); res.json({ success: true, data: p.tags }); }),
  getNotes: run(async (req, res) => { const p = await patientService.getNotes(scope(req), id(req)); if (!p) return missing(res); res.json({ success: true, data: p }); }),
  addNote: run(async (req, res) => { const p = await patientService.addNote(scope(req), id(req), v.noteSchema.parse(req.body)); if (!p) return missing(res); res.status(201).json({ success: true, data: p }); }),
  statusHistory: run(async (req, res) => { const p = await patientService.statusHistory(scope(req), id(req)); if (!p) return missing(res); res.json({ success: true, data: p }); }),
  changeStatus: run(async (req, res) => { const x = v.statusSchema.parse(req.body); const p = await patientService.changeStatus(scope(req), id(req), x.status, x.reason ?? ''); if (!p) return missing(res); res.json({ success: true, data: p }); }),
};
