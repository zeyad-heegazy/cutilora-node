import { hashPassword } from '../../auth/services/auth.security.js';
import { geoService } from '../../geo/services/geo.service.js';
import { tenancyRepository } from '../repositories/tenancy.repository.js';

export const tenancyService = {
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
  getContext(context: { tenantId: string; clinicId: string | null; branchId: string | null }) { return tenancyRepository.getTenantContext(context.tenantId, context.clinicId, context.branchId); },
  listClinics(tenantId: string) { return tenancyRepository.listClinics(tenantId); },
  async createClinic(input: Record<string, unknown>, tenantId: string) {
    await geoService.validateClinicLocation({
      countryId: typeof input.countryId === 'string' ? input.countryId : undefined,
      governorateId: typeof input.governorateId === 'string' ? input.governorateId : undefined,
      cityId: typeof input.cityId === 'string' ? input.cityId : undefined,
      districtId: typeof input.districtId === 'string' ? input.districtId : undefined,
    });
    return tenancyRepository.createClinic({ ...input, tenantId });
  },
  listBranches(tenantId: string, clinicId: string, branchId: string | null) { return tenancyRepository.listBranches({ tenantId, clinicId, ...(branchId ? { _id: branchId } : {}) }); },
  createBranch(input: Record<string, unknown>, tenantId: string, clinicId: string) { return tenancyRepository.createBranch({ ...input, tenantId, clinicId }); },
};