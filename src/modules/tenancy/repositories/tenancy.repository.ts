import { Types } from 'mongoose';
import { Tenant } from '../models/tenant.model.js';
import { Clinic } from '../models/clinic.model.js';
import { Branch } from '../models/branch.model.js';
import { Subscription } from '../models/subscription.model.js';
import { SubscriptionPayment } from '../models/subscription-payment.model.js';
import { TenantMembership } from '../models/tenant-membership.model.js';
import { User } from '../../auth/models/user.model.js';
import { TenantDocument } from '../models/tenant-document.model.js';
import { BranchHoliday } from '../models/branch-holiday.model.js';
import { TenantAuditEvent } from '../models/tenant-audit-event.model.js';
import { TenantConfiguration } from '../models/tenant-configuration.model.js';
import { TenantInvitation } from '../models/tenant-invitation.model.js';

export const tenancyRepository = {
  findTenantConfiguration(tenantId: string) {
    return TenantConfiguration.findOne({ tenantId }).lean() as any;
  },
  createTenantConfiguration(data: Record<string, unknown>) {
    return TenantConfiguration.create(data);
  },
  updateTenantConfiguration(tenantId: string, expectedVersion: number, values: Record<string, unknown>, changedBy: string) {
    return TenantConfiguration.findOneAndUpdate(
      { tenantId, version: expectedVersion },
      {
        $set: { values, version: expectedVersion + 1 },
        $push: { history: { $each: [{ version: expectedVersion + 1, values, changedBy, changedAt: new Date() }], $slice: -100 } },
      },
      { new: true, runValidators: true },
    );
  },
  listClinicsForConfiguration(tenantId: string, clinicIds?: string[]) {
    return Clinic.find({ tenantId, ...(clinicIds ? { _id: { $in: clinicIds } } : {}) })
      .select('name status settings')
      .lean();
  },
  applyTenantConfigurationToClinic(tenantId: string, clinicId: string, values: Record<string, unknown>, version: number) {
    return Clinic.findOneAndUpdate(
      { _id: clinicId, tenantId, $or: [{ 'settings.organizationDefaultsVersion': { $lt: version } }, { 'settings.organizationDefaultsVersion': { $exists: false } }] },
      { $set: { 'settings.organizationDefaults': values, 'settings.organizationDefaultsVersion': version } },
      { new: true, runValidators: true },
    );
  },
  createTenantAuditEvent(data: Record<string, unknown>) {
    return TenantAuditEvent.create(data);
  },
  async exportTenantAuditEvents(filter: Record<string, unknown>, limit: number) {
    return TenantAuditEvent.find(filter).sort({ createdAt: -1 }).limit(limit).lean();
  },
  async listTenantAuditEvents(filter: Record<string, unknown>, page: number, perPage: number) {
    const [items, total] = await Promise.all([
      TenantAuditEvent.find(filter).sort({ createdAt: -1 }).skip((page - 1) * perPage).limit(perPage).lean(),
      TenantAuditEvent.countDocuments(filter),
    ]);
    return { items, pagination: { page, perPage, total, pages: Math.ceil(total / perPage) } };
  },
  async listTenantMembershipHistory(tenantId: string, membershipId: string, page: number, perPage: number) {
    const acceptances = await TenantAuditEvent.find({
      tenantId, targetType: 'tenant_membership', targetId: membershipId,
      action: 'membership.invitation.accepted',
    }).select('metadata.invitationId').lean() as any[];
    const invitationIds = [...new Set(acceptances.map((event) => event.metadata?.invitationId).filter(Boolean).map(String))];
    const filter: Record<string, unknown> = {
      tenantId,
      $or: [
        { targetType: 'tenant_membership', targetId: membershipId },
        ...(invitationIds.length ? [{ targetType: 'tenant_invitation', targetId: { $in: invitationIds } }] : []),
      ],
    };
    const [items, total] = await Promise.all([
      TenantAuditEvent.find(filter).sort({ createdAt: -1 }).skip((page - 1) * perPage).limit(perPage).lean(),
      TenantAuditEvent.countDocuments(filter),
    ]);
    return { items, pagination: { page, perPage, total, pages: Math.ceil(total / perPage) } };
  },
  createTenantDocument(data: Record<string, unknown>) {
    return TenantDocument.create(data);
  },
  countExpiringTenantDocuments(tenantId: string, from: Date, to: Date) {
    return TenantDocument.countDocuments({ tenantId, status: 'active', expiresAt: { $gte: from, $lte: to } });
  },
  listTenantDocuments(tenantId: string, clinicId: string | null = null) {
    return TenantDocument.find({ tenantId, clinicId, status: 'active' }).sort({ createdAt: -1 }).lean();
  },
  async listTenantDocumentVersions(tenantId: string, documentId: string, clinicId: string | null = null) {
    const scope = { tenantId, clinicId };
    const anchor = await TenantDocument.findOne({ _id: documentId, ...scope }).select('-storageKey').lean() as any;
    if (!anchor) return null;
    const byId = new Map<string, any>([[String(anchor._id), anchor]]);
    let current: any = anchor;
    for (let depth = 0; current.replacesDocumentId && depth < 100; depth += 1) {
      const parent = await TenantDocument.findOne({ _id: current.replacesDocumentId, ...scope }).select('-storageKey').lean() as any;
      if (!parent || byId.has(String(parent._id))) break;
      byId.set(String(parent._id), parent);
      current = parent;
    }
    current = anchor;
    for (let depth = 0; depth < 100; depth += 1) {
      const child = await TenantDocument.findOne({ ...scope, replacesDocumentId: current._id }).select('-storageKey').sort({ version: -1 }).lean() as any;
      if (!child || byId.has(String(child._id))) break;
      byId.set(String(child._id), child);
      current = child;
    }
    return [...byId.values()].sort((a, b) => (a.version ?? 1) - (b.version ?? 1));
  },
  findTenantDocumentMetadata(tenantId: string, documentId: string, clinicId: string | null = null) {
    return TenantDocument.findOne({ _id: documentId, tenantId, clinicId, status: 'active' }).select('-storageKey').lean();
  },
  findTenantDocument(tenantId: string, documentId: string, clinicId: string | null = null) {
    return TenantDocument.findOne({ _id: documentId, tenantId, clinicId, status: 'active' }).select('+storageKey');
  },
  archiveTenantDocument(tenantId: string, documentId: string, userId: string, clinicId: string | null = null) {
    return TenantDocument.findOneAndUpdate(
      { _id: documentId, tenantId, clinicId, status: 'active' },
      { $set: { status: 'archived', archivedAt: new Date(), archivedBy: userId } },
      { new: true, runValidators: true },
    );
  },
  listTenants() {
    return Tenant.find().sort({ createdAt: 1 });
  },
  findTenantById(id: string) {
    return Tenant.findById(id);
  },
  findTenantBySlug(slug: string, excludeId?: string) {
    return Tenant.findOne({
      slug,
      ...(excludeId ? { _id: { $ne: excludeId } } : {}),
    }).select('_id');
  },
  createTenant(data: Record<string, unknown>) {
    return Tenant.create(data);
  },
  updateTenant(id: string, data: Record<string, unknown>) {
    return Tenant.findByIdAndUpdate(
      id,
      { $set: data },
      { new: true, runValidators: true },
    );
  },
  updateTenantStatus(id: string, status: 'active' | 'suspended') {
    return Tenant.findByIdAndUpdate(
      id,
      { status },
      { new: true, runValidators: true },
    );
  },
  deleteTenant(id: string) {
    return Tenant.deleteOne({ _id: id });
  },
  deleteTenantMemberships(tenantId: string) {
    return TenantMembership.deleteMany({ tenantId });
  },
  deleteTenantClinics(tenantId: string) {
    return Clinic.deleteMany({ tenantId });
  },
  findUserByEmail(email: string) {
    return User.findOne({ email: email.toLowerCase() });
  },
  createUser(data: Record<string, unknown>) {
    return User.create(data);
  },
  createMembership(data: Record<string, unknown>) {
    return TenantMembership.create(data);
  },
  findSubscriptionByTenantId(tenantId: string) {
    return Subscription.findOne({ tenantId });
  },
  upsertSubscription(tenantId: string, data: Record<string, unknown>) {
    return Subscription.findOneAndUpdate(
      { tenantId },
      { $set: data, $setOnInsert: { tenantId } },
      {
        new: true,
        upsert: true,
        runValidators: true,
        setDefaultsOnInsert: true,
      },
    );
  },
  deleteTenantSubscription(tenantId: string) {
    return Subscription.deleteOne({ tenantId });
  },
  async listSubscriptionPayments(tenantId: string) {
    return SubscriptionPayment.find({ tenantId })
      .select('amount currency status method provider invoiceNumber invoiceUrl paidAt failureReason recordedAt createdAt')
      .sort({ createdAt: -1 })
      .lean();
  },
  listTenantInvoices(tenantId: string) {
    return SubscriptionPayment.find({
      tenantId,
      $or: [{ invoiceNumber: { $gt: '' } }, { invoiceUrl: { $gt: '' } }],
    }).select('amount currency status method provider invoiceNumber invoiceUrl paidAt recordedAt createdAt').sort({ createdAt: -1 }).lean();
  },
  findTenantInvoice(tenantId: string, invoiceId: string) {
    return SubscriptionPayment.findOne({
      _id: invoiceId,
      tenantId,
      $or: [{ invoiceNumber: { $gt: '' } }, { invoiceUrl: { $gt: '' } }],
    }).select('amount currency status method provider invoiceNumber invoiceUrl paidAt failureReason recordedAt createdAt').lean();
  },
  async addSubscriptionPayment(
    tenantId: string,
    payment: Record<string, unknown>,
  ) {
    const subscription = await Subscription.findOne({ tenantId }).select('_id');
    if (!subscription) return null;
    return SubscriptionPayment.create({
      ...payment,
      tenantId,
      subscriptionId: subscription._id,
    });
  },
  deleteTenantSubscriptionPayments(tenantId: string) {
    return SubscriptionPayment.deleteMany({ tenantId });
  },
  async getDashboardCounts(tenantId: string) {
    const filter = { tenantId };
    const [clinicCount, activeClinicCount, branchCount, activeBranchCount, draftBranchCount, temporarilyClosedBranchCount, suspendedBranchCount, closedBranchCount, activeMemberIds, pendingInvitationCount] = await Promise.all([
      Clinic.countDocuments(filter),
      Clinic.countDocuments({ ...filter, status: 'active' }),
      Branch.countDocuments(filter),
      Branch.countDocuments({ ...filter, status: 'active' }),
      Branch.countDocuments({ ...filter, status: 'draft' }),
      Branch.countDocuments({ ...filter, status: 'temporarily_closed' }),
      Branch.countDocuments({ ...filter, status: 'suspended' }),
      Branch.countDocuments({ ...filter, status: 'closed' }),
      TenantMembership.distinct('userId', { ...filter, status: 'active' }),
      TenantInvitation.countDocuments({ tenantId, status: { $in: ['pending', 'processing'] }, expiresAt: { $gt: new Date() } }),
    ]);
    return {
      clinics: { total: clinicCount, active: activeClinicCount, suspended: clinicCount - activeClinicCount },
      branches: {
        total: branchCount,
        active: activeBranchCount,
        draft: draftBranchCount,
        temporarilyClosed: temporarilyClosedBranchCount,
        suspended: suspendedBranchCount,
        closed: closedBranchCount,
      },
      activeMembers: activeMemberIds.length,
      pendingInvitations: pendingInvitationCount,
    };
  },
  async listDashboardClinics(tenantId: string) {
    return Clinic.aggregate([
      { $match: { tenantId: new Types.ObjectId(tenantId) } },
      { $lookup: { from: 'branches', let: { clinicId: '$_id', tenantId: '$tenantId' }, pipeline: [
        { $match: { $expr: { $and: [{ $eq: ['$clinicId', '$$clinicId'] }, { $eq: ['$tenantId', '$$tenantId'] }] } } },
        { $group: { _id: null, total: { $sum: 1 }, active: { $sum: { $cond: [{ $eq: ['$status', 'active'] }, 1, 0] } } } },
      ], as: 'branchStats' } },
      { $addFields: { branchStats: { $ifNull: [{ $arrayElemAt: ['$branchStats', 0] }, { total: 0, active: 0 }] } } },
      { $lookup: { from: 'tenantmemberships', let: { clinicId: '$_id', tenantId: '$tenantId' }, pipeline: [
        { $match: { $expr: { $and: [{ $eq: ['$tenantId', '$$tenantId'] }, { $eq: ['$clinicId', '$$clinicId'] }, { $eq: ['$scope', 'clinic'] }, { $eq: ['$role', 'clinic_manager'] }, { $eq: ['$status', 'active'] }] } } },
        { $sort: { createdAt: 1 } },
        { $limit: 1 },
        { $lookup: { from: 'users', localField: 'userId', foreignField: '_id', as: 'user' } },
        { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },
        { $project: { _id: 0, name: '$user.name', email: '$user.email' } },
      ], as: 'clinicManager' } },
      { $lookup: { from: 'tenantauditevents', let: { clinicId: '$_id', clinicIdString: { $toString: '$_id' }, tenantId: '$tenantId' }, pipeline: [
        { $match: { $expr: { $and: [{ $eq: ['$tenantId', '$$tenantId'] }, { $or: [{ $eq: ['$clinicId', '$$clinicId'] }, { $eq: ['$targetId', '$$clinicIdString'] }] }] } } },
        { $sort: { createdAt: -1 } },
        { $limit: 1 },
        { $project: { _id: 0, createdAt: 1, action: 1 } },
      ], as: 'lastActivity' } },
      { $project: { name: 1, slug: 1, code: 1, status: 1, clinicType: 1, updatedAt: 1, branchCount: '$branchStats.total', activeBranchCount: '$branchStats.active', manager: { $arrayElemAt: ['$clinicManager', 0] }, lastActivity: { $arrayElemAt: ['$lastActivity', 0] } } },
      { $sort: { name: 1 } },
    ]);
  },
  listAllClinics(tenantId: string) {
    return Clinic.find({ tenantId }).sort({ name: 1 });
  },
  async listClinics(tenantId: string, query: { search?: string; status?: string; page: number; perPage: number }) {
    const filter: Record<string, unknown> = { tenantId };
    if (query.status) filter.status = query.status;
    if (query.search) {
      const slash = String.fromCharCode(92);
      const regexMeta = '.*+?^$' + '{}' + '()|[]' + slash;
      const escaped = query.search.split('').map((character) => regexMeta.includes(character) ? slash + character : character).join('');
      filter.$or = [{ name: { $regex: escaped, $options: 'i' } }, { code: { $regex: escaped, $options: 'i' } }];
    }
    const [items, total] = await Promise.all([
      Clinic.find(filter).sort({ name: 1 }).skip((query.page - 1) * query.perPage).limit(query.perPage).lean(),
      Clinic.countDocuments(filter),
    ]);
    return { items, pagination: { page: query.page, perPage: query.perPage, total, pages: Math.ceil(total / query.perPage) } };
  },
  findClinicById(id: string, tenantId: string) {
    return Clinic.findOne({ _id: id, tenantId });
  },
  findClinicBySlug(tenantId: string, slug: string, excludeId?: string) {
    return Clinic.findOne({
      tenantId,
      slug,
      ...(excludeId ? { _id: { $ne: excludeId } } : {}),
    }).select('_id');
  },
  createClinic(data: Record<string, unknown>) {
    return Clinic.create(data);
  },
  deleteClinic(id: string, tenantId: string) {
    return Clinic.deleteOne({ _id: id, tenantId });
  },
  updateClinic(id: string, tenantId: string, data: Record<string, unknown>) {
    return Clinic.findOneAndUpdate(
      { _id: id, tenantId },
      { $set: data },
      { new: true, runValidators: true },
    );
  },
  listBranchHolidays(filter: Record<string, unknown>) {
    return BranchHoliday.find({ ...filter, status: 'active' }).sort({ startDate: 1 }).lean();
  },
  acquireBranchHolidayMutationLock(tenantId: string, clinicId: string, branchId: string, token: string, now: Date, expiresAt: Date) {
    return Branch.findOneAndUpdate(
      {
        _id: branchId, tenantId, clinicId,
        $or: [
          { holidayMutationLockExpiresAt: { $lte: now } },
          { holidayMutationLockExpiresAt: null },
          { holidayMutationLockExpiresAt: { $exists: false } },
        ],
      },
      { $set: { holidayMutationLockToken: token, holidayMutationLockExpiresAt: expiresAt } },
      { new: true, projection: { _id: 1 } },
    );
  },
  releaseBranchHolidayMutationLock(tenantId: string, clinicId: string, branchId: string, token: string) {
    return Branch.updateOne(
      { _id: branchId, tenantId, clinicId, holidayMutationLockToken: token },
      { $set: { holidayMutationLockToken: null, holidayMutationLockExpiresAt: null } },
    );
  },
  findOverlappingBranchHoliday(filter: Record<string, unknown>, startDate: Date, endDate: Date, excludeHolidayId?: string) {
    return BranchHoliday.findOne({
      ...filter,
      status: 'active',
      ...(excludeHolidayId ? { _id: { $ne: excludeHolidayId } } : {}),
      startDate: { $lte: endDate },
      endDate: { $gte: startDate },
    }).select('_id title startDate endDate');
  },
  createBranchHoliday(data: Record<string, unknown>) {
    return BranchHoliday.create(data);
  },
  updateBranchHoliday(tenantId: string, clinicId: string, branchId: string, holidayId: string, data: Record<string, unknown>) {
    return BranchHoliday.findOneAndUpdate(
      { _id: holidayId, tenantId, clinicId, branchId, status: 'active' },
      { $set: data },
      { new: true, runValidators: true },
    );
  },
  cancelBranchHoliday(tenantId: string, clinicId: string, branchId: string, holidayId: string, userId: string) {
    return BranchHoliday.findOneAndUpdate(
      { _id: holidayId, tenantId, clinicId, branchId, status: 'active' },
      { $set: { status: 'cancelled', cancelledAt: new Date(), cancelledBy: userId } },
      { new: true, runValidators: true },
    );
  },
  async listBranches(filter: Record<string, unknown>, query: { search?: string; status?: string; page: number; perPage: number }) {
    const scopedFilter: Record<string, unknown> = { ...filter };
    if (query.status) scopedFilter.status = query.status;
    if (query.search) {
      const slash = String.fromCharCode(92);
      const regexMeta = '.*+?^$' + '{}' + '()|[]' + slash;
      const escaped = query.search.split('').map((character) => regexMeta.includes(character) ? slash + character : character).join('');
      scopedFilter.$or = [{ name: { $regex: escaped, $options: 'i' } }, { code: { $regex: escaped, $options: 'i' } }];
    }
    const [items, total] = await Promise.all([
      Branch.find(scopedFilter).sort({ name: 1 }).skip((query.page - 1) * query.perPage).limit(query.perPage).lean(),
      Branch.countDocuments(scopedFilter),
    ]);
    return { items, pagination: { page: query.page, perPage: query.perPage, total, pages: Math.ceil(total / query.perPage) } };
  },
  createBranch(data: Record<string, unknown>) {
    return Branch.create(data);
  },
  findBranchByCode(clinicId: string, code: string, excludeId?: string) {
    return Branch.findOne({ clinicId, code, ...(excludeId ? { _id: { $ne: excludeId } } : {}) }).select('_id');
  },
  findBranchBySlug(tenantId: string, clinicId: string, slug: string, excludeId?: string) {
    return Branch.findOne({
      tenantId,
      clinicId,
      slug,
      ...(excludeId ? { _id: { $ne: excludeId } } : {}),
    }).select('_id');
  },
  findBranchById(id: string, tenantId: string, clinicId: string) {
    return Branch.findOne({ _id: id, tenantId, clinicId });
  },
  updateBranch(id: string, tenantId: string, clinicId: string, data: Record<string, unknown>) {
    return Branch.findOneAndUpdate(
      { _id: id, tenantId, clinicId },
      { $set: data },
      { new: true, runValidators: true },
    );
  },
  transitionBranchStatus(id: string, tenantId: string, clinicId: string, allowedStatuses: string[], data: Record<string, unknown>) {
    return Branch.findOneAndUpdate(
      { _id: id, tenantId, clinicId, status: { $in: allowedStatuses } },
      { $set: data },
      { new: true, runValidators: true },
    );
  },
  getTenantContext(
    tenantId: string,
    clinicId: string | null,
    branchId: string | null,
  ) {
    return Promise.all([
      Tenant.findById(tenantId).select(
        'name displayName legalName slug businessType description industry status contact address branding preferences',
      ),
      clinicId
        ? Clinic.findOne({ _id: clinicId, tenantId }).select(
            'name slug code status clinicType timezone preferences contact address branding bookingSettings settings operatingHours',
          )
        : null,
      branchId
        ? Branch.findOne({ _id: branchId, tenantId, clinicId }).select(
            'name slug status timezone cityId operatingHours',
          )
        : null,
    ]);
  },
  createTenantInvitation(data: Record<string, unknown>) { return TenantInvitation.create(data); },
  findTenantInvitationById(tenantId: string, invitationId: string) { return TenantInvitation.findOne({ _id: invitationId, tenantId }); },
  expirePendingTenantInvitations(tenantId: string, email: string, now: Date) { return TenantInvitation.updateMany({ tenantId, email, status: 'pending', expiresAt: { $lte: now } }, { $set: { status: 'expired' } }); },
  findPendingTenantInvitation(tenantId: string, email: string) { return TenantInvitation.findOne({ tenantId, email, status: { $in: ['pending', 'processing'] }, expiresAt: { $gt: new Date() } }); },
  findTenantInvitationByTokenHash(tokenHash: string) { return TenantInvitation.findOne({ tokenHash }).select('+tokenHash'); },
  async listTenantInvitations(tenantId: string, query: { search?: string; status?: string; page: number; perPage: number } = { page: 1, perPage: 25 }) {
    const filter: Record<string, unknown> = { tenantId };
    const now = new Date();
    if (query.status === 'expired') filter.$or = [{ status: 'expired' }, { status: 'pending', expiresAt: { $lte: now } }];
    else if (query.status === 'pending') { filter.status = 'pending'; filter.expiresAt = { $gt: now }; }
    else if (query.status) filter.status = query.status;
    if (query.search) {
      const escaped = [...query.search].map((char) => '.*+?^$()|[]{}\\'.includes(char) ? '\\' + char : char).join('');
      filter.email = { $regex: escaped, $options: 'i' };
    }
    const skip = (query.page - 1) * query.perPage;
    const [items, total] = await Promise.all([
      TenantInvitation.find(filter).select('-tokenHash').populate('invitedBy', 'name email').populate('acceptedBy', 'name email').sort({ createdAt: -1 }).skip(skip).limit(query.perPage).lean(),
      TenantInvitation.countDocuments(filter),
    ]);
    return { items, pagination: { page: query.page, perPage: query.perPage, total, pages: Math.ceil(total / query.perPage) } };
  },
  revokeTenantInvitationIfAvailable(tenantId: string, invitationId: string, now: Date, userId: string) {\n    const staleProcessingAt = new Date(now.getTime() - 10 * 60 * 1000);\n    return TenantInvitation.findOneAndUpdate({ _id: invitationId, tenantId, $or: [\n      { status: { $in: ['pending', 'expired'] } },\n      { status: 'processing', $or: [{ processingAt: null }, { processingAt: { $lte: staleProcessingAt } }] },\n    ] }, { $set: { status: 'revoked', processingAt: null, revokedAt: now, revokedBy: userId } }, { new: true, runValidators: true }).select('-tokenHash');\n  },\n  rotateTenantInvitationIfAvailable(tenantId: string, invitationId: string, now: Date, tokenHash: string) {\n    const staleProcessingAt = new Date(now.getTime() - 10 * 60 * 1000);\n    return TenantInvitation.findOneAndUpdate({ _id: invitationId, tenantId, $or: [\n      { status: { $in: ['pending', 'expired'] } },\n      { status: 'processing', $or: [{ processingAt: null }, { processingAt: { $lte: staleProcessingAt } }] },\n    ] }, { $set: { tokenHash, status: 'pending', processingAt: null, expiresAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000), revokedAt: null, revokedBy: null } }, { new: true, runValidators: true }).select('-tokenHash');\n  },
  claimTenantInvitation(tokenHash: string, now: Date) {
    const staleProcessingAt = new Date(now.getTime() - 10 * 60 * 1000);
    return TenantInvitation.findOneAndUpdate({
      tokenHash,
      expiresAt: { $gt: now },
      $or: [
        { status: 'pending' },
        { status: 'processing', $or: [{ processingAt: null }, { processingAt: { $lte: staleProcessingAt } }] },
      ],
    }, { $set: { status: 'processing', processingAt: now } }, { new: true }).select('+tokenHash');
  },
  updateClaimedTenantInvitation(invitationId: string, processingAt: Date, update: Record<string, unknown>) { return TenantInvitation.findOneAndUpdate({ _id: invitationId, status: 'processing', processingAt }, { $set: update }, { new: true, runValidators: true }); },
  createTenantMembership(data: Record<string, unknown>) { return TenantMembership.create(data); },
  deleteTenantMembershipById(id: string) { return TenantMembership.deleteOne({ _id: id }); },
  findTenantMembershipForUser(userId: string, tenantId: string) { return TenantMembership.findOne({ userId, tenantId, status: { $in: ['active', 'invited'] } }); },
  findExistingMembershipForInvitation(userId: string, tenantId: string, clinicId: string | null) { return TenantMembership.findOne({ userId, tenantId, clinicId, status: { $in: ['active', 'invited'] } }); },
  async listTenantMemberships(tenantId: string, query: { search?: string; status?: string; role?: string; scope?: string; clinicId?: string; branchId?: string; lastLoginFrom?: Date; lastLoginTo?: Date; page: number; perPage: number } = { page: 1, perPage: 25 }) {
    const filter: Record<string, unknown> = { tenantId };
    if (query.status) filter.status = query.status;
    if (query.role) filter.role = query.role;
    if (query.branchId) {
      if (!query.clinicId) throw new Error('clinicId is required when filtering memberships by branchId.');
      filter.$or = [
        { scope: 'clinic', clinicId: query.clinicId },
        { scope: 'branch', clinicId: query.clinicId, branchIds: query.branchId },
      ];
    } else {
      if (query.scope) filter.scope = query.scope;
      if (query.clinicId) filter.clinicId = query.clinicId;
    }
    const userFilter: Record<string, unknown> = {};
    if (query.search) {
      const escaped = [...query.search].map((char) => '.*+?^$()|[]{}\\'.includes(char) ? '\\' + char : char).join('');
      userFilter.$or = [
        { name: { $regex: escaped, $options: 'i' } },
        { email: { $regex: escaped, $options: 'i' } },
      ];
    }
    if (query.lastLoginFrom || query.lastLoginTo) {
      userFilter.lastLoginAt = {
        ...(query.lastLoginFrom ? { $gte: query.lastLoginFrom } : {}),
        ...(query.lastLoginTo ? { $lte: query.lastLoginTo } : {}),
      };
    }
    if (Object.keys(userFilter).length) {
      const userIds = await User.find(userFilter).distinct('_id');
      filter.userId = { $in: userIds };
    }
    const skip = (query.page - 1) * query.perPage;
    const [items, total] = await Promise.all([
      TenantMembership.find(filter)
        .populate('userId', 'name email isActive lastLoginAt')
        .populate('clinicId', 'name slug status')
        .populate('branchIds', 'name slug status')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(query.perPage)
        .lean(),
      TenantMembership.countDocuments(filter),
    ]);
    return { items, pagination: { page: query.page, perPage: query.perPage, total, pages: Math.ceil(total / query.perPage) } };
  },
  listMembershipsForUser(tenantId: string, userId: string) {
    return TenantMembership.find({ tenantId, userId })
      .populate('clinicId', 'name slug status')
      .populate('branchIds', 'name slug status')
      .sort({ createdAt: 1 })
      .lean();
  },
  async findTenantUserDetails(tenantId: string, userId: string) {
    const [user, memberships] = await Promise.all([
      User.findById(userId).select('name email isActive lastLoginAt createdAt').lean(),
      TenantMembership.find({ tenantId, userId })
        .populate('clinicId', 'name slug status')
        .populate('branchIds', 'name slug status')
        .sort({ createdAt: 1 })
        .lean(),
    ]);
    if (!user || !memberships.length) return null;
    return { ...user, memberships };
  },
  findTenantMembershipById(tenantId: string, membershipId: string) {
    return TenantMembership.findOne({ _id: membershipId, tenantId });
  },
  acquireTenantEntitlementLock(tenantId: string, now: Date, leaseMs: number) {
    return Tenant.findOneAndUpdate(
      { _id: tenantId, $or: [{ entitlementMutationLockExpiresAt: null }, { entitlementMutationLockExpiresAt: { $lte: now } }] },
      { $set: { entitlementMutationLockExpiresAt: new Date(now.getTime() + leaseMs) } },
      { new: true },
    ).select('_id');
  },
  releaseTenantEntitlementLock(tenantId: string) {
    return Tenant.updateOne({ _id: tenantId }, { $set: { entitlementMutationLockExpiresAt: null } });
  },
  acquireTenantOwnerMutationLock(tenantId: string, now: Date, leaseMs: number) {
    return Tenant.findOneAndUpdate(
      { _id: tenantId, $or: [{ ownerMutationLockExpiresAt: null }, { ownerMutationLockExpiresAt: { $lte: now } }] },
      { $set: { ownerMutationLockExpiresAt: new Date(now.getTime() + leaseMs) } },
      { new: true },
    ).select('_id');
  },
  releaseTenantOwnerMutationLock(tenantId: string) {
    return Tenant.updateOne({ _id: tenantId }, { $set: { ownerMutationLockExpiresAt: null } });
  },
  countActiveTenantOwners(tenantId: string) {
    return TenantMembership.countDocuments({ tenantId, scope: 'tenant', role: 'tenant_owner', status: 'active' });
  },
  updateTenantMembership(tenantId: string, membershipId: string, update: Record<string, unknown>) {
    return TenantMembership.findOneAndUpdate(
      { _id: membershipId, tenantId },
      { $set: update },
      { new: true, runValidators: true },
    ).populate('userId', 'name email isActive').populate('clinicId', 'name slug').populate('branchIds', 'name slug');
  },
  findMembership(userId: string, tenantId: string, clinicId: string | null) {
    return TenantMembership.findOne({
      userId,
      tenantId,
      status: 'active',
      ...(clinicId
        ? { $or: [{ clinicId }, { clinicId: null }] }
        : { clinicId: null }),
    })
      .sort({ clinicId: clinicId ? -1 : 1 })
      .select('role scope tenantId clinicId branchIds');
  },
  findActiveTenant(id: string) {
    return Tenant.findOne({ _id: id, status: 'active' }).select('_id');
  },
  findActiveClinic(id: string, tenantId: string) {
    return Clinic.findOne({ _id: id, tenantId, status: 'active' }).select(
      '_id',
    );
  },
  findActiveBranch(id: string, tenantId: string, clinicId: string) {
    return Branch.findOne({
      _id: id,
      tenantId,
      clinicId,
      status: 'active',
    }).select('_id');
  },
};
