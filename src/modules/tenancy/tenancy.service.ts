import { hashPassword } from '../auth/auth.security.js';
import { User } from '../../models/user.model.js';
import { tenancyRepository } from './tenancy.repository.js';

export class TenancyError extends Error {
  constructor(public code: string, message: string, public status = 400) { super(message); }
}

export const tenancyService = {
  listTenants() { return tenancyRepository.listTenants(); },
  async createTenant(input: {
    name: string; slug: string;
    owner: { name: string; email: string; password: string };
    initialClinic?: { name: string; slug: string };
  }) {
    const tenant = await tenancyRepository.createTenant({ name: input.name, slug: input.slug });
    try {
      let owner = await tenancyRepository.findUserByEmail(input.owner.email);
      if (!owner) owner = await User.create({
        name: input.owner.name, email: input.owner.email.toLowerCase(),
        passwordHash: await hashPassword(input.owner.password),
      });
      await tenancyRepository.createMembership({
        userId: owner._id, tenantId: tenant._id, role: 'tenant_owner', scope: 'tenant', status: 'active',
      });
      if (input.initialClinic) {
        await tenancyRepository.createClinic({ tenantId: tenant._id, ...input.initialClinic });
      }
      return tenant;
    } catch (error) {
      await Promise.all([
        tenancyRepository.deleteTenantMemberships(String(tenant._id)),
        tenancyRepository.deleteTenantClinics(String(tenant._id)),
        tenancyRepository.deleteTenant(String(tenant._id)),
      ]);
      throw error;
    }
  },
  updateTenantStatus(id: string, status: 'active' | 'suspended') {
    return tenancyRepository.updateTenantStatus(id, status);
  },
  async getContext(context: { tenantId: string; clinicId: string | null; branchId: string | null }) {
    return tenancyRepository.getTenantContext(context.tenantId, context.clinicId, context.branchId);
  },
  listClinics(tenantId: string) { return tenancyRepository.listClinics(tenantId); },
  createClinic(input: Record<string, unknown>, tenantId: string) {
    return tenancyRepository.createClinic({ ...input, tenantId });
  },
  listBranches(tenantId: string, clinicId: string, branchId: string | null) {
    return tenancyRepository.listBranches({ tenantId, clinicId, ...(branchId ? { _id: branchId } : {}) });
  },
  createBranch(input: Record<string, unknown>, tenantId: string, clinicId: string) {
    return tenancyRepository.createBranch({ ...input, tenantId, clinicId });
  },
};
