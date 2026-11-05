import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/modules/auth/repositories/auth.repository.js', () => ({
  authRepository: {
    findUserByEmail: vi.fn(),
    findActiveMemberships: vi.fn(),
    updateLastLogin: vi.fn(),
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

describe('regular user login', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(signAccessToken).mockReturnValue('signed-access-token');
    vi.mocked(verifyPassword).mockResolvedValue(true);
    vi.mocked(authRepository.updateLastLogin).mockResolvedValue({ modifiedCount: 1 } as any);
    vi.mocked(authRepository.findActiveMemberships).mockResolvedValue([{ tenantId: 'tenant-1', clinicId: null, branchIds: [], scope: 'tenant', role: 'tenant_admin' }] as any);
  });

  it('records last login after successful authentication', async () => {
    vi.mocked(authRepository.findUserByEmail).mockResolvedValue({
      id: 'user-1', name: 'Tenant User', email: 'user@example.com', isActive: true, platformRole: 'user', passwordHash: 'hash',
    } as any);

    const result = await authService.login('USER@example.com', 'password');

    expect(authRepository.findUserByEmail).toHaveBeenCalledWith('user@example.com');
    expect(authRepository.updateLastLogin).toHaveBeenCalledWith('user-1', expect.any(Date));
    expect(result).toMatchObject({ access_token: 'signed-access-token', user: { id: 'user-1' } });
  });

  it('does not update last login for invalid credentials', async () => {
    vi.mocked(authRepository.findUserByEmail).mockResolvedValue(null as any);

    await expect(authService.login('missing@example.com', 'password'))
      .rejects.toBeInstanceOf(AuthError);

    expect(authRepository.updateLastLogin).not.toHaveBeenCalled();
  });
});
