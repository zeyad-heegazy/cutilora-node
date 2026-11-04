import { Router } from 'express';
import { authenticate } from '../../auth/middleware/authenticate.js';
import { logController } from '../controllers/log.controller.js';
export const monitoringRouter = Router();
monitoringRouter.use(authenticate);
monitoringRouter.use((req, res, next) => {
  if (req.auth?.platformRole !== 'platform_admin') return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Platform administrator access required.' } });
  next();
});
monitoringRouter.get('/logs', logController.list);
monitoringRouter.get('/logs/stats', logController.stats);
monitoringRouter.get('/logs/timeline', logController.timeline);
monitoringRouter.get('/logs/:id', logController.get);
