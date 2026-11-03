import { Router } from 'express';
import { z } from 'zod';
import { Clinic, ClinicMembership, User } from '../auth/auth.models.js';
import { authenticate, requirePlatformAdmin, resolveClinicTenant, requireClinicRoles } from '../auth/auth.middleware.js';
import { hashPassword } from '../auth/auth.security.js';

export const platformClinicsRouter = Router();
platformClinicsRouter.use(authenticate, requirePlatformAdmin);
platformClinicsRouter.get('/', async (_req, res, next) => {
  try { res.json({ success: true, data: await Clinic.find().sort({ createdAt: -1 }) }); } catch (e) { next(e); }
});
platformClinicsRouter.post('/', async (req, res, next) => {
  try {
    const input = z.object({ name: z.string().min(2), slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/), timezone: z.string().default('Africa/Cairo'), owner: z.object({ name: z.string().min(2), email: z.string().email(), password: z.string().min(12) }) }).parse(req.body);
    const clinic = await Clinic.create({ name: input.name, slug: input.slug, timezone: input.timezone });
    try {
      let owner = await User.findOne({ email: input.owner.email.toLowerCase() });
      if (!owner) owner = await User.create({ name: input.owner.name, email: input.owner.email, passwordHash: await hashPassword(input.owner.password) });
      await ClinicMembership.create({ userId: owner._id, clinicId: clinic._id, role: 'owner', status: 'active' });
    } catch (error) { await Clinic.deleteOne({ _id: clinic._id }); throw error; }
    res.status(201).json({ success: true, data: clinic });
  } catch (e) { next(e); }
});
platformClinicsRouter.patch('/:clinicId/status', async (req, res, next) => {
  try {
    const { status } = z.object({ status: z.enum(['active', 'suspended']) }).parse(req.body);
    const clinic = await Clinic.findByIdAndUpdate(req.params.clinicId, { status }, { new: true, runValidators: true });
    if (!clinic) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Clinic not found.' } });
    res.json({ success: true, data: clinic });
  } catch (e) { next(e); }
});

export const clinicContextRouter = Router();
clinicContextRouter.use(authenticate, resolveClinicTenant);
clinicContextRouter.get('/context', async (req, res) => {
  const clinic = await Clinic.findById(req.tenantId).select('name slug timezone settings status');
  res.json({ success: true, data: { clinic, role: req.auth?.clinicRole, tenant_id: req.tenantId } });
});
clinicContextRouter.get('/members', requireClinicRoles('owner', 'admin', 'manager'), async (req, res, next) => {
  try {
    const members = await ClinicMembership.find({ clinicId: req.tenantId }).populate('userId', 'name email').select('userId role status createdAt');
    res.json({ success: true, data: members });
  } catch (e) { next(e); }
});
