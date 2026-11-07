import { z } from 'zod';
const id = z.string().regex(/^[a-f0-9]{24}$/i);
export const createSchema = z.object({
  name: z.string().trim().min(2).max(120),
  url: z.string().url().max(2048),
  clinicId: id.nullable().optional(),
  events: z.array(z.string().trim().min(1).max(120)).min(1).max(100),
}).strict();
export const updateSchema = createSchema.partial().refine(value => Object.keys(value).length > 0, 'At least one webhook field must be provided.');

export const statusSchema = z.object({ status: z.enum(['active', 'disabled']) }).strict();
export const deliveryLimitSchema = z.coerce.number().int().min(1).max(100).default(50);
