import type { NextFunction, Request, Response } from 'express';

const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 10;
const MAX_TRACKED_IPS = 5000;
const attempts = new Map<string, { count: number; resetAt: number }>();

// Process-local protection for the current single-instance API deployment.
// Replace with a shared store (e.g. Redis) before running multiple API instances.
export function invitationAcceptanceRateLimit(req: Request, res: Response, next: NextFunction) {
  const now = Date.now();
  const ip = req.ip || req.socket.remoteAddress || 'unknown';

  if (attempts.size > 5000) {
    for (const [key, bucket] of attempts) {
      if (bucket.resetAt <= now) attempts.delete(key);
    }
  }

  const current = attempts.get(ip);
  if (!current && attempts.size >= MAX_TRACKED_IPS) {
    res.setHeader('Retry-After', '900');
    return res.status(429).json({
      success: false,
      error: { code: 'INVITATION_RATE_LIMIT_CAPACITY', message: 'Invitation acceptance is temporarily busy. Try again later.' },
    });
  }
  if (!current || current.resetAt <= now) {
    attempts.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return next();
  }

  if (current.count >= MAX_ATTEMPTS) {
    res.setHeader('Retry-After', String(Math.max(1, Math.ceil((current.resetAt - now) / 1000))));
    return res.status(429).json({
      success: false,
      error: { code: 'INVITATION_RATE_LIMITED', message: 'Too many invitation acceptance attempts. Try again later.' },
    });
  }

  current.count += 1;
  next();
}
