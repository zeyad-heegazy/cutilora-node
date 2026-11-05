import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/modules/tenancy/repositories/tenancy.repository.js', () => ({
  tenancyRepository: {
    findClinicById: vi.fn(),
    updateClinic: vi.fn(),
    createTenantAuditEvent: vi.fn().mockResolvedValue({}),
  },
}));
vi.mock('../../src/modules/geo/services/geo.service.js', () => ({
  geoService: {
    validateClinicLocation: vi.fn().mockResolvedValue(undefined),
    validateCity: vi.fn(),
    listForClinic: vi.fn(),
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

const tenantId = '64b000000000000000000001';
const clinicId = '64b000000000000000000003';
const userId = '64b000000000000000000002';
const oldLogo = '/uploads/branding/clinics/clinic/logos/old.png';
const oldCover = '/uploads/branding/clinics/clinic/covers/old.webp';
const newLogo = '/uploads/branding/clinics/clinic/logos/new.png';
const newCover = '/uploads/branding/clinics/clinic/covers/new.webp';

function makeClinic() {
  const data = {
    branding: { logoUrl: oldLogo, coverImageUrl: oldCover },
    address: {},
    contact: {},
    preferences: {},
    bookingSettings: {},
    settings: {},
  };
  return {
    toObject: () => data,
  };
}

describe('tenant clinic branding updates', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(removeBrandingImage).mockResolvedValue(undefined);
    vi.mocked(tenancyRepository.createTenantAuditEvent).mockResolvedValue({} as any);
    vi.mocked(tenancyRepository.findClinicById).mockResolvedValue(makeClinic() as any);
  });

  it('keeps newly committed branding files when old-file cleanup fails', async () => {
    vi.mocked(storeBrandingLogo).mockResolvedValue(newLogo);
    vi.mocked(storeBrandingCover).mockResolvedValue(newCover);
    vi.mocked(tenancyRepository.updateClinic).mockResolvedValue({ _id: clinicId } as any);
    vi.mocked(removeBrandingImage).mockImplementation(async (url) => {
      if (url === oldLogo || url === oldCover) throw new Error('filesystem unavailable');
    });

    await expect(
      tenancyService.updateClinic(
        clinicId,
        {
          branding: {
            logoBase64: 'data:image/png;base64,bG9nbw==',
            coverImageBase64: 'data:image/webp;base64,Y292ZXI=',
          },
        },
        tenantId,
        userId,
      ),
    ).resolves.toMatchObject({ _id: clinicId });

    expect(tenancyRepository.updateClinic).toHaveBeenCalled();
    expect(removeBrandingImage).toHaveBeenCalledWith(oldLogo);
    expect(removeBrandingImage).toHaveBeenCalledWith(oldCover);
    expect(removeBrandingImage).not.toHaveBeenCalledWith(newLogo);
    expect(removeBrandingImage).not.toHaveBeenCalledWith(newCover);
  });

  it('cleans newly uploaded branding files when the database update fails', async () => {
    vi.mocked(storeBrandingLogo).mockResolvedValue(newLogo);
    vi.mocked(tenancyRepository.updateClinic).mockRejectedValue(new Error('database unavailable'));

    await expect(
      tenancyService.updateClinic(
        clinicId,
        { branding: { logoBase64: 'data:image/png;base64,bG9nbw==' } },
        tenantId,
        userId,
      ),
    ).rejects.toThrow('database unavailable');

    expect(removeBrandingImage).toHaveBeenCalledWith(newLogo);
    expect(removeBrandingImage).not.toHaveBeenCalledWith(oldLogo);
  });
});
