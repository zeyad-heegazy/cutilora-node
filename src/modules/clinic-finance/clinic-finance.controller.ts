import type { Request, Response, NextFunction } from 'express';
import { clinicFinanceService } from './clinic-finance.service.js';
import { createCreditNoteSchema, createExpenseSchema, createInvoiceSchema, expenseListQuerySchema, invoiceListQuerySchema, summaryQuerySchema, receivablesQuerySchema, reportQuerySchema, payExpenseSchema, recordPaymentSchema, refundPaymentSchema, updateInvoiceSchema, voidExpenseSchema, voidInvoiceSchema } from './clinic-finance.validation.js';

function scope(req: Request) {
  const context = req.tenantContext!;
  if (!context.clinicId) throw { status: 400, code: 'CLINIC_CONTEXT_REQUIRED', message: 'Select a clinic using X-Clinic-Id.' };
  return { tenantId: context.tenantId, clinicId: context.clinicId, branchId: context.branchId, userId: req.auth!.userId };
}
function notFound(res: Response, code: string, message: string) { return res.status(404).json({ success: false, error: { code, message } }); }

export const clinicFinanceController = {
  async receivables(req: Request, res: Response, next: NextFunction) { try { res.json({ success: true, data: await clinicFinanceService.receivables(scope(req), receivablesQuerySchema.parse(req.query)) }); } catch (e) { next(e); } },
  async reports(req: Request, res: Response, next: NextFunction) { try { res.json({ success: true, data: await clinicFinanceService.reports(scope(req), reportQuerySchema.parse(req.query)) }); } catch (e) { next(e); } },
  async summary(req: Request, res: Response, next: NextFunction) { try { res.json({ success: true, data: await clinicFinanceService.summary(scope(req), summaryQuerySchema.parse(req.query)) }); } catch (e) { next(e); } },
  async listInvoices(req: Request, res: Response, next: NextFunction) { try { const result = await clinicFinanceService.listInvoices(scope(req), invoiceListQuerySchema.parse(req.query)); res.json({ success: true, data: result.items, pagination: result.pagination }); } catch (e) { next(e); } },
  async createInvoice(req: Request, res: Response, next: NextFunction) { try { const item = await clinicFinanceService.createInvoice(scope(req), createInvoiceSchema.parse(req.body)); res.status(201).json({ success: true, data: item }); } catch (e) { next(e); } },
  async getInvoice(req: Request, res: Response, next: NextFunction) { try { const item = await clinicFinanceService.getInvoice(scope(req), String(req.params.invoiceId)); return item ? res.json({ success: true, data: item }) : notFound(res, 'INVOICE_NOT_FOUND', 'Invoice not found.'); } catch (e) { next(e); } },
  async updateInvoice(req: Request, res: Response, next: NextFunction) { try { const item = await clinicFinanceService.updateDraftInvoice(scope(req), String(req.params.invoiceId), updateInvoiceSchema.parse(req.body)); return item ? res.json({ success: true, data: item }) : notFound(res, 'INVOICE_NOT_FOUND', 'Draft invoice not found.'); } catch (e) { next(e); } },
  async issueInvoice(req: Request, res: Response, next: NextFunction) { try { const item = await clinicFinanceService.issueInvoice(scope(req), String(req.params.invoiceId)); return item ? res.json({ success: true, data: item }) : notFound(res, 'INVOICE_NOT_FOUND', 'Draft invoice not found.'); } catch (e) { next(e); } },
  async recordPayment(req: Request, res: Response, next: NextFunction) { try { const item = await clinicFinanceService.recordPayment(scope(req), String(req.params.invoiceId), recordPaymentSchema.parse(req.body)); return item ? res.status(201).json({ success: true, data: item }) : notFound(res, 'INVOICE_NOT_FOUND', 'Invoice not found.'); } catch (e) { next(e); } },
  async refundPayment(req: Request, res: Response, next: NextFunction) { try { const item = await clinicFinanceService.refundPayment(scope(req), String(req.params.invoiceId), String(req.params.paymentId), refundPaymentSchema.parse(req.body)); return item ? res.json({ success: true, data: item }) : notFound(res, 'INVOICE_NOT_FOUND', 'Invoice not found.'); } catch (e) { next(e); } },
  async issueCreditNote(req: Request, res: Response, next: NextFunction) { try { const item = await clinicFinanceService.issueCreditNote(scope(req), String(req.params.invoiceId), createCreditNoteSchema.parse(req.body)); return item ? res.status(201).json({ success: true, data: item }) : notFound(res, 'INVOICE_NOT_FOUND', 'Invoice not found.'); } catch (e) { next(e); } },
  async voidInvoice(req: Request, res: Response, next: NextFunction) { try { const input = voidInvoiceSchema.parse(req.body); res.json({ success: true, data: await clinicFinanceService.voidInvoice(scope(req), String(req.params.invoiceId), input.reason) }); } catch (e) { next(e); } },
  async listExpenses(req: Request, res: Response, next: NextFunction) { try { const result = await clinicFinanceService.listExpenses(scope(req), expenseListQuerySchema.parse(req.query)); res.json({ success: true, data: result.items, pagination: result.pagination }); } catch (e) { next(e); } },
  async createExpense(req: Request, res: Response, next: NextFunction) { try { res.status(201).json({ success: true, data: await clinicFinanceService.createExpense(scope(req), createExpenseSchema.parse(req.body)) }); } catch (e) { next(e); } },
  async payExpense(req: Request, res: Response, next: NextFunction) { try { res.json({ success: true, data: await clinicFinanceService.payExpense(scope(req), String(req.params.expenseId), payExpenseSchema.parse(req.body)) }); } catch (e) { next(e); } },
  async voidExpense(req: Request, res: Response, next: NextFunction) { try { res.json({ success: true, data: await clinicFinanceService.voidExpense(scope(req), String(req.params.expenseId), voidExpenseSchema.parse(req.body).reason) }); } catch (e) { next(e); } },
};
