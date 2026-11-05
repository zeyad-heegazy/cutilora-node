import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/modules/auth/repositories/auth.repository.js', () => ({
  authRepository: {
    findUserByEmail: vi.fn(),
    createUser: vi.fn(),
    deleteUserById: vi.fn(),
  },
}));
vi.mock('../src/modules/tenancy/repositories/tenancy.repository.js', () => ({
  tenancyRepository: {
    claimTenantInvitation: vi.fn(),
    createTenantAuditEvent: vi.fn().mockResolvedValue({}),
    findActiveTenant: vi.fn(),
    findActiveClinic: vi.fn(),
    findActiveBranch: vi.fn(),
    findExistingMembershipForInvitation: vi.fn(),
    createTenantMembership: vi.fn(),
    updateClaimedTenantInvitation: vi.fn(),
    deleteTenantMembershipById: vi.fn(),
  },
}));
vi.mock('../src/modules/auth/services/auth.security.js', () => ({
  hashPassword: vi.fn().mockResolvedValue('hashed-password'),
  signAccessToken: vi.fn(),
  verifyPassword: vi.fn(),
  verifyAccessToken: vi.fn(),
}));
vi.mock('../src/modules/auth/services/token-revocation.service.js', () => ({
  tokenRevocationService: { revoke: vi.fn() },
}));

import { authService } from '../src/modules/auth/services/auth.service.js';
import { hashPassword } from '../src/modules/auth/services/auth.security.js';
import { authRepository } from '../src/modules/auth/repositories/auth.repository.js';
import { tenancyRepository } from '../src/modules/tenancy/repositories/tenancy.repository.js';

const tenantId = '64b000000000000000000001';
const userId = '64b000000000000000000002';
const invitationId = '64b000000000000000000003';
const membershipId = '64b000000000000000000004';
const invitation = {
  _id: invitationId,
  tenantId,
  email: 'invite@example.com',
  role: 'clinic_manager',
  scope: 'clinic',
  clinicId: '64b000000000000000000005',
  branchIds: [],
};

describe('tenant invitation acceptance', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(hashPassword).mockResolvedValue('hashed-password');
    vi.mocked(tenancyRepository.claimTenantInvitation).mockResolvedValue(invitation as any);
    vi.mocked(tenancyRepository.createTenantAuditEvent).mockResolvedValue({} as any);
    vi.mocked(tenancyRepository.findActiveTenant).mockResolvedValue({ _id: tenantId } as any);
    vi.mocked(tenancyRepository.findActiveClinic).mockResolvedValue({ _id: invitation.clinicId } as any);
    vi.mocked(tenancyRepository.findExistingMembershipForInvitation).mockResolvedValue(null as any);
    vi.mocked(tenancyRepository.createTenantMembership).mockResolvedValue({ _id: membershipId } as any);
    vi.mocked(tenancyRepository.updateClaimedTenantInvitation).mockResolvedValue({ _id: invitationId } as any);
    vi.mocked(tenancyRepository.deleteTenantMembershipById).mockResolvedValue({ deletedCount: 1 } as any);
    vi.mocked(authRepository.deleteUserById).mockResolvedValue({ deletedCount: 1 } as any);
  });

  it('links an existing user account and activates the invited membership', async () => {
    vi.mocked(authRepository.findUserByEmail).mockResolvedValue({
      _id: userId, name: 'Existing User', email: invitation.email, isActive: true, platformRole: 'user',
    } as any);

    const result = await authService.acceptInvitation({ token: 'x'.repeat(40) });

    expect(tenancyRepository.createTenantMembership).toHaveBeenCalledWith(expect.objectContaining({
      userId, tenantId, clinicId: invitation.clinicId, scope: 'clinic', role: 'clinic_manager', status: 'active',
    }));
    expect(tenancyRepository.updateClaimedTenantInvitation).toHaveBeenCalledWith(invitationId, expect.objectContaining({
      status: 'accepted', acceptedBy: userId,
    }));
    expect(result).toMatchObject({ user: { id: userId, email: invitation.email }, accountCreated: false });
  });

  it('creates a user account when the invited email has no existing account', async () => {
    vi.mocked(authRepository.findUserByEmail).mockResolvedValue(null as any);
    vi.mocked(authRepository.createUser).mockResolvedValue({
      _id: userId, name: 'New User', email: invitation.email,
    } as any);

    const result = await authService.acceptInvitation({
      token: 'x'.repeat(40), name: 'New User', password: 'a-strong-password-123',
    });

    expect(authRepository.createUser).toHaveBeenCalledWith(expect.objectContaining({
      name: 'New User', email: invitation.email, passwordHash: 'hashed-password', platformRole: 'user',
    }));
    expect(result).toMatchObject({ accountCreated: true, membership: { status: 'active' } });
  });

  it('requires account details when the invited email has no account', async () => {
    vi.mocked(authRepository.findUserByEmail).mockResolvedValue(null as any);

    await expect(authService.acceptInvitation({ token: 'x'.repeat(40) }))
      .rejects.toMatchObject({ code: 'ACCOUNT_DETAILS_REQUIRED', status: 422 });

    expect(tenancyRepository.updateClaimedTenantInvitation).toHaveBeenCalledWith(invitationId, { status: 'pending' });
    expect(tenancyRepository.createTenantMembership).not.toHaveBeenCalled();
  });

  it('rejects invalid or expired invitation tokens', async () => {
    vi.mocked(tenancyRepository.claimTenantInvitation).mockResolvedValue(null as any);

    await expect(authService.acceptInvitation({ token: 'x'.repeat(40) }))
      .rejects.toMatchObject({ code: 'INVITATION_INVALID_OR_EXPIRED', status: 400 });
  });

  it('rolls back the membership and newly created user if finalization fails', async () => {
    vi.mocked(authRepository.findUserByEmail).mockResolvedValue(null as any);
    vi.mocked(authRepository.createUser).mockResolvedValue({ _id: userId, name: 'New User' } as any);
    vi.mocked(tenancyRepository.updateClaimedTenantInvitation).mockResolvedValueOnce(null as any);

    await expect(authService.acceptInvitation({
      token: 'x'.repeat(40), name: 'New User', password: 'a-strong-password-123',
    })).rejects.toMatchObject({ code: 'INVITATION_ACCEPTANCE_CONFLICT' });

    expect(tenancyRepository.deleteTenantMembershipById).toHaveBeenCalledWith(membershipId);
    expect(authRepository.deleteUserById).toHaveBeenCalledWith(userId);
  });
  it('does not accept invitations for suspended or missing tenants', async () => {
    vi.mocked(tenancyRepository.findActiveTenant).mockResolvedValue(null as any);

    await expect(authService.acceptInvitation({ token: 'x'.repeat(40) }))
      .rejects.toMatchObject({ code: 'TENANT_UNAVAILABLE', status: 409 });

    expect(authRepository.findUserByEmail).not.toHaveBeenCalled();
    expect(tenancyRepository.createTenantMembership).not.toHaveBeenCalled();
  });

});
