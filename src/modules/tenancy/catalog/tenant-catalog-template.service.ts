import { Types } from 'mongoose';
import { TenantCatalogTemplate } from './tenant-catalog-template.model.js';
import { TenantConfiguration } from '../models/tenant-configuration.model.js';
import { Clinic } from '../models/clinic.model.js';
import { TenantAuditEvent } from '../models/tenant-audit-event.model.js';

type TemplateType = 'service' | 'treatment' | 'message' | 'notification' | 'appointment_policy' | 'cancellation_policy' | 'rescheduling_policy' | 'operational_preferences';
type PublishInput = { applyTo: 'new_clinics' | 'all' | 'selected'; clinicIds?: string[]; confirm: true };

function snapshot(template: any) {
  return {
    id: String(template._id), type: template.type, name: template.name,
    description: template.description, content: template.content,
    version: template.version, publishedVersion: template.publishedVersion,
    publishedAt: template.publishedAt,
  };
}

async function audit(tenantId: string, actorUserId: string, action: string, templateId: string, metadata: Record<string, unknown> = {}) {
  try {
    await TenantAuditEvent.create({
      tenantId, actorUserId, action, targetType: 'tenant_catalog_template',
      targetId: templateId, metadata,
    });
  } catch (error) {
    // Template history is persisted with the template mutation; audit failure is logged by the shared audit pipeline.
    const { logger } = await import('../../../shared/logger/logger.js');
    logger.error('Failed to persist catalog template audit event', { tenantId, action, error: error instanceof Error ? error.message : 'unknown' });
  }
}

export const tenantCatalogTemplateService = {
  async list(tenantId: string, query: { type?: TemplateType; status?: string; search?: string; page: number; perPage: number }) {
    const filter: Record<string, unknown> = { tenantId };
    if (query.type) filter.type = query.type;
    if (query.status) filter.status = query.status;
    if (query.search) { const search = query.search.replace(/[^a-zA-Z0-9\u0600-\u06FF _-]/g, ''); if (search) filter.name = { $regex: search, $options: 'i' }; }
    const [items, total] = await Promise.all([
      TenantCatalogTemplate.find(filter).select('-history').sort({ updatedAt: -1 }).skip((query.page - 1) * query.perPage).limit(query.perPage).lean(),
      TenantCatalogTemplate.countDocuments(filter),
    ]);
    return { items, pagination: { page: query.page, perPage: query.perPage, total, pages: Math.ceil(total / query.perPage) } };
  },

  async get(tenantId: string, templateId: string) {
    if (!Types.ObjectId.isValid(templateId)) return null;
    return TenantCatalogTemplate.findOne({ _id: templateId, tenantId }).lean();
  },

  async create(tenantId: string, actorUserId: string, input: { type: TemplateType; name: string; description?: string; content: Record<string, unknown> }) {
    const template = await TenantCatalogTemplate.create({
      tenantId, ...input, description: input.description ?? '',
      status: 'draft', version: 1, createdBy: actorUserId, updatedBy: actorUserId,
      history: [{ version: 1, action: 'created', name: input.name, description: input.description ?? '', content: input.content, changedBy: actorUserId }],
    });
    await audit(tenantId, actorUserId, 'configuration.catalog_template.created', String(template._id), { type: template.type, version: 1 });
    return template;
  },

  async update(tenantId: string, templateId: string, actorUserId: string, input: { name?: string; description?: string; content?: Record<string, unknown>; version: number }) {
    if (!Types.ObjectId.isValid(templateId)) return null;
    const current = await TenantCatalogTemplate.findOne({ _id: templateId, tenantId });
    if (!current) return null;
    if (current.status === 'archived') throw { status: 409, code: 'TEMPLATE_ARCHIVED', message: 'Archived templates cannot be edited.' };
    if (current.version !== input.version) throw { status: 409, code: 'TEMPLATE_VERSION_CONFLICT', message: 'The template changed since it was loaded. Reload and retry.' };
    const next = {
      name: input.name ?? current.name,
      description: input.description ?? current.description,
      content: input.content ?? current.content,
    };
    const updated = await TenantCatalogTemplate.findOneAndUpdate(
      { _id: templateId, tenantId, version: input.version, status: { $ne: 'archived' } },
      {
        $set: { ...next, updatedBy: actorUserId, version: input.version + 1 },
        $push: { history: { $each: [{ version: input.version + 1, action: 'updated', ...next, changedBy: actorUserId, changedAt: new Date() }], $slice: -50 } },
      },
      { new: true, runValidators: true },
    );
    if (!updated) throw { status: 409, code: 'TEMPLATE_VERSION_CONFLICT', message: 'The template changed concurrently. Reload and retry.' };
    await audit(tenantId, actorUserId, 'configuration.catalog_template.updated', templateId, { previousVersion: input.version, version: updated.version });
    return updated;
  },

  async previewPublish(tenantId: string, templateId: string, input: Omit<PublishInput, 'confirm'>) {
    if (!Types.ObjectId.isValid(templateId)) return null;
    const template = await TenantCatalogTemplate.findOne({ _id: templateId, tenantId }).lean() as any;
    if (!template) return null;
    if (template.status === 'archived') throw { status: 409, code: 'TEMPLATE_ARCHIVED', message: 'Archived templates cannot be published.' };
    const clinics = input.applyTo === 'new_clinics' ? [] : await Clinic.find({
      tenantId,
      ...(input.applyTo === 'selected' ? { _id: { $in: input.clinicIds ?? [] } } : {}),
    }).select('_id name status settings').lean() as any[];
    if (input.applyTo === 'selected' && clinics.length !== (input.clinicIds?.length ?? 0)) {
      throw { status: 404, code: 'CLINIC_NOT_FOUND', message: 'One or more selected clinics do not belong to this tenant.' };
    }
    const key = String(template._id);
    return {
      template: snapshot(template),
      applyTo: input.applyTo,
      total: clinics.length,
      clinics: clinics.map((clinic) => {
        const settings = clinic.settings ?? {};
        const defaults = settings.organizationDefaults ?? {};
        const overrides = settings.organizationOverrides ?? {};
        const hasOverride = Object.prototype.hasOwnProperty.call(overrides.catalogTemplates ?? {}, key);
        return {
          clinicId: String(clinic._id), name: clinic.name, status: clinic.status,
          hasClinicOverride: hasOverride,
          willUpdate: !hasOverride && JSON.stringify((defaults.catalogTemplates ?? {})[key] ?? null) !== JSON.stringify(snapshot(template)),
          effectiveTemplate: hasOverride ? overrides.catalogTemplates[key] : (defaults.catalogTemplates ?? {})[key] ?? snapshot(template),
          source: hasOverride ? 'clinic_override' : 'tenant_default',
        };
      }),
      note: input.applyTo === 'new_clinics'
        ? 'The published template will be included in defaults inherited by clinics created later.'
        : 'Clinic-specific template overrides are preserved and are not overwritten.',
    };
  },

  async publish(tenantId: string, templateId: string, actorUserId: string, input: PublishInput) {
    const preview = await this.previewPublish(tenantId, templateId, input);
    if (!preview) return null;
    const current = await TenantCatalogTemplate.findOne({ _id: templateId, tenantId });
    if (!current) return null;
    const publishedAt = current.publishedVersion === current.version && current.status === 'published' ? current.publishedAt ?? new Date() : new Date();
    let published: any = current;
    if (!(current.publishedVersion === current.version && current.status === 'published')) {
      published = await TenantCatalogTemplate.findOneAndUpdate(
        { _id: templateId, tenantId, version: current.version, status: { $ne: 'archived' } },
        {
          $set: { status: 'published', publishedVersion: current.version, publishedAt, updatedBy: actorUserId },
          $push: { history: { $each: [{ version: current.version, action: 'published', name: current.name, description: current.description, content: current.content, changedBy: actorUserId, changedAt: publishedAt }], $slice: -50 } },
        },
        { new: true, runValidators: true },
      );
      if (!published) throw { status: 409, code: 'TEMPLATE_VERSION_CONFLICT', message: 'The template changed while it was being published. Reload and retry.' };
    }

    const key = String(published._id);
    const config = await TenantConfiguration.findOne({ tenantId }).lean() as any;
    const currentSnapshot = config?.values?.catalogTemplates?.[key];
    const nextValues = currentSnapshot && JSON.stringify(currentSnapshot) === JSON.stringify(snapshot(published))
      ? (config?.values ?? {})
      : { ...(config?.values ?? {}), catalogTemplates: { ...(config?.values?.catalogTemplates ?? {}), [key]: snapshot(published) } };
    let updatedConfig: any;
    if (config && JSON.stringify(config.values?.catalogTemplates?.[key] ?? null) === JSON.stringify(snapshot(published))) {
      updatedConfig = config;
    } else if (!config) {
      updatedConfig = await TenantConfiguration.create({
        tenantId, version: 1, values: nextValues,
        history: [{ version: 1, values: nextValues, changedBy: actorUserId, changedAt: publishedAt }],
      });
    } else {
      updatedConfig = await TenantConfiguration.findOneAndUpdate(
        { tenantId, version: config.version },
        {
          $set: { values: nextValues, version: config.version + 1 },
          $push: { history: { $each: [{ version: config.version + 1, values: nextValues, changedBy: actorUserId, changedAt: publishedAt }], $slice: -100 } },
        },
        { new: true, runValidators: true },
      );
      if (!updatedConfig) throw { status: 409, code: 'CONFIGURATION_VERSION_CONFLICT', message: 'Organization defaults changed during publication. Retry publication.' };
    }

    let updated = 0, skipped = 0;
    if (input.applyTo !== 'new_clinics') {
      for (const clinic of preview.clinics) {
        const id = clinic.clinicId;
        const result = await Clinic.findOneAndUpdate(
          { _id: id, tenantId, ['settings.organizationOverrides.catalogTemplates.' + key]: { $exists: false }, $or: [{ 'settings.organizationDefaultsVersion': { $lt: updatedConfig.version } }, { 'settings.organizationDefaultsVersion': { $exists: false } }] },
          { $set: {
            ['settings.organizationDefaults.catalogTemplates.' + key]: snapshot(published),
            'settings.organizationDefaultsVersion': updatedConfig.version,
          } },
          { new: true, runValidators: true },
        );
        if (result) updated += 1; else skipped += 1;
      }
    }
    await audit(tenantId, actorUserId, 'configuration.catalog_template.published', key, {
      version: published.version, configurationVersion: updatedConfig.version, applyTo: input.applyTo, updated, skipped,
    });
    return { template: published, configurationVersion: updatedConfig.version, applyTo: input.applyTo, updated, skipped };
  },

  async archive(tenantId: string, templateId: string, actorUserId: string) {
    if (!Types.ObjectId.isValid(templateId)) return null;
    const current = await TenantCatalogTemplate.findOne({ _id: templateId, tenantId });
    if (!current) return null;
    if (current.status === 'archived') return current;
    const archived = await TenantCatalogTemplate.findOneAndUpdate(
      { _id: templateId, tenantId, version: current.version, status: { $ne: 'archived' } },
      { $set: { status: 'archived', updatedBy: actorUserId, version: current.version + 1 },
        $push: { history: { $each: [{ version: current.version + 1, action: 'archived', name: current.name, description: current.description, content: current.content, changedBy: actorUserId, changedAt: new Date() }], $slice: -50 } } },
      { new: true, runValidators: true },
    );
    if (!archived) throw { status: 409, code: 'TEMPLATE_VERSION_CONFLICT', message: 'The template changed concurrently. Reload and retry.' };
    const config = await TenantConfiguration.findOne({ tenantId }).lean() as any;
    if (config?.values?.catalogTemplates?.[templateId]) {
      const nextValues = { ...config.values, catalogTemplates: { ...config.values.catalogTemplates } };
      delete nextValues.catalogTemplates[templateId];
      const nextVersion = config.version + 1;
      const updatedConfig = await TenantConfiguration.findOneAndUpdate(
        { tenantId, version: config.version },
        { $set: { values: nextValues, version: nextVersion }, $push: { history: { $each: [{ version: nextVersion, values: nextValues, changedBy: actorUserId, changedAt: new Date() }], $slice: -100 } } },
        { new: true, runValidators: true },
      );
      if (!updatedConfig) throw { status: 409, code: 'CONFIGURATION_VERSION_CONFLICT', message: 'Organization defaults changed during template archival. Retry the archive operation.' };
    }
    await audit(tenantId, actorUserId, 'configuration.catalog_template.archived', templateId, { version: archived.version });
    return archived;
  },
};
