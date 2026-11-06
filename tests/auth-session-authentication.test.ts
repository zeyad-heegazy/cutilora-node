import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/modules/auth/repositories/auth.repository.js', () => ({
  authRepository: {
    findActiveUserById: vi.fn(),
    findActiveUserSession: vi.fn(),
    touchUserSession: vi.fn(),
  },
}));
vi.mock('../src/modules/auth/services/auth.security.js', () => ({
  verifyAccessToken: vi.fn(),
}));
vi.mock('../src/modules/auth/services/token-revocation.service.js', () => ({
  tokenRevocationService: { isRevoked: vi.fn() },
}));

import { authenticate } from '../src/modules/auth/middleware/authenticate.js';
import { authRepository } from '../src/modules/auth/repositories/auth.repository.js';
import { verifyAccessToken } from '../src/modules/auth/services/auth.security.js';
import { tokenRevocationService } from '../src/modules/auth/services/token-revocation.service.js';

function request() {
  return { header: vi.fn().mockReturnValue('Bearer access-token'), auth: undefined } as any;
}
function response() {
  const res: any = { status: vi.fn(), json: vi.fn() };
  res.status.mockReturnValue(res);
  return res;
}

describe('persisted user session authentication', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(verifyAccessToken).mockReturnValue({ sub: 'user-1', exp: 2_000_000_000, iat: 1_900_000_000, tokenType: 'user', sessionId: 'session-1' });
    vi.mocked(tokenRevocationService.isRevoked).mockResolvedValue(false);
    vi.mocked(authRepository.findActiveUserById).mockResolvedValue({ id: 'user-1', isActive: true, platformRole: 'user' } as any);
    vi.mocked(authRepository.findActiveUserSession).mockResolvedValue({ sessionId: 'session-1' } as any);
    vi.mocked(authRepository.touchUserSession).mockResolvedValue({ modifiedCount: 1 } as any);
  });

  it('accepts a valid persisted session and refreshes its last-seen timestamp', async () => {
    const req = request();
    const res = response();
    const next = vi.fn();

    await authenticate(req, res, next);

    expect(authRepository.findActiveUserSession).toHaveBeenCalledWith('session-1', 'user-1', expect.any(Date));
    expect(authRepository.touchUserSession).toHaveBeenCalledWith('session-1', expect.any(Date));
    expect(req.auth.userId).toBe('user-1');
    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('rejects a token whose persisted session has been revoked or expired', async () => {
    vi.mocked(authRepository.findActiveUserSession).mockResolvedValue(null as any);
    const req = request();
    const res = response();
    const next = vi.fn();

    await authenticate(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      error: expect.objectContaining({ code: 'SESSION_REVOKED' }),
    }));
    expect(next).not.toHaveBeenCalled();
  });
});
