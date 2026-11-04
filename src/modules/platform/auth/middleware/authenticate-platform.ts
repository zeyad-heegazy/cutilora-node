import type { NextFunction, Request, Response } from 'express';
import { authRepository } from '../../../auth/repositories/auth.repository.js';
import { verifyAccessToken } from '../../../auth/services/auth.security.js';
import { tokenRevocationService } from '../../../auth/services/token-revocation.service.js';
export async function authenticatePlatform(req: Request, res: Response, next: NextFunction) {
  try {
    const header = req.header('authorization');
    if (!header?.startsWith('Bearer ')) return res.status(401).json({ success: false, error: { code: 'UNAUTHENTICATED', message: 'Platform authentication required.' } });
    const token = header.slice(7);
    const payload = verifyAccessToken(token);
    if (payload.tokenType !== 'platform') return res.status(401).json({ success: false, error: { code: 'INVALID_TOKEN_TYPE', message: 'A platform access token is required.' } });
    if (await tokenRevocationService.isRevoked(token)) return res.status(401).json({ success: false, error: { code: 'TOKEN_REVOKED', message: 'This access token has been revoked.' } });
    const user = await authRepository.findActiveUserById(payload.sub);
    if (!user || !user.isActive || user.platformRole !== 'platform_admin') return res.status(403).json({ success: false, error: { code: 'PLATFORM_ACCESS_REQUIRED', message: 'Platform administrator access required.' } });
    req.auth = { userId: user.id, platformRole: user.platformRole, activeClinicId: null, clinicRole: null };
    next();
  } catch { return res.status(401).json({ success: false, error: { code: 'UNAUTHENTICATED', message: 'Invalid or expired platform token.' } }); }
}
