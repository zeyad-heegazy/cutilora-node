import { z } from 'zod';
const objectId = z.string().regex(/^[a-f\\d]{24}$/i);
export const templateTypes = ['service_treatment', 'pricing', 'appointment_policy', 'cancellation_policy', 'rescheduling_policy', 'message_template', 'notification_template', 'operational_policy'] as const;
const content = z.record(z.unknown());
export const createSchema = z.object({
  name: z.string().trim().min(1).max(120),
  key: z.string().trim().min(2).max(140).regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/),
  type: z.enum(templateTypes),
  description: z.string().trim().max(1000).optional(),
  content,
});
export const updateSchema = createSchema.partial().extend({ expectedVersion: z.number().int().positive() }).refine((v) => Object.keys(v).some((key) => key !== 'expectedVersion'), 'At least one template field is required.');
export const publishSchema = z.object({
  expectedVersion: z.number().int().positive(),
  applyTo: z.enum(['none', 'all', 'selected']),
  clinicIds: z.array(objectId).min(1).max(100).optional(),
  confirm: z.boolean(),
}).refine((v) => v.applyTo !== 'selected' || Boolean(v.clinicIds?.length), { message: 'clinicIds are required when applyTo=selected.', path: ['clinicIds'] });

export const listQuerySchema = z.object({ type: z.enum(templateTypes).optional(), status: z.enum(['draft', 'published', 'archived']).optional() });
export const rollbackSchema = z.object({ expectedVersion: z.number().int().positive(), targetVersion: z.number().int().positive() });
export const archiveSchema = z.object({ expectedVersion: z.number().int().positive() });
