import { authRepository } from '../repositories/auth.repository.js';
import { hashPassword, signAccessToken, verifyPassword } from './auth.security.js';

export class AuthError extends Error {
  constructor(public code: string, message: string, public status = 401) { super(message); }
}
export const authService = {
  async login(email: string, password: string) {
    const user = await authRepository.findUserByEmail(email.toLowerCase());
    if (!user || !user.isActive || !(await verifyPassword(password, user.passwordHash))) throw new AuthError('INVALID_CREDENTIALS', 'Email or password is incorrect.');
    const memberships = await authRepository.findActiveMemberships(user.id);
    return {
      access_token: signAccessToken(user.id), token_type: 'Bearer',
      user: { id: user.id, name: user.name, email: user.email, platform_role: user.platformRole },
      memberships: memberships.filter(m => m.tenantId).map(m => ({ tenant: m.tenantId, clinic: m.clinicId, branch_ids: m.branchIds, scope: m.scope, role: m.role })),
    };
  },
  async me(userId: string) {
    const [user, memberships] = await Promise.all([authRepository.findUserById(userId), authRepository.findActiveMemberships(userId)]);
    return { user, memberships: memberships.filter(m => m.tenantId) };
  },
  async bootstrapAdmin(input: { name: string; email: string; password: string }) {
    if (await authRepository.hasPlatformAdmin()) throw new AuthError('BOOTSTRAP_ALREADY_USED', 'A platform admin already exists.', 409);
    const user = await authRepository.createUser({ ...input, email: input.email.toLowerCase(), passwordHash: await hashPassword(input.password), platformRole: 'platform_admin' });
    return { id: user.id, email: user.email };
  },
};