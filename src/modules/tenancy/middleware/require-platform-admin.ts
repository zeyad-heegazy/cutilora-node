import type { NextFunction, Request, Response } from 'express';
export function requirePlatformAdmin(req: Request, res: Response, next: NextFunction) {
  if (req.auth?.platformRole !== 'platform_admin') return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Platform administrator access required.' } });
  next();
}