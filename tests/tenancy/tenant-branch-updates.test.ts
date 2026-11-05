import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/modules/tenancy/repositories/tenancy.repository.js', () => ({
  tenancyRepository: {
    findBranchById: vi.fn(),
    findBranchByCode: vi.fn(),
    findBranchBySlug: vi.fn(),
    updateBranch: vi.fn(),
    createTenantAuditEvent: vi.fn().mockResolvedValue({}),
  },
}));
vi.mock('../../src/modules/geo/services/geo.service.js', () => ({
  geoService: {
    validateClinicLocation: vi.fn().mockResolvedValue(undefined),
    validateCity: vi.fn().mockResolvedValue(undefined),
  },
}));

import { tenancyService } from '../../src/modules/tenancy/services/tenancy.service.js';
import { tenancyRepository } from '../../src/modules/tenancy/repositories/tenancy.repository.js';
import { geoService } from '../../src/modules/geo/services/geo.service.js';

const tenantId = '64b000000000000000000001';
const clinicId = '64b000000000000000000002';
const branchId = '64b000000000000000000003';
const userId = '64b000000000000000000004';

function makeBranch() {
  return {
    name: 'Main Branch',
    cityId: null,
    addressDetails: {
      addressLine1: '10 Main Street',
      addressLine2: 'Suite 4',
      building: 'Building A',
    },
    contact: {
      email: 'old@example.com',
      phone: '+201000000000',
      whatsapp: '+201000000001',
    },
    contactPerson: {
      name: 'Old Contact',
      email: 'contact@example.com',
      phone: '+201000000002',
    },
    settings: {
      reminders: { enabled: true, channels: ['email'] },
      booking: { allowOnline: false },
    },
    toObject() {
      return {
        name: this.name,
        cityId: this.cityId,
        addressDetails: this.addressDetails,
        contact: this.contact,
        contactPerson: this.contactPerson,
        settings: this.settings,
      };
    },
  };
}

describe('tenant branch partial updates', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(tenancyRepository.createTenantAuditEvent).mockResolvedValue({} as any);
    vi.mocked(tenancyRepository.findBranchById).mockResolvedValue(makeBranch() as any);
    vi.mocked(tenancyRepository.findBranchByCode).mockResolvedValue(null);
    vi.mocked(tenancyRepository.findBranchBySlug).mockResolvedValue(null);
    vi.mocked(geoService.validateClinicLocation).mockResolvedValue(undefined);
    vi.mocked(geoService.validateCity).mockResolvedValue(undefined);
    vi.mocked(tenancyRepository.updateBranch).mockResolvedValue({ _id: branchId } as any);
  });

  it('merges partial address, contact, contact person, and settings without erasing omitted values', async () => {
    await tenancyService.updateBranch(
      branchId,
      {
        addressDetails: { addressLine1: '20 New Street' },
        contact: { email: 'new@example.com' },
        contactPerson: { name: 'New Contact' },
        settings: { reminders: { enabled: false } },
      },
      tenantId,
      clinicId,
      userId,
    );

    expect(tenancyRepository.updateBranch).toHaveBeenCalledWith(
      branchId,
      tenantId,
      clinicId,
      expect.objectContaining({
        updatedBy: userId,
        addressDetails: {
          addressLine1: '20 New Street',
          addressLine2: 'Suite 4',
          building: 'Building A',
        },
        contact: {
          email: 'new@example.com',
          phone: '+201000000000',
          whatsapp: '+201000000001',
        },
        contactPerson: {
          name: 'New Contact',
          email: 'contact@example.com',
          phone: '+201000000002',
        },
        settings: {
          reminders: { enabled: false, channels: ['email'] },
          booking: { allowOnline: false },
        },
      }),
    );
  });

  it('rejects conflicting top-level and nested city IDs', async () => {
    await expect(
      tenancyService.updateBranch(
        branchId,
        {
          cityId: '64b000000000000000000005',
          addressDetails: { cityId: '64b000000000000000000006' },
        },
        tenantId,
        clinicId,
        userId,
      ),
    ).rejects.toMatchObject({ code: 'BRANCH_CITY_MISMATCH' });

    expect(tenancyRepository.updateBranch).not.toHaveBeenCalled();
  });

  it('validates the merged location when a partial address is changed', async () => {
    await tenancyService.updateBranch(
      branchId,
      { addressDetails: { addressLine1: '20 New Street' } },
      tenantId,
      clinicId,
      userId,
    );

    expect(geoService.validateClinicLocation).toHaveBeenCalledWith(
      expect.objectContaining({
        addressLine1: '20 New Street',
        addressLine2: 'Suite 4',
        building: 'Building A',
        cityId: null,
      }),
    );
  });
});
