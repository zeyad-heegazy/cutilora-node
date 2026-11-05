import type { Request, Response, NextFunction } from 'express';
import { authService } from '../services/auth.service.js';
import { acceptInvitationSchema, loginSchema } from '../validations/auth.validation.js';

export const authController = {
  async login(req: Request, res: Response, next: NextFunction) {
    try { const input = loginSchema.parse(req.body); res.json({ success: true, data: await authService.login(input.email, input.password) }); }
    catch (error) { next(error); }
  },
  async acceptInvitation(req: Request, res: Response, next: NextFunction) {
    try {
      const input = acceptInvitationSchema.parse(req.body);
      const data = await authService.acceptInvitation(input);
      res.status(200).json({ success: true, data });
    } catch (error) { next(error); }
  },
  async logout(req: Request, res: Response, next: NextFunction) {
    try {
      const token = req.header('authorization')!.slice(7);
      await authService.logout(token);
      res.json({ success: true, message: 'Logged out successfully.' });
    } catch (error) { next(error); }
  },
  async me(req: Request, res: Response, next: NextFunction) {
    try { res.json({ success: true, data: await authService.me(req.auth!.userId) }); }
    catch (error) { next(error); }
  },
};
