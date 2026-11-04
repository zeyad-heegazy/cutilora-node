import { Router } from 'express';
import { authenticatePlatform } from '../../auth/middleware/authenticate-platform.js';
import { platformTenantController } from '../controllers/platform-tenant.controller.js';

export const platformTenantRouter = Router();
platformTenantRouter.use(authenticatePlatform);
platformTenantRouter.get('/', platformTenantController.list);
platformTenantRouter.post('/', platformTenantController.create);
platformTenantRouter.get('/:tenantId', platformTenantController.get);
platformTenantRouter.patch('/:tenantId', platformTenantController.update);
platformTenantRouter.patch('/:tenantId/status', platformTenantController.updateStatus);
platformTenantRouter.put('/:tenantId/subscription', platformTenantController.upsertSubscription);
platformTenantRouter.post('/:tenantId/subscription/payments', platformTenantController.addSubscriptionPayment);
