import { Router } from 'express';
import { authenticate } from '../../auth/middleware/authenticate.js';
import { authenticatePlatform } from '../../auth/middleware/authenticate-platform.js';
import { resolveTenantContext, requireTenantRoles } from '../middleware/tenant-context.js';
import { tenancyController } from '../controllers/tenancy.controller.js';

export const platformTenantsRouter = Router();
platformTenantsRouter.use(authenticatePlatform);
platformTenantsRouter.get('/', tenancyController.listTenants);
platformTenantsRouter.post('/', tenancyController.createTenant);
platformTenantsRouter.patch('/:tenantId/status', tenancyController.updateTenantStatus);

export const tenantRouter = Router();
tenantRouter.use(authenticate, resolveTenantContext);
tenantRouter.get('/context', tenancyController.context);
tenantRouter.get('/clinics', requireTenantRoles('tenant_owner', 'tenant_admin'), tenancyController.listClinics);
tenantRouter.post('/clinics', requireTenantRoles('tenant_owner', 'tenant_admin'), tenancyController.createClinic);
tenantRouter.get('/branches', tenancyController.listBranches);
tenantRouter.post('/branches', requireTenantRoles('tenant_owner', 'tenant_admin', 'clinic_admin', 'clinic_manager'), tenancyController.createBranch);
