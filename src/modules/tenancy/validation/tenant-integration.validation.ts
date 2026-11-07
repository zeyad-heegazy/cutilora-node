import { z } from 'zod';
export const schema = z.object({
  clinicId: z.string().regex(/^[a-f\d]{24}$/i).nullable().optional(),
  provider: z.string().trim().min(2).max(80),
  integrationType: z.enum(['communication', 'payment_gateway', 'calendar', 'other']),
  displayName: z.string().trim().min(2).max(120),
  config: z.record(z.unknown()).optional(),
  secrets: z.record(z.string().max(4096)).optional(),
}).strict();
