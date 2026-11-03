import { Router } from 'express';
import { z } from 'zod';
import { authenticate, requirePlatformAdmin } from '../auth/auth.middleware.js';
import { User, TenantMembership } from '../auth/auth.models.js';
import { Tenant, Clinic, Branch } from './tenancy.models.js';
import { resolveTenantContext, requireTenantRoles } from './tenancy.middleware.js';
import { hashPassword } from '../auth/auth.security.js';

export const platformTenantsRouter = Router();
platformTenantsRouter.use(authenticate, requirePlatformAdmin);

platformTenantsRouter.get('/', async (_req, res, next) => {
  try { res.json({ success: true, data: await Tenant.find().sort({ createdAt: -1 }) }); } catch (e) { next(e); }
});
platformTenantsRouter.post('/', async (req, res, next) => {
  try {
    const input = z.object({
      name: z.string().min(2),
      slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
      owner: z.object({ name: z.string().min(2), email: z.string().email(), password: z.string().min(12) }),
      initialClinic: z.object({ name: z.string().min(2), slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/) }).optional(),
    }).parse(req.body);
    const tenant = await Tenant.create({ name: input.name, slug: input.slug });
    try {
      let owner = await User.findOne({ email: input.owner.email.toLowerCase() });
      if (!owner) owner = await User.create({ name: input.owner.name, email: input.owner.email, passwordHash: await hashPassword(input.owner.password) });
      await TenantMembership.create({ userId: owner._id, tenantId: tenant._id, role: 'tenant_owner', scope: 'tenant', status: 'active' });
      if (input.initialClinic) await Clinic.create({ tenantId: tenant._id, ...input.initialClinic });
    } catch (error) {
      await TenantMembership.deleteMany({ tenantId: tenant._id });
      await Clinic.deleteMany({ tenantId: tenant._id });
      await Tenant.deleteOne({ _id: tenant._id });
      throw error;
    }
    res.status(201).json({ success: true, data: tenant });
  } catch (e) { next(e); }
});
platformTenantsRouter.patch('/:tenantId/status', async (req, res, next) => {
  try {
    const { status } = z.object({ status: z.enum(['active', 'suspended']) }).parse(req.body);
    const tenant = await Tenant.findByIdAndUpdate(req.params.tenantId, { status }, { new: true, runValidators: true });
    if (!tenant) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Tenant not found.' } });
    res.json({ success: true, data: tenant });
  } catch (e) { next(e); }
});

export const tenantRouter = Router();
tenantRouter.use(authenticate, resolveTenantContext);
tenantRouter.get('/context', async (req, res) => {
  const [tenant, clinic, branch] = await Promise.all([
    Tenant.findById(req.tenantContext!.tenantId).select('name slug status plan settings'),
    req.tenantContext!.clinicId ? Clinic.findOne({ _id: req.tenantContext!.clinicId, tenantId: req.tenantContext!.tenantId }) : null,
    req.tenantContext!.branchId ? Branch.findOne({ _id: req.tenantContext!.branchId, tenantId: req.tenantContext!.tenantId }) : null,
  ]);
  res.json({ success: true, data: { tenant, clinic, branch, access: req.tenantContext } });
});
tenantRouter.get('/clinics', requireTenantRoles('tenant_owner', 'tenant_admin'), async (req, res, next) => {
  try { res.json({ success: true, data: await Clinic.find({ tenantId: req.tenantContext!.tenantId }).sort({ name: 1 }) }); } catch (e) { next(e); }
});
tenantRouter.post('/clinics', requireTenantRoles('tenant_owner', 'tenant_admin'), async (req, res, next) => {
  try {
    const input = z.object({ name: z.string().min(2), slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/), timezone: z.string().default('Africa/Cairo'), countryId: z.string().optional() }).parse(req.body);
    const clinic = await Clinic.create({ ...input, tenantId: req.tenantContext!.tenantId });
    res.status(201).json({ success: true, data: clinic });
  } catch (e) { next(e); }
});
tenantRouter.get('/branches', async (req, res, next) => {
  try {
    if (!req.tenantContext!.clinicId) return res.status(400).json({ success: false, error: { code: 'CLINIC_CONTEXT_REQUIRED', message: 'Select a clinic using X-Clinic-Id.' } });
    const filter: Record<string, unknown> = { tenantId: req.tenantContext!.tenantId, clinicId: req.tenantContext!.clinicId };
    if (req.tenantContext!.branchId) filter._id = req.tenantContext!.branchId;
    res.json({ success: true, data: await Branch.find(filter).sort({ name: 1 }) });
  } catch (e) { next(e); }
});
tenantRouter.post('/branches', requireTenantRoles('tenant_owner', 'tenant_admin', 'clinic_admin', 'clinic_manager'), async (req, res, next) => {
  try {
    if (!req.tenantContext!.clinicId) return res.status(400).json({ success: false, error: { code: 'CLINIC_CONTEXT_REQUIRED', message: 'Select a clinic using X-Clinic-Id.' } });
    const input = z.object({ name: z.string().min(2), slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/), address: z.string().optional(), cityId: z.string().optional(), timezone: z.string().default('Africa/Cairo') }).parse(req.body);
    const branch = await Branch.create({ ...input, tenantId: req.tenantContext!.tenantId, clinicId: req.tenantContext!.clinicId });
    res.status(201).json({ success: true, data: branch });
  } catch (e) { next(e); }
});
