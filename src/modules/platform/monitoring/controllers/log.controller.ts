import type { Request, Response, NextFunction } from 'express';
import { logIdSchema, logQuerySchema } from '../validation/log.validation.js';
import { logService } from '../services/log.service.js';

export const logController = {
  async list(req: Request, res: Response, next: NextFunction) {
    try {
      res.json({ success: true, data: await logService.list(logQuerySchema.parse(req.query)) });
    } catch (e) {
      next(e);
    }
  },
  async get(req: Request, res: Response, next: NextFunction) {
    try {
      const id = logIdSchema.parse(req.params.id);
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
