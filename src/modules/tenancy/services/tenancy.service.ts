import { geoService } from '../../geo/services/geo.service.js';
import type { GeoResource } from '../../geo/types/geo.types.js';
import { tenancyRepository } from '../repositories/tenancy.repository.js';

function slugify(value: string): string {
  const slug = value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return slug || 'clinic';
}

async function generateUniqueClinicSlug(tenantId: string, name: string, excludeId?: string): Promise<string> {
  const base = slugify(name);
  let candidate = base;
  let suffix = 2;
  while (await tenancyRepository.findClinicBySlug(tenantId, candidate, excludeId)) candidate = `${base}-${suffix++}`;
  return candidate;
}

function locationFrom(input: Record<string, any>) {
  const address = input.address ?? {};
  return {
    countryId: input.countryId ?? address.countryId,
    governorateId: input.governorateId ?? address.governorateId,
    cityId: input.cityId ?? address.cityId,
    districtId: input.districtId ?? address.districtId,
  };
}

export const tenancyService = {
  getContext(context: { tenantId: string; clinicId: string | null; branchId: string | null }) {
    return tenancyRepository.getTenantContext(context.tenantId, context.clinicId, context.branchId);
  },
  listClinics(tenantId: string) { return tenancyRepository.listClinics(tenantId); },
  getClinic(id: string, tenantId: string) { return tenancyRepository.findClinicById(id, tenantId); },
  listGeo(resource: GeoResource, query: { page: number; per_page: number; search?: string; country_id?: string; governorate_id?: string; city_id?: string }) {
    return geoService.listForClinic(resource, query);
  },
  async createClinic(input: Record<string, any>, tenantId: string) {
    const location = locationFrom(input);
    await geoService.validateClinicLocation(location);
    const name = String(input.name);
    const slug = await generateUniqueClinicSlug(tenantId, name);
    const address = { ...(input.address ?? {}), ...location };
    return tenancyRepository.createClinic({ ...input, address, ...location, name, slug, tenantId });
  },
  async updateClinic(id: string, input: Record<string, any>, tenantId: string) {
    const current = await tenancyRepository.findClinicById(id, tenantId);
    if (!current) return null;
    const currentData = current.toObject();
    const update: Record<string, any> = { ...input };
    for (const key of ['address', 'contact', 'branding', 'bookingSettings']) {
      if (input[key] && typeof input[key] === 'object' && !Array.isArray(input[key])) {
        const existingValue = currentData[key]?.toObject?.() ?? currentData[key] ?? {};
        update[key] = { ...existingValue, ...input[key] };
      }
    }
    const locationChanged = ['countryId', 'governorateId', 'cityId', 'districtId'].some((key) => key in input)
      || Boolean(input.address && ['countryId', 'governorateId', 'cityId', 'districtId'].some((key) => key in input.address));
    if (locationChanged) {
      const mergedLocation = {
        countryId: input.countryId ?? input.address?.countryId ?? currentData.countryId ?? currentData.address?.countryId,
        governorateId: input.governorateId ?? input.address?.governorateId ?? currentData.governorateId ?? currentData.address?.governorateId,
        cityId: input.cityId ?? input.address?.cityId ?? currentData.cityId ?? currentData.address?.cityId,
        districtId: input.districtId ?? input.address?.districtId ?? currentData.districtId ?? currentData.address?.districtId,
      };
      await geoService.validateClinicLocation(mergedLocation);
      const existingAddress = currentData.address?.toObject?.() ?? currentData.address ?? {};
      update.address = { ...existingAddress, ...(input.address ?? {}), ...mergedLocation };
      Object.assign(update, mergedLocation);
    }
    if (typeof input.name === 'string') update.slug = await generateUniqueClinicSlug(tenantId, input.name, id);
    return tenancyRepository.updateClinic(id, tenantId, update);
  },
  listBranches(tenantId: string, clinicId: string, branchId: string | null) {
    return tenancyRepository.listBranches({ tenantId, clinicId, ...(branchId ? { _id: branchId } : {}) });
  },
  createBranch(input: Record<string, unknown>, tenantId: string, clinicId: string) {
    return tenancyRepository.createBranch({ ...input, tenantId, clinicId });
  },
};
