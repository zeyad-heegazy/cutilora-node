import { Router } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { authenticatePlatform } from '../middleware/authenticate-platform.js';
import { authController } from '../controllers/auth.controller.js';

export const authRouter = Router();

authRouter.post('/login', authController.login);
authRouter.get('/me', authenticate, authController.me);

const platformAuthRouter = Router();
platformAuthRouter.post('/login', authController.platformLogin);
platformAuthRouter.get('/me', authenticatePlatform, authController.me);
authRouter.use('/platform', platformAuthRouter);

if (process.env.NODE_ENV !== 'production') {
  authRouter.post('/dev/bootstrap-admin', authController.bootstrapAdmin);
}