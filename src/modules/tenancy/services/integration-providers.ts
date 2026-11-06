type Credentials = Record<string, string>;
type Config = Record<string, unknown>;

async function request(url: string, init: RequestInit) {
  const response = await fetch(url, { ...init, redirect: 'error', signal: AbortSignal.timeout(8_000) });
  if (!response.ok) throw new Error(`Provider returned HTTP ${response.status}.`);
  return response;
}
function required(secrets: Credentials, key: string) {
  const value = secrets[key]?.trim();
  if (!value) throw new Error(`Missing required credential: ${key}.`);
  return value;
}
export const INTEGRATION_PROVIDER_CATALOG = [
  { key: 'resend_email', type: 'communication', label: 'Resend Email', credentialFields: ['apiKey'], capabilities: ['email.send'] },
  { key: 'twilio_sms', type: 'communication', label: 'Twilio SMS', credentialFields: ['accountSid', 'authToken'], capabilities: ['sms.send'] },
  { key: 'meta_whatsapp_cloud', type: 'communication', label: 'Meta WhatsApp Cloud API', credentialFields: ['accessToken', 'phoneNumberId'], capabilities: ['whatsapp.send'] },
  { key: 'stripe', type: 'payment_gateway', label: 'Stripe', credentialFields: ['secretKey'], capabilities: ['payment_gateway.connection_check'] },
  { key: 'paymob', type: 'payment_gateway', label: 'Paymob', credentialFields: ['apiKey'], capabilities: ['payment_gateway.connection_check'] },
] as const;

export async function verifyIntegrationConnection(provider: string, config: Config, secrets: Credentials): Promise<{ connected: boolean; message: string }> {
  try {
    switch (provider) {
      case 'resend_email': {
        await request('https://api.resend.com/domains', { headers: { authorization: `Bearer ${required(secrets, 'apiKey')}` } });
        return { connected: true, message: 'Resend API credentials are valid.' };
      }
      case 'twilio_sms': {
        const sid = required(secrets, 'accountSid');
        const token = required(secrets, 'authToken');
        if (!/^AC[a-f0-9]{32}$/i.test(sid)) throw new Error('Twilio Account SID format is invalid.');
        const auth = Buffer.from(`${sid}:${token}`).toString('base64');
        await request(`https://api.twilio.com/2010-04-01/Accounts/${sid}.json`, { headers: { authorization: `Basic ${auth}` } });
        return { connected: true, message: 'Twilio account credentials are valid.' };
      }
      case 'meta_whatsapp_cloud': {
        const token = required(secrets, 'accessToken');
        const phoneNumberId = required(secrets, 'phoneNumberId');
        const version = String(config.apiVersion ?? 'v26.0');
        if (!/^v\\d+\\.\\d+$/.test(version) || !/^\\d{5,30}$/.test(phoneNumberId)) throw new Error('WhatsApp API version or phone number ID is invalid.');
        await request(`https://graph.facebook.com/${version}/${phoneNumberId}?fields=id,display_phone_number,verified_name`, { headers: { authorization: `Bearer ${token}` } });
        return { connected: true, message: 'WhatsApp Cloud API credentials are valid.' };
      }
      case 'stripe': {
        await request('https://api.stripe.com/v1/account', { headers: { authorization: `Bearer ${required(secrets, 'secretKey')}` } });
        return { connected: true, message: 'Stripe account credentials are valid. This does not enable patient payment settlement.' };
      }
      case 'paymob': {
        const response = await request('https://accept.paymob.com/api/auth/tokens', {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ api_key: required(secrets, 'apiKey') }),
        });
        const data = await response.json() as { token?: string };
        if (!data.token) throw new Error('Paymob did not return an authentication token.');
        return { connected: true, message: 'Paymob API credentials are valid. This does not enable patient payment settlement.' };
      }
      default:
        throw new Error('No connection adapter is registered for this provider. Configuration is stored but cannot be marked connected.');
    }
  } catch (error) {
    return { connected: false, message: error instanceof Error ? error.message : 'Provider connection failed.' };
  }
}
