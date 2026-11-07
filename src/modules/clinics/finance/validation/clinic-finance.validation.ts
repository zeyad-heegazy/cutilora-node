import { z } from 'zod';
const id = z.string().regex(/^[a-f\d]{24}$/i);
const currency = z.string().trim().length(3).regex(/^[A-Za-z]{3}$/);
const date = z.string().datetime({ offset: true }).optional();
export const baseScope = z.object({ clinicId: id.optional(), branchId: id.optional(), from: date, to: date, currency: currency.optional(), page: z.coerce.number().int().min(1).default(1), perPage: z.coerce.number().int().min(1).max(100).default(25) }).refine(v => !v.branchId || !!v.clinicId, { message: 'clinicId is required with branchId', path: ['clinicId'] }).refine(v => !v.from || !v.to || new Date(v.from) <= new Date(v.to), { message: 'from must be before or equal to to', path: ['from'] });
export const invoiceSchema = z.object({ clinicId: id, branchId: id.optional(), patientId: id.optional(), invoiceNumber: z.string().trim().min(1).max(80).optional(), currency, description: z.string().max(500).optional(), issuedAt: date, lineItems: z.array(z.object({ category: z.string().trim().max(80).optional(), description: z.string().trim().min(1).max(240), quantity: z.number().positive().multipleOf(0.0001), unitPrice: z.number().nonnegative().multipleOf(0.01) })).min(1).max(100) });
export const paymentSchema = z.object({ invoiceId: id, amount: z.number().positive().multipleOf(0.01), currency, method: z.string().trim().max(50).optional(), reference: z.string().trim().max(120).optional(), idempotencyKey: z.string().trim().min(8).max(120).optional(), paidAt: date, branchId: id.optional() });
export const refundSchema = z.object({ paymentId: id, amount: z.number().positive().multipleOf(0.01), method: z.string().trim().max(50).optional(), reference: z.string().trim().max(120).optional(), refundedAt: date });
export const voidSchema = z.object({ entryId: id, reason: z.string().trim().min(3).max(500) });
export const expenseSchema = z.object({ clinicId: id, branchId: id.optional(), amount: z.number().positive().multipleOf(0.01), currency, category: z.string().trim().min(1).max(80), description: z.string().max(500).optional(), reference: z.string().max(120).optional(), method: z.string().trim().max(50).optional(), spentAt: date });
export const packageSchema = z.object({ invoiceId: id, paymentId: id, name: z.string().trim().min(2).max(120), saleAmount: z.number().positive().multipleOf(0.01), sessionsPurchased: z.number().int().min(1).max(1000), expiresAt: date });
export const packageListSchema = z.object({ clinicId: id.optional(), branchId: id.optional(), status: z.enum(['active', 'fully_redeemed', 'refund_pending', 'refunded', 'expired']).optional(), page: z.coerce.number().int().min(1).default(1), perPage: z.coerce.number().int().min(1).max(100).default(25) }).refine(v => !v.branchId || !!v.clinicId, { message: 'clinicId is required with branchId', path: ['clinicId'] });
export const packageRedeemSchema = z.object({ sessions: z.number().int().min(1).max(100), idempotencyKey: z.string().trim().min(8).max(120), reference: z.string().trim().max(120).optional(), reason: z.string().trim().max(500).optional() });
export const packageRefundSchema = z.object({ reason: z.string().trim().min(3).max(500), method: z.string().trim().max(50).optional(), reference: z.string().trim().max(120).optional(), refundedAt: date });
export const dailyCloseOpenSchema = z.object({
  clinicId: id, branchId: id.optional(), businessDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  timezone: z.string().trim().min(1).max(80), currency,
  periodStartAt: z.string().datetime({ offset: true }), periodEndAt: z.string().datetime({ offset: true }),
  openingCash: z.number().nonnegative().multipleOf(0.01),
});
export const dailyCloseSchema = z.object({ countedCash: z.number().nonnegative().multipleOf(0.01), varianceReason: z.string().trim().max(500).optional() });
