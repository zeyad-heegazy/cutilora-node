import { geoService } from '../../geo/services/geo.service.js';
import { tenancyRepository } from '../repositories/tenancy.repository.js';
export const tenancyService = {
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