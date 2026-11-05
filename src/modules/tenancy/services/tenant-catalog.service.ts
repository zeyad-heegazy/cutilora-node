import { tenancyRepository } from '../repositories/tenancy.repository.js';

const TEMPLATE_TYPES = new Set([
  'service_treatment', 'pricing', 'appointment_policy', 'cancellation_policy',
  'rescheduling_policy', 'message_template', 'notification_template', 'operational_policy',
]);

function fail(status: number, code: string, message: string): never {
  throw { status, code, message };
}

function normalizeTemplate(input: Record<string, any>) {
  const name = String(input.name ?? '').trim();
  const key = String(input.key ?? '').trim().toLowerCase();
  if (!name || name.length > 120) fail(400, 'TEMPLATE_NAME_INVALID', 'Template name is required and must not exceed 120 characters.');
  if (!/^[a-z0-9][a-z0-9_-]{1,139}$/.test(key)) fail(400, 'TEMPLATE_KEY_INVALID', 'Template key must be 2-140 lowercase letters, numbers, hyphens or underscores.');
  if (!TEMPLATE_TYPES.has(input.type)) fail(400, 'TEMPLATE_TYPE_INVALID', 'Unsupported catalog or policy template type.');
  if (!input.content || typeof input.content !== 'object' || Array.isArray(input.content)) fail(400, 'TEMPLATE_CONTENT_INVALID', 'Template content must be a JSON object.');
  if (JSON.stringify(input.content).length > 100_000) fail(400, 'TEMPLATE_CONTENT_TOO_LARGE', 'Template content must not exceed 100 KB.');
  return { name, key, type: input.type, description: String(input.description ?? '').trim().slice(0, 1000), content: input.content };
}

async function audit(tenantId: string, userId: string, action: string, templateId: string, metadata: Record<string, unknown> = {}) {
  await tenancyRepository.createTenantAuditEvent({
    tenantId, actorUserId: userId, action, targetType: 'tenant_catalog_template',
    targetId: templateId, metadata,
  });
}

export const tenantCatalogService = {
  list(tenantId: string, query: { type?: string; status?: string }) {
    return tenancyRepository.listTenantCatalogTemplates(tenantId, query);
  },
  async get(tenantId: string, templateId: string) {
    return tenancyRepository.findTenantCatalogTemplate(tenantId, templateId);
  },
  async create(tenantId: string, userId: string, input: Record<string, any>) {
    const data = normalizeTemplate(input);
    try {
      const created = await tenancyRepository.createTenantCatalogTemplate({
        tenantId, ...data, status: 'draft', version: 1,
        history: [{ version: 1, content: data.content, changedBy: userId, changedAt: new Date() }],
      });
      await audit(tenantId, userId, 'configuration.template.created', String(created._id), { type: data.type, key: data.key });
      return created;
    } catch (error: any) {
      if (error?.code === 11000) fail(409, 'TEMPLATE_KEY_CONFLICT', 'A template with this key already exists in the organization.');
      throw error;
    }
  },
  async update(tenantId: string, userId: string, templateId: string, expectedVersion: number, input: Record<string, any>) {
    const current: any = await tenancyRepository.findTenantCatalogTemplate(tenantId, templateId);
    if (!current) return null;
    if (current.status === 'archived') fail(409, 'TEMPLATE_ARCHIVED', 'Archived templates cannot be edited.');
    const data = normalizeTemplate({ ...current, ...input });
    const updated = await tenancyRepository.updateTenantCatalogTemplate(tenantId, templateId, expectedVersion, data, userId);
    if (!updated) fail(409, 'TEMPLATE_VERSION_CONFLICT', 'Template changed or was archived. Reload and retry.');
    await audit(tenantId, userId, 'configuration.template.updated', templateId, { version: updated.version });
    return updated;
  },
  async rollback(tenantId: string, userId: string, templateId: string, expectedVersion: number, targetVersion: number) {
    const current: any = await tenancyRepository.findTenantCatalogTemplate(tenantId, templateId);
    if (!current) return null;
    if (current.status === 'archived') fail(409, 'TEMPLATE_ARCHIVED', 'Archived templates cannot be rolled back.');
    const snapshot = (current.history ?? []).find((entry: any) => entry.version === targetVersion);
    if (!snapshot) fail(404, 'TEMPLATE_VERSION_NOT_FOUND', 'The requested template version is not available in retained history.');
    const updated = await tenancyRepository.rollbackTenantCatalogTemplate(
      tenantId, templateId, expectedVersion, targetVersion, snapshot.content, userId,
    );
    if (!updated) fail(409, 'TEMPLATE_VERSION_CONFLICT', 'Template changed while rolling back. Reload and retry.');
    await audit(tenantId, userId, 'configuration.template.rolled_back', templateId, {
      fromVersion: expectedVersion, restoredVersion: targetVersion, version: updated.version,
    });
    return updated;
  },
  async archive(tenantId: string, userId: string, templateId: string, expectedVersion: number) {
    const updated = await tenancyRepository.archiveTenantCatalogTemplate(tenantId, templateId, expectedVersion);
    if (!updated) fail(409, 'TEMPLATE_VERSION_CONFLICT', 'Template changed, is missing, or is already archived.');
    await audit(tenantId, userId, 'configuration.template.archived', templateId, { version: updated.version });
    return updated;
  },
  async publish(tenantId: string, userId: string, templateId: string, input: { expectedVersion: number; applyTo: 'none' | 'all' | 'selected'; clinicIds?: string[]; confirm: boolean }) {
    if (!input.confirm) fail(400, 'CONFIRMATION_REQUIRED', 'Review the preview and set confirm=true before publishing.');
    const current: any = await tenancyRepository.findTenantCatalogTemplate(tenantId, templateId);
    if (!current) return null;
    if (current.status === 'archived') fail(409, 'TEMPLATE_ARCHIVED', 'Archived templates cannot be published.');
    if (current.version !== input.expectedVersion) fail(409, 'TEMPLATE_VERSION_CONFLICT', 'Template changed. Reload and retry.');
    let clinics: any[] = [];
    if (input.applyTo !== 'none') {
      clinics = await tenancyRepository.listClinicsForConfiguration(tenantId, input.applyTo === 'selected' ? input.clinicIds : undefined);
      if (input.applyTo === 'selected' && clinics.length !== (input.clinicIds?.length ?? 0)) fail(404, 'CLINIC_NOT_FOUND', 'One or more selected clinics do not belong to this tenant.');
    }
    const published: any = await tenancyRepository.publishTenantCatalogTemplate(tenantId, templateId, input.expectedVersion, userId);
    if (!published) fail(409, 'TEMPLATE_VERSION_CONFLICT', 'Template changed while publishing. Reload and retry.');
    let updated = 0;
    let skipped = 0;
    for (const clinic of clinics) {
      const result = await tenancyRepository.applyCatalogTemplateToClinic(tenantId, String(clinic._id), published);
      if (result) updated += 1; else skipped += 1;
    }
    await audit(tenantId, userId, 'configuration.template.published', templateId, {
      version: published.version, applyTo: input.applyTo, updated, skipped,
    });
    return { template: published, applied: { updated, skipped, total: clinics.length } };
  },
};
