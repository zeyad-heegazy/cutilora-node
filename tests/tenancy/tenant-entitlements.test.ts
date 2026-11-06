import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/modules/tenancy/repositories/tenancy.repository.js', () => ({
  tenancyRepository: {
    findClinicById: vi.fn(),
    findBranchBySlug: vi.fn(),
    getDashboardCounts: vi.fn(),
    findSubscriptionByTenantId: vi.fn(),
    acquireTenantEntitlementLock: vi.fn(),
    releaseTenantEntitlementLock: vi.fn(),
    createBranch: vi.fn(),
  },
}));
vi.mock('../../src/modules/geo/services/geo.service.js', () => ({
  geoService: { validateCity: vi.fn(), validateClinicLocation: vi.fn(), listForClinic: vi.fn() },
}));
vi.mock('../../src/shared/storage/branding-image.storage.js', () => ({
  storeBrandingLogo: vi.fn(), storeBrandingCover: vi.fn(), removeBrandingImage: vi.fn(),
}));

import { tenancyService } from '../../src/modules/tenancy/services/tenancy.service.js';
import { tenancyRepository } from '../../src/modules/tenancy/repositories/tenancy.repository.js';
import { geoService } from '../../src/modules/geo/services/geo.service.js';

const tenantId = '64b000000000000000000001';
const clinicId = '64b000000000000000000002';

describe('tenant subscription entitlements', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(tenancyRepository.findClinicById).mockResolvedValue({ timezone: 'Africa/Cairo' } as any);
    vi.mocked(tenancyRepository.findBranchBySlug).mockResolvedValue(null as any);
    vi.mocked(tenancyRepository.getDashboardCounts).mockResolvedValue({
      clinics: { total: 1 }, branches: { total: 1 }, activeMembers: 1, pendingInvitations: 0,
    } as any);
    vi.mocked(tenancyRepository.acquireTenantEntitlementLock).mockResolvedValue({ _id: tenantId } as any);
    vi.mocked(tenancyRepository.releaseTenantEntitlementLock).mockResolvedValue({ modifiedCount: 1 } as any);
    vi.mocked(geoService.validateCity).mockResolvedValue(undefined as any);
    vi.mocked(geoService.validateClinicLocation).mockResolvedValue(undefined as any);
  });

  it('blocks branch creation at the configured plan limit and always releases the quota lease', async () => {
    vi.mocked(tenancyRepository.findSubscriptionByTenantId).mockResolvedValue({
      plan: { limits: { maxBranches: 1 } },
    } as any);

    await expect(tenancyService.createBranch({ name: 'Second Branch' }, tenantId, clinicId))
      .rejects.toMatchObject({ status: 403, code: 'SUBSCRIPTION_LIMIT_REACHED' });

    expect(tenancyRepository.createBranch).not.toHaveBeenCalled();
    expect(tenancyRepository.releaseTenantEntitlementLock).toHaveBeenCalledWith(tenantId);
  });

  it('allows creation when the Platform has not configured a limit', async () => {
    vi.mocked(tenancyRepository.findSubscriptionByTenantId).mockResolvedValue(null as any);
    vi.mocked(tenancyRepository.createBranch).mockResolvedValue({ _id: 'branch-1' } as any);

    const result = await tenancyService.createBranch({ name: 'Second Branch' }, tenantId, clinicId);

    expect(result).toMatchObject({ _id: 'branch-1' });
    expect(tenancyRepository.createBranch).toHaveBeenCalledOnce();
    expect(tenancyRepository.releaseTenantEntitlementLock).toHaveBeenCalledWith(tenantId);
  });
});
