import { Router } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { authController } from '../controllers/auth.controller.js';

export const authRouter = Router();
authRouter.post('/login', authController.login);
authRouter.post('/invitations/accept', authController.acceptInvitation);
authRouter.post('/logout', authenticate, authController.logout);
authRouter.get('/me', authenticate, authController.me);
