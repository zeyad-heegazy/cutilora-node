import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/modules/tenancy/repositories/tenancy.repository.js', () => ({
  tenancyRepository: {
    findTenantConfiguration: vi.fn(),
    createTenantConfiguration: vi.fn(),
    updateTenantConfiguration: vi.fn(),
    listClinicsForConfiguration: vi.fn(),
    applyTenantConfigurationToClinic: vi.fn(),
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
const userId = '64b000000000000000000002';
const clinicId = '64b000000000000000000003';

describe('tenant shared configuration service', () => {
  beforeEach(() => vi.resetAllMocks());

  it('updates configuration with optimistic versioning and preserves existing nested defaults', async () => {
    vi.mocked(tenancyRepository.findTenantConfiguration).mockResolvedValue({
      version: 3,
      values: { appointment: { duration: 30, buffer: 5 }, locale: 'en' },
    } as any);
    vi.mocked(tenancyRepository.updateTenantConfiguration).mockResolvedValue({
      version: 4,
      values: { appointment: { duration: 45, buffer: 5 }, locale: 'en' },
    } as any);

    const result = await tenancyService.updateTenantConfiguration(tenantId, userId, {
      appointment: { duration: 45 },
    });

    expect(tenancyRepository.updateTenantConfiguration).toHaveBeenCalledWith(
      tenantId,
      3,
      { appointment: { duration: 45, buffer: 5 }, locale: 'en' },
      userId,
    );
    expect(result).toMatchObject({ version: 4 });
  });

  it('rejects stale configuration writes instead of silently overwriting newer values', async () => {
    vi.mocked(tenancyRepository.findTenantConfiguration).mockResolvedValue({ version: 2, values: {} } as any);
    vi.mocked(tenancyRepository.updateTenantConfiguration).mockResolvedValue(null as any);

    await expect(tenancyService.updateTenantConfiguration(tenantId, userId, { locale: 'ar' }))
      .rejects.toMatchObject({ status: 409, code: 'CONFIGURATION_VERSION_CONFLICT' });
  });

  it('previews only clinics owned by the tenant and shows clinic overrides as the effective source', async () => {
    vi.mocked(tenancyRepository.findTenantConfiguration).mockResolvedValue({
      version: 5,
      values: { appointment: { duration: 30, buffer: 5 } },
    } as any);
    vi.mocked(tenancyRepository.listClinicsForConfiguration).mockResolvedValue([{
      _id: clinicId,
      name: 'Clinic One',
      status: 'active',
      settings: {
        organizationDefaultsVersion: 3,
        organizationOverrides: { appointment: { duration: 60 } },
      },
    }] as any);

    const result = await tenancyService.previewTenantConfigurationApply(tenantId, {
      applyTo: 'selected',
      clinicIds: [clinicId],
    });

    expect(tenancyRepository.listClinicsForConfiguration).toHaveBeenCalledWith(tenantId, [clinicId]);
    expect(result.clinics[0]).toMatchObject({
      clinicId,
      currentVersion: 3,
      hasOverrides: true,
      willUpdate: true,
      effectiveValues: { appointment: { duration: 60, buffer: 5 } },
    });
  });

  it('applies a confirmed configuration idempotently without overwriting clinic overrides', async () => {
    vi.mocked(tenancyRepository.findTenantConfiguration).mockResolvedValue({
      version: 5,
      values: { appointment: { duration: 30 } },
    } as any);
    vi.mocked(tenancyRepository.listClinicsForConfiguration).mockResolvedValue([{
      _id: clinicId,
      settings: { organizationDefaultsVersion: 4 },
    }] as any);
    vi.mocked(tenancyRepository.applyTenantConfigurationToClinic).mockResolvedValue({ _id: clinicId } as any);

    const result = await tenancyService.applyTenantConfiguration(tenantId, userId, {
      applyTo: 'selected',
      clinicIds: [clinicId],
      confirm: true,
    });

    expect(tenancyRepository.applyTenantConfigurationToClinic).toHaveBeenCalledWith(
      tenantId, clinicId, { appointment: { duration: 30 } }, 5,
    );
    expect(result).toEqual({ version: 5, updated: 1, skipped: 0 });
  });

  it('requires explicit confirmation before bulk applying defaults', async () => {
    await expect(tenancyService.applyTenantConfiguration(tenantId, userId, {
      applyTo: 'all',
      confirm: false,
    })).rejects.toMatchObject({ status: 400, code: 'CONFIRMATION_REQUIRED' });
    expect(tenancyRepository.findTenantConfiguration).not.toHaveBeenCalled();
  });
});
