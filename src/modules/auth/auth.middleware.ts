import type { NextFunction, Request, Response } from 'express';
import { User, ClinicMembership, Clinic } from './auth.models.js';
import { verifyAccessToken } from './auth.security.js';

export async function authenticate(req: Request, res: Response, next: NextFunction) {
  try {
    const header = req.header('authorization');
    if (!header?.startsWith('Bearer ')) return res.status(401).json({ success: false, error: { code: 'UNAUTHENTICATED', message: 'Authentication required.' } });
    const payload = verifyAccessToken(header.slice(7));
    const user = await User.findById(payload.sub).select('platformRole isActive');
    if (!user || !user.isActive) return res.status(401).json({ success: false, error: { code: 'UNAUTHENTICATED', message: 'Invalid user.' } });
    req.auth = { userId: user.id, platformRole: user.platformRole, activeClinicId: null, clinicRole: null };
    next();
  } catch { return res.status(401).json({ success: false, error: { code: 'UNAUTHENTICATED', message: 'Invalid or expired token.' } }); }
}

export function requirePlatformAdmin(req: Request, res: Response, next: NextFunction) {
  if (req.auth?.platformRole !== 'platform_admin') return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Platform administrator access required.' } });
  next();
}

export async function resolveClinicTenant(req: Request, res: Response, next: NextFunction) {
  try {
    const clinicId = req.header('x-clinic-id');
    if (!clinicId || !req.auth) return res.status(400).json({ success: false, error: { code: 'CLINIC_CONTEXT_REQUIRED', message: 'Select a clinic using X-Clinic-Id.' } });
    const membership = await ClinicMembership.findOne({ userId: req.auth.userId, clinicId, status: 'active' }).select('role clinicId');
    if (!membership) return res.status(403).json({ success: false, error: { code: 'CLINIC_ACCESS_DENIED', message: 'You are not an active member of this clinic.' } });
    const clinic = await Clinic.findOne({ _id: membership.clinicId, status: 'active' }).select('_id');
    if (!clinic) return res.status(403).json({ success: false, error: { code: 'CLINIC_UNAVAILABLE', message: 'This clinic is unavailable.' } });
    req.tenantId = clinic.id;
    req.auth.activeClinicId = clinic.id;
    req.auth.clinicRole = membership.role;
    next();
  } catch (error) { next(error); }
}
export function requireClinicRoles(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.auth?.clinicRole || !roles.includes(req.auth.clinicRole)) return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Insufficient clinic permissions.' } });
    next();
  };
}
