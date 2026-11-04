import { createHash } from 'node:crypto';
import { RevokedToken } from '../models/revoked-token.model.js';

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export const tokenRevocationService = {
  async revoke(token: string, expiresAt: number): Promise<void> {
    await RevokedToken.updateOne(
      { tokenHash: hashToken(token) },
      { $setOnInsert: { tokenHash: hashToken(token), expiresAt: new Date(expiresAt * 1000) } },
      { upsert: true },
    );
  },
  async isRevoked(token: string): Promise<boolean> {
    return Boolean(await RevokedToken.exists({ tokenHash: hashToken(token), expiresAt: { $gt: new Date() } }));
  },
};
