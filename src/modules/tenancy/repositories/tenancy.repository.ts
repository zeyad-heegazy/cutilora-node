import { Tenant } from '../models/tenant.model.js';
import { Clinic } from '../models/clinic.model.js';
import { Branch } from '../models/branch.model.js';
import { TenantMembership } from '../models/tenant-membership.model.js';
import { User } from '../../auth/models/user.model.js';

export const tenancyRepository = {
  listTenants() { return Tenant.find().sort({ createdAt: -1 }); },
  findTenantBySlug(slug: string, excludeId?: string) { return Tenant.findOne({ slug, ...(excludeId ? { _id: { $ne: excludeId } } : {}) }).select('_id'); },
  createTenant(data: Record<string, unknown>) { return Tenant.create(data); },
  updateTenant(id: string, data: { name: string; slug: string }) { return Tenant.findByIdAndUpdate(id, data, { new: true, runValidators: true }); },
  updateTenantStatus(id: string, status: 'active' | 'suspended') { return Tenant.findByIdAndUpdate(id, { status }, { new: true, runValidators: true }); },
  deleteTenant(id: string) { return Tenant.deleteOne({ _id: id }); },
  deleteTenantMemberships(tenantId: string) { return TenantMembership.deleteMany({ tenantId }); },
  deleteTenantClinics(tenantId: string) { return Clinic.deleteMany({ tenantId }); },
  findUserByEmail(email: string) { return User.findOne({ email: email.toLowerCase() }); },
  createUser(data: Record<string, unknown>) { return User.create(data); },
  createMembership(data: Record<string, unknown>) { return TenantMembership.create(data); },
  listClinics(tenantId: string) { return Clinic.find({ tenantId }).sort({ name: 1 }); },
  findClinicBySlug(tenantId: string, slug: string, excludeId?: string) {
    return Clinic.findOne({ tenantId, slug, ...(excludeId ? { _id: { $ne: excludeId } } : {}) }).select('_id');
  },
  createClinic(data: Record<string, unknown>) { return Clinic.create(data); },
  updateClinic(id: string, tenantId: string, data: Record<string, unknown>) {
    return Clinic.findOneAndUpdate({ _id: id, tenantId }, { $set: data }, { new: true, runValidators: true });
  },
  listBranches(filter: Record<string, unknown>) { return Branch.find(filter).sort({ name: 1 }); },
  createBranch(data: Record<string, unknown>) { return Branch.create(data); },
  getTenantContext(tenantId: string, clinicId: string | null, branchId: string | null) {
    return Promise.all([
      Tenant.findById(tenantId).select('name slug status plan settings'),
      clinicId ? Clinic.findOne({ _id: clinicId, tenantId }).select('name slug status timezone') : null,
      branchId ? Branch.findOne({ _id: branchId, tenantId, clinicId }).select('name slug status timezone') : null,
    ]);
  },
  findMembership(userId: string, tenantId: string, clinicId: string | null) {
    return TenantMembership.findOne({ userId, tenantId, status: 'active', ...(clinicId ? { $or: [{ clinicId }, { clinicId: null }] } : { clinicId: null }) }).sort({ clinicId: clinicId ? -1 : 1 }).select('role scope tenantId clinicId branchIds');
  },
  findActiveTenant(id: string) { return Tenant.findOne({ _id: id, status: 'active' }).select('_id'); },
  findActiveClinic(id: string, tenantId: string) { return Clinic.findOne({ _id: id, tenantId, status: 'active' }).select('_id'); },
  findActiveBranch(id: string, tenantId: string, clinicId: string) { return Branch.findOne({ _id: id, tenantId, clinicId, status: 'active' }).select('_id'); },
};
