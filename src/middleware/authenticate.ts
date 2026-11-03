import type { NextFunction, Request, Response } from 'express';
import { authRepository } from '../modules/auth/auth.repository.js';
import { verifyAccessToken } from '../modules/auth/auth.security.js';

export async function authenticate(req: Request, res: Response, next: NextFunction) {
  try {
    const header = req.header('authorization');
    if (!header?.startsWith('Bearer ')) return res.status(401).json({ success: false, error: { code: 'UNAUTHENTICATED', message: 'Authentication required.' } });
    const payload = verifyAccessToken(header.slice(7));
    const user = await authRepository.findActiveUserById(payload.sub);
    if (!user || !user.isActive) return res.status(401).json({ success: false, error: { code: 'UNAUTHENTICATED', message: 'Invalid user.' } });
    req.auth = { userId: user.id, platformRole: user.platformRole, activeClinicId: null, clinicRole: null };
    next();
  } catch { return res.status(401).json({ success: false, error: { code: 'UNAUTHENTICATED', message: 'Invalid or expired token.' } }); }
}
