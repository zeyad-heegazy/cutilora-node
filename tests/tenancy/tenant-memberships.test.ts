import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/modules/tenancy/repositories/tenancy.repository.js', () => ({
  tenancyRepository: {
    listTenantMemberships: vi.fn(),
    findTenantMembershipById: vi.fn(),
    countActiveTenantOwners: vi.fn(),
    findClinicById: vi.fn(),
    findBranchById: vi.fn(),
    updateTenantMembership: vi.fn(),
    createTenantAuditEvent: vi.fn().mockResolvedValue({}),
  },
}));
vi.mock('../../src/modules/geo/services/geo.service.js', () => ({
  geoService: { listForClinic: vi.fn(), validateClinicLocation: vi.fn(), validateCity: vi.fn() },
}));
vi.mock('../../src/shared/storage/branding-image.storage.js', () => ({
  storeBrandingLogo: vi.fn(),
  storeBrandingCover: vi.fn(),
  removeBrandingImage: vi.fn(),
}));
vi.mock('../../src/shared/storage/private-tenant-document.storage.js', () => ({
  storePrivateTenantDocument: vi.fn(),
  readPrivateTenantDocument: vi.fn(),
  removePrivateTenantDocument: vi.fn(),
}));

import { tenancyService } from '../../src/modules/tenancy/services/tenancy.service.js';
import { tenancyRepository } from '../../src/modules/tenancy/repositories/tenancy.repository.js';

const tenantId = '64b000000000000000000001';
const actorId = '64b000000000000000000002';
const targetId = '64b000000000000000000003';
const membershipId = '64b000000000000000000004';
const clinicId = '64b000000000000000000005';
const branchId = '64b000000000000000000006';

describe('tenant membership administration', () => {
  beforeEach(() => vi.resetAllMocks());

  it('prevents demoting or suspending the last active Tenant Owner', async () => {
    vi.mocked(tenancyRepository.findTenantMembershipById).mockResolvedValue({
      _id: membershipId, userId: targetId, role: 'tenant_owner', scope: 'tenant', status: 'active',
      clinicId: null, branchIds: [],
    } as any);
    vi.mocked(tenancyRepository.countActiveTenantOwners).mockResolvedValue(1 as any);

    await expect(tenancyService.updateTenantMembership(tenantId, membershipId, actorId, 'tenant_owner', {
      status: 'suspended',
    })).rejects.toMatchObject({ status: 409, code: 'LAST_TENANT_OWNER_REQUIRED' });

    expect(tenancyRepository.updateTenantMembership).not.toHaveBeenCalled();
  });

  it('validates branch membership scope against the tenant and clinic before saving', async () => {
    vi.mocked(tenancyRepository.findTenantMembershipById).mockResolvedValue({
      _id: membershipId, userId: targetId, role: 'clinic_manager', scope: 'clinic', status: 'active',
      clinicId, branchIds: [],
    } as any);
    vi.mocked(tenancyRepository.findClinicById).mockResolvedValue({ _id: clinicId } as any);
    vi.mocked(tenancyRepository.findBranchById).mockResolvedValue({ _id: branchId } as any);
    vi.mocked(tenancyRepository.updateTenantMembership).mockResolvedValue({ _id: membershipId, role: 'branch_manager' } as any);

    const result = await tenancyService.updateTenantMembership(tenantId, membershipId, actorId, 'tenant_owner', {
      scope: 'branch',
      role: 'branch_manager',
      clinicId,
      branchIds: [branchId],
    });

    expect(tenancyRepository.findBranchById).toHaveBeenCalledWith(branchId, tenantId, clinicId);
    expect(tenancyRepository.updateTenantMembership).toHaveBeenCalledWith(tenantId, membershipId, expect.objectContaining({
      scope: 'branch', role: 'branch_manager', clinicId, branchIds: [branchId], updatedBy: actorId,
    }));
    expect(result).toMatchObject({ role: 'branch_manager' });
  });

  it('prevents Tenant Admin from assigning tenant-wide roles', async () => {
    vi.mocked(tenancyRepository.findTenantMembershipById).mockResolvedValue({
      _id: membershipId, userId: targetId, role: 'clinic_manager', scope: 'clinic', status: 'active',
      clinicId, branchIds: [],
    } as any);

    await expect(tenancyService.updateTenantMembership(tenantId, membershipId, actorId, 'tenant_admin', {
      scope: 'tenant', role: 'tenant_admin',
    })).rejects.toMatchObject({ status: 403, code: 'TENANT_OWNER_REQUIRED' });
  });

  it('prevents users from changing their own membership', async () => {
    vi.mocked(tenancyRepository.findTenantMembershipById).mockResolvedValue({
      _id: membershipId, userId: actorId, role: 'tenant_owner', scope: 'tenant', status: 'active',
      clinicId: null, branchIds: [],
    } as any);

    await expect(tenancyService.updateTenantMembership(tenantId, membershipId, actorId, 'tenant_owner', {
      status: 'suspended',
    })).rejects.toMatchObject({ status: 403, code: 'SELF_MEMBERSHIP_CHANGE_DENIED' });
  });
});
