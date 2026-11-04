import { hashPassword } from '../../../auth/services/auth.security.js';
import { tenancyRepository } from '../../../tenancy/repositories/tenancy.repository.js';
import { geoService } from '../../../geo/services/geo.service.js';
import { storeBrandingLogo, removeBrandingLogo } from '../../../../shared/storage/branding-image.storage.js';

function slugify(value: string, fallback = 'tenant'): string {
  const slug = value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return slug || fallback;
}

async function generateUniqueTenantSlug(name: string, excludeId?: string): Promise<string> {
  const base = slugify(name);
  let candidate = base;
  let suffix = 2;
  while (await tenancyRepository.findTenantBySlug(candidate, excludeId)) candidate = `${base}-${suffix++}`;
  return candidate;
}

async function generateUniqueClinicSlug(tenantId: string, name: string): Promise<string> {
  const base = slugify(name, 'clinic');
  let candidate = base;
  let suffix = 2;
  while (await tenancyRepository.findClinicBySlug(tenantId, candidate)) candidate = `${base}-${suffix++}`;
  return candidate;
}

export const platformTenantService = {
  listTenants() { return tenancyRepository.listTenants(); },
  async getTenantDetails(id: string) {
    const tenant = await tenancyRepository.findTenantById(id);
    if (!tenant) return null;
    const [clinics, subscription] = await Promise.all([
      tenancyRepository.listClinics(id),
      tenancyRepository.findSubscriptionByTenantId(id),
    ]);
    const paymentHistory = subscription ? await tenancyRepository.listSubscriptionPayments(id) : [];
    return {
      ...tenant.toObject(),
      clinics,
      subscription: subscription ? { ...subscription.toObject(), paymentHistory } : null,
    };
  },
  async createTenant(input: any) {
    if (input.address) await geoService.validateClinicLocation(input.address);
    const { logoBase64: tenantLogoBase64, ...tenantBranding } = input.branding ?? {};
    let storedTenantLogo = '';
    let storedClinicLogo = '';
    const slug = await generateUniqueTenantSlug(input.name);
    const tenant = await tenancyRepository.createTenant({
      name: input.name,
      slug,
      displayName: input.displayName,
      legalName: input.legalName,
      businessType: input.businessType,
      description: input.description,
      industry: input.industry,
      contact: input.contact,
      address: input.address,
      legal: input.legal,
      branding: tenantBranding,
      preferences: input.preferences,
      settings: input.settings,
    });
    try {
      if (tenantLogoBase64) {
        storedTenantLogo = await storeBrandingLogo(tenantLogoBase64, 'tenants', String(tenant._id));
        tenant.set('branding.logoUrl', storedTenantLogo);
        await tenant.save();
      }
      let owner = await tenancyRepository.findUserByEmail(input.owner.email);
      if (!owner) owner = await tenancyRepository.createUser({
        name: input.owner.name,
        email: input.owner.email.toLowerCase(),
        passwordHash: await hashPassword(input.owner.password),
      });
      await tenancyRepository.createMembership({
        userId: owner._id, tenantId: tenant._id, role: 'tenant_owner', scope: 'tenant', status: 'active',
      });
      if (input.initialClinic) {
        const initial = input.initialClinic;
        const clinicSlug = await generateUniqueClinicSlug(String(tenant._id), initial.name);
        const address = initial.address ?? {};
        await geoService.validateClinicLocation({
          countryId: initial.countryId ?? address.countryId,
          governorateId: initial.governorateId ?? address.governorateId,
          cityId: initial.cityId ?? address.cityId,
          districtId: initial.districtId ?? address.districtId,
        });
        const { logoBase64: clinicLogoBase64, ...clinicBranding } = initial.branding ?? {};
        const clinic = await tenancyRepository.createClinic({
          ...initial,
          branding: clinicBranding,
          address: { ...address, countryId: initial.countryId ?? address.countryId, governorateId: initial.governorateId ?? address.governorateId, cityId: initial.cityId ?? address.cityId, districtId: initial.districtId ?? address.districtId },
          tenantId: tenant._id,
          slug: clinicSlug,
          countryId: initial.countryId ?? address.countryId,
          governorateId: initial.governorateId ?? address.governorateId,
          cityId: initial.cityId ?? address.cityId,
          districtId: initial.districtId ?? address.districtId,
        });
        if (clinicLogoBase64) {
          storedClinicLogo = await storeBrandingLogo(clinicLogoBase64, 'clinics', String(clinic._id));
          clinic.set('branding.logoUrl', storedClinicLogo);
          await clinic.save();
        }
      }
      return await platformTenantService.getTenantDetails(String(tenant._id));
    } catch (error) {
      await Promise.all([
        removeBrandingLogo(storedTenantLogo),
        removeBrandingLogo(storedClinicLogo),
        tenancyRepository.deleteTenantMemberships(String(tenant._id)),
        tenancyRepository.deleteTenantClinics(String(tenant._id)),
        tenancyRepository.deleteTenantSubscriptionPayments(String(tenant._id)),
        tenancyRepository.deleteTenantSubscription(String(tenant._id)),
        tenancyRepository.deleteTenant(String(tenant._id)),
      ]);
      throw error;
    }
  },
  async updateTenant(id: string, input: Record<string, any>) {
    const current = await tenancyRepository.findTenantById(id);
    if (!current) return null;
    const update: Record<string, unknown> = { ...input };
    if (typeof input.name === 'string') update.slug = await generateUniqueTenantSlug(input.name, id);
    let newLogoUrl = '';
    const oldLogoUrl = current.get('branding')?.logoUrl ?? '';
    for (const key of ['contact', 'address', 'legal', 'branding', 'preferences', 'settings']) {
      if (input[key] && typeof input[key] === 'object' && !Array.isArray(input[key])) {
        const existingValue = current.get(key);
        const existingObject = existingValue?.toObject?.() ?? existingValue ?? {};
        if (key === 'branding') {
          const { logoBase64, ...brandingFields } = input.branding;
          update.branding = { ...existingObject, ...brandingFields };
          if (logoBase64) {
            newLogoUrl = await storeBrandingLogo(logoBase64, 'tenants', id);
            (update.branding as Record<string, unknown>).logoUrl = newLogoUrl;
          }
        } else update[key] = { ...existingObject, ...input[key] };
      }
    }
    let updated: Awaited<ReturnType<typeof tenancyRepository.updateTenant>>;
    try {
      if (input.address && ['countryId', 'governorateId', 'cityId', 'districtId'].some((key) => key in input.address)) {
        await geoService.validateClinicLocation(update.address as Record<string, string>);
      }
      updated = await tenancyRepository.updateTenant(id, update);
    } catch (error) {
      await removeBrandingLogo(newLogoUrl);
      throw error;
    }
    if (!updated) { await removeBrandingLogo(newLogoUrl); return null; }
    if (newLogoUrl && oldLogoUrl && oldLogoUrl !== newLogoUrl) await removeBrandingLogo(oldLogoUrl);
    return platformTenantService.getTenantDetails(id);
  },
  async updateTenantStatus(id: string, status: 'active' | 'suspended') {
    const updated = await tenancyRepository.updateTenantStatus(id, status);
    return updated ? platformTenantService.getTenantDetails(id) : null;
  },
  async upsertSubscription(tenantId: string, input: Record<string, unknown>) {
    const tenant = await tenancyRepository.findTenantById(tenantId);
    if (!tenant) return null;
    return tenancyRepository.upsertSubscription(tenantId, input);
  },
  addSubscriptionPayment(tenantId: string, payment: Record<string, unknown>) {
    return tenancyRepository.addSubscriptionPayment(tenantId, payment);
  },
};
