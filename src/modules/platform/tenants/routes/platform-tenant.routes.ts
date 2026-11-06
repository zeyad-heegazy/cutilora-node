import { Router } from 'express';
import { authenticatePlatform } from '../../auth/middleware/authenticate-platform.js';
import { requirePlatformPermission } from '../../auth/middleware/platform-permissions.js';
import { platformTenantController } from '../controllers/platform-tenant.controller.js';

export const platformTenantRouter = Router();
platformTenantRouter.use(authenticatePlatform);
platformTenantRouter.get('/', requirePlatformPermission('platform.tenants.read'), platformTenantController.list);
platformTenantRouter.post('/', requirePlatformPermission('platform.tenants.create'), platformTenantController.create);
platformTenantRouter.get('/:tenantId', requirePlatformPermission('platform.tenants.read'), platformTenantController.get);
platformTenantRouter.patch('/:tenantId', requirePlatformPermission('platform.tenants.update'), platformTenantController.update);
platformTenantRouter.patch('/:tenantId/status', requirePlatformPermission('platform.tenants.lifecycle.manage'), platformTenantController.updateStatus);
platformTenantRouter.put('/:tenantId/subscription', requirePlatformPermission('platform.subscriptions.manage'), platformTenantController.upsertSubscription);
platformTenantRouter.post('/:tenantId/subscription/payments', requirePlatformPermission('platform.subscriptions.payments.manage'), platformTenantController.addSubscriptionPayment);
