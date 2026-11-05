import { Router } from 'express';
import { authenticate } from '../../../auth/middleware/authenticate.js';
import { resolveTenantContext } from '../../../tenancy/middleware/tenant-context.js';
import { requireTenantPermission } from '../../../tenancy/middleware/tenant-permissions.js';
import { clinicFinanceController } from '../controllers/clinic-finance.controller.js';

export const clinicFinanceRouter = Router();
clinicFinanceRouter.use(authenticate, resolveTenantContext);
clinicFinanceRouter.post('/invoices', requireTenantPermission('finance.manage'), clinicFinanceController.createInvoice);
clinicFinanceRouter.post('/payments', requireTenantPermission('finance.manage'), clinicFinanceController.payment);
clinicFinanceRouter.post('/refunds', requireTenantPermission('finance.manage'), clinicFinanceController.refund);
clinicFinanceRouter.post('/expenses', requireTenantPermission('finance.manage'), clinicFinanceController.expense);
