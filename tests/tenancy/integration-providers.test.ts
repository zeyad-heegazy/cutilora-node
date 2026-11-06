import { describe, expect, it } from 'vitest';
import { INTEGRATION_PROVIDER_CATALOG, verifyIntegrationConnection } from '../../src/modules/tenancy/services/integration-providers.js';

describe('integration provider catalog', () => {
  it('exposes the independently replaceable provider adapters', () => {
    expect(INTEGRATION_PROVIDER_CATALOG.map(provider => provider.key)).toEqual([
      'resend_email', 'twilio_sms', 'meta_whatsapp_cloud', 'stripe', 'paymob',
    ]);
  });

  it('does not report an unsupported provider as connected', async () => {
    await expect(verifyIntegrationConnection('unregistered', {}, {})).resolves.toEqual({
      connected: false,
      message: 'No connection adapter is registered for this provider. Configuration is stored but cannot be marked connected.',
    });
  });

  it('rejects malformed Twilio account identifiers before making a network request', async () => {
    await expect(verifyIntegrationConnection('twilio_sms', {}, {
      accountSid: 'not-a-sid', authToken: 'token',
    })).resolves.toMatchObject({ connected: false, message: 'Twilio Account SID format is invalid.' });
  });
});
