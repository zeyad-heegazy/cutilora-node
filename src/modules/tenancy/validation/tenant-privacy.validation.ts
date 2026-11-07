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

export const routeParamSchema = z.string().trim().min(1);
export const legalBasisSchema = z.object({ legalBasisReference: z.string().trim().min(1).max(200) });
export const retentionPolicySchema = z.object({
  recordType: z.string().trim().min(1).max(100),
  retentionPeriodDays: z.number().int().positive().max(36500).nullable().optional(),
  action: z.enum(['archive', 'anonymize', 'delete', 'manual_review']).default('manual_review'),
  legalBasisReference: z.string().trim().max(200).nullable().optional(),
});
export const revokeConsentSchema = z.object({ reason: z.string().trim().min(1).max(500) });
export const legalReviewSchema = z.object({
  decision: z.enum(['approved', 'rejected']),
  legalReviewReference: z.string().trim().min(1).max(160),
});
export const fulfillRequestSchema = z.object({ resolutionNote: z.string().trim().min(1).max(2000) });
