import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/modules/tenancy/repositories/tenancy.repository.js', () => ({
  tenancyRepository: {
    findClinicById: vi.fn(),
    updateClinic: vi.fn(),
    findBranchById: vi.fn(),
    updateBranch: vi.fn(),
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
const clinicId = '64b000000000000000000002';
const branchId = '64b000000000000000000003';
const userId = '64b000000000000000000004';

describe('clinic and branch configuration overrides', () => {
  beforeEach(() => vi.resetAllMocks());

  it('returns clinic defaults, overrides and effective settings separately', async () => {
    vi.mocked(tenancyRepository.findClinicById).mockResolvedValue({
      settings: {
        organizationDefaults: { appointment: { duration: 30, buffer: 5 } },
        organizationDefaultsVersion: 4,
        organizationOverrides: { appointment: { duration: 45 } },
      },
    } as any);

    const result = await tenancyService.getClinicSettings(tenantId, clinicId);
    expect(result).toMatchObject({
      inheritedVersion: 4,
      defaults: { appointment: { duration: 30, buffer: 5 } },
      overrides: { appointment: { duration: 45 } },
      effectiveValues: { appointment: { duration: 45, buffer: 5 } },
      sources: { appointment: 'clinic_override' },
    });
  });

  it('updates clinic overrides without replacing tenant defaults', async () => {
    vi.mocked(tenancyRepository.findClinicById).mockResolvedValue({
      settings: {
        organizationDefaults: { appointment: { duration: 30, buffer: 5 } },
        organizationDefaultsVersion: 4,
        organizationOverrides: { appointment: { duration: 45 } },
      },
    } as any);
    vi.mocked(tenancyRepository.updateClinic).mockResolvedValue({
      settings: {
        organizationDefaults: { appointment: { duration: 30, buffer: 5 } },
        organizationDefaultsVersion: 4,
        organizationOverrides: { appointment: { duration: 60 } },
      },
    } as any);

    const result = await tenancyService.updateClinicSettings(tenantId, clinicId, userId, {
      appointment: { duration: 60 },
    });

    expect(tenancyRepository.updateClinic).toHaveBeenCalledWith(clinicId, tenantId, expect.objectContaining({
      settings: {
        organizationDefaults: { appointment: { duration: 30, buffer: 5 } },
        organizationDefaultsVersion: 4,
        organizationOverrides: { appointment: { duration: 60 } },
      },
      updatedBy: userId,
    }));
    expect(result?.effectiveValues).toEqual({ appointment: { duration: 60, buffer: 5 } });
  });

  it('computes branch effective values from clinic defaults, clinic overrides and branch overrides', async () => {
    vi.mocked(tenancyRepository.findBranchById).mockResolvedValue({
      settings: { organizationOverrides: { appointment: { duration: 75 } } },
      timezone: 'Africa/Cairo',
      operatingHours: [],
    } as any);
    vi.mocked(tenancyRepository.findClinicById).mockResolvedValue({
      settings: {
        organizationDefaults: { appointment: { duration: 30, buffer: 5 } },
        organizationDefaultsVersion: 2,
        organizationOverrides: { appointment: { buffer: 10 } },
      },
    } as any);

    const result = await tenancyService.getBranchSettings(tenantId, clinicId, branchId);
    expect(result).toMatchObject({
      inheritedVersion: 2,
      inheritedValues: { appointment: { duration: 30, buffer: 10 } },
      overrides: { appointment: { duration: 75 } },
      effectiveValues: { appointment: { duration: 75, buffer: 10 } },
      sources: { appointment: 'branch_override' },
    });
  });
});
