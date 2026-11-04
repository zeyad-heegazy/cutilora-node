import type { Request, Response, NextFunction } from 'express';
import { authService } from '../services/auth.service.js';
import { loginSchema } from '../validations/auth.validation.js';

export const authController = {
  async login(req: Request, res: Response, next: NextFunction) {
    try { const input = loginSchema.parse(req.body); res.json({ success: true, data: await authService.login(input.email, input.password) }); }
    catch (error) { next(error); }
  },
  async me(req: Request, res: Response, next: NextFunction) {
    try { res.json({ success: true, data: await authService.me(req.auth!.userId) }); }
    catch (error) { next(error); }
  },
};