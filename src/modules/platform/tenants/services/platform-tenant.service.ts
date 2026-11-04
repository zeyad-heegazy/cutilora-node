import { hashPassword } from '../../../auth/services/auth.security.js';
import { tenancyRepository } from '../../../tenancy/repositories/tenancy.repository.js';

function slugify(value: string): string {
  const slug = value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'tenant';
}

async function generateUniqueTenantSlug(name: string, excludeId?: string): Promise<string> {
  const base = slugify(name);
  let candidate = base;
  let suffix = 2;

  while (await tenancyRepository.findTenantBySlug(candidate, excludeId)) {
    candidate = `${base}-${suffix++}`;
  }

  return candidate;
}

export const platformTenantService = {
  listTenants() { return tenancyRepository.listTenants(); },
  async createTenant(input: { name: string; owner: { name: string; email: string; password: string }; initialClinic?: { name: string } }) {
    const slug = await generateUniqueTenantSlug(input.name);
    const tenant = await tenancyRepository.createTenant({ name: input.name, slug });
    try {
      let owner = await tenancyRepository.findUserByEmail(input.owner.email);
      if (!owner) owner = await tenancyRepository.createUser({ name: input.owner.name, email: input.owner.email.toLowerCase(), passwordHash: await hashPassword(input.owner.password) });
      await tenancyRepository.createMembership({ userId: owner._id, tenantId: tenant._id, role: 'tenant_owner', scope: 'tenant', status: 'active' });
      if (input.initialClinic) {\n        const clinicBase = slugify(input.initialClinic.name) || 'clinic';\n        let clinicSlug = clinicBase;\n        let suffix = 2;\n        while (await tenancyRepository.findClinicBySlug(String(tenant._id), clinicSlug)) {\n          clinicSlug = `${clinicBase}-${suffix++}`;\n        }\n        await tenancyRepository.createClinic({ tenantId: tenant._id, ...input.initialClinic, slug: clinicSlug });\n      }
      return tenant;
    } catch (error) {
      await Promise.all([tenancyRepository.deleteTenantMemberships(String(tenant._id)), tenancyRepository.deleteTenantClinics(String(tenant._id)), tenancyRepository.deleteTenant(String(tenant._id))]);
      throw error;
    }
  },
  async updateTenant(id: string, name: string) {
    const slug = await generateUniqueTenantSlug(name, id);
    return tenancyRepository.updateTenant(id, { name, slug });
  },
  updateTenantStatus(id: string, status: 'active' | 'suspended') { return tenancyRepository.updateTenantStatus(id, status); },
};