import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { clinicFinanceService } from '../../clinics/finance/services/clinic-finance.service.js';

const id = z.string().regex(/^[a-f\\d]{24}$/i);
const currency = z.string().trim().length(3).regex(/^[A-Za-z]{3}$/);
const querySchema = z.object({
  clinicId: id.optional(), branchId: id.optional(),
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  currency: currency.optional(),
}).refine(v => !v.from || !v.to || new Date(v.from) <= new Date(v.to), { message: 'from must be before or equal to to', path: ['from'] });
function scope(req: Request) {
  const context = req.tenantContext!;
  const query = { ...req.query } as Record<string, unknown>;
  if (context.scope !== 'tenant') query.clinicId = context.clinicId;
  if (context.scope === 'branch') query.branchId = context.branchId;
  const value = querySchema.parse(query);
  if (context.scope === 'clinic' && value.clinicId !== context.clinicId) throw { status: 403, code: 'CLINIC_ACCESS_DENIED', message: 'The requested clinic is outside your membership scope.' };
  if (context.scope === 'branch' && (value.clinicId !== context.clinicId || value.branchId !== context.branchId)) throw { status: 403, code: 'BRANCH_ACCESS_DENIED', message: 'The requested branch is outside your membership scope.' };
  return { ...value, from: value.from ? new Date(value.from) : undefined, to: value.to ? new Date(value.to) : undefined };
}
export const tenantFinanceController = {
  async summary(req: Request, res: Response, next: NextFunction) {
    try { res.json({ success: true, data: await clinicFinanceService.overview(req.tenantContext!.tenantId, scope(req)) }); } catch (error) { next(error); }
  },
  async clinicComparison(req: Request, res: Response, next: NextFunction) {
    try { res.json({ success: true, data: await clinicFinanceService.clinicComparison(req.tenantContext!.tenantId, scope(req)) }); } catch (error) { next(error); }
  },
  async revenueTrends(req: Request, res: Response, next: NextFunction) {
    try { res.json({ success: true, data: await clinicFinanceService.revenueTrends(req.tenantContext!.tenantId, scope(req)) }); } catch (error) { next(error); }
  },
  async expenseSummary(req: Request, res: Response, next: NextFunction) {
    try { res.json({ success: true, data: await clinicFinanceService.expenseSummary(req.tenantContext!.tenantId, scope(req)) }); } catch (error) { next(error); }
  },
  async exportReport(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await clinicFinanceService.exportReport(req.tenantContext!.tenantId, scope(req));
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="tenant-financial-report.csv"');
      res.setHeader('X-Export-Truncated', String(result.truncated));
      res.setHeader('X-Exported-Rows', String(result.exported));
      res.send(result.csv);
    } catch (error) { next(error); }
  },
};
