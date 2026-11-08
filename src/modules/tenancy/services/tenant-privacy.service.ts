import { DataAccessLog } from '../models/data-access-log.model.js';
import { ConsentRecord } from '../models/consent-record.model.js';
import { PrivacyDataRequest } from '../models/privacy-data-request.model.js';
import { DataRetentionPolicy } from '../models/data-retention-policy.model.js';
import { TenantAuditEvent } from '../models/tenant-audit-event.model.js';

type TenantScope = { tenantId: string; clinicId: string };
type Pagination = { page?: number; perPage?: number };

const writePrivacyAudit = async (input: { tenantId: string; clinicId?: string; actorUserId: string; action: string; targetType: string; targetId: string; requestId?: string | null }) => {
  try {
    await TenantAuditEvent.create({
      tenantId: input.tenantId, actorUserId: input.actorUserId,
      action: input.action, targetType: input.targetType, targetId: input.targetId,
      clinicId: input.clinicId ?? null, result: 'success',
      requestId: String(input.requestId ?? '').slice(0, 120), metadata: {},
    });
  } catch (error) {
    // Privacy records remain persisted; audit persistence failures are surfaced to server logs.
    console.error('Failed to persist privacy audit event', error instanceof Error ? error.message : 'unknown');
  }
};

const paginate = (query: Pagination) => {
  const page = Math.max(1, Math.floor(query.page ?? 1));
  const perPage = Math.min(100, Math.max(1, Math.floor(query.perPage ?? 25)));
  return { page, perPage, skip: (page - 1) * perPage };
};

export const tenantPrivacyService = {
  async recordPatientAccess(input: TenantScope & {
    actorUserId: string;
    patientId: string;
    accessReason: string;
    resourceType: string;
    resourceId?: string | null;
    correlationId?: string | null;
  }) {
    const item = await DataAccessLog.create(input);
    await writePrivacyAudit({ ...input, action: 'patient.data.accessed', targetType: input.resourceType, targetId: input.resourceId ?? input.patientId, requestId: input.correlationId });
    return item;
  },

  async listPatientAccessHistory(scope: TenantScope & { patientId: string } & Pagination) {
    const { page, perPage, skip } = paginate(scope);
    const filter = { tenantId: scope.tenantId, clinicId: scope.clinicId, patientId: scope.patientId };
    const [items, total] = await Promise.all([
      DataAccessLog.find(filter).sort({ accessedAt: -1 }).skip(skip).limit(perPage).lean(),
      DataAccessLog.countDocuments(filter),
    ]);
    return { items, pagination: { page, perPage, total, pages: Math.ceil(total / perPage) } };
  },

  async recordConsent(input: {
    tenantId: string;
    clinicId: string;
    patientId: string;
    consentType: string;
    documentVersion: string;
    documentHash: string;
    documentSnapshot: string;
    status: 'granted' | 'declined' | 'revoked';
    actorUserId: string;
    correlationId?: string;
    source: 'clinic_portal' | 'patient_portal' | 'import' | 'other';
    signedAt?: Date;
    revokedAt?: Date | null;
    revocationReason?: string | null;
  }) {
    const item = await ConsentRecord.create({ ...input, signedAt: input.signedAt ?? new Date() });
    await writePrivacyAudit({ tenantId: input.tenantId, clinicId: input.clinicId, actorUserId: input.actorUserId, action: 'patient.consent.recorded', targetType: 'ConsentRecord', targetId: String(item._id), requestId: input.correlationId });
    return item;
  },

  async listPatientConsents(scope: TenantScope & { patientId: string } & Pagination) {
    const { page, perPage, skip } = paginate(scope);
    const filter = { tenantId: scope.tenantId, clinicId: scope.clinicId, patientId: scope.patientId };
    const [items, total] = await Promise.all([
      ConsentRecord.find(filter).select('-documentSnapshot').sort({ createdAt: -1 }).skip(skip).limit(perPage).lean(),
      ConsentRecord.countDocuments(filter),
    ]);
    return { items, pagination: { page, perPage, total, pages: Math.ceil(total / perPage) } };
  },

  async getConsent(input: { tenantId: string; clinicId: string; consentId: string }) {
    return ConsentRecord.findOne({
      _id: input.consentId, tenantId: input.tenantId, clinicId: input.clinicId,
    }).select('-documentSnapshot').lean();
  },

  async listRetentionPolicies(input: { tenantId: string; page?: number; perPage?: number }) {
    const { page, perPage, skip } = paginate(input);
    const filter = { tenantId: input.tenantId };
    const [items, total] = await Promise.all([
      DataRetentionPolicy.find(filter).sort({ createdAt: -1 }).skip(skip).limit(perPage).lean(),
      DataRetentionPolicy.countDocuments(filter),
    ]);
    return { items, pagination: { page, perPage, total, pages: Math.ceil(total / perPage) } };
  },

  async createDataRequest(input: {
    tenantId: string;
    clinicId: string;
    patientId: string;
    requestType: 'access' | 'export' | 'correction' | 'deletion';
    requestedByUserId: string;
    correlationId?: string;
    reason?: string;
  }) {
    const item = await PrivacyDataRequest.create(input);
    await writePrivacyAudit({ tenantId: input.tenantId, clinicId: input.clinicId, actorUserId: input.requestedByUserId, action: 'privacy.request.submitted', targetType: 'PrivacyDataRequest', targetId: String(item._id), requestId: input.correlationId });
    return item;
  },

  async listDataRequests(scope: TenantScope & Pagination) {
    const { page, perPage, skip } = paginate(scope);
    const filter = { tenantId: scope.tenantId, clinicId: scope.clinicId };
    const [items, total] = await Promise.all([
      PrivacyDataRequest.find(filter).sort({ createdAt: -1 }).skip(skip).limit(perPage).lean(),
      PrivacyDataRequest.countDocuments(filter),
    ]);
    return { items, pagination: { page, perPage, total, pages: Math.ceil(total / perPage) } };
  },

  async createRetentionPolicy(input: {
    tenantId: string;
    recordType: string;
    retentionPeriodDays?: number | null;
    action: 'archive' | 'anonymize' | 'delete' | 'manual_review';
    legalBasisReference?: string | null;
    actorUserId: string;
    correlationId?: string;
  }) {
    const item = await DataRetentionPolicy.create({
      tenantId: input.tenantId, recordType: input.recordType,
      retentionPeriodDays: input.retentionPeriodDays, action: input.action,
      legalBasisReference: input.legalBasisReference ?? null,
      active: false, legalApprovalStatus: 'pending', approvedByUserId: null, approvedAt: null,
    });
    await writePrivacyAudit({ tenantId: input.tenantId, actorUserId: input.actorUserId, action: 'privacy.retention_policy.proposed', targetType: 'DataRetentionPolicy', targetId: String(item._id), requestId: input.correlationId });
    return item;
  },

  async approveRetentionPolicy(input: { tenantId: string; policyId: string; actorUserId: string; legalBasisReference: string; correlationId?: string }) {
    return DataRetentionPolicy.findOneAndUpdate({
      _id: input.policyId, tenantId: input.tenantId, legalApprovalStatus: 'pending', active: false,
    }, {
      $set: {
        legalApprovalStatus: 'approved',
        legalBasisReference: input.legalBasisReference,
        approvedByUserId: input.actorUserId,
        approvedAt: new Date(),
        active: true,
      },
    }, { new: true, runValidators: true }).lean().then(async (item) => {
      if (item) await writePrivacyAudit({ tenantId: input.tenantId, actorUserId: input.actorUserId, action: 'privacy.retention_policy.approved', targetType: 'DataRetentionPolicy', targetId: input.policyId, requestId: input.correlationId });
      return item;
    });
  },

  async revokeConsent(input: { tenantId: string; clinicId: string; consentId: string; actorUserId: string; reason: string; correlationId?: string }) {
    const original = await ConsentRecord.findOne({
      _id: input.consentId, tenantId: input.tenantId, clinicId: input.clinicId, status: 'granted',
    }).select('+documentSnapshot').lean() as any;
    if (!original) return null;
    if (await ConsentRecord.exists({ tenantId: input.tenantId, revokesConsentId: original._id })) return null;
    let revoked;
    try {
      revoked = await ConsentRecord.create({
        tenantId: original.tenantId,
        clinicId: original.clinicId,
        patientId: original.patientId,
        consentType: original.consentType,
        documentVersion: original.documentVersion,
        documentHash: original.documentHash,
        documentSnapshot: original.documentSnapshot,
        status: 'revoked',
        actorUserId: input.actorUserId,
        source: 'clinic_portal',
        signedAt: new Date(),
        revokedAt: new Date(),
        revocationReason: input.reason,
        revokesConsentId: original._id,
      });
    } catch (error) {
      // The unique partial index is the concurrency guard when two revocations race.
      if (error && typeof error === 'object' && 'code' in error && error.code === 11000) return null;
      throw error;
    }
    await writePrivacyAudit({ tenantId: input.tenantId, clinicId: input.clinicId, actorUserId: input.actorUserId, action: 'patient.consent.revoked', targetType: 'ConsentRecord', targetId: String(revoked._id), requestId: input.correlationId });
    return revoked;
  },

  async getDataRequest(input: { tenantId: string; clinicId: string; requestId: string }) {
    return PrivacyDataRequest.findOne({ _id: input.requestId, tenantId: input.tenantId, clinicId: input.clinicId }).lean();
  },

  async reviewDataRequest(input: { tenantId: string; clinicId: string; requestId: string; reviewerUserId: string; decision: 'approved' | 'rejected'; legalReviewReference: string; correlationId?: string }) {
    return PrivacyDataRequest.findOneAndUpdate({
      _id: input.requestId, tenantId: input.tenantId, clinicId: input.clinicId,
      status: { $in: ['submitted', 'identity_review', 'in_review'] },
      legalReviewStatus: 'pending',
    }, {
      $set: {
        legalReviewRequired: true,
        legalReviewStatus: input.decision,
        legalReviewReference: input.legalReviewReference,
        legalReviewedByUserId: input.reviewerUserId,
        legalReviewedAt: new Date(),
      },
    }, { new: true, runValidators: true }).lean().then(async (item) => {
      if (item) await writePrivacyAudit({ tenantId: input.tenantId, clinicId: input.clinicId, actorUserId: input.reviewerUserId, action: 'privacy.request.legal_reviewed', targetType: 'PrivacyDataRequest', targetId: input.requestId, requestId: input.correlationId });
      return item;
    });
  },

  async fulfillDataRequest(input: { tenantId: string; clinicId: string; requestId: string; actorUserId: string; resolutionNote: string; correlationId?: string }) {
    const request = await PrivacyDataRequest.findOneAndUpdate({
      _id: input.requestId, tenantId: input.tenantId, clinicId: input.clinicId,
      status: 'approved', legalReviewStatus: 'approved',
    }, {
      $set: { status: 'fulfilled', fulfilledAt: new Date(), decisionByUserId: input.actorUserId, resolutionNote: input.resolutionNote },
    }, { new: true, runValidators: true }).lean();
    if (request) await writePrivacyAudit({ tenantId: input.tenantId, clinicId: input.clinicId, actorUserId: input.actorUserId, action: 'privacy.request.fulfilled', targetType: 'PrivacyDataRequest', targetId: input.requestId, requestId: input.correlationId });
    return request;
  },

  async decideDataRequest(input: {
    tenantId: string; clinicId: string; requestId: string; actorUserId: string;
    decision: 'approved' | 'rejected'; resolutionNote?: string; correlationId?: string;
  }) {
    const request = await PrivacyDataRequest.findOneAndUpdate({
      _id: input.requestId, tenantId: input.tenantId, clinicId: input.clinicId,
      status: { $in: ['submitted', 'identity_review', 'in_review'] },
      legalReviewStatus: input.decision,
      legalReviewedByUserId: { $ne: input.actorUserId },
    }, {
      $set: {
        status: input.decision,
        legalReviewRequired: true,
        decisionByUserId: input.actorUserId,
        decisionAt: new Date(),
        resolutionNote: input.resolutionNote ?? '',
      },
    }, { new: true, runValidators: true }).lean();
    if (!request) return null;
    await writePrivacyAudit({ tenantId: input.tenantId, clinicId: input.clinicId, actorUserId: input.actorUserId, action: `privacy.request.${input.decision}`, targetType: 'PrivacyDataRequest', targetId: input.requestId, requestId: input.correlationId });
    return request;
  },

};
