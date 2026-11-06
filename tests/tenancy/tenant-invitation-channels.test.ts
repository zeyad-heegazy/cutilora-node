import { describe, expect, it } from 'vitest';
import { createTenantInvitationSchema } from '../../src/modules/tenancy/validations/tenancy.validation.js';

const base = {
  email: 'member@example.com',
  role: 'billing_admin',
  scope: 'tenant',
};

describe('tenant invitation channel validation', () => {
  it('defaults to email delivery for backwards compatibility', () => {
    expect(createTenantInvitationSchema.parse(base).channels).toEqual(['email']);
  });

  it('accepts SMS and combined delivery when an E.164 phone is supplied', () => {
    expect(createTenantInvitationSchema.parse({
      ...base,
      phone: '+201000000000',
      channels: ['email', 'sms'],
    })).toMatchObject({ phone: '+201000000000', channels: ['email', 'sms'] });

    expect(createTenantInvitationSchema.parse({
      ...base,
      phone: '+966501234567',
      channels: ['sms'],
    })).toMatchObject({ channels: ['sms'] });
  });

  it('rejects SMS without a phone number or invalid E.164 phone values', () => {
    expect(() => createTenantInvitationSchema.parse({ ...base, channels: ['sms'] })).toThrow();
    expect(() => createTenantInvitationSchema.parse({
      ...base,
      phone: '01000000000',
      channels: ['sms'],
    })).toThrow();
  });

  it('rejects duplicate delivery channels', () => {
    expect(() => createTenantInvitationSchema.parse({
      ...base,
      channels: ['email', 'email'],
    })).toThrow();
  });
});
