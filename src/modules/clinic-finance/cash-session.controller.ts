import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { cashSessionService } from './cash-session.service.js';

const openSchema = z.object({ openingBalanceMinor: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER) });
const movementSchema = z.object({
  idempotencyKey: z.string().trim().min(8).max(128),
  direction: z.enum(['in', 'out']),
  amountMinor: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
  reason: z.string().trim().min(3).max(240),
});
const closeSchema = z.object({
  countedBalanceMinor: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  varianceReason: z.string().trim().max(500).optional(),
});
function scope(req: Request) {
  const context = req.tenantContext!;
  if (!context.clinicId) throw { status: 400, code: 'CLINIC_CONTEXT_REQUIRED', message: 'Select a clinic using X-Clinic-Id.' };
  return { tenantId: context.tenantId, clinicId: context.clinicId, branchId: context.branchId, userId: req.auth!.userId };
}
export const cashSessionController = {
  async getOpen(req: Request, res: Response, next: NextFunction) { try { res.json({ success: true, data: await cashSessionService.getOpen(scope(req)) }); } catch (e) { next(e); } },
  async open(req: Request, res: Response, next: NextFunction) { try { res.status(201).json({ success: true, data: await cashSessionService.open(scope(req), openSchema.parse(req.body)) }); } catch (e) { next(e); } },
  async addMovement(req: Request, res: Response, next: NextFunction) { try { const item = await cashSessionService.addMovement(scope(req), String(req.params.sessionId), movementSchema.parse(req.body)); return item ? res.json({ success: true, data: item }) : res.status(404).json({ success: false, error: { code: 'CASH_SESSION_NOT_FOUND', message: 'Cash session not found.' } }); } catch (e) { next(e); } },
  async close(req: Request, res: Response, next: NextFunction) { try { res.json({ success: true, data: await cashSessionService.close(scope(req), String(req.params.sessionId), closeSchema.parse(req.body)) }); } catch (e) { next(e); } },
  async approve(req: Request, res: Response, next: NextFunction) { try { res.json({ success: true, data: await cashSessionService.approve(scope(req), String(req.params.sessionId)) }); } catch (e) { next(e); } },
};
