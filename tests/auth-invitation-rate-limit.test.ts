import { afterEach, describe, expect, it, vi } from 'vitest';
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
  afterEach(() => vi.useRealTimers());

  it('allows ten attempts and blocks the eleventh attempt from the same IP', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-05T10:00:00.000Z'));
    const req = { ip: '198.51.100.44', socket: { remoteAddress: '198.51.100.44' } } as any;

    for (let i = 0; i < 10; i += 1) {
      const res = createResponse();
      const next = vi.fn();
      invitationAcceptanceRateLimit(req, res as any, next);
      expect(next).toHaveBeenCalledOnce();
    }

    const res = createResponse();
    const next = vi.fn();
    invitationAcceptanceRateLimit(req, res as any, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(429);
    expect(res.headers['Retry-After']).toBe('900');
    expect(res.body).toMatchObject({ error: { code: 'INVITATION_RATE_LIMITED' } });
  });

  it('resets the attempt window after fifteen minutes', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-05T10:00:00.000Z'));
    const req = { ip: '198.51.100.45', socket: { remoteAddress: '198.51.100.45' } } as any;
    for (let i = 0; i < 10; i += 1) invitationAcceptanceRateLimit(req, createResponse() as any, vi.fn());

    vi.advanceTimersByTime(15 * 60 * 1000);
    const next = vi.fn();
    invitationAcceptanceRateLimit(req, createResponse() as any, next);
    expect(next).toHaveBeenCalledOnce();
  });
});
