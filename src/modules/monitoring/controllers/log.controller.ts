import type { Request, Response, NextFunction } from 'express';
import { logService } from '../services/log.service.js';

export const logController = {
  async list(req: Request, res: Response, next: NextFunction) {
    try {
      res.json({ success: true, data: await logService.list(req.query as Record<string, unknown>) });
    } catch (e) {
      next(e);
    }
  },
  async get(req: Request, res: Response, next: NextFunction) {
    try {
      const id = req.params.id;
      if (typeof id !== 'string' || !id.trim()) {
        return res.status(400).json({
          success: false,
          error: { code: 'INVALID_LOG_ID', message: 'A valid log ID is required.' },
        });
      }
      const item = await logService.get(id);
      if (!item) {
        return res.status(404).json({
          success: false,
          error: { code: 'LOG_NOT_FOUND', message: 'Log not found.' },
        });
      }
      return res.json({ success: true, data: item });
    } catch (e) {
      next(e);
    }
  },
  async stats(req: Request, res: Response, next: NextFunction) {
    try {
      res.json({ success: true, data: await logService.stats(req.query as Record<string, unknown>) });
    } catch (e) {
      next(e);
    }
  },
  async timeline(req: Request, res: Response, next: NextFunction) {
    try {
      res.json({ success: true, data: await logService.timeline(req.query as Record<string, unknown>) });
    } catch (e) {
      next(e);
    }
  },
};
