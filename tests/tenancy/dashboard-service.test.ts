import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/modules/tenancy/repositories/tenancy.repository.js', () => ({
  tenancyRepository: {
    getDashboardCounts: vi.fn(),
    listDashboardClinics: vi.fn(),
    findSubscriptionByTenantId: vi.fn(),
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

import { tenancyService } from '../../src/modules/tenancy/services/tenancy.service.js';
import { tenancyRepository } from '../../src/modules/tenancy/repositories/tenancy.repository.js';

const tenantId = '64b000000000000000000001';

describe('tenant dashboard service', () => {
  beforeEach(() => vi.resetAllMocks());

  it('queries dashboard counts using only the active tenant id', async () => {
    const counts = {
      clinics: { total: 2, active: 1, suspended: 1 },
      branches: { total: 3, active: 2, suspended: 1 },
      activeMembers: 4,
      pendingInvitations: 1,
    };
    vi.mocked(tenancyRepository.getDashboardCounts).mockResolvedValue(counts as any);

    await expect(tenancyService.getDashboardCounts(tenantId)).resolves.toEqual(counts);
    expect(tenancyRepository.getDashboardCounts).toHaveBeenCalledWith(tenantId);
  });

  it('returns only the subscription fields intended for tenant self-service display', async () => {
    vi.mocked(tenancyRepository.findSubscriptionByTenantId).mockResolvedValue({
      plan: { code: 'growth', name: 'Growth', amount: 100, currency: 'EGP' },
      billingCycle: 'monthly',
      status: 'active',
      trialEndsAt: null,
      currentPeriodEndsAt: new Date('2026-12-01T00:00:00.000Z'),
      nextBillingAt: new Date('2026-12-01T00:00:00.000Z'),
      cancelAtPeriodEnd: false,
      internalNotes: 'must not leak',
    } as any);

    const result = await tenancyService.getSubscriptionOverview(tenantId);
    expect(result).toMatchObject({ plan: { code: 'growth' }, status: 'active', billingCycle: 'monthly' });
    expect(result).not.toHaveProperty('internalNotes');
    expect(tenancyRepository.findSubscriptionByTenantId).toHaveBeenCalledWith(tenantId);
  });

  it('returns usage without inventing plan limits that the platform schema does not define', async () => {
    vi.mocked(tenancyRepository.getDashboardCounts).mockResolvedValue({
      clinics: { total: 3, active: 3, suspended: 0 },
      branches: { total: 5, active: 5, suspended: 0 },
      activeMembers: 8,
      pendingInvitations: 2,
    } as any);
    vi.mocked(tenancyRepository.findSubscriptionByTenantId).mockResolvedValue({
      plan: { code: 'growth', name: 'Growth' },
    } as any);

    const usage = await tenancyService.getTenantSubscriptionUsage(tenantId);
    expect(usage.usage).toEqual({ clinics: 3, branches: 5, activeMembers: 8, pendingInvitations: 2 });
    expect(usage.limits).toBeNull();
    expect(usage.limitsAvailable).toBe(false);
  });

  it('returns null when the tenant has no subscription', async () => {
    vi.mocked(tenancyRepository.findSubscriptionByTenantId).mockResolvedValue(null as any);
    await expect(tenancyService.getSubscriptionOverview(tenantId)).resolves.toBeNull();
  });
});
