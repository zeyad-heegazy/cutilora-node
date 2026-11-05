import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/modules/auth/repositories/auth.repository.js', () => ({
  authRepository: {
    findUserByEmail: vi.fn(),
    findActiveMemberships: vi.fn(),
    updateLastLogin: vi.fn(),
    createUserSession: vi.fn(),
    listUserSessions: vi.fn(),
    revokeUserSession: vi.fn(),
  },
}));
vi.mock('../src/modules/auth/services/auth.security.js', () => ({
  hashPassword: vi.fn(),
  signAccessToken: vi.fn().mockReturnValue('signed-access-token'),
  verifyPassword: vi.fn(),
  verifyAccessToken: vi.fn(),
}));
vi.mock('../src/modules/auth/services/token-revocation.service.js', () => ({
  tokenRevocationService: { revoke: vi.fn() },
}));

import { authService, AuthError } from '../src/modules/auth/services/auth.service.js';
import { authRepository } from '../src/modules/auth/repositories/auth.repository.js';
import { signAccessToken, verifyPassword } from '../src/modules/auth/services/auth.security.js';
import { userSessionService } from '../src/modules/auth/services/user-session.service.js';

describe('regular user login', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(signAccessToken).mockReturnValue('signed-access-token');
    vi.mocked(verifyPassword).mockResolvedValue(true);
    vi.mocked(authRepository.updateLastLogin).mockResolvedValue({ modifiedCount: 1 } as any);
    vi.mocked(authRepository.createUserSession).mockResolvedValue({} as any);
    vi.mocked(authRepository.findActiveMemberships).mockResolvedValue([{ tenantId: 'tenant-1', clinicId: null, branchIds: [], scope: 'tenant', role: 'tenant_admin' }] as any);
  });

  it('records last login after successful authentication', async () => {
    vi.mocked(authRepository.findUserByEmail).mockResolvedValue({
      id: 'user-1', name: 'Tenant User', email: 'user@example.com', isActive: true, platformRole: 'user', passwordHash: 'hash',
    } as any);

    const result = await authService.login('USER@example.com', 'password');

    expect(authRepository.findUserByEmail).toHaveBeenCalledWith('user@example.com');
    expect(authRepository.updateLastLogin).toHaveBeenCalledWith('user-1', expect.any(Date));
    expect(authRepository.createUserSession).toHaveBeenCalledWith(expect.objectContaining({ userId: 'user-1', userAgent: null, lastSeenAt: expect.any(Date), expiresAt: expect.any(Date) }));
    expect(signAccessToken).toHaveBeenCalledWith('user-1', 'user', expect.any(String));
    expect(result).toMatchObject({ access_token: 'signed-access-token', user: { id: 'user-1' } });
  });

  it('revokes the persisted session when logging out', async () => {
    const { verifyAccessToken } = await import('../src/modules/auth/services/auth.security.js');
    vi.mocked(verifyAccessToken).mockReturnValue({ sub: 'user-1', exp: 2_000_000_000, iat: 1_900_000_000, tokenType: 'user', sessionId: 'session-1' });
    vi.mocked(authRepository.revokeUserSession).mockResolvedValue({ sessionId: 'session-1' } as any);

    await authService.logout('signed-access-token');

    expect(authRepository.revokeUserSession).toHaveBeenCalledWith('user-1', 'session-1', expect.any(Date));
  });

  it('returns safe session summaries without token or IP data', async () => {
    vi.mocked(authRepository.listUserSessions).mockResolvedValue([{
      sessionId: 'session-1', userAgent: 'Chrome', createdAt: new Date(), lastSeenAt: new Date(),
      expiresAt: new Date(Date.now() + 60_000), revokedAt: null,
    }] as any);

    const sessions = await userSessionService.listSummaries('user-1');

    expect(sessions).toMatchObject([{ sessionId: 'session-1', userAgent: 'Chrome', status: 'active' }]);
    expect(sessions[0]).not.toHaveProperty('token');
    expect(sessions[0]).not.toHaveProperty('ipAddress');
  });

  it('revokes only the requested active user session', async () => {
    vi.mocked(authRepository.revokeUserSession).mockResolvedValue({ sessionId: 'session-1' } as any);

    await userSessionService.revoke('user-1', 'session-1');

    expect(authRepository.revokeUserSession).toHaveBeenCalledWith('user-1', 'session-1', expect.any(Date));
  });

  it('does not update last login for invalid credentials', async () => {
    vi.mocked(authRepository.findUserByEmail).mockResolvedValue(null as any);

    await expect(authService.login('missing@example.com', 'password'))
      .rejects.toBeInstanceOf(AuthError);

    expect(authRepository.updateLastLogin).not.toHaveBeenCalled();
  });
});
