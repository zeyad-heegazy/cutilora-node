import { Router } from 'express';
import { z } from 'zod';
import { User, ClinicMembership, Clinic } from './auth.models.js';
import { hashPassword, signAccessToken, verifyPassword } from './auth.security.js';
import { authenticate } from './auth.middleware.js';

export const authRouter = Router();
const loginSchema = z.object({ email: z.string().email().transform(v => v.toLowerCase()), password: z.string().min(1) });
authRouter.post('/login', async (req, res, next) => {
  try {
    const input = loginSchema.parse(req.body);
    const user = await User.findOne({ email: input.email }).select('+passwordHash name email platformRole isActive');
    if (!user || !user.isActive || !(await verifyPassword(input.password, user.passwordHash))) return res.status(401).json({ success: false, error: { code: 'INVALID_CREDENTIALS', message: 'Email or password is incorrect.' } });
    const memberships = await ClinicMembership.find({ userId: user._id, status: 'active' }).populate({ path: 'clinicId', match: { status: 'active' }, select: 'name slug status' }).select('clinicId role');
    const clinics = memberships.filter(m => m.clinicId).map(m => ({ clinic: m.clinicId, role: m.role }));
    res.json({ success: true, data: { access_token: signAccessToken(user.id), token_type: 'Bearer', user: { id: user.id, name: user.name, email: user.email, platform_role: user.platformRole }, clinics } });
  } catch (error) { next(error); }
});
authRouter.get('/me', authenticate, async (req, res, next) => {
  try {
    const user = await User.findById(req.auth!.userId).select('name email platformRole');
    const memberships = await ClinicMembership.find({ userId: req.auth!.userId, status: 'active' }).populate({ path: 'clinicId', match: { status: 'active' }, select: 'name slug' }).select('clinicId role');
    res.json({ success: true, data: { user, clinics: memberships.filter(m => m.clinicId) } });
  } catch (error) { next(error); }
});
// Bootstrap is intentionally disabled in production; create the first platform admin out-of-band.
if (process.env.NODE_ENV !== 'production') {
  authRouter.post('/dev/bootstrap-admin', async (req, res, next) => {
    try {
      const schema = z.object({ name: z.string().min(2), email: z.string().email(), password: z.string().min(12) });
      const input = schema.parse(req.body);
      if (await User.exists({ platformRole: 'platform_admin' })) return res.status(409).json({ success: false, error: { code: 'BOOTSTRAP_ALREADY_USED', message: 'A platform admin already exists.' } });
      const user = await User.create({ ...input, passwordHash: await hashPassword(input.password), platformRole: 'platform_admin' });
      res.status(201).json({ success: true, data: { id: user.id, email: user.email } });
    } catch (error) { next(error); }
  });
}
