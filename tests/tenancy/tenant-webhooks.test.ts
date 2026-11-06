import { beforeEach, describe, expect, it, vi } from 'vitest';

const webhookMocks = vi.hoisted(() => ({
  endpointFind: vi.fn(), endpointCreate: vi.fn(), deliveryInsertMany: vi.fn(),
}));
vi.mock('../../src/modules/tenancy/models/tenant-webhook-endpoint.model.js', () => ({
  TenantWebhookEndpoint: { find: webhookMocks.endpointFind, create: webhookMocks.endpointCreate },
}));
vi.mock('../../src/modules/tenancy/models/tenant-webhook-delivery.model.js', () => ({
  TenantWebhookDelivery: { insertMany: webhookMocks.deliveryInsertMany },
}));
vi.mock('../../src/modules/tenancy/models/clinic.model.js', () => ({ Clinic: { exists: vi.fn() } }));

import { createHmac } from 'node:crypto';
import { tenantWebhookService, verifyTenantWebhookSignature } from '../../src/modules/tenancy/services/tenant-webhook.service.js';

describe('tenant webhook service', () => {
  beforeEach(() => vi.resetAllMocks());

  it('queues only safe tenant governance metadata and never includes arbitrary clinical data', async () => {
    const endpoint = { _id: '64b000000000000000000010', tenantId: '64b000000000000000000001' };
    webhookMocks.endpointFind.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue([endpoint]),
    });
    webhookMocks.deliveryInsertMany.mockResolvedValue([]);

    await tenantWebhookService.queueAuditEvent({
      tenantId: endpoint.tenantId, actorUserId: '64b000000000000000000002',
      action: 'clinic.created', targetType: 'clinic', targetId: '64b000000000000000000003',
      clinicId: '64b000000000000000000003', branchId: null, result: 'success',
      metadata: { patientName: 'must-not-be-included', diagnosis: 'must-not-be-included' },
      requestId: 'req-123', createdAt: new Date('2026-11-06T10:00:00.000Z'),
    });

    const [deliveries] = webhookMocks.deliveryInsertMany.mock.calls[0]!;
    expect(deliveries).toHaveLength(1);
    expect(deliveries[0]).toMatchObject({
      tenantId: endpoint.tenantId, endpointId: endpoint._id, eventType: 'clinic.created',
      payload: { actorId: '64b000000000000000000002', target: { type: 'clinic', id: '64b000000000000000000003' }, requestId: 'req-123' },
    });
    expect(JSON.stringify(deliveries)).not.toContain('must-not-be-included');
  });

  it('does not enqueue unsupported event types', async () => {
    await tenantWebhookService.queueAuditEvent({ tenantId: '64b000000000000000000001', action: 'patient.record.created' });
    expect(webhookMocks.endpointFind).not.toHaveBeenCalled();
    expect(webhookMocks.deliveryInsertMany).not.toHaveBeenCalled();
  });

  it('rejects non-HTTPS webhook destinations', async () => {
    await expect(tenantWebhookService.create(
      '64b000000000000000000001',
      '64b000000000000000000002',
      { name: 'Local endpoint', url: 'http://example.com/hook', events: ['clinic.created'] },
    )).rejects.toMatchObject({ code: 'WEBHOOK_URL_UNSAFE', status: 400 });
    expect(webhookMocks.endpointCreate).not.toHaveBeenCalled();
  });
});
