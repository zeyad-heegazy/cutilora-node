import { z } from 'zod';
const id = z.string().regex(/^[a-f\\d]{24}$/i);
const currency = z.string().trim().length(3).regex(/^[A-Za-z]{3}$/);
export const querySchema = z.object({
  clinicId: id.optional(), branchId: id.optional(),
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  currency: currency.optional(),
}).refine(v => !v.branchId || !!v.clinicId, { message: 'clinicId is required with branchId', path: ['clinicId'] }).refine(v => !v.from || !v.to || new Date(v.from) <= new Date(v.to), { message: 'from must be before or equal to to', path: ['from'] });
