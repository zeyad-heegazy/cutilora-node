import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const buckets = new Map<string, { count: number; expiresAt: Date }>();
vi.mock('../src/config/env.js', () => ({ env: { JWT_SECRET: 'unit-test-key' } }));
vi.mock('../src/modules/auth/repositories/auth.repository.js', () => ({
  authRepository: {
    consumeInvitationAttempt: vi.fn(async (key: string, now: Date, windowMs: number) => {
      const current = buckets.get(key);
      if (!current || current.expiresAt.getTime() <= now.getTime()) {
        const next = { count: 1, expiresAt: new Date(now.getTime() + windowMs) };
        buckets.set(key, next);
        return next;
      }
      current.count += 1;
      return current;
    }),
  },
}));

import { authRepository } from '../src/modules/auth/repositories/auth.repository.js';
import { invitationAcceptanceRateLimit } from '../src/modules/auth/middleware/invitation-rate-limit.js';

function createResponse() {
  const res = {
    headers: {} as Record<string, string>,
    statusCode: 200,
    body: undefined as unknown,
    setHeader(name: string, value: string) { this.headers[name] = value; return this; },
    status(code: number) { this.statusCode = code; return this; },
    json(body: unknown) { this.body = body; return this; },
  };
  return res;
}

describe('invitation acceptance rate limit', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-05T10:00:00.000Z'));
    buckets.clear();
    vi.mocked(authRepository.consumeInvitationAttempt).mockClear();
    vi.mocked(authRepository.consumeInvitationAttempt).mockImplementation(async (key, now, windowMs) => {
      const current = buckets.get(key);
      if (!current || current.expiresAt.getTime() <= now.getTime()) {
        const next = { count: 1, expiresAt: new Date(now.getTime() + windowMs) };
        buckets.set(key, next);
        return next as any;
      }
      current.count += 1;
      return current as any;
    });
  });
  afterEach(() => vi.useRealTimers());

  it('allows ten attempts and blocks the eleventh attempt from the same IP', async () => {
    const req = { ip: '198.51.100.44', socket: { remoteAddress: '198.51.100.44' } } as any;
    for (let i = 0; i < 10; i += 1) {
      const res = createResponse();
      const next = vi.fn();
      await invitationAcceptanceRateLimit(req, res as any, next);
      expect(next).toHaveBeenCalledOnce();
    }

    const res = createResponse();
    const next = vi.fn();
    await invitationAcceptanceRateLimit(req, res as any, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(429);
    expect(res.headers['Retry-After']).toBe('900');
    expect(res.body).toMatchObject({ error: { code: 'INVITATION_RATE_LIMITED' } });
    const [key] = vi.mocked(authRepository.consumeInvitationAttempt).mock.calls[0] ?? [];
    expect(key).toMatch(/^[a-f0-9]{64}$/);
    expect(key).not.toBe(req.ip);
  });

  it('resets the attempt window after fifteen minutes', async () => {
    const req = { ip: '198.51.100.45', socket: { remoteAddress: '198.51.100.45' } } as any;
    for (let i = 0; i < 10; i += 1) await invitationAcceptanceRateLimit(req, createResponse() as any, vi.fn());

    vi.advanceTimersByTime(15 * 60 * 1000);
    const next = vi.fn();
    await invitationAcceptanceRateLimit(req, createResponse() as any, next);
    expect(next).toHaveBeenCalledOnce();
  });

  it('fails closed when the shared rate-limit store is unavailable', async () => {
    vi.mocked(authRepository.consumeInvitationAttempt).mockRejectedValueOnce(new Error('database unavailable'));
    const res = createResponse();
    const next = vi.fn();
    await invitationAcceptanceRateLimit({ ip: '198.51.100.46', socket: {} } as any, res as any, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(503);
    expect(res.body).toMatchObject({ error: { code: 'INVITATION_RATE_LIMIT_UNAVAILABLE' } });
  });
});
