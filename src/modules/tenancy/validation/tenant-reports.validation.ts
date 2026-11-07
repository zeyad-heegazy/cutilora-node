import { z } from 'zod';
export const querySchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
}).refine(value => !value.from || !value.to || value.from <= value.to, 'from must be before or equal to to')
  .refine(value => !value.from || !value.to || value.to.getTime() - value.from.getTime() <= 366 * 24 * 60 * 60 * 1000, 'Report range cannot exceed 366 days.');
