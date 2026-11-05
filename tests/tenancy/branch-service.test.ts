import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/modules/tenancy/repositories/tenancy.repository.js', () => ({
  tenancyRepository: {
    findClinicById: vi.fn(),
    findBranchBySlug: vi.fn(),
    findBranchById: vi.fn(),
    createBranch: vi.fn(),
    updateBranch: vi.fn(),
    listBranches: vi.fn(),
  },
}));
vi.mock('../../src/modules/geo/services/geo.service.js', () => ({
  geoService: { listForClinic: vi.fn(), validateClinicLocation: vi.fn() },
}));
vi.mock('../../src/shared/storage/branding-image.storage.js', () => ({
  storeBrandingLogo: vi.fn(),
  storeBrandingCover: vi.fn(),
  removeBrandingImage: vi.fn(),
}));

import { tenancyService } from '../../src/modules/tenancy/services/tenancy.service.js';
import { tenancyRepository } from '../../src/modules/tenancy/repositories/tenancy.repository.js';

const tenantId = '64b000000000000000000001';
const clinicId = '64b000000000000000000002';
const branchId = '64b000000000000000000003';

describe('branch service', () => {
  beforeEach(() => vi.resetAllMocks());

  it('lists branches strictly inside the selected tenant and clinic', async () => {
    vi.mocked(tenancyRepository.listBranches).mockResolvedValue([] as any);
    await tenancyService.listBranches(tenantId, clinicId, null);
    expect(tenancyRepository.listBranches).toHaveBeenCalledWith({ tenantId, clinicId });
  });

  it('restricts branch listing to the selected branch when branch context exists', async () => {
    vi.mocked(tenancyRepository.listBranches).mockResolvedValue([] as any);
    await tenancyService.listBranches(tenantId, clinicId, branchId);
    expect(tenancyRepository.listBranches).toHaveBeenCalledWith({ tenantId, clinicId, _id: branchId });
  });

  it('generates a unique slug and inherits the clinic timezone when creating a branch', async () => {
    vi.mocked(tenancyRepository.findClinicById).mockResolvedValue({
      timezone: 'Asia/Riyadh',
      preferences: { timezone: 'Africa/Cairo' },
    } as any);
    vi.mocked(tenancyRepository.findBranchBySlug).mockResolvedValue(null as any);
    vi.mocked(tenancyRepository.createBranch).mockImplementation(async (data: any) => data as any);

    const result = await tenancyService.createBranch({
      name: 'New Riyadh Branch',
      operatingHours: [{ dayOfWeek: 0, isClosed: true }],
    }, tenantId, clinicId);

    expect(tenancyRepository.createBranch).toHaveBeenCalledWith(expect.objectContaining({
      tenantId,
      clinicId,
      slug: 'new-riyadh-branch',
      timezone: 'Asia/Riyadh',
    }));
    expect(result).toMatchObject({ slug: 'new-riyadh-branch', timezone: 'Asia/Riyadh' });
  });

  it('does not create a branch for a clinic outside the selected tenant', async () => {
    vi.mocked(tenancyRepository.findClinicById).mockResolvedValue(null as any);
    const result = await tenancyService.createBranch({ name: 'Other clinic branch' }, tenantId, clinicId);
    expect(result).toBeNull();
    expect(tenancyRepository.createBranch).not.toHaveBeenCalled();
  });

  it('updates a branch using tenant and clinic scoped repository filters', async () => {
    vi.mocked(tenancyRepository.findBranchById).mockResolvedValue({
      _id: branchId, name: 'Old name', slug: 'old-name',
    } as any);
    vi.mocked(tenancyRepository.findBranchBySlug).mockResolvedValue(null as any);
    vi.mocked(tenancyRepository.updateBranch).mockResolvedValue({ _id: branchId, name: 'New name', slug: 'new-name' } as any);

    await tenancyService.updateBranch(branchId, { name: 'New name' }, tenantId, clinicId);

    expect(tenancyRepository.updateBranch).toHaveBeenCalledWith(branchId, tenantId, clinicId, {
      name: 'New name',
      slug: 'new-name',
    });
  });

  it('does not update a branch outside the selected tenant and clinic', async () => {
    vi.mocked(tenancyRepository.findBranchById).mockResolvedValue(null as any);
    const result = await tenancyService.updateBranch(branchId, { status: 'suspended' }, tenantId, clinicId);
    expect(result).toBeNull();
    expect(tenancyRepository.updateBranch).not.toHaveBeenCalled();
  });
});
