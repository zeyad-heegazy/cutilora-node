import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  integration: { find: vi.fn(), findOne: vi.fn(), findOneAndUpdate: vi.fn() },
  clinicExists: vi.fn(),
  auditCreate: vi.fn(),
}));
vi.mock('../../src/modules/tenancy/models/tenant-integration.model.js', () => ({ TenantIntegration: mocks.integration }));
vi.mock('../../src/modules/tenancy/models/clinic.model.js', () => ({ Clinic: { exists: mocks.clinicExists } }));
vi.mock('../../src/modules/tenancy/models/tenant-audit-event.model.js', () => ({ TenantAuditEvent: { create: mocks.auditCreate } }));

import { tenantIntegrationService } from '../../src/modules/tenancy/services/tenant-integration.service.js';

const tenantId = '64b000000000000000000001';
const actorId = '64b000000000000000000002';
const clinicId = '64b000000000000000000003';

describe('tenant integration configuration', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.auditCreate.mockResolvedValue({});
  });

  it('rejects unknown credential keys rather than encrypting arbitrary provider secrets', async () => {
    await expect(tenantIntegrationService.save(tenantId, actorId, {
      provider: 'twilio_sms',
      integrationType: 'communication',
      displayName: 'Clinic SMS',
      secrets: { accountSid: 'AC' + 'a'.repeat(32), authToken: 'token', unexpected: 'secret' },
    })).rejects.toMatchObject({ status: 400, code: 'INVALID_INTEGRATION_CREDENTIALS' });
    expect(mocks.integration.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('requires patient payment gateway credentials to be clinic scoped', async () => {
    await expect(tenantIntegrationService.save(tenantId, actorId, {
      provider: 'paymob',
      integrationType: 'payment_gateway',
      displayName: 'Paymob',
      secrets: { apiKey: 'key' },
    })).rejects.toMatchObject({ status: 400, code: 'CLINIC_SCOPE_REQUIRED' });
    expect(mocks.integration.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('does not fall back to tenant credentials when a clinic override is disabled', async () => {
    mocks.clinicExists.mockResolvedValue(true);
    mocks.integration.findOne.mockReturnValue({
      select: vi.fn().mockResolvedValue({ status: 'disabled', encryptedSecrets: 'ciphertext' }),
    });

    const result = await tenantIntegrationService.resolveForClinic(tenantId, clinicId, 'twilio_sms');

    expect(result).toBeNull();
    expect(mocks.integration.findOne).toHaveBeenCalledTimes(1);
    expect(mocks.integration.findOne).toHaveBeenCalledWith({ tenantId, provider: 'twilio_sms', clinicId });
  });

  it('returns credential presence without exposing encrypted or plaintext secret values', async () => {
    const record = {
      _id: '64b000000000000000000004', provider: 'twilio_sms', integrationType: 'communication',
      displayName: 'SMS', clinicId: null, config: {}, encryptedSecrets: 'ciphertext-secret',
      status: 'connected',
    };
    mocks.integration.find.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      sort: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue([record]),
    });

    const result = await tenantIntegrationService.list(tenantId);

    expect(result[0]).toMatchObject({ hasCredentials: true, status: 'connected' });
    expect(JSON.stringify(result)).not.toContain('ciphertext-secret');
    expect(JSON.stringify(result)).not.toContain('encryptedSecrets');
  });
});
