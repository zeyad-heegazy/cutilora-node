import { Router } from 'express';
import { authenticate } from '../auth/middleware/authenticate.js';
import { resolveTenantContext } from '../tenancy/middleware/tenant-context.js';
import { requireTenantPermission } from '../tenancy/middleware/tenant-permissions.js';
import { clinicFinanceController } from './clinic-finance.controller.js';

export const clinicFinanceRouter = Router();
clinicFinanceRouter.use(authenticate, resolveTenantContext);

clinicFinanceRouter.get('/finance/summary', requireTenantPermission('finance.read'), clinicFinanceController.summary);
clinicFinanceRouter.get('/invoices', requireTenantPermission('finance.invoices.read'), clinicFinanceController.listInvoices);
clinicFinanceRouter.post('/invoices', requireTenantPermission('finance.invoices.manage'), clinicFinanceController.createInvoice);
clinicFinanceRouter.get('/invoices/:invoiceId', requireTenantPermission('finance.invoices.read'), clinicFinanceController.getInvoice);
clinicFinanceRouter.patch('/invoices/:invoiceId', requireTenantPermission('finance.invoices.manage'), clinicFinanceController.updateInvoice);
clinicFinanceRouter.post('/invoices/:invoiceId/issue', requireTenantPermission('finance.invoices.manage'), clinicFinanceController.issueInvoice);
clinicFinanceRouter.post('/invoices/:invoiceId/payments', requireTenantPermission('finance.payments.manage'), clinicFinanceController.recordPayment);
clinicFinanceRouter.post('/invoices/:invoiceId/payments/:paymentId/refunds', requireTenantPermission('finance.refunds.manage'), clinicFinanceController.refundPayment);
clinicFinanceRouter.post('/invoices/:invoiceId/void', requireTenantPermission('finance.invoices.manage'), clinicFinanceController.voidInvoice);
clinicFinanceRouter.get('/expenses', requireTenantPermission('finance.expenses.read'), clinicFinanceController.listExpenses);
clinicFinanceRouter.post('/expenses', requireTenantPermission('finance.expenses.manage'), clinicFinanceController.createExpense);
clinicFinanceRouter.post('/expenses/:expenseId/pay', requireTenantPermission('finance.expenses.manage'), clinicFinanceController.payExpense);
clinicFinanceRouter.post('/expenses/:expenseId/void', requireTenantPermission('finance.expenses.manage'), clinicFinanceController.voidExpense);
