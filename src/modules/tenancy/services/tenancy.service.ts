import { geoService } from '../../geo/services/geo.service.js';
import type { GeoResource } from '../../geo/types/geo.types.js';
import { tenancyRepository } from '../repositories/tenancy.repository.js';

function slugify(value: string): string {
  const slug = value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'clinic';
}

async function generateUniqueClinicSlug(tenantId: string, name: string, excludeId?: string): Promise<string> {
  const base = slugify(name);
  let candidate = base;
  let suffix = 2;

  while (await tenancyRepository.findClinicBySlug(tenantId, candidate, excludeId)) {
    candidate = `${base}-${suffix++}`;
  }

  return candidate;
}

export const tenancyService = {
  getContext(context: { tenantId: string; clinicId: string | null; branchId: string | null }) { return tenancyRepository.getTenantContext(context.tenantId, context.clinicId, context.branchId); },
  listClinics(tenantId: string) { return tenancyRepository.listClinics(tenantId); },
  listGeo(resource: GeoResource, query: { page: number; per_page: number; search?: string; country_id?: string; governorate_id?: string; city_id?: string }) { return geoService.listForClinic(resource, query); },
  async createClinic(input: Record<string, unknown>, tenantId: string) {
    await geoService.validateClinicLocation({
      countryId: typeof input.countryId === 'string' ? input.countryId : undefined,
      governorateId: typeof input.governorateId === 'string' ? input.governorateId : undefined,
      cityId: typeof input.cityId === 'string' ? input.cityId : undefined,
      districtId: typeof input.districtId === 'string' ? input.districtId : undefined,
    });
    const name = String(input.name);
    const slug = await generateUniqueClinicSlug(tenantId, name);
    return tenancyRepository.createClinic({ ...input, name, slug, tenantId });
  },
  async updateClinic(id: string, input: Record<string, unknown>, tenantId: string) {
    if (['countryId', 'governorateId', 'cityId', 'districtId'].some((key) => key in input)) {
      await geoService.validateClinicLocation({
        countryId: typeof input.countryId === 'string' ? input.countryId : undefined,
        governorateId: typeof input.governorateId === 'string' ? input.governorateId : undefined,
        cityId: typeof input.cityId === 'string' ? input.cityId : undefined,
        districtId: typeof input.districtId === 'string' ? input.districtId : undefined,
      });
    }
    const update = { ...input };
    if (typeof input.name === 'string') {
      update.slug = await generateUniqueClinicSlug(tenantId, input.name, id);
    }
    return tenancyRepository.updateClinic(id, tenantId, update);
  },
  listBranches(tenantId: string, clinicId: string, branchId: string | null) { return tenancyRepository.listBranches({ tenantId, clinicId, ...(branchId ? { _id: branchId } : {}) }); },
  createBranch(input: Record<string, unknown>, tenantId: string, clinicId: string) { return tenancyRepository.createBranch({ ...input, tenantId, clinicId }); },
};
