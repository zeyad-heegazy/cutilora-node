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
import { logger } from '../../../shared/logger/logger.js';
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
      const tenantIsActive = await tenancyRepository.findActiveTenant(String(invitation.tenantId));
      if (!tenantIsActive) throw new AuthError('TENANT_UNAVAILABLE', 'This tenant is not currently accepting invitations.', 409);
      if (invitation.clinicId) {
        const clinicIsActive = await tenancyRepository.findActiveClinic(String(invitation.clinicId), String(invitation.tenantId));
        if (!clinicIsActive) throw new AuthError('INVITATION_SCOPE_UNAVAILABLE', 'The invited clinic is no longer active.', 409);
      }
      for (const branchId of invitation.branchIds ?? []) {
        if (!invitation.clinicId || !await tenancyRepository.findActiveBranch(String(branchId), String(invitation.tenantId), String(invitation.clinicId))) {
          throw new AuthError('INVITATION_SCOPE_UNAVAILABLE', 'One or more invited branches are no longer active.', 409);
        }
      }

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

      const existingMembership = await tenancyRepository.findExistingMembershipForInvitation(
        String(user._id), String(invitation.tenantId), invitation.clinicId ? String(invitation.clinicId) : null,
      );
      if (existingMembership) {
        const sameScope = existingMembership.scope === invitation.scope
          && existingMembership.role === invitation.role
          && (existingMembership.branchIds ?? []).map((id: unknown) => String(id)).join(',') === (invitation.branchIds ?? []).map((id: unknown) => String(id)).join(',');
        if (!sameScope || existingMembership.status !== 'active') {
          throw new AuthError('MEMBERSHIP_ALREADY_EXISTS', 'This user already has a different membership for the invited scope.', 409);
        }
        const acceptedExisting = await tenancyRepository.updateClaimedTenantInvitation(String(invitation._id), {
          status: 'accepted', acceptedAt: new Date(), acceptedBy: String(user._id), processingAt: null,
        });
        if (!acceptedExisting) throw new AuthError('INVITATION_ACCEPTANCE_CONFLICT', 'The invitation could not be completed. Please try again.', 409);
        return {
          user: { id: String(user._id), name: user.name, email: user.email },
          membership: { id: String(existingMembership._id), tenantId: String(invitation.tenantId), clinicId: invitation.clinicId ? String(invitation.clinicId) : null, branchIds: (invitation.branchIds ?? []).map((id: unknown) => String(id)), scope: invitation.scope, role: invitation.role, status: 'active' },
          accountCreated: Boolean(createdUserId),
          alreadyMember: true,
        };
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
        processingAt: null,
      });
      if (!accepted) throw new AuthError('INVITATION_ACCEPTANCE_CONFLICT', 'The invitation could not be completed. Please try again.', 409);

      try {
        await tenancyRepository.createTenantAuditEvent({
          tenantId: String(invitation.tenantId),
          actorUserId: String(user._id),
          action: 'membership.invitation.accepted',
          targetType: 'tenant_membership',
          targetId: String(membership._id),
          clinicId: invitation.clinicId ?? null,
          metadata: { invitationId: String(invitation._id), role: invitation.role, scope: invitation.scope },
        });
      } catch (auditError) {
        logger.warn('Tenant invitation accepted but audit event could not be persisted.', {
          tenantId: String(invitation.tenantId),
          invitationId: String(invitation._id),
          error: auditError instanceof Error ? auditError.message : String(auditError),
        });
      }

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
      await tenancyRepository.updateClaimedTenantInvitation(String(invitation._id), { status: 'pending', processingAt: null }).catch(() => null);
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
