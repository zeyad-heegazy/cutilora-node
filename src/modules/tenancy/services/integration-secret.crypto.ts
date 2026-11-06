import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

function key() {
  const configuredKey = process.env.INTEGRATION_ENCRYPTION_KEY ?? process.env.JWT_SECRET;
  const secret = configuredKey ?? (process.env.NODE_ENV === 'test' ? 'cutilora-test-only-integration-key-not-for-production' : '');
  if (secret.length < 32) throw new Error('INTEGRATION_ENCRYPTION_KEY must contain at least 32 characters.');
  return createHash('sha256').update('cutilora:integration-secrets:v1:').update(secret).digest();
}
export function encryptIntegrationSecret(value: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), ciphertext.toString('base64url')].join('.');
}
export function decryptIntegrationSecret(value: string): string {
  const [version, iv, tag, ciphertext] = value.split('.');
  if (version !== 'v1' || !iv || !tag || !ciphertext) throw new Error('Unsupported encrypted integration secret format.');
  const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(ciphertext, 'base64url')), decipher.final()]).toString('utf8');
}
