import { authRepository } from '../../../auth/repositories/auth.repository.js';
import { hashPassword, signAccessToken, verifyPassword, verifyAccessToken } from '../../../auth/services/auth.security.js';
import { AuthError } from '../../../auth/services/auth.service.js';
import { tokenRevocationService } from '../../../auth/services/token-revocation.service.js';
export const platformAuthService = {
  async login(email: string, password: string) {
    const user = await authRepository.findUserByEmail(email.toLowerCase());
    if (!user || !user.isActive || !(await verifyPassword(password, user.passwordHash))) throw new AuthError('INVALID_CREDENTIALS', 'Email or password is incorrect.');
    if (user.platformRole !== 'platform_admin') throw new AuthError('PLATFORM_ACCESS_REQUIRED', 'This account is not a platform administrator.');
    return { access_token: signAccessToken(user.id, 'platform'), token_type: 'Bearer', user: { id: user.id, name: user.name, email: user.email, platform_role: user.platformRole } };
  },
  async logout(token: string) {
    const payload = verifyAccessToken(token);
    if (payload.tokenType !== 'platform') throw new AuthError('INVALID_TOKEN_TYPE', 'A platform access token is required.');
    await tokenRevocationService.revoke(token, payload.exp);
  },
  async me(userId: string) { return { user: await authRepository.findUserById(userId) }; },
  async bootstrapAdmin(input: { name: string; email: string; password: string }) {
    if (await authRepository.hasPlatformAdmin()) throw new AuthError('BOOTSTRAP_ALREADY_USED', 'A platform admin already exists.', 409);
    const user = await authRepository.createUser({ ...input, email: input.email.toLowerCase(), passwordHash: await hashPassword(input.password), platformRole: 'platform_admin' });
    return { id: user.id, email: user.email };
  },
};
