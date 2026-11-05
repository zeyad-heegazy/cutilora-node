import { z } from 'zod';

const currencySchema = z.string().trim().regex(/^[A-Za-z]{3}$/).transform((v) => v.toUpperCase());
const paymentMethodSchema = z.enum(['cash', 'card', 'bank_transfer', 'online', 'wallet', 'other']);
const lineSchema = z.object({
  description: z.string().trim().min(1).max(240),
  serviceReference: z.string().trim().max(100).optional(),
  quantity: z.number().int().min(1).max(10000),
  unitPriceMinor: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  discountBps: z.number().int().min(0).max(10000).default(0),
  taxBps: z.number().int().min(0).max(10000).default(0),
});
const customerSchema = z.object({
  displayName: z.string().trim().min(1).max(160),
  phone: z.string().trim().max(40).optional(),
  email: z.string().trim().email().max(254).optional(),
  externalPatientReference: z.string().trim().max(100).optional(),
});
export const createInvoiceSchema = z.object({ idempotencyKey: z.string().trim().min(8).max(128), customer: customerSchema, lines: z.array(lineSchema).min(1).max(100), currency: currencySchema.optional(), dueAt: z.coerce.date().optional() });
export const updateInvoiceSchema = createInvoiceSchema.omit({ idempotencyKey: true }).partial().refine((v) => Object.keys(v).length > 0, 'At least one field is required.');
export const invoiceListQuerySchema = z.object({
  status: z.enum(['draft', 'issued', 'partially_paid', 'paid', 'void']).optional(),
  from: z.coerce.date().optional(), to: z.coerce.date().optional(),
  branchId: z.string().regex(/^[a-f\d]{24}$/i).optional(),
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(25),
}).refine((v) => !v.from || !v.to || v.from <= v.to, 'from must be before or equal to to');
export const recordPaymentSchema = z.object({
  idempotencyKey: z.string().trim().min(8).max(128),
  amountMinor: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
  method: paymentMethodSchema,
  reference: z.string().trim().max(160).optional(),
  receivedAt: z.coerce.date().optional(),
});
export const refundPaymentSchema = z.object({
  method: paymentMethodSchema,
  idempotencyKey: z.string().trim().min(8).max(128),
  amountMinor: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
  reason: z.string().trim().min(3).max(500),
});
export const voidInvoiceSchema = z.object({ reason: z.string().trim().min(3).max(500) });
export const createExpenseSchema = z.object({
  idempotencyKey: z.string().trim().min(8).max(128),
  description: z.string().trim().min(1).max(240),
  category: z.string().trim().min(1).max(80),
  supplier: z.object({ name: z.string().trim().max(160).optional(), reference: z.string().trim().max(120).optional() }).optional(),
  amountMinor: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
  currency: currencySchema.optional(),
  dueAt: z.coerce.date().optional(),
  incurredAt: z.coerce.date().optional(),
});
export const payExpenseSchema = z.object({ idempotencyKey: z.string().trim().min(8).max(128), method: paymentMethodSchema, paidAt: z.coerce.date().optional() });
export const voidExpenseSchema = z.object({ reason: z.string().trim().min(3).max(500) });
export const reportQuerySchema = z.object({ from: z.coerce.date(), to: z.coerce.date(), branchId: z.string().regex(/^[a-f0-9]{24}$/i).optional(), groupBy: z.enum(['day', 'month']).default('day') }).refine((v) => v.from <= v.to && v.to.getTime() - v.from.getTime() <= 366 * 24 * 60 * 60 * 1000, 'Report range must be ordered and no longer than 366 days.');
export const receivablesQuerySchema = z.object({ asOf: z.coerce.date().optional(), branchId: z.string().regex(/^[a-f0-9]{24}$/i).optional() });
export const summaryQuerySchema = z.object({ from: z.coerce.date().optional(), to: z.coerce.date().optional(), branchId: z.string().regex(/^[a-f0-9]{24}$/i).optional() }).refine((v) => !v.from || !v.to || v.from <= v.to, 'from must be before or equal to to');
export const expenseListQuerySchema = z.object({
  status: z.enum(['recorded', 'paid', 'void']).optional(),
  from: z.coerce.date().optional(), to: z.coerce.date().optional(),
  branchId: z.string().regex(/^[a-f\d]{24}$/i).optional(),
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(25),
}).refine((v) => !v.from || !v.to || v.from <= v.to, 'from must be before or equal to to');
