import { DataAccessLog } from '../models/data-access-log.model.js';
import { ConsentRecord } from '../models/consent-record.model.js';
import { PrivacyDataRequest } from '../models/privacy-data-request.model.js';
import { DataRetentionPolicy } from '../models/data-retention-policy.model.js';

type TenantScope = { tenantId: string; clinicId: string };
type Pagination = { page?: number; perPage?: number };

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
    return DataAccessLog.create(input);
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
    source: 'clinic_portal' | 'patient_portal' | 'import' | 'other';
    signedAt?: Date;
    revokedAt?: Date | null;
    revocationReason?: string | null;
  }) {
    return ConsentRecord.create({ ...input, signedAt: input.signedAt ?? new Date() });
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

  async createDataRequest(input: {
    tenantId: string;
    clinicId: string;
    patientId: string;
    requestType: 'access' | 'export' | 'correction' | 'deletion';
    requestedByUserId: string;
    reason?: string;
  }) {
    return PrivacyDataRequest.create(input);
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
  }) {
    return DataRetentionPolicy.create({
      ...input,
      active: false,
      legalApprovalStatus: 'pending',
      approvedByUserId: null,
      approvedAt: null,
    });
  },

  async revokeConsent(input: { tenantId: string; clinicId: string; consentId: string; actorUserId: string; reason: string }) {
    const original = await ConsentRecord.findOne({
      _id: input.consentId, tenantId: input.tenantId, clinicId: input.clinicId, status: 'granted',
    }).select('+documentSnapshot').lean() as any;
    if (!original) return null;
    return ConsentRecord.create({
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
    });
  },

  async getDataRequest(input: { tenantId: string; clinicId: string; requestId: string }) {
    return PrivacyDataRequest.findOne({ _id: input.requestId, tenantId: input.tenantId, clinicId: input.clinicId }).lean();
  },

  async decideDataRequest(input: {
    tenantId: string; clinicId: string; requestId: string; actorUserId: string;
    decision: 'approved' | 'rejected'; legalReviewReference: string; resolutionNote?: string;
  }) {
    const request = await PrivacyDataRequest.findOne({
      _id: input.requestId, tenantId: input.tenantId, clinicId: input.clinicId,
      status: { $in: ['submitted', 'identity_review', 'in_review'] },
      ...(input.decision === 'approved' ? { legalReviewStatus: { $in: ['approved', 'not_required'] } } : {}),
    });
    if (!request) return null;
    request.status = input.decision;
    request.legalReviewRequired = true;
    request.legalReviewStatus = 'approved';
    request.legalReviewReference = input.legalReviewReference;
    request.decisionByUserId = input.actorUserId as any;
    request.decisionAt = new Date();
    request.resolutionNote = input.resolutionNote ?? '';
    await request.save();
    return request.toObject();
  },

};
