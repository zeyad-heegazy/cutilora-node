import { z } from 'zod';

export const catalogTemplateTypeSchema = z.enum([
  'service_category', 'treatment_category', 'service', 'treatment', 'message', 'notification',
  'appointment_policy', 'cancellation_policy', 'rescheduling_policy', 'operational_preferences',
]);

const contentSchema = z.record(z.unknown()).refine((value) => {
  try { return Buffer.byteLength(JSON.stringify(value), 'utf8') <= 65536; } catch { return false; }
}, 'Template content must be valid JSON and no larger than 64 KB.');

export const createCatalogTemplateSchema = z.object({
  type: catalogTemplateTypeSchema,
  name: z.string().trim().min(2).max(160),
  description: z.string().trim().max(1000).optional().default(''),
  content: contentSchema,
});

export const updateCatalogTemplateSchema = z.object({
  name: z.string().trim().min(2).max(160).optional(),
  description: z.string().trim().max(1000).optional(),
  content: contentSchema.optional(),
  version: z.number().int().min(1),
}).refine((value) => value.name !== undefined || value.description !== undefined || value.content !== undefined, {
  message: 'At least one template field must be provided.',
});

export const listCatalogTemplatesQuerySchema = z.object({
  type: catalogTemplateTypeSchema.optional(),
  status: z.enum(['draft', 'published', 'archived']).optional(),
  search: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(25),
});

const publishCatalogTemplateFieldsSchema = z.object({
  applyTo: z.enum(['new_clinics', 'all', 'selected']),
  clinicIds: z.array(z.string().regex(/^[0-9a-f]{24}$/i)).min(1).max(100)
    .refine((ids) => new Set(ids).size === ids.length, 'clinicIds must be unique.').optional(),
});
export const previewCatalogTemplatePublishSchema = publishCatalogTemplateFieldsSchema.refine((value) => value.applyTo !== 'selected' || Boolean(value.clinicIds?.length), {
  message: 'clinicIds are required when applyTo=selected.', path: ['clinicIds'],
});
export const publishCatalogTemplateSchema = publishCatalogTemplateFieldsSchema.extend({ confirm: z.literal(true) }).refine((value) => value.applyTo !== 'selected' || Boolean(value.clinicIds?.length), {
  message: 'clinicIds are required when applyTo=selected.', path: ['clinicIds'],
});
