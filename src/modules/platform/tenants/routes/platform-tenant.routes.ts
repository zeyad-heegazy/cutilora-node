import { Router } from 'express';
import { authenticatePlatform } from '../../auth/middleware/authenticate-platform.js';
import { platformTenantController } from '../controllers/platform-tenant.controller.js';
export const platformTenantRouter=Router();
platformTenantRouter.use(authenticatePlatform);
platformTenantRouter.get('/',platformTenantController.list);
platformTenantRouter.post('/',platformTenantController.create);
platformTenantRouter.patch('/:tenantId/status',platformTenantController.updateStatus);