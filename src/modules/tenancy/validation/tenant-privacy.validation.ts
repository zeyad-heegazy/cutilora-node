import { z } from 'zod';
export const pageSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(25),
});
export const patientIdSchema = z.string().trim().min(1).max(120);
export const consentSchema = z.object({
  patientId: patientIdSchema,
  consentType: z.string().trim().min(1).max(100),
  documentVersion: z.string().trim().min(1).max(80),
  documentHash: z.string().trim().regex(/^[a-fA-F0-9]{64}$/),
  documentSnapshot: z.string().min(1).max(100000),
  status: z.enum(['granted', 'declined']),
  source: z.enum(['clinic_portal', 'patient_portal', 'import', 'other']).default('clinic_portal'),
});
export const requestSchema = z.object({
  patientId: patientIdSchema,
  requestType: z.enum(['access', 'export', 'correction', 'deletion']),
  reason: z.string().trim().max(1000).optional(),
});
export const decisionSchema = z.object({
  decision: z.enum(['approved', 'rejected']),
  resolutionNote: z.string().trim().max(2000).optional(),
});
