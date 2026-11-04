import { Router } from 'express';
import { authenticatePlatform } from '../middleware/authenticate-platform.js';
import { platformAuthController } from '../controllers/platform-auth.controller.js';

export const platformAuthRouter = Router();
platformAuthRouter.post('/login', platformAuthController.login);
platformAuthRouter.post('/logout', authenticatePlatform, platformAuthController.logout);
platformAuthRouter.get('/me', authenticatePlatform, platformAuthController.me);
if (process.env.NODE_ENV !== 'production') platformAuthRouter.post('/dev/bootstrap-admin', platformAuthController.bootstrapAdmin);
