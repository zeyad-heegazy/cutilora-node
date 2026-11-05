import { createHmac } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { authRepository } from '../repositories/auth.repository.js';
import { env } from '../../../config/env.js';

const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 10;

export async function invitationAcceptanceRateLimit(req: Request, res: Response, next: NextFunction) {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const key = createHmac('sha256', env.JWT_SECRET).update(ip).digest('hex');

  try {
    const bucket = await authRepository.consumeInvitationAttempt(key, new Date(), WINDOW_MS) as { count: number; expiresAt: Date } | null;
    if (!bucket) {
      return res.status(503).json({
        success: false,
        error: { code: 'INVITATION_RATE_LIMIT_UNAVAILABLE', message: 'Invitation acceptance is temporarily unavailable. Try again later.' },
      });
    }

    if (bucket.count > MAX_ATTEMPTS) {
      const retryAfter = Math.max(1, Math.ceil((new Date(bucket.expiresAt).getTime() - Date.now()) / 1000));
      res.setHeader('Retry-After', String(retryAfter));
      return res.status(429).json({
        success: false,
        error: { code: 'INVITATION_RATE_LIMITED', message: 'Too many invitation acceptance attempts. Try again later.' },
      });
    }

    return next();
  } catch {
    return res.status(503).json({
      success: false,
      error: { code: 'INVITATION_RATE_LIMIT_UNAVAILABLE', message: 'Invitation acceptance is temporarily unavailable. Try again later.' },
    });
  }
}
