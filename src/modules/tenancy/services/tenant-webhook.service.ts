import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { request as httpsRequest } from 'node:https';
import { TenantWebhookEndpoint } from '../models/tenant-webhook-endpoint.model.js';
import { TenantWebhookDelivery } from '../models/tenant-webhook-delivery.model.js';
import { Clinic } from '../models/clinic.model.js';
import { TenantAuditEvent } from '../models/tenant-audit-event.model.js';
import { encryptIntegrationSecret, decryptIntegrationSecret } from './integration-secret.crypto.js';

const MAX_ATTEMPTS = 8;
const RETRY_DELAYS_MS = [60_000, 5 * 60_000, 30 * 60_000, 2 * 60 * 60_000, 12 * 60 * 60_000];
const SAFE_EVENTS = new Set([
  'clinic.created', 'clinic.updated', 'clinic.deactivated', 'clinic.settings.overridden',
  'branch.created', 'branch.updated', 'branch.closed', 'branch.suspended', 'branch.temporarily_closed', 'branch.permanently_closed', 'branch.holiday.created', 'branch.holiday.updated', 'branch.holiday.cancelled', 'branch.settings.overridden',
  'membership.invited', 'membership.accepted', 'membership.suspended', 'membership.removed', 'membership.invitation.created', 'membership.invitation.revoked', 'membership.invitation.resent', 'membership.user_session.revoked', 'membership.updated',
  'role.created', 'role.updated', 'role.deactivated', 'permission.changed',
  'organization.updated', 'organization.profile.updated', 'organization.preferences.updated', 'configuration.updated', 'configuration.published', 'configuration.defaults.updated', 'configuration.defaults.applied', 'billing.profile.updated',
  'finance.invoice.created', 'finance.payment.recorded', 'finance.refund.recorded', 'finance.expense.recorded', 'finance.entry.voided',
  'subscription.change_requested', 'integration.configuration.saved', 'integration.disabled', 'integration.enabled',
  'integration.connection_verified', 'integration.connection_failed', 'integration.credentials.rotated', 'integration.credentials.revoked',
  'integration.webhook.created', 'integration.webhook.updated', 'integration.webhook.secret.rotated', 'integration.webhook.disabled', 'integration.webhook.enabled',
]);

function privateIpv6(address: string) {
  const value = address.toLowerCase();
  if (value.startsWith('::ffff:')) return privateAddress(value.slice(7));
  return !/^[23][0-9a-f]{0,3}:/.test(value) || value.startsWith('2001:db8:');
}
function privateAddress(address: string) {
  if (address === '::1' || address === '::' || address.startsWith('fc') || address.startsWith('fd') || address.startsWith('fe80:') || address.startsWith('ff')) return true;
  if (address.toLowerCase().startsWith('::ffff:')) return privateAddress(address.slice(7));
  const parts = address.split('.').map(Number);
  if (parts.length !== 4 || parts.some(n => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const a = parts[0] ?? -1;
  const b = parts[1] ?? -1;
  return a === 0 || a === 10 || a === 127 || a >= 224 || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)
    || (a === 100 && b >= 64 && b <= 127);
}
async function validateWebhookUrl(value: string) {
  let url: URL;
  try { url = new URL(value); } catch { throw { status: 400, code: 'WEBHOOK_URL_INVALID', message: 'Webhook URL must be a valid HTTPS URL.' }; }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || !url.hostname
    || url.hostname === 'localhost' || url.hostname.endsWith('.localhost') || url.hostname.endsWith('.local')
    || isIP(url.hostname)) {
    throw { status: 400, code: 'WEBHOOK_URL_UNSAFE', message: 'Webhook endpoints must use public HTTPS hostnames without embedded credentials.' };
  }
  let addresses: Array<{ address: string; family: number }>;
  try { addresses = await lookup(url.hostname, { all: true, verbatim: true }); }
  catch { throw { status: 400, code: 'WEBHOOK_HOST_UNRESOLVED', message: 'Webhook hostname could not be resolved.' }; }
  if (!addresses.length || addresses.some(item => item.family === 4 ? privateAddress(item.address) : privateIpv6(item.address))) {
    throw { status: 400, code: 'WEBHOOK_URL_UNSAFE', message: 'Webhook hostname resolves to a non-public network address.' };
  }
  return url.toString();
}
async function sendWebhook(urlValue: string, body: string, headers: Record<string, string>) {
  const url = new URL(await validateWebhookUrl(urlValue));
  const addresses = await lookup(url.hostname, { all: true, verbatim: true });
  const target = addresses[0];
  if (!target || (target.family === 4 ? privateAddress(target.address) : privateIpv6(target.address))) {
    throw new Error('Webhook destination is not publicly routable.');
  }
  return new Promise<number>((resolve, reject) => {
    const request = httpsRequest(url, {
      method: 'POST',
      headers,
      timeout: 10_000,
      lookup: ((_hostname: string, _options: unknown, callback: (error: NodeJS.ErrnoException | null, address: string, family: number) => void) => {
        callback(null, target.address, target.family);
      }) as any,
    }, response => {
      const status = response.statusCode ?? 0;
      response.resume();
      response.on('end', () => resolve(status));
    });
    request.on('timeout', () => { const error = new Error('Webhook request timed out.'); error.name = 'TimeoutError'; request.destroy(error); });
    request.on('error', reject);
    request.end(body);
  });
}
async function auditWebhook(tenantId: string, actorId: string, action: string, endpoint: any) {
  await TenantAuditEvent.create({
    tenantId, actorUserId: actorId, action, targetType: 'tenant_webhook_endpoint',
    targetId: String(endpoint._id), clinicId: endpoint.clinicId ?? null,
    metadata: { name: endpoint.name, scope: endpoint.clinicId ? 'clinic' : 'tenant', eventCount: endpoint.events?.length ?? 0, status: endpoint.status },
  }).catch(() => undefined);
}
function safeEndpoint(item: any) {
  return {
    id: String(item._id), name: item.name, url: item.url,
    clinicId: item.clinicId ? String(item.clinicId) : null,
    scope: item.clinicId ? 'clinic' : 'tenant', events: item.events,
    status: item.status, createdAt: item.createdAt, updatedAt: item.updatedAt,
    lastDeliveryAt: item.lastDeliveryAt, lastSuccessAt: item.lastSuccessAt, lastFailureAt: item.lastFailureAt,
  };
}
export const tenantWebhookService = {
  async create(tenantId: string, actorId: string, input: { name: string; url: string; clinicId?: string | null; events: string[] }) {
    if (input.clinicId && !await Clinic.exists({ _id: input.clinicId, tenantId })) throw { status: 404, code: 'CLINIC_NOT_FOUND', message: 'Clinic does not belong to this tenant.' };
    const events = [...new Set(input.events)];
    if (!events.length || events.length > 100 || events.some(event => event !== '*' && !SAFE_EVENTS.has(event))) throw { status: 400, code: 'WEBHOOK_EVENTS_INVALID', message: 'One or more webhook event types are not supported.' };
    const url = await validateWebhookUrl(input.url);
    const secret = `whsec_${randomBytes(32).toString('base64url')}`;
    const endpoint = await TenantWebhookEndpoint.create({
      tenantId, clinicId: input.clinicId ?? null, name: input.name.trim(), url,
      encryptedSigningSecret: encryptIntegrationSecret(secret), events, status: 'active',
      createdBy: actorId, updatedBy: actorId,
    });
    await auditWebhook(tenantId, actorId, 'integration.webhook.created', endpoint);
    return { ...safeEndpoint(endpoint), signingSecret: secret };
  },
  async list(tenantId: string) {
    return (await TenantWebhookEndpoint.find({ tenantId }).sort({ createdAt: -1 }).lean()).map(safeEndpoint);
  },
  async update(tenantId: string, actorId: string, endpointId: string, input: { name?: string; url?: string; clinicId?: string | null; events?: string[] }) {
    if (input.clinicId && !await Clinic.exists({ _id: input.clinicId, tenantId })) throw { status: 404, code: 'CLINIC_NOT_FOUND', message: 'Clinic does not belong to this tenant.' };
    const events = input.events ? [...new Set(input.events)] : undefined;
    if (events && (!events.length || events.length > 100 || events.some(event => event !== '*' && !SAFE_EVENTS.has(event)))) throw { status: 400, code: 'WEBHOOK_EVENTS_INVALID', message: 'One or more webhook event types are not supported.' };
    const update: Record<string, unknown> = { updatedBy: actorId };
    if (input.name !== undefined) update.name = input.name.trim();
    if (input.url !== undefined) update.url = await validateWebhookUrl(input.url);
    if (input.clinicId !== undefined) update.clinicId = input.clinicId;
    if (events) update.events = events;
    const endpoint = await TenantWebhookEndpoint.findOneAndUpdate({ _id: endpointId, tenantId }, { $set: update }, { new: true, runValidators: true });
    if (!endpoint) return null;
    await auditWebhook(tenantId, actorId, 'integration.webhook.updated', endpoint);
    return safeEndpoint(endpoint);
  },
  async rotateSecret(tenantId: string, actorId: string, endpointId: string) {
    const secret = `whsec_${randomBytes(32).toString('base64url')}`;
    const endpoint = await TenantWebhookEndpoint.findOneAndUpdate(
      { _id: endpointId, tenantId }, { $set: { encryptedSigningSecret: encryptIntegrationSecret(secret), updatedBy: actorId } }, { new: true },
    );
    if (!endpoint) return null;
    await auditWebhook(tenantId, actorId, 'integration.webhook.secret.rotated', endpoint);
    return { ...safeEndpoint(endpoint), signingSecret: secret };
  },
  async setStatus(tenantId: string, actorId: string, endpointId: string, status: 'active' | 'disabled') {
    const endpoint = await TenantWebhookEndpoint.findOneAndUpdate({ _id: endpointId, tenantId }, { $set: { status, updatedBy: actorId } }, { new: true });
    return endpoint ? safeEndpoint(endpoint) : null;
  },
  async listDeliveries(tenantId: string, endpointId: string, limit = 50) {
    const endpoint = await TenantWebhookEndpoint.exists({ _id: endpointId, tenantId });
    if (!endpoint) return null;
    const items = await TenantWebhookDelivery.find({ tenantId, endpointId })
      .select('-payload').sort({ createdAt: -1 }).limit(Math.min(Math.max(limit, 1), 100)).lean();
    return items.map(item => ({
      id: String(item._id), eventId: item.eventId, eventType: item.eventType, status: item.status,
      attempts: item.attempts, nextAttemptAt: item.nextAttemptAt, responseStatus: item.responseStatus,
      responseExcerpt: item.responseExcerpt, lastErrorCode: item.lastErrorCode, deliveredAt: item.deliveredAt,
      createdAt: item.createdAt,
    }));
  },
  async queueAuditEvent(event: any) {
    if (!SAFE_EVENTS.has(event.action)) return;
    const endpointFilter: Record<string, unknown> = {
      tenantId: event.tenantId, status: 'active',
      events: { $in: [event.action, '*'] },
      ...(event.clinicId ? { $or: [{ clinicId: null }, { clinicId: event.clinicId }] } : { clinicId: null }),
    };
    const endpoints = await TenantWebhookEndpoint.find(endpointFilter).select('_id tenantId').lean();
    if (!endpoints.length) return;
    const eventId = String(event._id ?? randomUUID());
    const payload = {
      id: eventId, type: event.action, occurredAt: event.createdAt ?? new Date(),
      tenantId: String(event.tenantId), actorId: String(event.actorUserId),
      target: { type: event.targetType, id: event.targetId },
      clinicId: event.clinicId ? String(event.clinicId) : null,
      branchId: event.branchId ? String(event.branchId) : null,
      result: event.result ?? 'success', requestId: event.requestId || null,
    };
    await TenantWebhookDelivery.insertMany(endpoints.map(endpoint => ({
      tenantId: event.tenantId, endpointId: endpoint._id, eventId, eventType: event.action,
      payload, status: 'pending', attempts: 0, nextAttemptAt: new Date(),
    })), { ordered: false }).catch(() => undefined);
  },
  async deliverBatch(batchSize = 20) {
    const now = new Date();
    let delivered = 0;
    for (let i = 0; i < batchSize; i++) {
      const delivery = await TenantWebhookDelivery.findOneAndUpdate(
        {
          $or: [
            { status: { $in: ['pending', 'retrying'] }, nextAttemptAt: { $lte: now } },
            { status: 'processing', lockedUntil: { $lte: now } },
          ],
        },
        { $set: { status: 'processing', lockedUntil: new Date(now.getTime() + 30_000) }, $inc: { attempts: 1 } },
        { new: true, sort: { nextAttemptAt: 1 } },
      );
      if (!delivery) break;
      const endpoint = await TenantWebhookEndpoint.findOne({ _id: delivery.endpointId, tenantId: delivery.tenantId, status: 'active' }).select('+encryptedSigningSecret');
      if (!endpoint) {
        await TenantWebhookDelivery.updateOne({ _id: delivery._id, status: 'processing' }, { $set: { status: 'failed', lastErrorCode: 'ENDPOINT_DISABLED', lockedUntil: null } });
        continue;
      }
      const body = JSON.stringify({ id: delivery.eventId, type: delivery.eventType, data: delivery.payload });
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const secret = decryptIntegrationSecret(endpoint.encryptedSigningSecret);
      const signature = createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
      let responseStatus: number | null = null;
      let responseExcerpt = '';
      let errorCode = '';
      try {
        responseStatus = await sendWebhook(endpoint.url, body, {
          'content-type': 'application/json', 'user-agent': 'Cutilora-Webhooks/1.0',
          'x-cutilora-event': delivery.eventType, 'x-cutilora-delivery': delivery.eventId,
          'x-cutilora-timestamp': timestamp, 'x-cutilora-signature': `v1=${signature}`,
        });
        responseExcerpt = responseStatus >= 200 && responseStatus < 300 ? 'Accepted by endpoint.' : 'Endpoint returned a non-success response.';
        if (responseStatus < 200 || responseStatus >= 300) errorCode = `HTTP_${responseStatus}`;
      } catch (error) {
        errorCode = error instanceof Error && error.name === 'TimeoutError' ? 'TIMEOUT' : 'NETWORK_ERROR';
      }
      const success = responseStatus !== null && responseStatus >= 200 && responseStatus < 300;
      const attempts = delivery.attempts;
      const exhausted = !success && attempts >= MAX_ATTEMPTS;
      const delay = RETRY_DELAYS_MS[Math.min(attempts - 1, RETRY_DELAYS_MS.length - 1)]!;
      await TenantWebhookDelivery.updateOne({ _id: delivery._id, status: 'processing' }, {
        $set: {
          status: success ? 'delivered' : exhausted ? 'failed' : 'retrying',
          nextAttemptAt: new Date(Date.now() + delay), lockedUntil: null,
          responseStatus, responseExcerpt, lastErrorCode: success ? '' : errorCode,
          ...(success ? { deliveredAt: new Date() } : {}),
        },
      });
      await TenantWebhookEndpoint.updateOne({ _id: endpoint._id }, {
        $set: { lastDeliveryAt: new Date(), ...(success ? { lastSuccessAt: new Date() } : { lastFailureAt: new Date() }) },
      });
      if (success) delivered++;
    }
    return { delivered };
  },
};
