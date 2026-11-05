import { geoService } from '../../geo/services/geo.service.js';
import type { GeoResource } from '../../geo/types/geo.types.js';
import { tenancyRepository } from '../repositories/tenancy.repository.js';
import { storeBrandingLogo, storeBrandingCover, removeBrandingImage } from '../../../shared/storage/branding-image.storage.js';
import { readPrivateTenantDocument, removePrivateTenantDocument, storePrivateTenantDocument } from '../../../shared/storage/private-tenant-document.storage.js';
import { logger } from '../../../shared/logger/logger.js';

function deepMerge(defaults: Record<string, any>, provided?: Record<string, any>): Record<string, any> {
  const result = { ...defaults };
  for (const [key, value] of Object.entries(provided ?? {})) {
    const fallback = result[key];
    result[key] = value && typeof value === 'object' && !Array.isArray(value) && fallback && typeof fallback === 'object' && !Array.isArray(fallback)
      ? deepMerge(fallback, value) : value;
  }
  return result;
}

const DEFAULT_CLINIC_PREFERENCES = { timezone: 'Africa/Cairo', locale: 'en', currency: 'EGP', dateFormat: 'YYYY-MM-DD', weekStartsOn: 6, supportedLanguages: ['en', 'ar'] };
const DEFAULT_BOOKING_SETTINGS = { allowOnlineBooking: false, requireAppointmentConfirmation: true, defaultAppointmentDurationMinutes: 30, bufferMinutes: 0, cancellationWindowHours: 24 };

function slugify(value: string, fallback = 'clinic'): string {
  const slug = value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return slug || fallback;
}

async function generateUniqueClinicSlug(tenantId: string, name: string, excludeId?: string): Promise<string> {
  const base = slugify(name);
  let candidate = base;
  let suffix = 2;
  while (await tenancyRepository.findClinicBySlug(tenantId, candidate, excludeId)) candidate = `${base}-${suffix++}`;
  return candidate;
}

function locationFrom(input: Record<string, any>) {
  const address = input.address ?? {};
  return {
    countryId: input.countryId ?? address.countryId,
    governorateId: input.governorateId ?? address.governorateId,
    cityId: input.cityId ?? address.cityId,
    districtId: input.districtId ?? address.districtId,
  };
}

function decodeTenantDocument(input: string): { content: Buffer; mimeType: string; extension: string } {
  const match = input.match(/^data:(application\/pdf|image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/);
  const encoded = match ? (match[2] ?? '') : input;
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded) || encoded.length % 4 !== 0) {
    throw new Error('Document must be valid base64 or a supported base64 data URL.');
  }
  const content = Buffer.from(encoded, 'base64');
  if (!content.length || content.length > 3 * 1024 * 1024) throw new Error('Document size must be between 1 byte and 3 MB.');
  let mimeType = '';
  let extension = '';
  if (content.subarray(0, 5).toString() === '%PDF-') { mimeType = 'application/pdf'; extension = 'pdf'; }
  else if (content.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) { mimeType = 'image/png'; extension = 'png'; }
  else if (content[0] === 0xff && content[1] === 0xd8 && content[2] === 0xff) { mimeType = 'image/jpeg'; extension = 'jpg'; }
  else if (content.subarray(0, 4).toString() === 'RIFF' && content.subarray(8, 12).toString() === 'WEBP') { mimeType = 'image/webp'; extension = 'webp'; }
  if (!mimeType) throw new Error('Only valid PDF, JPEG, PNG and WebP documents are supported.');
  if (match && match[1] !== mimeType) throw new Error('Declared document MIME type does not match its content.');
  return { content, mimeType, extension };
}

async function recordTenantAuditEvent(input: Record<string, unknown>): Promise<void> {
  try { await tenancyRepository.createTenantAuditEvent(input); }
  catch (error) {
    logger.error('Failed to persist tenant audit event', {
      error: error instanceof Error ? error.message : 'unknown',
      action: input.action,
      tenantId: input.tenantId,
    });
  }
}

export const tenancyService = {
  listTenantAuditEvents(tenantId: string, query: Record<string, any>) {
    const filter: Record<string, any> = { tenantId };
    if (query.actorId) filter.actorUserId = query.actorId;
    if (query.action) filter.action = query.action;
    if (query.targetType) filter.targetType = query.targetType;
    if (query.clinicId) filter.clinicId = query.clinicId;
    if (query.branchId) filter.branchId = query.branchId;
    if (query.from || query.to) filter.createdAt = {
      ...(query.from ? { $gte: query.from } : {}),
      ...(query.to ? { $lte: query.to } : {}),
    };
    return tenancyRepository.listTenantAuditEvents(filter, query.page, query.perPage);
  },
  async createTenantDocument(tenantId: string, userId: string, input: Record<string, any>) {
    const decoded = decodeTenantDocument(input.fileBase64);
    const storageKey = await storePrivateTenantDocument(tenantId, decoded.extension, decoded.content);
    try {
      const document = await tenancyRepository.createTenantDocument({
        tenantId,
        uploadedBy: userId,
        category: input.category,
        name: String(input.name).trim().replace(/[\\/\\r\\n\"\\\\]/g, '_'),
        mimeType: decoded.mimeType,
        sizeBytes: decoded.content.length,
        storageKey,
        expiresAt: input.expiresAt ?? null,
      });
      await recordTenantAuditEvent({ tenantId, actorUserId: userId, action: 'organization.document.uploaded', targetType: 'tenant_document', targetId: String(document._id), metadata: { category: input.category, mimeType: decoded.mimeType, sizeBytes: decoded.content.length } });
      return document;
    } catch (error) {
      await removePrivateTenantDocument(storageKey);
      throw error;
    }
  },
  listTenantDocuments(tenantId: string) {
    return tenancyRepository.listTenantDocuments(tenantId);
  },
  async getTenantDocument(tenantId: string, documentId: string) {
    const document = await tenancyRepository.findTenantDocument(tenantId, documentId);
    if (!document) return null;
    const content = await readPrivateTenantDocument(document.storageKey);
    return { document, content };
  },
  getTenantDocumentMetadata(tenantId: string, documentId: string) {
    return tenancyRepository.findTenantDocumentMetadata(tenantId, documentId);
  },
  archiveTenantDocument(tenantId: string, documentId: string, userId: string) {
    return tenancyRepository.archiveTenantDocument(tenantId, documentId, userId).then(async (item) => {
      if (item) await recordTenantAuditEvent({ tenantId, actorUserId: userId, action: 'organization.document.archived', targetType: 'tenant_document', targetId: documentId });
      return item;
    });
  },
  getProfile(tenantId: string) {
    return tenancyRepository.findTenantById(tenantId);
  },
  async updateProfile(tenantId: string, userId: string, input: Record<string, any>) {
    const current = await tenancyRepository.findTenantById(tenantId);
    if (!current) return null;
    const update: Record<string, any> = { ...input, updatedBy: userId };
    for (const key of ['contact', 'address', 'legal', 'preferences']) {
      if (input[key] && typeof input[key] === 'object' && !Array.isArray(input[key])) {
        const existing = current.get(key);
        update[key] = deepMerge(existing?.toObject?.() ?? existing ?? {}, input[key]);
      }
    }
    if (input.address) await geoService.validateClinicLocation(update.address);
    const oldBranding = current.get('branding')?.toObject?.() ?? current.get('branding') ?? {};
    let newLogoUrl = '';
    let newCoverUrl = '';
    if (input.branding) {
      const { logoBase64, coverImageBase64, ...brandingFields } = input.branding;
      update.branding = { ...oldBranding, ...brandingFields };
      try {
        if (logoBase64) {
          newLogoUrl = await storeBrandingLogo(logoBase64, 'tenants', tenantId);
          update.branding.logoUrl = newLogoUrl;
        }
        if (coverImageBase64) {
          newCoverUrl = await storeBrandingCover(coverImageBase64, 'tenants', tenantId);
          update.branding.coverImageUrl = newCoverUrl;
        }
      } catch (error) {
        await Promise.all([removeBrandingImage(newLogoUrl), removeBrandingImage(newCoverUrl)]);
        throw error;
      }
    }
    try {
      const updated = await tenancyRepository.updateTenant(tenantId, update);
      if (!updated) {
        await Promise.all([removeBrandingImage(newLogoUrl), removeBrandingImage(newCoverUrl)]);
        return null;
      }
      if (newLogoUrl && oldBranding.logoUrl) await removeBrandingImage(oldBranding.logoUrl);
      if (newCoverUrl && oldBranding.coverImageUrl) await removeBrandingImage(oldBranding.coverImageUrl);
      await recordTenantAuditEvent({ tenantId, actorUserId: userId, action: 'organization.profile.updated', targetType: 'tenant', targetId: tenantId, metadata: { changedFields: Object.keys(input) } });
      return updated;
    } catch (error) {
      await Promise.all([removeBrandingImage(newLogoUrl), removeBrandingImage(newCoverUrl)]);
      throw error;
    }
  },
  async updatePreferences(tenantId: string, userId: string, preferences: Record<string, any>) {
    const current = await tenancyRepository.findTenantById(tenantId);
    if (!current) return null;
    const existing = current.preferences?.toObject?.() ?? current.preferences ?? {};
    const updated = await tenancyRepository.updateTenant(tenantId, {
      preferences: deepMerge(existing, preferences),
      updatedBy: userId,
    });
    if (updated) await recordTenantAuditEvent({ tenantId, actorUserId: userId, action: 'organization.preferences.updated', targetType: 'tenant', targetId: tenantId, metadata: { changedFields: Object.keys(preferences) } });
    return updated;
  },
  async getSubscriptionOverview(tenantId: string) {
    const subscription = await tenancyRepository.findSubscriptionByTenantId(tenantId);
    if (!subscription) return null;
    return {
      plan: subscription.plan,
      billingCycle: subscription.billingCycle,
      status: subscription.status,
      trialEndsAt: subscription.trialEndsAt,
      currentPeriodEndsAt: subscription.currentPeriodEndsAt,
      nextBillingAt: subscription.nextBillingAt,
      cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
    };
  },
  async getTenantSubscription(tenantId: string) {
    const item = await tenancyRepository.findSubscriptionByTenantId(tenantId);
    if (!item) return null;
    return {
      id: String(item._id),
      plan: item.plan,
      billingCycle: item.billingCycle,
      status: item.status,
      trialStartsAt: item.trialStartsAt,
      trialEndsAt: item.trialEndsAt,
      currentPeriodStartsAt: item.currentPeriodStartsAt,
      currentPeriodEndsAt: item.currentPeriodEndsAt,
      nextBillingAt: item.nextBillingAt,
      cancelAtPeriodEnd: item.cancelAtPeriodEnd,
      canceledAt: item.canceledAt,
    };
  },
  async getTenantSubscriptionUsage(tenantId: string) {
    const [counts, subscription] = await Promise.all([
      tenancyRepository.getDashboardCounts(tenantId),
      tenancyRepository.findSubscriptionByTenantId(tenantId),
    ]);
    return {
      plan: subscription ? { code: subscription.plan?.code, name: subscription.plan?.name } : null,
      usage: {
        clinics: counts.clinics.total,
        branches: counts.branches.total,
        activeMembers: counts.activeMembers,
        pendingInvitations: counts.pendingInvitations,
      },
      limits: null,
      limitsAvailable: false,
      limitsMessage: 'Plan entitlements are not yet represented in the current subscription schema.',
    };
  },
  listTenantInvoices(tenantId: string) {
    return tenancyRepository.listTenantInvoices(tenantId);
  },
  getTenantInvoice(tenantId: string, invoiceId: string) {
    return tenancyRepository.findTenantInvoice(tenantId, invoiceId);
  },
  getDashboardCounts(tenantId: string) {
    return tenancyRepository.getDashboardCounts(tenantId);
  },
  listDashboardClinics(tenantId: string) {
    return tenancyRepository.listDashboardClinics(tenantId);
  },
  getContext(context: { tenantId: string; clinicId: string | null; branchId: string | null }) {
    return tenancyRepository.getTenantContext(context.tenantId, context.clinicId, context.branchId);
  },
  listClinics(tenantId: string) { return tenancyRepository.listClinics(tenantId); },
  getClinic(id: string, tenantId: string) { return tenancyRepository.findClinicById(id, tenantId); },
  listGeo(resource: GeoResource, query: { page: number; per_page: number; search?: string; country_id?: string; governorate_id?: string; city_id?: string }) {
    return geoService.listForClinic(resource, query);
  },
  async createClinic(input: Record<string, any>, tenantId: string, userId?: string) {
    const location = locationFrom(input);
    await geoService.validateClinicLocation(location);
    const name = String(input.name);
    const slug = await generateUniqueClinicSlug(tenantId, name);
    const address = { ...(input.address ?? {}), ...location };
    const { logoBase64, coverImageBase64, ...branding } = input.branding ?? {};
    const clinic = await tenancyRepository.createClinic({ ...input, branding, preferences: deepMerge(DEFAULT_CLINIC_PREFERENCES, input.preferences), bookingSettings: deepMerge(DEFAULT_BOOKING_SETTINGS, input.bookingSettings), settings: deepMerge({}, input.settings), address, ...location, name, slug, tenantId });
    let logoUrl = '';
    let coverUrl = '';
    try {
      if (logoBase64) {
        logoUrl = await storeBrandingLogo(logoBase64, 'clinics', String(clinic._id));
        clinic.set('branding.logoUrl', logoUrl);
      }
      if (coverImageBase64) {
        coverUrl = await storeBrandingCover(coverImageBase64, 'clinics', String(clinic._id));
        clinic.set('branding.coverImageUrl', coverUrl);
      }
      if (logoUrl || coverUrl) await clinic.save();
    } catch (error) {
      await Promise.all([removeBrandingImage(logoUrl), removeBrandingImage(coverUrl), tenancyRepository.deleteClinic(String(clinic._id), tenantId)]);
      throw error;
    }
    if (userId) await recordTenantAuditEvent({ tenantId, actorUserId: userId, action: 'clinic.created', targetType: 'clinic', targetId: String(clinic._id), metadata: { name: clinic.name } });
    return clinic;
  },
  async updateClinic(id: string, input: Record<string, any>, tenantId: string, userId?: string) {
    const current = await tenancyRepository.findClinicById(id, tenantId);
    if (!current) return null;
    const currentData = current.toObject();
    const update: Record<string, any> = { ...input };
    let newLogoUrl = '';
    let newCoverUrl = '';
    const oldLogoUrl = currentData.branding?.logoUrl ?? '';
    const oldCoverUrl = currentData.branding?.coverImageUrl ?? '';
    try {
    for (const key of ['address', 'contact', 'branding', 'preferences', 'bookingSettings', 'settings']) {
      if (input[key] && typeof input[key] === 'object' && !Array.isArray(input[key])) {
        const existingValue = currentData[key]?.toObject?.() ?? currentData[key] ?? {};
        if (key === 'branding') {
          const { logoBase64, coverImageBase64, ...brandingFields } = input.branding;
          update.branding = { ...existingValue, ...brandingFields };
          if (logoBase64) {
            newLogoUrl = await storeBrandingLogo(logoBase64, 'clinics', id);
            update.branding.logoUrl = newLogoUrl;
          }
          if (coverImageBase64) {
            newCoverUrl = await storeBrandingCover(coverImageBase64, 'clinics', id);
            update.branding.coverImageUrl = newCoverUrl;
          }
        } else update[key] = deepMerge(existingValue, input[key]);
      }
    }
    } catch (error) {
      await Promise.all([removeBrandingImage(newLogoUrl), removeBrandingImage(newCoverUrl)]);
      throw error;
    }
    let updated: Awaited<ReturnType<typeof tenancyRepository.updateClinic>>;
    try {
      const locationChanged = ['countryId', 'governorateId', 'cityId', 'districtId'].some((key) => key in input)
        || Boolean(input.address && ['countryId', 'governorateId', 'cityId', 'districtId'].some((key) => key in input.address));
      if (locationChanged) {
        const mergedLocation = {
          countryId: input.countryId ?? input.address?.countryId ?? currentData.countryId ?? currentData.address?.countryId,
          governorateId: input.governorateId ?? input.address?.governorateId ?? currentData.governorateId ?? currentData.address?.governorateId,
          cityId: input.cityId ?? input.address?.cityId ?? currentData.cityId ?? currentData.address?.cityId,
          districtId: input.districtId ?? input.address?.districtId ?? currentData.districtId ?? currentData.address?.districtId,
        };
        await geoService.validateClinicLocation(mergedLocation);
        const existingAddress = currentData.address?.toObject?.() ?? currentData.address ?? {};
        update.address = { ...existingAddress, ...(input.address ?? {}), ...mergedLocation };
        Object.assign(update, mergedLocation);
      }
      if (typeof input.name === 'string') update.slug = await generateUniqueClinicSlug(tenantId, input.name, id);
      updated = await tenancyRepository.updateClinic(id, tenantId, update);
    } catch (error) {
      await Promise.all([removeBrandingImage(newLogoUrl), removeBrandingImage(newCoverUrl)]);
      throw error;
    }
    if (!updated) { await Promise.all([removeBrandingImage(newLogoUrl), removeBrandingImage(newCoverUrl)]); return null; }
    if (newLogoUrl && oldLogoUrl && oldLogoUrl !== newLogoUrl) await removeBrandingImage(oldLogoUrl);
    if (newCoverUrl && oldCoverUrl && oldCoverUrl !== newCoverUrl) await removeBrandingImage(oldCoverUrl);
    if (userId) await recordTenantAuditEvent({ tenantId, actorUserId: userId, action: input.status ? 'clinic.status.changed' : 'clinic.updated', targetType: 'clinic', targetId: id, metadata: { changedFields: Object.keys(input), ...(input.status ? { status: input.status } : {}) } });
    return updated;
  },
  async listBranchHolidays(tenantId: string, clinicId: string, branchId: string) {
    const branch = await tenancyRepository.findBranchById(branchId, tenantId, clinicId);
    if (!branch) return null;
    return tenancyRepository.listBranchHolidays({ tenantId, clinicId, branchId });
  },
  async createBranchHoliday(tenantId: string, clinicId: string, branchId: string, userId: string, input: Record<string, any>) {
    const branch = await tenancyRepository.findBranchById(branchId, tenantId, clinicId);
    if (!branch) return null;
    const startDate = new Date(`${input.startDate}T00:00:00.000Z`);
    const endDate = new Date(`${input.endDate}T00:00:00.000Z`);
    if (startDate > endDate) throw { status: 400, code: 'INVALID_DATE_RANGE', message: 'endDate must be on or after startDate.' };
    const scope = { tenantId, clinicId, branchId };
    const overlap = await tenancyRepository.findOverlappingBranchHoliday(scope, startDate, endDate);
    if (overlap) throw { status: 409, code: 'BRANCH_HOLIDAY_OVERLAP', message: 'This date range overlaps an existing active holiday or closure.' };
    const holiday = await tenancyRepository.createBranchHoliday({
      ...input,
      tenantId,
      clinicId,
      branchId,
      createdBy: userId,
      startDate,
      endDate,
    });
    await recordTenantAuditEvent({ tenantId, actorUserId: userId, action: 'branch.holiday.created', targetType: 'branch_holiday', targetId: String(holiday._id), clinicId, branchId, metadata: { type: input.type, startDate: input.startDate, endDate: input.endDate } });
    return holiday;
  },
  async cancelBranchHoliday(tenantId: string, clinicId: string, branchId: string, holidayId: string, userId: string) {
    const branch = await tenancyRepository.findBranchById(branchId, tenantId, clinicId);
    if (!branch) return null;
    const holiday = await tenancyRepository.cancelBranchHoliday(tenantId, clinicId, branchId, holidayId, userId);
    if (holiday) await recordTenantAuditEvent({ tenantId, actorUserId: userId, action: 'branch.holiday.cancelled', targetType: 'branch_holiday', targetId: holidayId, clinicId, branchId });
    return holiday;
  },
  listBranches(tenantId: string, clinicId: string, branchId: string | null) {
    return tenancyRepository.listBranches({ tenantId, clinicId, ...(branchId ? { _id: branchId } : {}) });
  },
  getBranch(id: string, tenantId: string, clinicId: string) {
    return tenancyRepository.findBranchById(id, tenantId, clinicId);
  },
  async createBranch(input: Record<string, any>, tenantId: string, clinicId: string, userId?: string) {
    const clinic = await tenancyRepository.findClinicById(clinicId, tenantId);
    if (!clinic) return null;
    await geoService.validateCity(input.cityId ?? null);
    const base = slugify(String(input.slug || input.name), 'branch');
    let slug = base;
    let suffix = 2;
    while (await tenancyRepository.findBranchBySlug(tenantId, clinicId, slug)) {
      slug = `${base}-${suffix++}`;
    }
    const branch = await tenancyRepository.createBranch({
      ...input,
      slug,
      timezone: input.timezone || clinic.timezone || clinic.preferences?.timezone || 'Africa/Cairo',
      tenantId,
      clinicId,
    });
    if (userId) await recordTenantAuditEvent({ tenantId, actorUserId: userId, action: 'branch.created', targetType: 'branch', targetId: String(branch._id), clinicId, metadata: { name: branch.name } });
    return branch;
  },
  async updateBranch(id: string, input: Record<string, any>, tenantId: string, clinicId: string, userId?: string) {
    const current = await tenancyRepository.findBranchById(id, tenantId, clinicId);
    if (!current) return null;
    const update: Record<string, unknown> = { ...input };
    if ('cityId' in input) await geoService.validateCity(input.cityId ?? null);
    if (typeof input.slug === 'string' || (typeof input.name === 'string' && input.name !== current.name)) {
      const base = slugify(String(input.slug || input.name), 'branch');
      let candidate = base;
      let suffix = 2;
      while (await tenancyRepository.findBranchBySlug(tenantId, clinicId, candidate, id)) {
        candidate = `${base}-${suffix++}`;
      }
      update.slug = candidate;
    }
    const branch = await tenancyRepository.updateBranch(id, tenantId, clinicId, update);
    if (branch && userId) await recordTenantAuditEvent({ tenantId, actorUserId: userId, action: input.status ? 'branch.status.changed' : 'branch.updated', targetType: 'branch', targetId: id, clinicId, metadata: { changedFields: Object.keys(input), ...(input.status ? { status: input.status } : {}) } });
    return branch;
  },
};
