import { createHash } from 'node:crypto';
import { authRepository } from '../repositories/auth.repository.js';
import { tenancyRepository } from '../../tenancy/repositories/tenancy.repository.js';
import { hashPassword } from './auth.security.js';
import {
  signAccessToken,
  verifyPassword,
  verifyAccessToken,
} from './auth.security.js';
import { tokenRevocationService } from './token-revocation.service.js';
export class AuthError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 401,
  ) {
    super(message);
  }
}
export const authService = {
  async login(email: string, password: string) {
    const user = await authRepository.findUserByEmail(email.toLowerCase());
    if (
      !user ||
      !user.isActive ||
      user.platformRole === 'platform_admin' ||
      !(await verifyPassword(password, user.passwordHash))
    ) {
      throw new AuthError(
        'INVALID_CREDENTIALS',
        'Email or password is incorrect.',
      );
    }
    const memberships = await authRepository.findActiveMemberships(user.id);
    return {
      access_token: signAccessToken(user.id, 'user'),
      token_type: 'Bearer',
      user: { id: user.id, name: user.name, email: user.email },
      memberships: memberships
        .filter((m: any) => m.tenantId)
        .map((m: any) => ({
          tenant: m.tenantId,
          clinic: m.clinicId,
          branch_ids: m.branchIds,
          scope: m.scope,
          role: m.role,
        })),
    };
  },
  async acceptInvitation(input: { token: string; name?: string; password?: string }) {
    const tokenHash = createHash('sha256').update(input.token).digest('hex');
    const invitation = await tenancyRepository.claimTenantInvitation(tokenHash, new Date());
    if (!invitation) {
      throw new AuthError('INVITATION_INVALID_OR_EXPIRED', 'The invitation is invalid, expired, or already used.', 400);
    }

    let createdUserId: string | null = null;
    let createdMembershipId: string | null = null;
    try {
      let user = await authRepository.findUserByEmail(String(invitation.email).toLowerCase());
      if (!user) {
        if (!input.name || !input.password) {
          throw new AuthError('ACCOUNT_DETAILS_REQUIRED', 'Name and password are required to create your account.', 422);
        }
        user = await authRepository.createUser({
          name: input.name.trim(),
          email: String(invitation.email).toLowerCase(),
          passwordHash: await hashPassword(input.password),
          platformRole: 'user',
          isActive: true,
        });
        createdUserId = String(user._id);
      } else if (!user.isActive || user.platformRole === 'platform_admin') {
        throw new AuthError('ACCOUNT_NOT_ELIGIBLE', 'This account cannot accept tenant invitations.', 403);
      }

      const membership = await tenancyRepository.createTenantMembership({
        userId: String(user._id),
        tenantId: String(invitation.tenantId),
        clinicId: invitation.clinicId ?? null,
        branchIds: invitation.branchIds ?? [],
        scope: invitation.scope,
        role: invitation.role,
        status: 'active',
      });
      createdMembershipId = String(membership._id);

      const accepted = await tenancyRepository.updateClaimedTenantInvitation(String(invitation._id), {
        status: 'accepted',
        acceptedAt: new Date(),
        acceptedBy: String(user._id),
      });
      if (!accepted) throw new AuthError('INVITATION_ACCEPTANCE_CONFLICT', 'The invitation could not be completed. Please try again.', 409);

      return {
        user: { id: String(user._id), name: user.name, email: user.email },
        membership: {
          id: String(membership._id),
          tenantId: String(invitation.tenantId),
          clinicId: invitation.clinicId ? String(invitation.clinicId) : null,
          branchIds: (invitation.branchIds ?? []).map((id: unknown) => String(id)),
          scope: invitation.scope,
          role: invitation.role,
          status: 'active',
        },
        accountCreated: Boolean(createdUserId),
      };
    } catch (error) {
      if (createdMembershipId) await tenancyRepository.deleteTenantMembershipById(createdMembershipId).catch(() => null);
      if (createdUserId) await authRepository.deleteUserById(createdUserId).catch(() => null);
      await tenancyRepository.updateClaimedTenantInvitation(String(invitation._id), { status: 'pending' }).catch(() => null);
      throw error;
    }
  },
  async logout(token: string) {
    const payload = verifyAccessToken(token);
    if (payload.tokenType !== 'user')
      throw new AuthError(
        'INVALID_TOKEN_TYPE',
        'A regular user access token is required.',
      );
    await tokenRevocationService.revoke(token, payload.exp);
  },
  async me(userId: string) {
    const [user, memberships] = await Promise.all([
      authRepository.findUserById(userId),
      authRepository.findActiveMemberships(userId),
    ]);
    return { user, memberships: memberships.filter((m: any) => m.tenantId) };
  },
};
