import { authRepository } from '../repositories/auth.repository.js';
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
