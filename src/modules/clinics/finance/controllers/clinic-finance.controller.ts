import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { clinicFinanceService } from '../services/clinic-finance.service.js';

const id = z.string().regex(/^[a-f\d]{24}$/i);
const currency = z.string().trim().length(3).regex(/^[A-Za-z]{3}$/);
const date = z.string().datetime({ offset: true }).optional();
const baseScope = z.object({ clinicId: id.optional(), branchId: id.optional(), from: date, to: date, currency: currency.optional(), page: z.coerce.number().int().min(1).default(1), perPage: z.coerce.number().int().min(1).max(100).default(25) }).refine(v => !v.branchId || !!v.clinicId, { message: 'clinicId is required with branchId', path: ['clinicId'] }).refine(v => !v.from || !v.to || new Date(v.from) <= new Date(v.to), { message: 'from must be before or equal to to', path: ['from'] });
const invoiceSchema = z.object({ clinicId: id, branchId: id.optional(), patientId: id.optional(), invoiceNumber: z.string().trim().min(1).max(80).optional(), currency, description: z.string().max(500).optional(), issuedAt: date, lineItems: z.array(z.object({ category: z.string().trim().max(80).optional(), description: z.string().trim().min(1).max(240), quantity: z.number().positive().multipleOf(0.0001), unitPrice: z.number().nonnegative().multipleOf(0.01) })).min(1).max(100) });
const paymentSchema = z.object({ invoiceId: id, amount: z.number().positive().multipleOf(0.01), currency, method: z.string().trim().max(50).optional(), reference: z.string().trim().max(120).optional(), idempotencyKey: z.string().trim().min(8).max(120).optional(), paidAt: date, branchId: id.optional() });
const refundSchema = z.object({ paymentId: id, amount: z.number().positive().multipleOf(0.01), method: z.string().trim().max(50).optional(), reference: z.string().trim().max(120).optional(), refundedAt: date });
const voidSchema = z.object({ entryId: id, reason: z.string().trim().min(3).max(500) });
const expenseSchema = z.object({ clinicId: id, branchId: id.optional(), amount: z.number().positive().multipleOf(0.01), currency, category: z.string().trim().min(1).max(80), description: z.string().max(500).optional(), reference: z.string().max(120).optional(), method: z.string().trim().max(50).optional(), spentAt: date });
const packageSchema = z.object({ invoiceId: id, paymentId: id, name: z.string().trim().min(2).max(120), saleAmount: z.number().positive().multipleOf(0.01), sessionsPurchased: z.number().int().min(1).max(1000), expiresAt: date });
const packageListSchema = z.object({ clinicId: id.optional(), branchId: id.optional(), status: z.enum(['active', 'fully_redeemed', 'refund_pending', 'refunded', 'expired']).optional(), page: z.coerce.number().int().min(1).default(1), perPage: z.coerce.number().int().min(1).max(100).default(25) }).refine(v => !v.branchId || !!v.clinicId, { message: 'clinicId is required with branchId', path: ['clinicId'] });
const packageRedeemSchema = z.object({ sessions: z.number().int().min(1).max(100), idempotencyKey: z.string().trim().min(8).max(120), reference: z.string().trim().max(120).optional(), reason: z.string().trim().max(500).optional() });
const packageRefundSchema = z.object({ reason: z.string().trim().min(3).max(500), method: z.string().trim().max(50).optional(), reference: z.string().trim().max(120).optional(), refundedAt: date });
const dailyCloseOpenSchema = z.object({
  clinicId: id, branchId: id.optional(), businessDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  timezone: z.string().trim().min(1).max(80), currency,
  periodStartAt: z.string().datetime({ offset: true }), periodEndAt: z.string().datetime({ offset: true }),
  openingCash: z.number().nonnegative().multipleOf(0.01),
});
const dailyCloseSchema = z.object({ countedCash: z.number().nonnegative().multipleOf(0.01), varianceReason: z.string().trim().max(500).optional() });
function parseScope(query: any, context: any) {
  const value = baseScope.parse(query);
  if (context.scope === 'clinic' && value.clinicId && value.clinicId !== context.clinicId) throw { status: 403, code: 'CLINIC_ACCESS_DENIED', message: 'The requested clinic is outside your membership scope.' };
  if (context.scope === 'branch' && value.branchId && value.branchId !== context.branchId) throw { status: 403, code: 'BRANCH_ACCESS_DENIED', message: 'The requested branch is outside your membership scope.' };
  const clinicId = context.scope === 'tenant' ? value.clinicId : context.clinicId;
  const branchId = context.scope === 'branch' ? context.branchId : value.branchId;
  return { ...value, clinicId, branchId, from: value.from ? new Date(value.from) : undefined, to: value.to ? new Date(value.to) : undefined };
}
function actor(req: Request) { const c = req.tenantContext!; return { tenantId: c.tenantId, userId: req.auth!.userId, clinicId: c.clinicId, branchId: c.branchId, scope: c.scope }; }
export const clinicFinanceController = {
  async overview(req: Request, res: Response, next: NextFunction) { try { const q = parseScope(req.query, req.tenantContext!); res.json({ success: true, data: await clinicFinanceService.overview(req.tenantContext!.tenantId, q) }); } catch (e) { next(e); } },
  async list(req: Request, res: Response, next: NextFunction) { try { const q = parseScope(req.query, req.tenantContext!); const result = await clinicFinanceService.listEntries(req.tenantContext!.tenantId, q); res.json({ success: true, data: result.items, pagination: result.pagination }); } catch (e) { next(e); } },
  async createInvoice(req: Request, res: Response, next: NextFunction) { try { const input = invoiceSchema.parse(req.body); const data = await clinicFinanceService.createInvoice(actor(req), input); res.status(201).json({ success: true, data }); } catch (e) { next(e); } },
  async payment(req: Request, res: Response, next: NextFunction) { try { const input = paymentSchema.parse(req.body); const data = await clinicFinanceService.recordPayment(actor(req), input); res.status(201).json({ success: true, data }); } catch (e) { next(e); } },
  async refund(req: Request, res: Response, next: NextFunction) { try { const input = refundSchema.parse(req.body); const data = await clinicFinanceService.recordRefund(actor(req), input); res.status(201).json({ success: true, data }); } catch (e) { next(e); } },
  async voidEntry(req: Request, res: Response, next: NextFunction) { try { const input = voidSchema.parse(req.body); const data = await clinicFinanceService.voidEntry(actor(req), input); res.json({ success: true, data }); } catch (e) { next(e); } },
  async expense(req: Request, res: Response, next: NextFunction) { try { const input = expenseSchema.parse(req.body); const data = await clinicFinanceService.createExpense(actor(req), input); res.status(201).json({ success: true, data }); } catch (e) { next(e); } },
  async listPackages(req: Request, res: Response, next: NextFunction) { try { const query = packageListSchema.parse(req.query); const data = await clinicFinanceService.listPackages(actor(req), query); res.json({ success: true, data: data.items, pagination: data.pagination }); } catch (e) { next(e); } },
  async createPackage(req: Request, res: Response, next: NextFunction) { try { const input = packageSchema.parse(req.body); const data = await clinicFinanceService.createPackage(actor(req), input); res.status(201).json({ success: true, data }); } catch (e) { next(e); } },
  async redeemPackage(req: Request, res: Response, next: NextFunction) { try { const input = packageRedeemSchema.parse(req.body); const data = await clinicFinanceService.redeemPackage(actor(req), { ...input, packageId: req.params.packageId }); res.json({ success: true, data }); } catch (e) { next(e); } },
  async refundPackage(req: Request, res: Response, next: NextFunction) { try { const input = packageRefundSchema.parse(req.body); const data = await clinicFinanceService.refundPackage(actor(req), { ...input, packageId: req.params.packageId }); res.json({ success: true, data }); } catch (e) { next(e); } },
  async packageEvents(req: Request, res: Response, next: NextFunction) { try { const data = await clinicFinanceService.listPackageEvents(actor(req), String(req.params.packageId ?? '')); if (!data) return res.status(404).json({ success: false, error: { code: 'PACKAGE_NOT_FOUND', message: 'Package not found.' } }); res.json({ success: true, data }); } catch (e) { next(e); } },
  async openDailyClose(req: Request, res: Response, next: NextFunction) { try { const input = dailyCloseOpenSchema.parse(req.body); const data = await clinicFinanceService.openDailyClose(actor(req), input); res.status(201).json({ success: true, data }); } catch (e) { next(e); } },
  async listDailyCloses(req: Request, res: Response, next: NextFunction) { try { const q = parseScope(req.query, req.tenantContext!); const data = await clinicFinanceService.listDailyCloses(req.tenantContext!.tenantId, q); res.json({ success: true, data }); } catch (e) { next(e); } },
  async closeDailyClose(req: Request, res: Response, next: NextFunction) { try { const input = dailyCloseSchema.parse(req.body); const data = await clinicFinanceService.closeDailyClose(actor(req), { ...input, closeId: req.params.closeId }); res.json({ success: true, data }); } catch (e) { next(e); } },
  async approveDailyClose(req: Request, res: Response, next: NextFunction) { try { const data = await clinicFinanceService.approveDailyClose(actor(req), String(req.params.closeId ?? '')); res.json({ success: true, data }); } catch (e) { next(e); } },

};
