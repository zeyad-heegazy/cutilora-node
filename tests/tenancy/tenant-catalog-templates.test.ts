import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/modules/tenancy/repositories/tenancy.repository.js', () => ({
  tenancyRepository: {
    listTenantCatalogTemplates: vi.fn(),
    findTenantCatalogTemplate: vi.fn(),
    createTenantCatalogTemplate: vi.fn(),
    updateTenantCatalogTemplate: vi.fn(),
    archiveTenantCatalogTemplate: vi.fn(),
    publishTenantCatalogTemplate: vi.fn(),
    listClinicsForConfiguration: vi.fn(),
    applyCatalogTemplateToClinic: vi.fn(),
    createTenantAuditEvent: vi.fn().mockResolvedValue({}),
  },
}));

import { tenantCatalogService } from '../../src/modules/tenancy/services/tenant-catalog.service.js';
import { tenancyRepository } from '../../src/modules/tenancy/repositories/tenancy.repository.js';

const tenantId = '64b000000000000000000001';
const userId = '64b000000000000000000002';
const templateId = '64b000000000000000000003';
const clinicId = '64b000000000000000000004';

describe('tenant catalog and policy templates', () => {
  beforeEach(() => vi.resetAllMocks());

  it('creates tenant-owned draft templates and records an audit event', async () => {
    vi.mocked(tenancyRepository.createTenantCatalogTemplate).mockResolvedValue({ _id: templateId, version: 1, status: 'draft' } as any);
    const result = await tenantCatalogService.create(tenantId, userId, {
      name: 'Initial Consultation', key: 'initial-consultation', type: 'service_treatment',
      content: { durationMinutes: 30, bufferMinutes: 5 },
    });
    expect(tenancyRepository.createTenantCatalogTemplate).toHaveBeenCalledWith(expect.objectContaining({
      tenantId, key: 'initial-consultation', version: 1, status: 'draft',
    }));
    expect(tenancyRepository.createTenantAuditEvent).toHaveBeenCalledWith(expect.objectContaining({
      tenantId, action: 'configuration.template.created', targetId: templateId,
    }));
    expect(result).toMatchObject({ version: 1, status: 'draft' });
  });

  it('rejects invalid template types and unsafe keys', async () => {
    await expect(tenantCatalogService.create(tenantId, userId, {
      name: 'Bad', key: '../escape', type: 'service_treatment', content: {},
    })).rejects.toMatchObject({ code: 'TEMPLATE_KEY_INVALID' });
    await expect(tenantCatalogService.create(tenantId, userId, {
      name: 'Bad', key: 'valid-key', type: 'unknown', content: {},
    })).rejects.toMatchObject({ code: 'TEMPLATE_TYPE_INVALID' });
    expect(tenancyRepository.createTenantCatalogTemplate).not.toHaveBeenCalled();
  });

  it('uses optimistic version checks when updating templates', async () => {
    vi.mocked(tenancyRepository.findTenantCatalogTemplate).mockResolvedValue({
      name: 'Policy', key: 'policy', type: 'appointment_policy', description: '', content: { duration: 30 }, version: 3, status: 'draft',
    } as any);
    vi.mocked(tenancyRepository.updateTenantCatalogTemplate).mockResolvedValue(null as any);
    await expect(tenantCatalogService.update(tenantId, userId, templateId, 2, { content: { duration: 45 } }))
      .rejects.toMatchObject({ status: 409, code: 'TEMPLATE_VERSION_CONFLICT' });
  });

  it('requires confirmation before publishing', async () => {
    await expect(tenantCatalogService.publish(tenantId, userId, templateId, {
      expectedVersion: 1, applyTo: 'none', confirm: false,
    })).rejects.toMatchObject({ status: 400, code: 'CONFIRMATION_REQUIRED' });
    expect(tenancyRepository.findTenantCatalogTemplate).not.toHaveBeenCalled();
  });

  it('validates selected clinic ownership and applies published snapshots idempotently', async () => {
    vi.mocked(tenancyRepository.findTenantCatalogTemplate).mockResolvedValue({
      _id: templateId, version: 2, status: 'draft', key: 'appointment-policy', type: 'appointment_policy', content: { duration: 30 },
    } as any);
    vi.mocked(tenancyRepository.listClinicsForConfiguration).mockResolvedValue([{ _id: clinicId }] as any);
    vi.mocked(tenancyRepository.publishTenantCatalogTemplate).mockResolvedValue({
      _id: templateId, version: 2, status: 'published', key: 'appointment-policy', type: 'appointment_policy', content: { duration: 30 },
    } as any);
    vi.mocked(tenancyRepository.applyCatalogTemplateToClinic).mockResolvedValue({ _id: clinicId } as any);

    const result = await tenantCatalogService.publish(tenantId, userId, templateId, {
      expectedVersion: 2, applyTo: 'selected', clinicIds: [clinicId], confirm: true,
    });
    expect(tenancyRepository.applyCatalogTemplateToClinic).toHaveBeenCalledWith(tenantId, clinicId, expect.objectContaining({
      key: 'appointment-policy', version: 2,
    }));
    expect(result).toMatchObject({ applied: { updated: 1, skipped: 0, total: 1 } });
  });

  it('rejects selected clinic IDs outside the tenant', async () => {
    vi.mocked(tenancyRepository.findTenantCatalogTemplate).mockResolvedValue({
      _id: templateId, version: 1, status: 'draft', key: 'policy', type: 'operational_policy', content: {},
    } as any);
    vi.mocked(tenancyRepository.listClinicsForConfiguration).mockResolvedValue([]);
    await expect(tenantCatalogService.publish(tenantId, userId, templateId, {
      expectedVersion: 1, applyTo: 'selected', clinicIds: [clinicId], confirm: true,
    })).rejects.toMatchObject({ status: 404, code: 'CLINIC_NOT_FOUND' });
    expect(tenancyRepository.publishTenantCatalogTemplate).not.toHaveBeenCalled();
  });
});
