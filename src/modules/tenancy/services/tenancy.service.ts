import { geoService } from '../../geo/services/geo.service.js';
import type { GeoResource } from '../../geo/types/geo.types.js';
import { tenancyRepository } from '../repositories/tenancy.repository.js';
import { storeBrandingLogo, storeBrandingCover, removeBrandingImage } from '../../../shared/storage/branding-image.storage.js';

function deepMerge(defaults: Record<string, any>, provided?: Record<string, any>): Record<string, any> {
  const result = { ...defaults };
  for (const [key, value] of Object.entries(provided ?? {})) {
    const fallback = result[key];
    result[key] = value && typeof value === 'object' && !Array.isArray(value) && fallback && typeof fallback === 'object' && !Array.isArray(fallback)
      ? deepMerge(fallback, value) : value;
  }
  return result;
}

const DEFAULT_CLINIC_PREFERENCES = { timezone: 'Africa/Cairo', locale: 'en', currency: 'EGP', dateFormat: 'YYYY-MM-DD', weekStartsOn: 6, supportedLanguages: ['en', 'ar'] };
const DEFAULT_BOOKING_SETTINGS = { allowOnlineBooking: false, requireAppointmentConfirmation: true, defaultAppointmentDurationMinutes: 30, bufferMinutes: 0, cancellationWindowHours: 24 };

function slugify(value: string, fallback = 'clinic'): string {
  const slug = value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return slug || fallback;
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
  getProfile(tenantId: string) {
    return tenancyRepository.findTenantById(tenantId);
  },
  async updatePreferences(tenantId: string, userId: string, preferences: Record<string, any>) {
    const current = await tenancyRepository.findTenantById(tenantId);
    if (!current) return null;
    const existing = current.preferences?.toObject?.() ?? current.preferences ?? {};
    return tenancyRepository.updateTenant(tenantId, {
      preferences: deepMerge(existing, preferences),
      updatedBy: userId,
    });
  },
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
    const { logoBase64, coverImageBase64, ...branding } = input.branding ?? {};
    const clinic = await tenancyRepository.createClinic({ ...input, branding, preferences: deepMerge(DEFAULT_CLINIC_PREFERENCES, input.preferences), bookingSettings: deepMerge(DEFAULT_BOOKING_SETTINGS, input.bookingSettings), settings: deepMerge({}, input.settings), address, ...location, name, slug, tenantId });
    let logoUrl = '';
    let coverUrl = '';
    try {
      if (logoBase64) {
        logoUrl = await storeBrandingLogo(logoBase64, 'clinics', String(clinic._id));
        clinic.set('branding.logoUrl', logoUrl);
      }
      if (coverImageBase64) {
        coverUrl = await storeBrandingCover(coverImageBase64, 'clinics', String(clinic._id));
        clinic.set('branding.coverImageUrl', coverUrl);
      }
      if (logoUrl || coverUrl) await clinic.save();
    } catch (error) {
      await Promise.all([removeBrandingImage(logoUrl), removeBrandingImage(coverUrl), tenancyRepository.deleteClinic(String(clinic._id), tenantId)]);
      throw error;
    }
    return clinic;
  },
  async updateClinic(id: string, input: Record<string, any>, tenantId: string) {
    const current = await tenancyRepository.findClinicById(id, tenantId);
    if (!current) return null;
    const currentData = current.toObject();
    const update: Record<string, any> = { ...input };
    let newLogoUrl = '';
    let newCoverUrl = '';
    const oldLogoUrl = currentData.branding?.logoUrl ?? '';
    const oldCoverUrl = currentData.branding?.coverImageUrl ?? '';
    try {
    for (const key of ['address', 'contact', 'branding', 'preferences', 'bookingSettings', 'settings']) {
      if (input[key] && typeof input[key] === 'object' && !Array.isArray(input[key])) {
        const existingValue = currentData[key]?.toObject?.() ?? currentData[key] ?? {};
        if (key === 'branding') {
          const { logoBase64, coverImageBase64, ...brandingFields } = input.branding;
          update.branding = { ...existingValue, ...brandingFields };
          if (logoBase64) {
            newLogoUrl = await storeBrandingLogo(logoBase64, 'clinics', id);
            update.branding.logoUrl = newLogoUrl;
          }
          if (coverImageBase64) {
            newCoverUrl = await storeBrandingCover(coverImageBase64, 'clinics', id);
            update.branding.coverImageUrl = newCoverUrl;
          }
        } else update[key] = deepMerge(existingValue, input[key]);
      }
    }
    } catch (error) {
      await Promise.all([removeBrandingImage(newLogoUrl), removeBrandingImage(newCoverUrl)]);
      throw error;
    }
    let updated: Awaited<ReturnType<typeof tenancyRepository.updateClinic>>;
    try {
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
      updated = await tenancyRepository.updateClinic(id, tenantId, update);
    } catch (error) {
      await Promise.all([removeBrandingImage(newLogoUrl), removeBrandingImage(newCoverUrl)]);
      throw error;
    }
    if (!updated) { await Promise.all([removeBrandingImage(newLogoUrl), removeBrandingImage(newCoverUrl)]); return null; }
    if (newLogoUrl && oldLogoUrl && oldLogoUrl !== newLogoUrl) await removeBrandingImage(oldLogoUrl);
    if (newCoverUrl && oldCoverUrl && oldCoverUrl !== newCoverUrl) await removeBrandingImage(oldCoverUrl);
    return updated;
  },
  listBranches(tenantId: string, clinicId: string, branchId: string | null) {
    return tenancyRepository.listBranches({ tenantId, clinicId, ...(branchId ? { _id: branchId } : {}) });
  },
  getBranch(id: string, tenantId: string, clinicId: string) {
    return tenancyRepository.findBranchById(id, tenantId, clinicId);
  },
  async createBranch(input: Record<string, any>, tenantId: string, clinicId: string) {
    const clinic = await tenancyRepository.findClinicById(clinicId, tenantId);
    if (!clinic) return null;
    await geoService.validateCity(input.cityId ?? null);
    const base = slugify(String(input.slug || input.name), 'branch');
    let slug = base;
    let suffix = 2;
    while (await tenancyRepository.findBranchBySlug(tenantId, clinicId, slug)) {
      slug = `${base}-${suffix++}`;
    }
    return tenancyRepository.createBranch({
      ...input,
      slug,
      timezone: input.timezone || clinic.timezone || clinic.preferences?.timezone || 'Africa/Cairo',
      tenantId,
      clinicId,
    });
  },
  async updateBranch(id: string, input: Record<string, any>, tenantId: string, clinicId: string) {
    const current = await tenancyRepository.findBranchById(id, tenantId, clinicId);
    if (!current) return null;
    const update: Record<string, unknown> = { ...input };
    if ('cityId' in input) await geoService.validateCity(input.cityId ?? null);
    if (typeof input.slug === 'string' || (typeof input.name === 'string' && input.name !== current.name)) {
      const base = slugify(String(input.slug || input.name), 'branch');
      let candidate = base;
      let suffix = 2;
      while (await tenancyRepository.findBranchBySlug(tenantId, clinicId, candidate, id)) {
        candidate = `${base}-${suffix++}`;
      }
      update.slug = candidate;
    }
    return tenancyRepository.updateBranch(id, tenantId, clinicId, update);
  },
};
