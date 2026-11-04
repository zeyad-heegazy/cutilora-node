import { Router } from 'express';
import { authenticatePlatform } from '../../auth/middleware/authenticate-platform.js';
import { logController } from '../controllers/log.controller.js';
import { monitoringViewController } from '../controllers/monitoring-view.controller.js';

export const monitoringRouter = Router();

// Public HTML shell; all monitoring data endpoints require a platform token.
monitoringRouter.get('/view', monitoringViewController.show);
monitoringRouter.use(authenticatePlatform);

monitoringRouter.get('/logs', logController.list);
monitoringRouter.get('/logs/stats', logController.stats);
monitoringRouter.get('/logs/timeline', logController.timeline);
monitoringRouter.get('/logs/:id', logController.get);
