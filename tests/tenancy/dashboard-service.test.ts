import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/modules/tenancy/repositories/tenancy.repository.js', () => ({
  tenancyRepository: {
    createTenantAuditEvent: vi.fn().mockResolvedValue({}),
    getDashboardCounts: vi.fn(),
    findTenantById: vi.fn(),
    listTenantAuditEvents: vi.fn(),
    exportTenantAuditEvents: vi.fn(),
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

  it('returns only safe organization profile fields', async () => {
    vi.mocked(tenancyRepository.findTenantById).mockResolvedValue({
      toObject: () => ({
        _id: tenantId, name: 'Tenant', displayName: 'Tenant Display', legalName: 'Legal Tenant',
        businessType: 'clinic_group', status: 'active', contact: {}, address: {}, legal: {}, branding: {}, preferences: {},
        ownerUserId: 'private-owner', internalNotes: 'must not leak', createdAt: new Date(), updatedAt: new Date(),
      }),
    } as any);
    const profile = await tenancyService.getProfile(tenantId);
    expect(profile).toMatchObject({ name: 'Tenant', legalName: 'Legal Tenant', businessType: 'clinic_group' });
    expect(profile).not.toHaveProperty('ownerUserId');
    expect(profile).not.toHaveProperty('internalNotes');
  });

  it('lists audit events with the active tenant forcibly applied to all filters', async () => {
    vi.mocked(tenancyRepository.listTenantAuditEvents).mockResolvedValue({ items: [], pagination: { page: 1, perPage: 25, total: 0, pages: 0 } } as any);
    const query = { page: 1, perPage: 25, actorId: '64b000000000000000000002', action: 'clinic.created' };
    await tenancyService.listTenantAuditEvents(tenantId, query);
    expect(tenancyRepository.listTenantAuditEvents).toHaveBeenCalledWith({
      tenantId,
      actorUserId: query.actorId,
      action: query.action,
    }, 1, 25);
  });

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
  it('exports only safe audit fields with tenant-scoped filters and a row cap', async () => {
    vi.mocked(tenancyRepository.exportTenantAuditEvents).mockResolvedValue([
      { createdAt: new Date('2026-11-05T10:00:00.000Z'), actorUserId: 'user-1', action: 'membership.updated', targetType: 'membership', targetId: 'm-1', clinicId: null, branchId: null, result: 'success', requestId: 'req-1', metadata: { secret: 'must-not-export' } },
    ] as any);

    const result = await tenancyService.exportTenantAuditEvents(tenantId, {
      actorId: '64b000000000000000000002', action: 'membership.updated',
    });

    expect(tenancyRepository.exportTenantAuditEvents).toHaveBeenCalledWith({
      tenantId, actorUserId: '64b000000000000000000002', action: 'membership.updated',
    }, 5001);
    expect(result.csv).toContain('membership.updated');
    expect(result.csv).not.toContain('must-not-export');
    expect(result.truncated).toBe(false);
  });

});
