import { createCipheriv, createHash, randomBytes } from 'node:crypto';
import { env } from '../../../config/env.js';
import { Clinic } from '../models/clinic.model.js';
import { TenantIntegration } from '../models/tenant-integration.model.js';
import { TenantAuditEvent } from '../models/tenant-audit-event.model.js';

type IntegrationInput = {
  clinicId?: string | null;
  provider: string;
  integrationType: 'communication' | 'payment_gateway' | 'calendar' | 'other';
  displayName: string;
  config?: Record<string, unknown>;
  secrets?: Record<string, string>;
};

function encryptionKey() {
  return createHash('sha256').update('cutilora:tenant-integrations:v1:').update(env.JWT_SECRET).digest();
}
function encryptSecrets(secrets: Record<string, string>) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(secrets), 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), encrypted.toString('base64url')].join('.');
}
function safeRecord(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).filter(([key]) => !/secret|token|password|credential|api.?key/i.test(key)));
}
function present(item: any) {
  return {
    id: String(item._id), provider: item.provider, integrationType: item.integrationType,
    displayName: item.displayName, clinicId: item.clinicId ? String(item.clinicId) : null,
    scope: item.clinicId ? 'clinic' : 'tenant', config: safeRecord(item.config),
    hasCredentials: Boolean(item.encryptedSecrets), status: item.status,
    createdAt: item.createdAt, updatedAt: item.updatedAt,
  };
}
async function audit(tenantId: string, actorId: string, action: string, item: any) {
  await TenantAuditEvent.create({
    tenantId, actorUserId: actorId, action, targetType: 'tenant_integration', targetId: String(item._id),
    clinicId: item.clinicId ?? null,
    metadata: { provider: item.provider, integrationType: item.integrationType, status: item.status },
  }).catch(() => undefined);
}
export const tenantIntegrationService = {
  async list(tenantId: string) {
    const items = await TenantIntegration.find({ tenantId }).sort({ integrationType: 1, provider: 1, clinicId: 1 }).lean();
    return items.map(present);
  },
  async save(tenantId: string, actorId: string, input: IntegrationInput) {
    const provider = input.provider.trim().toLowerCase();
    if (!/^[a-z0-9][a-z0-9._-]{1,79}$/.test(provider)) throw { status: 400, code: 'INVALID_INTEGRATION_PROVIDER', message: 'Provider must be a valid provider key.' };
    if (input.clinicId && !await Clinic.exists({ _id: input.clinicId, tenantId })) {
      throw { status: 404, code: 'CLINIC_NOT_FOUND', message: 'Clinic does not belong to this tenant.' };
    }
    const secrets = input.secrets;
    if (secrets && (Object.keys(secrets).length > 30 || Object.values(secrets).some(value => typeof value !== 'string' || value.length > 4096))) {
      throw { status: 400, code: 'INVALID_INTEGRATION_CREDENTIALS', message: 'Credentials exceed the supported limits.' };
    }
    const filter = { tenantId, provider, clinicId: input.clinicId ?? null };
    const update: Record<string, unknown> = {
      $set: {
        integrationType: input.integrationType,
        displayName: input.displayName.trim(),
        config: safeRecord(input.config),
        updatedBy: actorId,
        status: 'configured',
      },
      $setOnInsert: { tenantId, provider, clinicId: input.clinicId ?? null, createdBy: actorId },
    };
    if (secrets && Object.keys(secrets).length) (update.$set as Record<string, unknown>).encryptedSecrets = encryptSecrets(secrets);
    const item = await TenantIntegration.findOneAndUpdate(filter, update, { new: true, upsert: true, runValidators: true }).select('+encryptedSecrets');
    await audit(tenantId, actorId, 'integration.configuration.saved', item);
    return present(item);
  },
  async setStatus(tenantId: string, actorId: string, integrationId: string, status: 'configured' | 'disabled') {
    const item = await TenantIntegration.findOneAndUpdate(
      { _id: integrationId, tenantId },
      { $set: { status, updatedBy: actorId } },
      { new: true, runValidators: true },
    ).select('+encryptedSecrets');
    if (!item) return null;
    await audit(tenantId, actorId, status === 'disabled' ? 'integration.disabled' : 'integration.enabled', item);
    return present(item);
  },
};
