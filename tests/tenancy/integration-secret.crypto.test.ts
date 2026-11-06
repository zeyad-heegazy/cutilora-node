import { describe, expect, it } from 'vitest';
import { decryptIntegrationSecret, encryptIntegrationSecret } from '../../src/modules/tenancy/services/integration-secret.crypto.js';

describe('integration secret encryption', () => {
  it('encrypts secrets with authenticated encryption and decrypts the original value', () => {
    const secret = JSON.stringify({ apiKey: 'private-value', accountSid: 'AC123' });
    const encrypted = encryptIntegrationSecret(secret);
    expect(encrypted).not.toContain('private-value');
    expect(encrypted).not.toContain('AC123');
    expect(decryptIntegrationSecret(encrypted)).toBe(secret);
  });

  it('uses a fresh IV for each encryption', () => {
    const first = encryptIntegrationSecret('same-secret');
    const second = encryptIntegrationSecret('same-secret');
    expect(first).not.toBe(second);
    expect(decryptIntegrationSecret(first)).toBe('same-secret');
    expect(decryptIntegrationSecret(second)).toBe('same-secret');
  });

  it('rejects tampered ciphertext', () => {
    const encrypted = encryptIntegrationSecret('sensitive');
    const parts = encrypted.split('.');
    const tag = parts[2] ?? '';
    parts[2] = (tag.startsWith('A') ? 'B' : 'A') + tag.slice(1);
    expect(() => decryptIntegrationSecret(parts.join('.'))).toThrow();
  });
});
