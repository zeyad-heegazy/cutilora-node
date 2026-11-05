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
  async listTenantAuditEvents(filter: Record<string, unknown>, page: number, perPage: number) {
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
  listTenantDocuments(tenantId: string) {
    return TenantDocument.find({ tenantId, status: 'active' }).sort({ createdAt: -1 }).lean();
  },
  findTenantDocumentMetadata(tenantId: string, documentId: string) {
    return TenantDocument.findOne({ _id: documentId, tenantId, status: 'active' }).select('-storageKey').lean();
  },
  findTenantDocument(tenantId: string, documentId: string) {
    return TenantDocument.findOne({ _id: documentId, tenantId, status: 'active' }).select('+storageKey');
  },
  archiveTenantDocument(tenantId: string, documentId: string, userId: string) {
    return TenantDocument.findOneAndUpdate(
      { _id: documentId, tenantId, status: 'active' },
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
    const [clinicCount, activeClinicCount, branchCount, activeBranchCount, activeMemberIds, pendingInvitationCount] = await Promise.all([
      Clinic.countDocuments(filter),
      Clinic.countDocuments({ ...filter, status: 'active' }),
      Branch.countDocuments(filter),
      Branch.countDocuments({ ...filter, status: 'active' }),
      TenantMembership.distinct('userId', { ...filter, status: 'active' }),
      TenantMembership.countDocuments({ ...filter, status: 'invited' }),
    ]);
    return {
      clinics: { total: clinicCount, active: activeClinicCount, suspended: clinicCount - activeClinicCount },
      branches: { total: branchCount, active: activeBranchCount, suspended: branchCount - activeBranchCount },
      activeMembers: activeMemberIds.length,
      pendingInvitations: pendingInvitationCount,
    };
  },
  async listDashboardClinics(tenantId: string) {
    return Clinic.aggregate([
      { $match: { tenantId: new Types.ObjectId(tenantId) } },
      { $lookup: { from: 'branches', let: { clinicId: '$_id', tenantId: '$tenantId' }, pipeline: [
        { $match: { $expr: { $and: [{ $eq: ['$clinicId', '$clinicId'] }, { $eq: ['$tenantId', '$tenantId'] }] } } },
        { $group: { _id: null, total: { $sum: 1 }, active: { $sum: { $cond: [{ $eq: ['$status', 'active'] }, 1, 0] } } } },
      ], as: 'branchStats' } },
      { $addFields: { branchStats: { $ifNull: [{ $arrayElemAt: ['$branchStats', 0] }, { total: 0, active: 0 }] } } },
      { $project: { name: 1, slug: 1, code: 1, status: 1, clinicType: 1, updatedAt: 1, branchCount: '$branchStats.total', activeBranchCount: '$branchStats.active' } },
      { $sort: { name: 1 } },
    ]);
  },
  listClinics(tenantId: string) {
    return Clinic.find({ tenantId }).sort({ name: 1 });
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
  findOverlappingBranchHoliday(filter: Record<string, unknown>, startDate: Date, endDate: Date) {
    return BranchHoliday.findOne({
      ...filter,
      status: 'active',
      startDate: { $lte: endDate },
      endDate: { $gte: startDate },
    }).select('_id title startDate endDate');
  },
  createBranchHoliday(data: Record<string, unknown>) {
    return BranchHoliday.create(data);
  },
  cancelBranchHoliday(tenantId: string, clinicId: string, branchId: string, holidayId: string, userId: string) {
    return BranchHoliday.findOneAndUpdate(
      { _id: holidayId, tenantId, clinicId, branchId, status: 'active' },
      { $set: { status: 'cancelled', cancelledAt: new Date(), cancelledBy: userId } },
      { new: true, runValidators: true },
    );
  },
  listBranches(filter: Record<string, unknown>) {
    return Branch.find(filter).sort({ name: 1 });
  },
  createBranch(data: Record<string, unknown>) {
    return Branch.create(data);
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
  listTenantMemberships(tenantId: string) {
    return TenantMembership.find({ tenantId })
      .populate('userId', 'name email isActive')
      .populate('clinicId', 'name slug status')
      .populate('branchIds', 'name slug status')
      .sort({ createdAt: -1 })
      .lean();
  },
  findTenantMembershipById(tenantId: string, membershipId: string) {
    return TenantMembership.findOne({ _id: membershipId, tenantId });
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
