import { encryptIntegrationSecret, decryptIntegrationSecret } from './integration-secret.crypto.js';
import { verifyIntegrationConnection, INTEGRATION_PROVIDER_CATALOG } from './integration-providers.js';
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

function safeRecord(value: unknown, depth = 0): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || depth > 5) return {};
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).slice(0, 100).map(([key, item]) => [
    key,
    /secret|token|password|credential|api.?key|authorization/i.test(key)
      ? '[REDACTED]'
      : item && typeof item === 'object' ? safeRecord(item, depth + 1) : item,
  ]));
}
function present(item: any) {
  return {
    id: String(item._id), provider: item.provider, integrationType: item.integrationType,
    displayName: item.displayName, clinicId: item.clinicId ? String(item.clinicId) : null,
    scope: item.clinicId ? 'clinic' : 'tenant', config: safeRecord(item.config),
    hasCredentials: Boolean(item.encryptedSecrets), status: item.status,
    lastCheckedAt: item.lastCheckedAt ?? null, lastError: item.lastError ?? '',
    createdAt: item.createdAt, updatedAt: item.updatedAt,
  };
}
function validateProviderSecrets(provider: string, secrets: Record<string, string>) {
  const definition = INTEGRATION_PROVIDER_CATALOG.find(item => item.key === provider);
  if (!definition) throw { status: 400, code: 'INTEGRATION_PROVIDER_UNSUPPORTED', message: 'Select a supported provider.' };
  const allowed = new Set<string>(definition.credentialFields);
  const keys = Object.keys(secrets);
  if (!keys.length || keys.some(key => !allowed.has(key)) || definition.credentialFields.some(key => !secrets[key]?.trim())) {
    throw { status: 400, code: 'INVALID_INTEGRATION_CREDENTIALS', message: 'Provide every required credential field for the selected provider and no unsupported fields.' };
  }
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
    const items = await TenantIntegration.find({ tenantId }).select('+encryptedSecrets').sort({ integrationType: 1, provider: 1, clinicId: 1 }).lean();
    return items.map(present);
  },
  async save(tenantId: string, actorId: string, input: IntegrationInput) {
    const provider = input.provider.trim().toLowerCase();
    const definition = INTEGRATION_PROVIDER_CATALOG.find((item) => item.key === provider);
    if (!definition || definition.type !== input.integrationType) throw { status: 400, code: 'INTEGRATION_PROVIDER_UNSUPPORTED', message: 'Select a supported provider for this integration type.' };
    if (!/^[a-z0-9][a-z0-9._-]{1,79}$/.test(provider)) throw { status: 400, code: 'INVALID_INTEGRATION_PROVIDER', message: 'Provider must be a valid provider key.' };
    if (input.integrationType === 'payment_gateway' && !input.clinicId) throw { status: 400, code: 'CLINIC_SCOPE_REQUIRED', message: 'Patient payment gateway credentials must be configured for a specific clinic.' };
    if (input.clinicId && !await Clinic.exists({ _id: input.clinicId, tenantId })) {
      throw { status: 404, code: 'CLINIC_NOT_FOUND', message: 'Clinic does not belong to this tenant.' };
    }
    const secrets = input.secrets;
    if (secrets && (Object.keys(secrets).length > 30 || Object.values(secrets).some(value => typeof value !== 'string' || value.length > 4096))) {
      throw { status: 400, code: 'INVALID_INTEGRATION_CREDENTIALS', message: 'Credentials exceed the supported limits.' };
    }
    if (secrets && Object.keys(secrets).length) validateProviderSecrets(provider, secrets);
    const filter = { tenantId, provider, clinicId: input.clinicId ?? null };
    const update: Record<string, unknown> = {
      $set: {
        integrationType: input.integrationType,
        displayName: input.displayName.trim(),
        config: safeRecord(input.config),
        updatedBy: actorId,
        status: 'configured',
        lastError: '',
      },
      $setOnInsert: { tenantId, provider, clinicId: input.clinicId ?? null, createdBy: actorId },
    };
    if (secrets && Object.keys(secrets).length) (update.$set as Record<string, unknown>).encryptedSecrets = encryptIntegrationSecret(JSON.stringify(secrets));
    const item = await TenantIntegration.findOneAndUpdate(filter, update, { new: true, upsert: true, runValidators: true }).select('+encryptedSecrets');
    await audit(tenantId, actorId, 'integration.configuration.saved', item);
    return present(item);
  },
  listProviders() { return INTEGRATION_PROVIDER_CATALOG; },
  async resolveForClinic(tenantId: string, clinicId: string, provider: string) {
    if (!await Clinic.exists({ _id: clinicId, tenantId })) return null;
    const clinicOverride = await TenantIntegration.findOne({ tenantId, provider, clinicId }).select('+encryptedSecrets');
    const item = clinicOverride ?? await TenantIntegration.findOne({ tenantId, provider, clinicId: null }).select('+encryptedSecrets');
    if (!item || item.status !== 'connected') return null;
    const secrets = item.encryptedSecrets ? JSON.parse(decryptIntegrationSecret(item.encryptedSecrets)) : {};
    return { id: String(item._id), provider: item.provider, integrationType: item.integrationType, config: item.config ?? {}, secrets };
  },

  async rotateCredentials(tenantId: string, actorId: string, integrationId: string, secrets: Record<string, string>) {
    if (!Object.keys(secrets).length || Object.keys(secrets).length > 30 || Object.values(secrets).some(value => typeof value !== 'string' || value.length > 4096)) {
      throw { status: 400, code: 'INVALID_INTEGRATION_CREDENTIALS', message: 'Provide valid replacement credentials.' };
    }
    const existing = await TenantIntegration.findOne({ _id: integrationId, tenantId }).select('+encryptedSecrets');
    if (!existing) return null;
    validateProviderSecrets(existing.provider, secrets);
    const item = await TenantIntegration.findOneAndUpdate(
      { _id: integrationId, tenantId },
      { $set: { encryptedSecrets: encryptIntegrationSecret(JSON.stringify(secrets)), status: 'configured', lastError: '', updatedBy: actorId } },
      { new: true, runValidators: true },
    ).select('+encryptedSecrets');
    if (!item) return null;
    await audit(tenantId, actorId, 'integration.credentials.rotated', item);
    return present(item);
  },
  async revokeCredentials(tenantId: string, actorId: string, integrationId: string) {
    const item = await TenantIntegration.findOneAndUpdate(
      { _id: integrationId, tenantId },
      { $set: { encryptedSecrets: '', status: 'disabled', lastError: 'Credentials revoked.', updatedBy: actorId } },
      { new: true, runValidators: true },
    ).select('+encryptedSecrets');
    if (!item) return null;
    await audit(tenantId, actorId, 'integration.credentials.revoked', item);
    return present(item);
  },
  async testConnection(tenantId: string, actorId: string, integrationId: string) {
    const item = await TenantIntegration.findOne({ _id: integrationId, tenantId }).select('+encryptedSecrets');
    if (!item) return null;
    if (item.status === 'disabled') throw { status: 409, code: 'INTEGRATION_DISABLED', message: 'Enable this integration before testing its connection.' };
    let result: { connected: boolean; message: string };
    try {
      const secrets = item.encryptedSecrets ? JSON.parse(decryptIntegrationSecret(item.encryptedSecrets)) : {};
      result = await verifyIntegrationConnection(item.provider, item.config ?? {}, secrets);
    } catch (error) {
      result = { connected: false, message: error instanceof Error ? error.message : 'Connection test failed.' };
    }
    item.status = result.connected ? 'connected' : 'error';
    item.lastCheckedAt = new Date();
    item.lastError = result.connected ? '' : result.message.slice(0, 300);
    item.updatedBy = actorId;
    await item.save();
    await audit(tenantId, actorId, result.connected ? 'integration.connection_verified' : 'integration.connection_failed', item);
    return { ...present(item), connection: result };
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
