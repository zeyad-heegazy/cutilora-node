import { authRepository } from '../repositories/auth.repository.js';

export const userSessionService = {
  async listSummaries(userId: string) {
    const now = new Date();
    const sessions = await authRepository.listUserSessions(userId);
    return sessions.map((session: any) => ({
      sessionId: session.sessionId,
      userAgent: session.userAgent ?? null,
      createdAt: session.createdAt,
      lastSeenAt: session.lastSeenAt,
      expiresAt: session.expiresAt,
      revokedAt: session.revokedAt ?? null,
      status: session.revokedAt ? 'revoked' : new Date(session.expiresAt).getTime() <= now.getTime() ? 'expired' : 'active',
    }));
  },
  revoke(userId: string, sessionId: string) {
    return authRepository.revokeUserSession(userId, sessionId, new Date());
  },
};
