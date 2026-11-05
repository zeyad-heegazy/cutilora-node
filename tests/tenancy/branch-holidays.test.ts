import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/modules/tenancy/repositories/tenancy.repository.js', () => ({
  tenancyRepository: {
    createTenantAuditEvent: vi.fn().mockResolvedValue({}),
    findBranchById: vi.fn(),
    acquireBranchHolidayMutationLock: vi.fn(),
    releaseBranchHolidayMutationLock: vi.fn(),
    listBranchHolidays: vi.fn(),
    findOverlappingBranchHoliday: vi.fn(),
    createBranchHoliday: vi.fn(),
    updateBranchHoliday: vi.fn(),
    cancelBranchHoliday: vi.fn(),
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
import { createBranchHolidaySchema } from '../../src/modules/tenancy/validations/tenancy.validation.js';

const tenantId = '64b000000000000000000001';
const clinicId = '64b000000000000000000002';
const branchId = '64b000000000000000000003';
const userId = '64b000000000000000000004';

describe('branch holiday service', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(tenancyRepository.acquireBranchHolidayMutationLock).mockResolvedValue({ _id: branchId } as any);
    vi.mocked(tenancyRepository.releaseBranchHolidayMutationLock).mockResolvedValue({ acknowledged: true } as any);
  });

  it('rejects impossible dates and invalid exceptional-hours combinations', () => {
    expect(createBranchHolidaySchema.safeParse({
      title: 'Invalid date', type: 'closure', startDate: '2026-02-31', endDate: '2026-03-01',
    }).success).toBe(false);
    expect(createBranchHolidaySchema.safeParse({
      title: 'Modified hours', type: 'modified_hours', startDate: '2026-12-25', endDate: '2026-12-25',
      isAllDay: true,
    }).success).toBe(false);
    expect(createBranchHolidaySchema.safeParse({
      title: 'Partial closure', type: 'closure', startDate: '2026-12-25', endDate: '2026-12-25',
      isAllDay: false,
    }).success).toBe(false);
  });

  it('creates a holiday only after confirming the branch belongs to the tenant and clinic', async () => {
    vi.mocked(tenancyRepository.findBranchById).mockResolvedValue({ _id: branchId } as any);
    vi.mocked(tenancyRepository.findOverlappingBranchHoliday).mockResolvedValue(null as any);
    vi.mocked(tenancyRepository.createBranchHoliday).mockImplementation(async (data: any) => data as any);

    const result = await tenancyService.createBranchHoliday(tenantId, clinicId, branchId, userId, {
      title: 'Public holiday',
      type: 'closure',
      startDate: '2026-12-25',
      endDate: '2026-12-26',
      isAllDay: true,
    });

    expect(tenancyRepository.findBranchById).toHaveBeenCalledWith(branchId, tenantId, clinicId);
    expect(tenancyRepository.findOverlappingBranchHoliday).toHaveBeenCalledWith(
      { tenantId, clinicId, branchId },
      new Date('2026-12-25T00:00:00.000Z'),
      new Date('2026-12-26T00:00:00.000Z'),
    );
    expect(tenancyRepository.createBranchHoliday).toHaveBeenCalledWith(expect.objectContaining({
      tenantId, clinicId, branchId, createdBy: userId, type: 'closure',
    }));
    expect(result).toMatchObject({ tenantId, clinicId, branchId });
  });

  it('rejects overlapping active holiday ranges', async () => {
    vi.mocked(tenancyRepository.findBranchById).mockResolvedValue({ _id: branchId } as any);
    vi.mocked(tenancyRepository.findOverlappingBranchHoliday).mockResolvedValue({ _id: 'existing' } as any);

    await expect(tenancyService.createBranchHoliday(tenantId, clinicId, branchId, userId, {
      title: 'Overlapping closure',
      type: 'closure',
      startDate: '2026-12-25',
      endDate: '2026-12-26',
    })).rejects.toMatchObject({ status: 409, code: 'BRANCH_HOLIDAY_OVERLAP' });

    expect(tenancyRepository.createBranchHoliday).not.toHaveBeenCalled();
  });

  it('updates an active holiday while excluding itself from overlap detection', async () => {
    vi.mocked(tenancyRepository.findBranchById).mockResolvedValue({ _id: branchId } as any);
    vi.mocked(tenancyRepository.findOverlappingBranchHoliday).mockResolvedValue(null as any);
    vi.mocked(tenancyRepository.updateBranchHoliday).mockImplementation(async (_tenantId: string, _clinicId: string, _branchId: string, _holidayId: string, data: any) => data as any);

    const result = await tenancyService.updateBranchHoliday(tenantId, clinicId, branchId, '64b000000000000000000005', userId, {
      title: 'Updated hours',
      type: 'modified_hours',
      startDate: '2026-12-25',
      endDate: '2026-12-25',
      isAllDay: false,
      startTime: '10:00',
      endTime: '16:00',
      reason: 'Seasonal hours',
    });

    expect(tenancyRepository.findOverlappingBranchHoliday).toHaveBeenCalledWith(
      { tenantId, clinicId, branchId },
      new Date('2026-12-25T00:00:00.000Z'),
      new Date('2026-12-25T00:00:00.000Z'),
      '64b000000000000000000005',
    );
    expect(tenancyRepository.updateBranchHoliday).toHaveBeenCalledWith(
      tenantId, clinicId, branchId, '64b000000000000000000005',
      expect.objectContaining({ title: 'Updated hours', startTime: '10:00', endTime: '16:00' }),
    );
    expect(result).toMatchObject({ title: 'Updated hours', type: 'modified_hours' });
  });

  it('rejects a holiday update that overlaps another active holiday', async () => {
    vi.mocked(tenancyRepository.findBranchById).mockResolvedValue({ _id: branchId } as any);
    vi.mocked(tenancyRepository.findOverlappingBranchHoliday).mockResolvedValue({ _id: 'another-holiday' } as any);

    await expect(tenancyService.updateBranchHoliday(tenantId, clinicId, branchId, '64b000000000000000000005', userId, {
      title: 'Updated closure',
      type: 'closure',
      startDate: '2026-12-25',
      endDate: '2026-12-26',
      isAllDay: true,
    })).rejects.toMatchObject({ status: 409, code: 'BRANCH_HOLIDAY_OVERLAP' });

    expect(tenancyRepository.updateBranchHoliday).not.toHaveBeenCalled();
  });

  it('does not update a holiday when its branch is outside the tenant and clinic', async () => {
    vi.mocked(tenancyRepository.findBranchById).mockResolvedValue(null as any);

    const result = await tenancyService.updateBranchHoliday(tenantId, clinicId, branchId, '64b000000000000000000005', userId, {
      title: 'Updated closure',
      type: 'closure',
      startDate: '2026-12-25',
      endDate: '2026-12-25',
      isAllDay: true,
    });

    expect(result).toBeNull();
    expect(tenancyRepository.findOverlappingBranchHoliday).not.toHaveBeenCalled();
    expect(tenancyRepository.updateBranchHoliday).not.toHaveBeenCalled();
  });

  it('does not create a holiday for a branch outside the active tenant and clinic', async () => {
    vi.mocked(tenancyRepository.findBranchById).mockResolvedValue(null as any);
    const result = await tenancyService.createBranchHoliday(tenantId, clinicId, branchId, userId, {
      title: 'Holiday',
      type: 'closure',
      startDate: '2026-12-25',
      endDate: '2026-12-25',
    });
    expect(result).toBeNull();
    expect(tenancyRepository.findOverlappingBranchHoliday).not.toHaveBeenCalled();
    expect(tenancyRepository.createBranchHoliday).not.toHaveBeenCalled();
  });
});
