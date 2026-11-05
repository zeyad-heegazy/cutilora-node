import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/modules/tenancy/repositories/tenancy.repository.js', () => ({
  tenancyRepository: {
    findTenantById: vi.fn(),
    updateTenant: vi.fn(),
    createTenantAuditEvent: vi.fn().mockResolvedValue({}),
  },
}));

vi.mock('../../src/modules/geo/services/geo.service.js', () => ({
  geoService: {
    validateClinicLocation: vi.fn().mockResolvedValue(undefined),
    listForClinic: vi.fn(),
    validateCity: vi.fn(),
  },
}));

vi.mock('../../src/shared/storage/branding-image.storage.js', () => ({
  storeBrandingLogo: vi.fn(),
  storeBrandingCover: vi.fn(),
  removeBrandingImage: vi.fn().mockResolvedValue(undefined),
}));

import { tenancyService } from '../../src/modules/tenancy/services/tenancy.service.js';
import { tenancyRepository } from '../../src/modules/tenancy/repositories/tenancy.repository.js';
import {
  storeBrandingLogo,
  storeBrandingCover,
  removeBrandingImage,
} from '../../src/shared/storage/branding-image.storage.js';
import { Tenant } from '../../src/modules/tenancy/models/tenant.model.js';

const tenantId = '64b000000000000000000001';
const userId = '64b000000000000000000002';
const oldLogo = '/uploads/branding/tenants/tenant/logos/old.png';
const oldCover = '/uploads/branding/tenants/tenant/covers/old.webp';
const newLogo = '/uploads/branding/tenants/tenant/logos/new.png';
const newCover = '/uploads/branding/tenants/tenant/covers/new.webp';

function makeTenant(branding: Record<string, unknown> = {}) {
  const values: Record<string, unknown> = {
    contact: { email: 'old@example.com', phone: '+201000000000' },
    address: {},
    legal: {},
    preferences: { locale: 'en', currency: 'EGP' },
    branding,
  };

  return {
    preferences: values.preferences,
    get: (key: string) => values[key],
  };
}

describe('tenant organization profile', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(tenancyRepository.createTenantAuditEvent).mockResolvedValue({} as any);
    vi.mocked(removeBrandingImage).mockResolvedValue(undefined);
  });

  it('merges partial profile fields and persists uploaded logo and cover URLs', async () => {
    vi.mocked(tenancyRepository.findTenantById).mockResolvedValue(
      makeTenant({ logoUrl: oldLogo, coverImageUrl: oldCover }) as any,
    );
    vi.mocked(storeBrandingLogo).mockResolvedValue(newLogo);
    vi.mocked(storeBrandingCover).mockResolvedValue(newCover);
    vi.mocked(tenancyRepository.updateTenant).mockResolvedValue({ _id: tenantId } as any);

    await tenancyService.updateProfile(tenantId, userId, {
      contact: { email: 'new@example.com' },
      branding: {
        logoBase64: 'data:image/png;base64,bG9nbw==',
        coverImageBase64: 'data:image/webp;base64,Y292ZXI=',
        primaryColor: '#123456',
      },
    });

    expect(tenancyRepository.updateTenant).toHaveBeenCalledWith(
      tenantId,
      expect.objectContaining({
        updatedBy: userId,
        contact: { email: 'new@example.com', phone: '+201000000000' },
        branding: {
          logoUrl: newLogo,
          coverImageUrl: newCover,
          primaryColor: '#123456',
        },
      }),
    );
    expect(removeBrandingImage).toHaveBeenCalledWith(oldLogo);
    expect(removeBrandingImage).toHaveBeenCalledWith(oldCover);
    expect(removeBrandingImage).not.toHaveBeenCalledWith(newLogo);
    expect(removeBrandingImage).not.toHaveBeenCalledWith(newCover);
  });

  it('does not invalidate the saved profile when cleanup of replaced images fails', async () => {
    vi.mocked(tenancyRepository.findTenantById).mockResolvedValue(
      makeTenant({ logoUrl: oldLogo, coverImageUrl: oldCover }) as any,
    );
    vi.mocked(storeBrandingLogo).mockResolvedValue(newLogo);
    vi.mocked(storeBrandingCover).mockResolvedValue(newCover);
    vi.mocked(tenancyRepository.updateTenant).mockResolvedValue({ _id: tenantId } as any);
    vi.mocked(removeBrandingImage).mockImplementation(async (url) => {
      if (url === oldLogo || url === oldCover) throw new Error('filesystem unavailable');
    });

    await expect(
      tenancyService.updateProfile(tenantId, userId, {
        branding: {
          logoBase64: 'data:image/png;base64,bG9nbw==',
          coverImageBase64: 'data:image/webp;base64,Y292ZXI=',
        },
      }),
    ).resolves.toMatchObject({ _id: tenantId });

    expect(tenancyRepository.updateTenant).toHaveBeenCalled();
    expect(removeBrandingImage).toHaveBeenCalledWith(oldLogo);
    expect(removeBrandingImage).toHaveBeenCalledWith(oldCover);
    expect(removeBrandingImage).not.toHaveBeenCalledWith(newLogo);
    expect(removeBrandingImage).not.toHaveBeenCalledWith(newCover);
  });

  it('removes newly stored images when the database update fails', async () => {
    vi.mocked(tenancyRepository.findTenantById).mockResolvedValue(
      makeTenant({ logoUrl: oldLogo }) as any,
    );
    vi.mocked(storeBrandingLogo).mockResolvedValue(newLogo);
    vi.mocked(tenancyRepository.updateTenant).mockRejectedValue(new Error('database unavailable'));

    await expect(
      tenancyService.updateProfile(tenantId, userId, {
        branding: { logoBase64: 'data:image/png;base64,bG9nbw==' },
      }),
    ).rejects.toThrow('database unavailable');

    expect(removeBrandingImage).toHaveBeenCalledWith(newLogo);
    expect(removeBrandingImage).not.toHaveBeenCalledWith(oldLogo);
  });

  it('updates preferences without overwriting unspecified organization defaults', async () => {
    vi.mocked(tenancyRepository.findTenantById).mockResolvedValue(
      makeTenant() as any,
    );
    vi.mocked(tenancyRepository.updateTenant).mockResolvedValue({
      _id: tenantId,
      preferences: { locale: 'ar', currency: 'EGP' },
    } as any);

    await tenancyService.updatePreferences(tenantId, userId, {
      locale: 'ar',
    });

    expect(tenancyRepository.updateTenant).toHaveBeenCalledWith(
      tenantId,
      expect.objectContaining({
        updatedBy: userId,
        preferences: { locale: 'ar', currency: 'EGP' },
      }),
    );
  });

  it('applies complete default organization preferences when none are supplied', () => {
    const tenant = new Tenant({ name: 'Example Clinic', slug: 'example-clinic' });

    expect(tenant.preferences).toMatchObject({
      timezone: 'Africa/Cairo',
      locale: 'en',
      currency: 'EGP',
      dateFormat: 'YYYY-MM-DD',
      weekStartsOn: 6,
      supportedLanguages: ['en', 'ar'],
    });
  });
});
