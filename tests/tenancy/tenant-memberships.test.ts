import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/modules/tenancy/repositories/tenancy.repository.js', () => ({
  tenancyRepository: {
    listTenantMemberships: vi.fn(),
    findTenantUserDetails: vi.fn(),
    listTenantInvitations: vi.fn(),
    listTenantAuditEvents: vi.fn(),
    listMembershipsForUser: vi.fn(),
    findTenantMembershipById: vi.fn(),
    countActiveTenantOwners: vi.fn(),
    acquireTenantOwnerMutationLock: vi.fn(),
    releaseTenantOwnerMutationLock: vi.fn(),
    findClinicById: vi.fn(),
    findActiveClinic: vi.fn(),
    findActiveBranch: vi.fn(),
    expirePendingTenantInvitations: vi.fn(),
    findPendingTenantInvitation: vi.fn(),
    createTenantInvitation: vi.fn(),
    findBranchById: vi.fn(),
    updateTenantMembership: vi.fn(),
    createTenantAuditEvent: vi.fn().mockResolvedValue({}),
    getDashboardCounts: vi.fn(),
    findSubscriptionByTenantId: vi.fn(),
    acquireTenantEntitlementLock: vi.fn(),
    releaseTenantEntitlementLock: vi.fn(),
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
const actorId = '64b000000000000000000002';
const targetId = '64b000000000000000000003';
const membershipId = '64b000000000000000000004';
const clinicId = '64b000000000000000000005';
const branchId = '64b000000000000000000006';

describe('tenant membership administration', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(tenancyRepository.acquireTenantOwnerMutationLock).mockResolvedValue({ _id: tenantId } as any);
    vi.mocked(tenancyRepository.releaseTenantOwnerMutationLock).mockResolvedValue({ modifiedCount: 1 } as any);
    vi.mocked(tenancyRepository.getDashboardCounts).mockResolvedValue({ clinics: { total: 0 }, branches: { total: 0 }, activeMembers: 0, pendingInvitations: 0 } as any);
    vi.mocked(tenancyRepository.findSubscriptionByTenantId).mockResolvedValue(null as any);
    vi.mocked(tenancyRepository.acquireTenantEntitlementLock).mockResolvedValue({ _id: tenantId } as any);
    vi.mocked(tenancyRepository.releaseTenantEntitlementLock).mockResolvedValue({ modifiedCount: 1 } as any);
  });

  it('prevents demoting or suspending the last active Tenant Owner', async () => {
    vi.mocked(tenancyRepository.findTenantMembershipById).mockResolvedValue({
      _id: membershipId, userId: targetId, role: 'tenant_owner', scope: 'tenant', status: 'active',
      clinicId: null, branchIds: [],
    } as any);
    vi.mocked(tenancyRepository.countActiveTenantOwners).mockResolvedValue(1 as any);

    await expect(tenancyService.updateTenantMembership(tenantId, membershipId, actorId, 'tenant_owner', {
      status: 'suspended',
    })).rejects.toMatchObject({ status: 409, code: 'LAST_TENANT_OWNER_REQUIRED' });

    expect(tenancyRepository.updateTenantMembership).not.toHaveBeenCalled();
  });

  it('validates branch membership scope against the tenant and clinic before saving', async () => {
    vi.mocked(tenancyRepository.findTenantMembershipById).mockResolvedValue({
      _id: membershipId, userId: targetId, role: 'clinic_manager', scope: 'clinic', status: 'active',
      clinicId, branchIds: [],
    } as any);
    vi.mocked(tenancyRepository.findClinicById).mockResolvedValue({ _id: clinicId } as any);
    vi.mocked(tenancyRepository.findBranchById).mockResolvedValue({ _id: branchId } as any);
    vi.mocked(tenancyRepository.updateTenantMembership).mockResolvedValue({ _id: membershipId, role: 'branch_manager' } as any);

    const result = await tenancyService.updateTenantMembership(tenantId, membershipId, actorId, 'tenant_owner', {
      scope: 'branch',
      role: 'branch_manager',
      clinicId,
      branchIds: [branchId],
    });

    expect(tenancyRepository.findBranchById).toHaveBeenCalledWith(branchId, tenantId, clinicId);
    expect(tenancyRepository.updateTenantMembership).toHaveBeenCalledWith(tenantId, membershipId, expect.objectContaining({
      scope: 'branch', role: 'branch_manager', clinicId, branchIds: [branchId], updatedBy: actorId,
    }));
    expect(result).toMatchObject({ role: 'branch_manager' });
  });

  it('prevents Tenant Admin from assigning tenant-wide roles', async () => {
    vi.mocked(tenancyRepository.findTenantMembershipById).mockResolvedValue({
      _id: membershipId, userId: targetId, role: 'clinic_manager', scope: 'clinic', status: 'active',
      clinicId, branchIds: [],
    } as any);

    await expect(tenancyService.updateTenantMembership(tenantId, membershipId, actorId, 'tenant_admin', {
      scope: 'tenant', role: 'tenant_admin',
    })).rejects.toMatchObject({ status: 403, code: 'TENANT_OWNER_REQUIRED' });
  });

  it('does not allow an invited membership to be activated without invitation acceptance', async () => {
    vi.mocked(tenancyRepository.findTenantMembershipById).mockResolvedValue({
      _id: membershipId, userId: targetId, role: 'clinic_manager', scope: 'clinic', status: 'invited',
      clinicId, branchIds: [],
    } as any);

    await expect(tenancyService.updateTenantMembership(tenantId, membershipId, actorId, 'tenant_owner', {
      status: 'active',
    })).rejects.toMatchObject({ status: 409, code: 'INVITATION_ACCEPTANCE_REQUIRED' });
    expect(tenancyRepository.updateTenantMembership).not.toHaveBeenCalled();
  });

  it('prevents users from changing their own membership', async () => {
    vi.mocked(tenancyRepository.findTenantMembershipById).mockResolvedValue({
      _id: membershipId, userId: actorId, role: 'tenant_owner', scope: 'tenant', status: 'active',
      clinicId: null, branchIds: [],
    } as any);

    await expect(tenancyService.updateTenantMembership(tenantId, membershipId, actorId, 'tenant_owner', {
      status: 'suspended',
    })).rejects.toMatchObject({ status: 403, code: 'SELF_MEMBERSHIP_CHANGE_DENIED' });
  });
  it('passes tenant user directory filters and pagination to the repository', async () => {
    vi.mocked(tenancyRepository.listTenantMemberships).mockResolvedValue({
      items: [{ _id: membershipId }],
      pagination: { page: 2, perPage: 10, total: 21, pages: 3 },
    } as any);

    const result = await tenancyService.listTenantMemberships(tenantId, {
      search: 'manager', status: 'active', role: 'clinic_manager', scope: 'clinic', clinicId, lastLoginFrom: new Date('2026-01-01T00:00:00.000Z'), lastLoginTo: new Date('2026-11-05T00:00:00.000Z'), page: 2, perPage: 10,
    });

    expect(tenancyRepository.listTenantMemberships).toHaveBeenCalledWith(tenantId, {
      search: 'manager', status: 'active', role: 'clinic_manager', scope: 'clinic', clinicId, lastLoginFrom: new Date('2026-01-01T00:00:00.000Z'), lastLoginTo: new Date('2026-11-05T00:00:00.000Z'), page: 2, perPage: 10,
    });
    expect(result.pagination).toMatchObject({ page: 2, perPage: 10, total: 21 });
  });

  it('returns paginated tenant invitation results through the service', async () => {
    vi.mocked(tenancyRepository.listTenantInvitations).mockResolvedValue({
      items: [{ _id: 'invite-1', status: 'pending', expiresAt: new Date(Date.now() + 60_000) }],
      pagination: { page: 1, perPage: 10, total: 1, pages: 1 },
    } as any);

    const result = await tenancyService.listTenantInvitations(tenantId, {
      search: 'clinic@example.com', status: 'pending', page: 1, perPage: 10,
    });

    expect(tenancyRepository.listTenantInvitations).toHaveBeenCalledWith(tenantId, {
      search: 'clinic@example.com', status: 'pending', page: 1, perPage: 10,
    });
    expect(result.pagination.total).toBe(1);
  });

  it('creates a scoped invitation only for an active clinic and active branches', async () => {
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    vi.mocked(tenancyRepository.findActiveClinic).mockResolvedValue({ _id: clinicId } as any);
    vi.mocked(tenancyRepository.expirePendingTenantInvitations).mockResolvedValue({ modifiedCount: 0 } as any);
    vi.mocked(tenancyRepository.findPendingTenantInvitation).mockResolvedValue(null as any);
    vi.mocked(tenancyRepository.createTenantInvitation).mockResolvedValue({
      _id: '64b000000000000000000007',
      email: 'manager@example.com',
      role: 'clinic_manager',
      scope: 'clinic',
      clinicId,
      branchIds: [],
      status: 'pending',
      expiresAt,
    } as any);

    const result = await tenancyService.createTenantInvitation(tenantId, actorId, 'tenant_owner', {
      email: 'manager@example.com', role: 'clinic_manager', scope: 'clinic', clinicId, expiresInDays: 7,
    });

    expect(tenancyRepository.findActiveClinic).toHaveBeenCalledWith(clinicId, tenantId);
    expect(tenancyRepository.createTenantInvitation).toHaveBeenCalledWith(expect.objectContaining({
      tenantId, email: 'manager@example.com', clinicId, role: 'clinic_manager', scope: 'clinic', status: 'pending',
    }));
    expect(result?.invitationToken).toHaveLength(43);
  });

  it('does not issue an invitation for a suspended clinic', async () => {
    vi.mocked(tenancyRepository.findActiveClinic).mockResolvedValue(null as any);

    await expect(tenancyService.createTenantInvitation(tenantId, actorId, 'tenant_owner', {
      email: 'manager@example.com', role: 'clinic_manager', scope: 'clinic', clinicId,
    })).resolves.toBeNull();

    expect(tenancyRepository.createTenantInvitation).not.toHaveBeenCalled();
  });

  it('previews only effective memberships belonging to the requested tenant user', async () => {
    vi.mocked(tenancyRepository.listMembershipsForUser).mockResolvedValue([
      { _id: membershipId, status: 'active', role: 'clinic_manager', scope: 'clinic', clinicId: { _id: clinicId, name: 'Clinic' }, branchIds: [] },
      { _id: '64b000000000000000000008', status: 'suspended', role: 'branch_manager', scope: 'branch', clinicId, branchIds: [branchId] },
    ] as any);

    const result = await tenancyService.getTenantUserEffectiveAccess(tenantId, targetId);

    expect(result?.memberships[0]?.permissions).toContain('clinic.settings.manage');
    expect(result?.memberships[1]?.permissions).toEqual([]);
    expect(tenancyRepository.listMembershipsForUser).toHaveBeenCalledWith(tenantId, targetId);
  });

  it('does not query MongoDB for malformed tenant user IDs', async () => {
    await expect(tenancyService.getTenantUserEffectiveAccess(tenantId, 'not-an-object-id')).resolves.toBeNull();
    expect(tenancyRepository.listMembershipsForUser).not.toHaveBeenCalled();
  });

  it('serializes concurrent last-owner demotions with a tenant-scoped lease', async () => {
    vi.mocked(tenancyRepository.findTenantMembershipById).mockResolvedValue({
      _id: membershipId, userId: targetId, role: 'tenant_owner', scope: 'tenant', status: 'active',
      clinicId: null, branchIds: [],
    } as any);
    vi.mocked(tenancyRepository.acquireTenantOwnerMutationLock).mockResolvedValue(null as any);

    await expect(tenancyService.updateTenantMembership(tenantId, membershipId, actorId, 'tenant_owner', {
      status: 'suspended',
    })).rejects.toMatchObject({ status: 409, code: 'OWNER_CHANGE_IN_PROGRESS' });

    expect(tenancyRepository.countActiveTenantOwners).not.toHaveBeenCalled();
    expect(tenancyRepository.updateTenantMembership).not.toHaveBeenCalled();
  });

  it('returns membership history only after confirming the membership belongs to the tenant', async () => {
    vi.mocked(tenancyRepository.findTenantMembershipById).mockResolvedValue({ _id: membershipId } as any);
    vi.mocked(tenancyRepository.listTenantMembershipHistory).mockResolvedValue({
      items: [{ action: 'membership.updated', targetId: membershipId }],
      pagination: { page: 1, perPage: 25, total: 1, pages: 1 },
    } as any);

    const result = await tenancyService.listTenantMembershipHistory(tenantId, membershipId);

    expect(tenancyRepository.findTenantMembershipById).toHaveBeenCalledWith(tenantId, membershipId);
    expect(tenancyRepository.listTenantMembershipHistory).toHaveBeenCalledWith(tenantId, membershipId, 1, 25);
    expect(result?.items).toHaveLength(1);
  });

  it('does not query membership history for a membership outside the tenant', async () => {
    vi.mocked(tenancyRepository.findTenantMembershipById).mockResolvedValue(null as any);

    await expect(tenancyService.listTenantMembershipHistory(tenantId, membershipId)).resolves.toBeNull();

    expect(tenancyRepository.listTenantAuditEvents).not.toHaveBeenCalled();
  });

  it('returns tenant user details through a tenant-scoped repository query', async () => {
    vi.mocked(tenancyRepository.findTenantUserDetails).mockResolvedValue({
      _id: targetId, name: 'Clinic User', email: 'user@example.com',
      memberships: [{ tenantId, scope: 'clinic', role: 'clinic_manager' }],
    } as any);

    const result = await tenancyService.getTenantUserDetails(tenantId, targetId);

    expect(tenancyRepository.findTenantUserDetails).toHaveBeenCalledWith(tenantId, targetId);
    expect(result).toMatchObject({ email: 'user@example.com', memberships: [{ role: 'clinic_manager' }] });
  });

  it('returns no tenant user when the identity has no membership in the active tenant', async () => {
    vi.mocked(tenancyRepository.findTenantUserDetails).mockResolvedValue(null as any);
    await expect(tenancyService.getTenantUserDetails(tenantId, targetId)).resolves.toBeNull();
  });

});
