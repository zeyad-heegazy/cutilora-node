import type { NextFunction, Request, Response } from 'express';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { tenantPrivacyService } from '../services/tenant-privacy.service.js';

const pageSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(25),
});
const patientIdSchema = z.string().trim().min(1).max(120);
const routeParam = (req: Request, key: string): string => z.string().trim().min(1).parse(req.params[key]);
const consentSchema = z.object({
  patientId: patientIdSchema,
  consentType: z.string().trim().min(1).max(100),
  documentVersion: z.string().trim().min(1).max(80),
  documentHash: z.string().trim().regex(/^[a-fA-F0-9]{64}$/),
  documentSnapshot: z.string().min(1).max(100000),
  status: z.enum(['granted', 'declined']),
  source: z.enum(['clinic_portal', 'patient_portal', 'import', 'other']).default('clinic_portal'),
});
const requestSchema = z.object({
  patientId: patientIdSchema,
  requestType: z.enum(['access', 'export', 'correction', 'deletion']),
  reason: z.string().trim().max(1000).optional(),
});
const decisionSchema = z.object({
  decision: z.enum(['approved', 'rejected']),
  resolutionNote: z.string().trim().max(2000).optional(),
});

const scope = (req: Request) => {
  const context = req.tenantContext!;
  if (!context.clinicId) {
    const error = new Error('Select a clinic using X-Clinic-Id for this privacy operation.') as Error & { status?: number; code?: string };
    error.status = 400;
    error.code = 'CLINIC_CONTEXT_REQUIRED';
    throw error;
  }
  return { tenantId: context.tenantId, clinicId: context.clinicId };
};

export const tenantPrivacyController = {
  async patientAccessHistory(req: Request, res: Response, next: NextFunction) {
    try {
      const patientId = patientIdSchema.parse(req.params.patientId);
      const query = pageSchema.parse(req.query);
      const result = await tenantPrivacyService.listPatientAccessHistory({ ...scope(req), patientId, ...query });
      res.json({ success: true, data: result.items, pagination: result.pagination });
    } catch (error) { next(error); }
  },

  async listConsents(req: Request, res: Response, next: NextFunction) {
    try {
      const patientId = patientIdSchema.parse(req.query.patientId);
      const query = pageSchema.parse(req.query);
      const result = await tenantPrivacyService.listPatientConsents({ ...scope(req), patientId, ...query });
      res.json({ success: true, data: result.items, pagination: result.pagination });
    } catch (error) { next(error); }
  },

  async getConsent(req: Request, res: Response, next: NextFunction) {
    try {
      const item = await tenantPrivacyService.getConsent({ ...scope(req), consentId: routeParam(req, 'consentId') });
      if (!item) return res.status(404).json({ success: false, error: { code: 'CONSENT_NOT_FOUND', message: 'Consent record not found.' } });
      res.json({ success: true, data: item });
    } catch (error) { next(error); }
  },

  async listRetentionPolicies(req: Request, res: Response, next: NextFunction) {
    try {
      const query = pageSchema.parse(req.query);
      const result = await tenantPrivacyService.listRetentionPolicies({ tenantId: req.tenantContext!.tenantId, ...query });
      res.json({ success: true, data: result.items, pagination: result.pagination });
    } catch (error) { next(error); }
  },

  async approveRetentionPolicy(req: Request, res: Response, next: NextFunction) {
    try {
      const input = z.object({ legalBasisReference: z.string().trim().min(1).max(200) }).parse(req.body);
      const item = await tenantPrivacyService.approveRetentionPolicy({
        tenantId: req.tenantContext!.tenantId, policyId: routeParam(req, 'policyId'),
        actorUserId: req.auth!.userId, correlationId: String(res.getHeader('x-request-id') ?? ''), ...input,
      });
      if (!item) return res.status(409).json({ success: false, error: { code: 'RETENTION_POLICY_NOT_APPROVABLE', message: 'Policy not found, already reviewed, or not pending approval.' } });
      res.json({ success: true, data: item, executionEnabled: false });
    } catch (error) { next(error); }
  },

  async createRetentionPolicy(req: Request, res: Response, next: NextFunction) {
    try {
      const input = z.object({
        recordType: z.string().trim().min(1).max(100),
        retentionPeriodDays: z.number().int().positive().max(36500).nullable().optional(),
        action: z.enum(['archive', 'anonymize', 'delete', 'manual_review']).default('manual_review'),
        legalBasisReference: z.string().trim().max(200).nullable().optional(),
      }).parse(req.body);
      const item = await tenantPrivacyService.createRetentionPolicy({
        tenantId: req.tenantContext!.tenantId, actorUserId: req.auth!.userId, correlationId: String(res.getHeader('x-request-id') ?? ''), ...input,
      });
      res.status(201).json({ success: true, data: item });
    } catch (error) { next(error); }
  },

  async createConsent(req: Request, res: Response, next: NextFunction) {
    try {
      const input = consentSchema.parse(req.body);
      const actualHash = createHash('sha256').update(input.documentSnapshot, 'utf8').digest('hex');
      if (actualHash !== input.documentHash.toLowerCase()) return res.status(400).json({ success: false, error: { code: 'CONSENT_HASH_MISMATCH', message: 'documentHash must be the SHA-256 hash of documentSnapshot.' } });
      const item = await tenantPrivacyService.recordConsent({
        ...scope(req), ...input, actorUserId: req.auth!.userId, correlationId: String(res.getHeader('x-request-id') ?? ''), signedAt: new Date(),
        documentHash: input.documentHash.toLowerCase(),
      });
      res.status(201).json({ success: true, data: { ...item.toObject(), documentSnapshot: undefined } });
    } catch (error) { next(error); }
  },

  async revokeConsent(req: Request, res: Response, next: NextFunction) {
    try {
      const reason = z.object({ reason: z.string().trim().min(1).max(500) }).parse(req.body).reason;
      const item = await tenantPrivacyService.revokeConsent({
        ...scope(req), consentId: routeParam(req, 'consentId'), actorUserId: req.auth!.userId, reason, correlationId: String(res.getHeader('x-request-id') ?? ''),
      });
      if (!item) return res.status(404).json({ success: false, error: { code: 'CONSENT_NOT_FOUND', message: 'Active consent not found.' } });
      res.status(201).json({ success: true, data: { ...item.toObject(), documentSnapshot: undefined } });
    } catch (error) { next(error); }
  },

  async createDataRequest(req: Request, res: Response, next: NextFunction) {
    try {
      const input = requestSchema.parse(req.body);
      const item = await tenantPrivacyService.createDataRequest({
        ...scope(req), ...input, requestedByUserId: req.auth!.userId, correlationId: String(res.getHeader('x-request-id') ?? ''),
      });
      res.status(201).json({ success: true, data: item });
    } catch (error) { next(error); }
  },

  async listDataRequests(req: Request, res: Response, next: NextFunction) {
    try {
      const query = pageSchema.parse(req.query);
      const result = await tenantPrivacyService.listDataRequests({ ...scope(req), ...query });
      res.json({ success: true, data: result.items, pagination: result.pagination });
    } catch (error) { next(error); }
  },

  async getDataRequest(req: Request, res: Response, next: NextFunction) {
    try {
      const item = await tenantPrivacyService.getDataRequest({ ...scope(req), requestId: routeParam(req, 'requestId') });
      if (!item) return res.status(404).json({ success: false, error: { code: 'PRIVACY_REQUEST_NOT_FOUND', message: 'Privacy request not found.' } });
      res.json({ success: true, data: item });
    } catch (error) { next(error); }
  },

  async reviewDataRequest(req: Request, res: Response, next: NextFunction) {
    try {
      const input = z.object({
        decision: z.enum(['approved', 'rejected']),
        legalReviewReference: z.string().trim().min(1).max(160),
      }).parse(req.body);
      const item = await tenantPrivacyService.reviewDataRequest({
        ...scope(req), requestId: routeParam(req, 'requestId'),
        reviewerUserId: req.auth!.userId, correlationId: String(res.getHeader('x-request-id') ?? ''), ...input,
      });
      if (!item) return res.status(409).json({ success: false, error: { code: 'PRIVACY_REQUEST_NOT_REVIEWABLE', message: 'Request not found, already reviewed, or no longer pending.' } });
      res.json({ success: true, data: item });
    } catch (error) { next(error); }
  },

  async fulfillDataRequest(req: Request, res: Response, next: NextFunction) {
    try {
      const input = z.object({ resolutionNote: z.string().trim().min(1).max(2000) }).parse(req.body);
      const item = await tenantPrivacyService.fulfillDataRequest({
        ...scope(req), requestId: routeParam(req, 'requestId'),
        actorUserId: req.auth!.userId, correlationId: String(res.getHeader('x-request-id') ?? ''), ...input,
      });
      if (!item) return res.status(409).json({ success: false, error: { code: 'PRIVACY_REQUEST_NOT_FULFILLABLE', message: 'Only legally approved requests can be marked fulfilled.' } });
      res.json({ success: true, data: item, automatedDataMutation: false });
    } catch (error) { next(error); }
  },

  async decideDataRequest(req: Request, res: Response, next: NextFunction) {
    try {
      const input = decisionSchema.parse(req.body);
      const item = await tenantPrivacyService.decideDataRequest({
        ...scope(req), requestId: routeParam(req, 'requestId'), actorUserId: req.auth!.userId, correlationId: String(res.getHeader('x-request-id') ?? ''), ...input,
      });
      if (!item) return res.status(409).json({ success: false, error: { code: 'PRIVACY_REQUEST_NOT_REVIEWABLE', message: 'Request not found, already decided, or legal approval is incomplete.' } });
      res.json({ success: true, data: item });
    } catch (error) { next(error); }
  },
};
