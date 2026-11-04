import { hashPassword } from '../../../auth/services/auth.security.js';
import { tenancyRepository } from '../../../tenancy/repositories/tenancy.repository.js';
export const platformTenantService = {
  listTenants() { return tenancyRepository.listTenants(); },
  async createTenant(input: { name: string; slug: string; owner: { name: string; email: string; password: string }; initialClinic?: { name: string; slug: string } }) {
    const tenant = await tenancyRepository.createTenant({ name: input.name, slug: input.slug });
    try {
      let owner = await tenancyRepository.findUserByEmail(input.owner.email);
      if (!owner) owner = await tenancyRepository.createUser({ name: input.owner.name, email: input.owner.email.toLowerCase(), passwordHash: await hashPassword(input.owner.password) });
      await tenancyRepository.createMembership({ userId: owner._id, tenantId: tenant._id, role: 'tenant_owner', scope: 'tenant', status: 'active' });
      if (input.initialClinic) await tenancyRepository.createClinic({ tenantId: tenant._id, ...input.initialClinic });
      return tenant;
    } catch (error) {
      await Promise.all([tenancyRepository.deleteTenantMemberships(String(tenant._id)), tenancyRepository.deleteTenantClinics(String(tenant._id)), tenancyRepository.deleteTenant(String(tenant._id))]);
      throw error;
    }
  },
  updateTenantStatus(id: string, status: 'active' | 'suspended') { return tenancyRepository.updateTenantStatus(id, status); },
};