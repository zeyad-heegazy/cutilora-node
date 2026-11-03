import type { Request, Response, NextFunction } from 'express';
import { authService } from './auth.service.js';
import { bootstrapAdminSchema, loginSchema } from './auth.validation.js';

export const authController = {
  async login(req: Request, res: Response, next: NextFunction) {
    try {
      const input = loginSchema.parse(req.body);
      res.json({ success: true, data: await authService.login(input.email, input.password) });
    } catch (error) { next(error); }
  },
  async me(req: Request, res: Response, next: NextFunction) {
    try { res.json({ success: true, data: await authService.me(req.auth!.userId) }); }
    catch (error) { next(error); }
  },
  async bootstrapAdmin(req: Request, res: Response, next: NextFunction) {
    try {
      const input = bootstrapAdminSchema.parse(req.body);
      res.status(201).json({ success: true, data: await authService.bootstrapAdmin(input) });
    } catch (error) { next(error); }
  },
};
