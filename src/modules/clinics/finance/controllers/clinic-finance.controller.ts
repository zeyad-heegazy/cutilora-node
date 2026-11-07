import type { Request, Response, NextFunction } from 'express';
import { baseScope, invoiceSchema, paymentSchema, refundSchema, voidSchema, expenseSchema, packageSchema, packageListSchema, packageRedeemSchema, packageRefundSchema, dailyCloseOpenSchema, dailyCloseSchema } from '../validation/clinic-finance.validation.js';
import { clinicFinanceService } from '../services/clinic-finance.service.js';

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
