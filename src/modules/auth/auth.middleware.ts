import type { NextFunction, Request, Response } from 'express';
import { User } from './auth.models.js';
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
