import { Router } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { authController } from '../controllers/auth.controller.js';
export const authRouter = Router();
authRouter.post('/login', authController.login);
authRouter.get('/me', authenticate, authController.me);