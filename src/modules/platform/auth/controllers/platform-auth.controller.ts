import type { Request, Response, NextFunction } from 'express';
import { platformAuthService } from '../services/platform-auth.service.js';
import { bootstrapAdminSchema, loginSchema } from '../../../auth/validations/auth.validation.js';
export const platformAuthController = {
  async login(req: Request, res: Response, next: NextFunction) {
    try { const input = loginSchema.parse(req.body); res.json({ success: true, data: await platformAuthService.login(input.email, input.password) }); }
    catch (error) { next(error); }
  },
  async logout(req: Request, res: Response, next: NextFunction) {
    try {
      const token = req.header('authorization')!.slice(7);
      await platformAuthService.logout(token);
      res.json({ success: true, message: 'Logged out successfully.' });
    } catch (error) { next(error); }
  },
  async me(req: Request, res: Response, next: NextFunction) {
    try { res.json({ success: true, data: await platformAuthService.me(req.auth!.userId) }); }
    catch (error) { next(error); }
  },
  async bootstrapAdmin(req: Request, res: Response, next: NextFunction) {
    try { const input = bootstrapAdminSchema.parse(req.body); res.status(201).json({ success: true, data: await platformAuthService.bootstrapAdmin(input) }); }
    catch (error) { next(error); }
  },
};
