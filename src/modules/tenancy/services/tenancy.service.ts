import { createHash, randomBytes } from 'node:crypto';
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
  async createTenantInvitation(tenantId: string, userId: string, actorRole: string, input: { email: string; role: string; scope: 'tenant' | 'clinic' | 'branch'; clinicId?: string; branchIds?: string[]; expiresInDays?: number }) {
    const grantableByOwner = ['tenant_admin', 'billing_admin', 'clinic_admin', 'clinic_manager', 'branch_manager', 'staff', 'provider', 'receptionist'];
    const grantableByAdmin = ['billing_admin', 'clinic_admin', 'clinic_manager', 'branch_manager', 'staff', 'provider', 'receptionist'];
    const grantable = actorRole === 'tenant_owner' ? grantableByOwner : actorRole === 'tenant_admin' ? grantableByAdmin : [];
    if (!grantable.includes(input.role)) throw { status: 403, code: 'ROLE_GRANT_FORBIDDEN', message: 'You cannot invite a user with this role.' };
    const scopeRoles: Record<string, string[]> = {
      tenant: ['tenant_admin', 'billing_admin'],
      clinic: ['clinic_admin', 'clinic_manager', 'staff', 'provider', 'receptionist'],
      branch: ['branch_manager', 'staff', 'provider', 'receptionist'],
    };
    if (!scopeRoles[input.scope]?.includes(input.role)) throw { status: 400, code: 'INVITATION_SCOPE_INVALID', message: 'The selected role is not valid for this membership scope.' };
    if (input.scope === 'tenant' && (input.clinicId || (input.branchIds?.length ?? 0))) throw { status: 400, code: 'INVITATION_SCOPE_INVALID', message: 'Tenant-wide invitations cannot include clinic or branch scopes.' };
    if (input.scope !== 'tenant' && !input.clinicId) throw { status: 400, code: 'CLINIC_REQUIRED', message: 'A clinic is required for clinic- or branch-scoped invitations.' };
    if (input.scope === 'clinic' && (input.branchIds?.length ?? 0)) throw { status: 400, code: 'INVITATION_SCOPE_INVALID', message: 'Clinic-scoped invitations cannot include branch IDs.' };
    if (input.scope === 'branch' && !(input.branchIds?.length)) throw { status: 400, code: 'BRANCH_REQUIRED', message: 'At least one branch is required for branch-scoped invitations.' };
    if (input.clinicId && !await tenancyRepository.findActiveClinic(input.clinicId, tenantId)) return null;
    for (const branchId of input.branchIds ?? []) {
      if (!input.clinicId || !await tenancyRepository.findActiveBranch(branchId, tenantId, input.clinicId)) throw { status: 400, code: 'BRANCH_SCOPE_INVALID', message: 'Every selected branch must be active and belong to the selected clinic and tenant.' };
    }
    const email = input.email.trim().toLowerCase();
    await tenancyRepository.expirePendingTenantInvitations(tenantId, email, new Date());
    const pending = await tenancyRepository.findPendingTenantInvitation(tenantId, email);
    if (pending) throw { status: 409, code: 'INVITATION_ALREADY_PENDING', message: 'An active invitation already exists for this email.' };
    const token = randomBytes(32).toString('base64url');
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const expiresAt = new Date(Date.now() + (input.expiresInDays ?? 7) * 24 * 60 * 60 * 1000);
    const invitation = await tenancyRepository.createTenantInvitation({
      tenantId, email, role: input.role, scope: input.scope, clinicId: input.clinicId ?? null,
      branchIds: input.branchIds ?? [], invitedBy: userId, tokenHash, status: 'pending', expiresAt,
    });
    await recordTenantAuditEvent({ tenantId, actorUserId: userId, action: 'membership.invitation.created', targetType: 'tenant_invitation', targetId: String(invitation._id), clinicId: input.clinicId, metadata: { email, role: input.role, scope: input.scope } });
    return {
      invitation: { id: String(invitation._id), email, role: invitation.role, scope: invitation.scope, clinicId: invitation.clinicId, branchIds: invitation.branchIds, status: invitation.status, expiresAt: invitation.expiresAt },
      invitationToken: token,
      acceptanceEndpoint: '/auth/invitations/accept',
      delivery: 'manual',
    };
  },
  async listTenantInvitations(tenantId: string, query: { search?: string; status?: string; page: number; perPage: number }) {
    const result = await tenancyRepository.listTenantInvitations(tenantId, query);
    return { ...result, items: result.items.map((item: any) => ({ ...item, status: item.status === 'pending' && new Date(item.expiresAt).getTime() <= Date.now() ? 'expired' : item.status })) };
  },
  async revokeTenantInvitation(tenantId: string, invitationId: string, userId: string) {
    const invitation = await tenancyRepository.findTenantInvitationById(tenantId, invitationId);
    if (!invitation || invitation.status !== 'pending') return null;
    const updated = await tenancyRepository.updateTenantInvitation(tenantId, invitationId, { status: 'revoked', revokedAt: new Date(), revokedBy: userId });
    if (updated) await recordTenantAuditEvent({ tenantId, actorUserId: userId, action: 'membership.invitation.revoked', targetType: 'tenant_invitation', targetId: invitationId, metadata: { email: invitation.email } });
    return updated;
  },
  async resendTenantInvitation(tenantId: string, invitationId: string, userId: string) {
    const invitation = await tenancyRepository.findTenantInvitationById(tenantId, invitationId);
    if (!invitation || !['pending', 'expired'].includes(invitation.status)) return null;
    const token = randomBytes(32).toString('base64url');
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const updated = await tenancyRepository.updateTenantInvitation(tenantId, invitationId, {
      tokenHash, status: 'pending', expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), revokedAt: null, revokedBy: null,
    });
    if (!updated) return null;
    await recordTenantAuditEvent({ tenantId, actorUserId: userId, action: 'membership.invitation.resent', targetType: 'tenant_invitation', targetId: invitationId, metadata: { email: invitation.email } });
    return { invitation: updated, invitationToken: token, acceptanceEndpoint: '/auth/invitations/accept', delivery: 'manual' };
  },
  async getTenantUserEffectiveAccess(tenantId: string, userId: string) {
    if (!/^[a-f\\d]{24}$/i.test(userId)) return null;
    const memberships = await tenancyRepository.listMembershipsForUser(tenantId, userId);
    if (!memberships.length) return null;
    return {
      userId,
      memberships: memberships.map((membership: any) => ({
        membershipId: String(membership._id),
        status: membership.status,
        role: membership.role,
        scope: membership.scope,
        clinic: membership.clinicId,
        branches: membership.branchIds ?? [],
        permissions: membership.status === 'active' ? getTenantRolePermissions(membership.role) : [],
        permissionSource: 'built_in_role',
      })),
    };
  },
  listTenantMemberships(tenantId: string, query: { search?: string; status?: string; role?: string; scope?: string; clinicId?: string; page: number; perPage: number }) {
    return tenancyRepository.listTenantMemberships(tenantId, query);
  },
  async updateTenantMembership(tenantId: string, membershipId: string, actorUserId: string, actorRole: string, input: Record<string, any>) {
    const current = await tenancyRepository.findTenantMembershipById(tenantId, membershipId);
    if (!current) return null;
    if (String(current.userId) === actorUserId) throw { status: 403, code: 'SELF_MEMBERSHIP_CHANGE_DENIED', message: 'You cannot change your own membership role, scope or status.' };
    if (actorRole !== 'tenant_owner' && current.scope === 'tenant') throw { status: 403, code: 'MEMBERSHIP_MANAGEMENT_DENIED', message: 'Only the Tenant Owner can manage tenant-wide memberships.' };
    const next = {
      role: input.role ?? current.role,
      scope: input.scope ?? current.scope,
      clinicId: input.clinicId === undefined ? (current.clinicId ? String(current.clinicId) : null) : input.clinicId,
      branchIds: input.branchIds === undefined ? (current.branchIds ?? []).map((id: unknown) => String(id)) : input.branchIds,
      status: input.status ?? current.status,
    };
    if (current.status === 'invited' && next.status === 'active') throw { status: 409, code: 'INVITATION_ACCEPTANCE_REQUIRED', message: 'An invited membership can only become active through the invitation acceptance flow.' };
    const tenantRoles = ['tenant_owner', 'tenant_admin', 'billing_admin'];
    const clinicRoles = ['clinic_admin', 'clinic_manager', 'staff', 'provider', 'receptionist'];
    const branchRoles = ['branch_manager', 'staff', 'provider', 'receptionist'];
    if (next.scope === 'tenant') {
      if (!tenantRoles.includes(next.role)) throw { status: 400, code: 'INVALID_ROLE_SCOPE', message: 'This role cannot be assigned at tenant scope.' };
      if (actorRole !== 'tenant_owner') throw { status: 403, code: 'TENANT_OWNER_REQUIRED', message: 'Only the Tenant Owner can assign tenant-wide roles.' };
      next.clinicId = null;
      next.branchIds = [];
    } else {
      if (!next.clinicId) throw { status: 400, code: 'CLINIC_REQUIRED', message: 'Clinic scope requires clinicId.' };
      if (!await tenancyRepository.findClinicById(next.clinicId, tenantId)) throw { status: 404, code: 'CLINIC_NOT_FOUND', message: 'Clinic not found in this tenant.' };
      if (next.scope === 'clinic') {
        if (!clinicRoles.includes(next.role)) throw { status: 400, code: 'INVALID_ROLE_SCOPE', message: 'This role cannot be assigned at clinic scope.' };
        next.branchIds = [];
      } else {
        if (!branchRoles.includes(next.role) || !next.branchIds.length) throw { status: 400, code: 'INVALID_ROLE_SCOPE', message: 'Branch scope requires a branch-compatible role and at least one branch.' };
        for (const branchId of next.branchIds) {
          if (!await tenancyRepository.findBranchById(branchId, tenantId, next.clinicId)) throw { status: 404, code: 'BRANCH_NOT_FOUND', message: 'A selected branch does not belong to the selected clinic.' };
        }
      }
    }
    const isDemotingLastOwner = current.scope === 'tenant' && current.role === 'tenant_owner' && current.status === 'active'
      && (next.scope !== 'tenant' || next.role !== 'tenant_owner' || next.status !== 'active');
    if (isDemotingLastOwner && await tenancyRepository.countActiveTenantOwners(tenantId) <= 1) {
      throw { status: 409, code: 'LAST_TENANT_OWNER_REQUIRED', message: 'The last active Tenant Owner cannot be demoted or suspended.' };
    }
    if (actorRole !== 'tenant_owner' && (next.scope === 'tenant' || next.role === 'tenant_owner' || next.role === 'tenant_admin')) {
      throw { status: 403, code: 'ROLE_GRANT_DENIED', message: 'Tenant Admin cannot grant tenant-wide or administrative roles.' };
    }
    const updated = await tenancyRepository.updateTenantMembership(tenantId, membershipId, { ...next, updatedBy: actorUserId });
    if (updated) await recordTenantAuditEvent({ tenantId, actorUserId, action: 'membership.updated', targetType: 'tenant_membership', targetId: membershipId, clinicId: next.clinicId, metadata: { role: next.role, scope: next.scope, status: next.status } });
    return updated;
  },
  async getTenantConfiguration(tenantId: string) {
    const configuration = await tenancyRepository.findTenantConfiguration(tenantId);
    return configuration ?? { tenantId, version: 0, values: {}, history: [] };
  },
  async updateTenantConfiguration(tenantId: string, userId: string, values: Record<string, any>) {
    const current = await tenancyRepository.findTenantConfiguration(tenantId);
    let updated;
    if (!current) {
      updated = await tenancyRepository.createTenantConfiguration({
        tenantId,
        version: 1,
        values,
        history: [{ version: 1, values, changedBy: userId, changedAt: new Date() }],
      });
    } else {
      updated = await tenancyRepository.updateTenantConfiguration(tenantId, current.version, deepMerge(current.values ?? {}, values), userId);
      if (!updated) throw { status: 409, code: 'CONFIGURATION_VERSION_CONFLICT', message: 'Organization configuration changed concurrently. Reload and retry.' };
    }
    await recordTenantAuditEvent({ tenantId, actorUserId: userId, action: 'configuration.defaults.updated', targetType: 'tenant_configuration', targetId: tenantId, metadata: { version: updated.version, changedKeys: Object.keys(values) } });
    return updated;
  },
  async previewTenantConfigurationApply(tenantId: string, input: { applyTo: 'all' | 'selected'; clinicIds?: string[] }) {
    const configuration = await tenancyRepository.findTenantConfiguration(tenantId);
    if (!configuration) return { version: 0, clinics: [], total: 0 };
    const clinics = await tenancyRepository.listClinicsForConfiguration(tenantId, input.applyTo === 'selected' ? input.clinicIds : undefined);
    if (input.applyTo === 'selected' && clinics.length !== (input.clinicIds?.length ?? 0)) {
      throw { status: 404, code: 'CLINIC_NOT_FOUND', message: 'One or more selected clinics do not belong to this tenant.' };
    }
    return {
      version: configuration.version,
      total: clinics.length,
      clinics: clinics.map((clinic: any) => {
        const settings = clinic.settings ?? {};
        const overrides = settings.organizationOverrides ?? {};
        return {
          clinicId: String(clinic._id),
          name: clinic.name,
          status: clinic.status,
          currentVersion: settings.organizationDefaultsVersion ?? 0,
          hasOverrides: Object.keys(overrides).length > 0,
          willUpdate: (settings.organizationDefaultsVersion ?? 0) < configuration.version,
          effectiveValues: deepMerge(configuration.values ?? {}, overrides),
        };
      }),
    };
  },
  async applyTenantConfiguration(tenantId: string, userId: string, input: { applyTo: 'all' | 'selected'; clinicIds?: string[]; confirm: boolean }) {
    if (!input.confirm) throw { status: 400, code: 'CONFIRMATION_REQUIRED', message: 'Set confirm=true after reviewing the preview.' };
    const configuration = await tenancyRepository.findTenantConfiguration(tenantId);
    if (!configuration) return { version: 0, updated: 0, skipped: 0 };
    const clinics = await tenancyRepository.listClinicsForConfiguration(tenantId, input.applyTo === 'selected' ? input.clinicIds : undefined);
    if (input.applyTo === 'selected' && clinics.length !== (input.clinicIds?.length ?? 0)) {
      throw { status: 404, code: 'CLINIC_NOT_FOUND', message: 'One or more selected clinics do not belong to this tenant.' };
    }
    let updated = 0;
    let skipped = 0;
    for (const clinic of clinics as any[]) {
      const currentVersion = clinic.settings?.organizationDefaultsVersion ?? 0;
      if (currentVersion >= configuration.version) { skipped += 1; continue; }
      const result = await tenancyRepository.applyTenantConfigurationToClinic(tenantId, String(clinic._id), configuration.values ?? {}, configuration.version);
      if (result) updated += 1;
      else skipped += 1;
    }
    await recordTenantAuditEvent({ tenantId, actorUserId: userId, action: 'configuration.defaults.applied', targetType: 'tenant_configuration', targetId: tenantId, metadata: { version: configuration.version, applyTo: input.applyTo, updated, skipped } });
    return { version: configuration.version, updated, skipped };
  },
  countExpiringTenantDocuments(tenantId: string, from: Date, to: Date) {
    return tenancyRepository.countExpiringTenantDocuments(tenantId, from, to);
  },
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
  async replaceTenantDocument(tenantId: string, documentId: string, userId: string, input: Record<string, any>) {
    const existing = await tenancyRepository.findTenantDocument(tenantId, documentId);
    if (!existing) return null;
    const decoded = decodeTenantDocument(input.fileBase64);
    const storageKey = await storePrivateTenantDocument(tenantId, decoded.extension, decoded.content);
    let replacement;
    try {
      replacement = await tenancyRepository.createTenantDocument({
        tenantId,
        uploadedBy: userId,
        category: existing.category,
        name: String(input.name ?? existing.name).trim().split('/').join('_').split(String.fromCharCode(92)).join('_').replaceAll('"', '_').replaceAll(String.fromCharCode(10), '_').replaceAll(String.fromCharCode(13), '_'),
        mimeType: decoded.mimeType,
        sizeBytes: decoded.content.length,
        storageKey,
        expiresAt: Object.prototype.hasOwnProperty.call(input, 'expiresAt') ? input.expiresAt : existing.expiresAt ?? null,
        version: (existing.version ?? 1) + 1,
        replacesDocumentId: existing._id,
      });
    } catch (error) {
      await removePrivateTenantDocument(storageKey);
      throw error;
    }
    const archived = await tenancyRepository.archiveTenantDocument(tenantId, documentId, userId);
    if (!archived) {
      await tenancyRepository.archiveTenantDocument(tenantId, String(replacement._id), userId);
      await removePrivateTenantDocument(storageKey);
      throw { status: 409, code: 'DOCUMENT_REPLACEMENT_CONFLICT', message: 'The original document changed while the replacement was being saved.' };
    }
    await recordTenantAuditEvent({ tenantId, actorUserId: userId, action: 'organization.document.replaced', targetType: 'tenant_document', targetId: documentId, metadata: { replacementDocumentId: String(replacement._id), version: replacement.version } });
    return replacement;
  },
  async createTenantDocument(tenantId: string, userId: string, input: Record<string, any>) {
    const decoded = decodeTenantDocument(input.fileBase64);
    const storageKey = await storePrivateTenantDocument(tenantId, decoded.extension, decoded.content);
    try {
      const document = await tenancyRepository.createTenantDocument({
        tenantId,
        uploadedBy: userId,
        category: input.category,
        name: String(input.name).trim().split('/').join('_').split(String.fromCharCode(92)).join('_').replaceAll('"', '_').replaceAll(String.fromCharCode(10), '_').replaceAll(String.fromCharCode(13), '_'),
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
  async getProfile(tenantId: string) {
    const tenant = await tenancyRepository.findTenantById(tenantId);
    if (!tenant) return null;
    const data = tenant.toObject?.() ?? tenant;
    return {
      _id: data._id,
      name: data.name,
      displayName: data.displayName,
      legalName: data.legalName,
      businessType: data.businessType,
      description: data.description,
      industry: data.industry,
      slug: data.slug,
      status: data.status,
      contact: data.contact,
      address: data.address,
      legal: data.legal,
      branding: data.branding,
      preferences: data.preferences,
      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
    };
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
  listClinics(tenantId: string, query: { search?: string; status?: string; page: number; perPage: number }) { return tenancyRepository.listClinics(tenantId, query); },
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
    const configuration = await tenancyRepository.findTenantConfiguration(tenantId);
    const providedSettings = { ...(input.settings ?? {}) };
    delete providedSettings.organizationDefaults;
    delete providedSettings.organizationDefaultsVersion;
    delete providedSettings.organizationOverrides;
    const settings = deepMerge({ organizationDefaults: configuration?.values ?? {}, organizationDefaultsVersion: configuration?.version ?? 0 }, providedSettings);
    const clinic = await tenancyRepository.createClinic({ ...input, branding, preferences: deepMerge(DEFAULT_CLINIC_PREFERENCES, input.preferences), bookingSettings: deepMerge(DEFAULT_BOOKING_SETTINGS, input.bookingSettings), settings, address, ...location, name, slug, tenantId });
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
    if (userId) await recordTenantAuditEvent({ tenantId, actorUserId: userId, action: 'clinic.created', targetType: 'clinic', targetId: String(clinic._id), clinicId: String(clinic._id), metadata: { name: clinic.name } });
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
    if (userId) await recordTenantAuditEvent({ tenantId, actorUserId: userId, action: input.status ? 'clinic.status.changed' : 'clinic.updated', targetType: 'clinic', targetId: id, clinicId: id, metadata: { changedFields: Object.keys(input), ...(input.status ? { status: input.status } : {}) } });
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
  async listClinicBranches(tenantId: string, clinicId: string, branchId: string | null, query: { search?: string; status?: string; page: number; perPage: number }) {
    const clinic = await tenancyRepository.findClinicById(clinicId, tenantId);
    if (!clinic) return null;
    return tenancyRepository.listBranches({ tenantId, clinicId, ...(branchId ? { _id: branchId } : {}) }, query);
  },
  listBranches(tenantId: string, clinicId: string, branchId: string | null, query: { search?: string; status?: string; page: number; perPage: number } = { page: 1, perPage: 25 }) {
    return tenancyRepository.listBranches({ tenantId, clinicId, ...(branchId ? { _id: branchId } : {}) }, query);
  },
  getBranch(id: string, tenantId: string, clinicId: string) {
    return tenancyRepository.findBranchById(id, tenantId, clinicId);
  },
  async getClinicSettings(tenantId: string, clinicId: string) {
    const clinic = await tenancyRepository.findClinicById(clinicId, tenantId);
    if (!clinic) return null;
    const settings = clinic.settings?.toObject?.() ?? clinic.settings ?? {};
    const defaults = settings.organizationDefaults ?? {};
    const overrides = settings.organizationOverrides ?? {};
    return {
      defaults,
      overrides,
      effectiveValues: deepMerge(defaults, overrides),
      inheritedVersion: settings.organizationDefaultsVersion ?? 0,
      overrideKeys: Object.keys(overrides),
    };
  },
  async updateClinicSettings(tenantId: string, clinicId: string, userId: string, overrides: Record<string, any>) {
    const clinic = await tenancyRepository.findClinicById(clinicId, tenantId);
    if (!clinic) return null;
    const settings = clinic.settings?.toObject?.() ?? clinic.settings ?? {};
    const mergedOverrides = deepMerge(settings.organizationOverrides ?? {}, overrides);
    const updated = await tenancyRepository.updateClinic(clinicId, tenantId, {
      settings: { ...settings, organizationOverrides: mergedOverrides },
      updatedBy: userId,
    });
    if (updated) await recordTenantAuditEvent({ tenantId, actorUserId: userId, action: 'clinic.settings.overridden', targetType: 'clinic', targetId: clinicId, clinicId, metadata: { changedKeys: Object.keys(overrides) } });
    const updatedSettings = updated?.settings?.toObject?.() ?? updated?.settings ?? {};
    if (!updated) return null;
    return {
      defaults: updatedSettings.organizationDefaults ?? {},
      overrides: updatedSettings.organizationOverrides ?? {},
      effectiveValues: deepMerge(updatedSettings.organizationDefaults ?? {}, updatedSettings.organizationOverrides ?? {}),
      inheritedVersion: updatedSettings.organizationDefaultsVersion ?? 0,
      overrideKeys: Object.keys(updatedSettings.organizationOverrides ?? {}),
    };
  },
  async getBranchSettings(tenantId: string, clinicId: string, branchId: string) {
    const branch = await tenancyRepository.findBranchById(branchId, tenantId, clinicId);
    if (!branch) return null;
    const clinic = await tenancyRepository.findClinicById(clinicId, tenantId);
    const clinicSettings = clinic?.settings?.toObject?.() ?? clinic?.settings ?? {};
    const branchSettings = branch.settings?.toObject?.() ?? branch.settings ?? {};
    const inheritedValues = deepMerge(clinicSettings.organizationDefaults ?? {}, clinicSettings.organizationOverrides ?? {});
    const overrides = branchSettings.organizationOverrides ?? {};
    return {
      inheritedValues,
      overrides,
      effectiveValues: deepMerge(inheritedValues, overrides),
      inheritedVersion: clinicSettings.organizationDefaultsVersion ?? 0,
      timezone: branch.timezone,
      operatingHours: branch.operatingHours ?? [],
    };
  },
  async updateBranchSettings(tenantId: string, clinicId: string, branchId: string, userId: string, settings: Record<string, any>) {
    const branch = await tenancyRepository.findBranchById(branchId, tenantId, clinicId);
    if (!branch) return null;
    const clinic = await tenancyRepository.findClinicById(clinicId, tenantId);
    if (!clinic) return null;
    const currentSettings = branch.settings?.toObject?.() ?? branch.settings ?? {};
    const mergedOverrides = deepMerge(currentSettings.organizationOverrides ?? {}, settings);
    const updated = await tenancyRepository.updateBranch(branchId, tenantId, clinicId, {
      settings: { ...currentSettings, organizationOverrides: mergedOverrides },
      updatedBy: userId,
    });
    if (updated) await recordTenantAuditEvent({ tenantId, actorUserId: userId, action: 'branch.settings.overridden', targetType: 'branch', targetId: branchId, clinicId, metadata: { changedKeys: Object.keys(settings) } });
    if (!updated) return null;
    const updatedSettings = updated.settings?.toObject?.() ?? updated.settings ?? {};
    const clinicSettings = clinic.settings?.toObject?.() ?? clinic.settings ?? {};
    const inheritedValues = deepMerge(clinicSettings.organizationDefaults ?? {}, clinicSettings.organizationOverrides ?? {});
    const branchOverrides = updatedSettings.organizationOverrides ?? {};
    return {
      inheritedValues,
      overrides: branchOverrides,
      effectiveValues: deepMerge(inheritedValues, branchOverrides),
      inheritedVersion: clinicSettings.organizationDefaultsVersion ?? 0,
      timezone: updated.timezone,
      operatingHours: updated.operatingHours ?? [],
    };
  },
  async createBranch(input: Record<string, any>, tenantId: string, clinicId: string, userId?: string) {
    const clinic = await tenancyRepository.findClinicById(clinicId, tenantId);
    if (!clinic) return null;
    const addressDetails = input.addressDetails ?? {};
    if (input.cityId && addressDetails.cityId && String(input.cityId) !== String(addressDetails.cityId)) throw { status: 400, code: 'BRANCH_CITY_MISMATCH', message: 'cityId and addressDetails.cityId must match.' };
    await geoService.validateCity(input.cityId ?? addressDetails.cityId ?? null);
    if (Object.keys(addressDetails).length) await geoService.validateClinicLocation(addressDetails);
    if (input.code && await tenancyRepository.findBranchByCode(clinicId, input.code)) throw { status: 409, code: 'BRANCH_CODE_EXISTS', message: 'Branch code already exists in this clinic.' };
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
      cityId: input.cityId ?? addressDetails.cityId ?? null,
      addressDetails,
      createdBy: userId ?? null,
      tenantId,
      clinicId,
    });
    if (userId) await recordTenantAuditEvent({ tenantId, actorUserId: userId, action: 'branch.created', targetType: 'branch', targetId: String(branch._id), clinicId, metadata: { name: branch.name } });
    return branch;
  },
  async updateBranch(id: string, input: Record<string, any>, tenantId: string, clinicId: string, userId?: string) {
    const current = await tenancyRepository.findBranchById(id, tenantId, clinicId);
    if (!current) return null;
    const update: Record<string, unknown> = { ...input, ...(userId ? { updatedBy: userId } : {}) };
    if ('cityId' in input) await geoService.validateCity(input.cityId ?? null);
    else if (input.addressDetails?.cityId) update.cityId = input.addressDetails.cityId;
    if (input.addressDetails) await geoService.validateClinicLocation(input.addressDetails);
    if (input.cityId && input.addressDetails?.cityId && String(input.cityId) !== String(input.addressDetails.cityId)) throw { status: 400, code: 'BRANCH_CITY_MISMATCH', message: 'cityId and addressDetails.cityId must match.' };
    if (typeof input.code === 'string' && await tenancyRepository.findBranchByCode(clinicId, input.code, id)) throw { status: 409, code: 'BRANCH_CODE_EXISTS', message: 'Branch code already exists in this clinic.' };
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
