import { hashPassword } from '../../../auth/services/auth.security.js';
import { tenancyRepository } from '../../../tenancy/repositories/tenancy.repository.js';
import { geoService } from '../../../geo/services/geo.service.js';

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
    return { ...tenant.toObject(), clinics, subscription };
  },
  async createTenant(input: any) {
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
      branding: input.branding,
      preferences: input.preferences,
      settings: input.settings,
    });
    try {
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
        await tenancyRepository.createClinic({
          ...initial,
          tenantId: tenant._id,
          slug: clinicSlug,
          countryId: initial.countryId ?? address.countryId,
          governorateId: initial.governorateId ?? address.governorateId,
          cityId: initial.cityId ?? address.cityId,
          districtId: initial.districtId ?? address.districtId,
        });
      }
      return tenant;
    } catch (error) {
      await Promise.all([
        tenancyRepository.deleteTenantMemberships(String(tenant._id)),
        tenancyRepository.deleteTenantClinics(String(tenant._id)),
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
    for (const key of ['contact', 'address', 'legal', 'branding', 'preferences', 'settings']) {
      if (input[key] && typeof input[key] === 'object' && !Array.isArray(input[key])) {
        const existingValue = current.get(key);
        const existingObject = existingValue?.toObject?.() ?? existingValue ?? {};
        update[key] = { ...existingObject, ...input[key] };
      }
    }
    return tenancyRepository.updateTenant(id, update);
  },
  updateTenantStatus(id: string, status: 'active' | 'suspended') {
    return tenancyRepository.updateTenantStatus(id, status);
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
