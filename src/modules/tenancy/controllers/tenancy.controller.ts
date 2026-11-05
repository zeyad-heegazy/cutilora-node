import type { Request, Response, NextFunction } from 'express';
import { tenancyService } from '../services/tenancy.service.js';
import { getTenantRoleCatalog, getTenantRolePermissions } from '../middleware/tenant-permissions.js';
import { createBranchSchema, createClinicSchema, updateBranchSchema, updateClinicSchema, updateTenantSchema, updateTenantPreferencesSchema, createTenantDocumentSchema, createBranchHolidaySchema, tenantAuditQuerySchema, updateTenantConfigurationSchema, previewTenantConfigurationApplySchema, applyTenantConfigurationSchema, updateTenantMembershipSchema, updateBranchSettingsSchema, updateClinicSettingsSchema, clinicListQuerySchema, branchListQuerySchema, replaceTenantDocumentSchema, createTenantInvitationSchema, tenantUserListQuerySchema, tenantInvitationListQuerySchema, updateBranchOperatingHoursSchema, branchLifecycleReasonSchema } from '../validations/tenancy.validation.js';
import { clinicGeoListSchema, geoResourceSchema } from '../../geo/validations/geo.validation.js';

export const tenancyController = {
  async getProfile(req: Request, res: Response, next: NextFunction) {
    try {
      const item = await tenancyService.getProfile(req.tenantContext!.tenantId);
      if (!item) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Tenant profile not found.' } });
      res.json({ success: true, data: item });
    } catch (e) { next(e); }
  },
  async updateProfile(req: Request, res: Response, next: NextFunction) {
    try {
      const input = updateTenantSchema.parse(req.body);
      if (req.tenantContext!.role !== 'tenant_owner' && ('legalName' in input || 'legal' in input)) {
        return res.status(403).json({ success: false, error: { code: 'LEGAL_PROFILE_PERMISSION_REQUIRED', message: 'Only the Tenant Owner can change legal identity details.' } });
      }
      const item = await tenancyService.updateProfile(req.tenantContext!.tenantId, req.auth!.userId, input);
      if (!item) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Tenant profile not found.' } });
      res.json({ success: true, data: item });
    } catch (e) { next(e); }
  },
  async getPreferences(req: Request, res: Response, next: NextFunction) {
    try {
      const item = await tenancyService.getProfile(req.tenantContext!.tenantId);
      if (!item) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Tenant profile not found.' } });
      res.json({ success: true, data: item.preferences });
    } catch (e) { next(e); }
  },
  async updatePreferences(req: Request, res: Response, next: NextFunction) {
    try {
      const input = updateTenantPreferencesSchema.parse(req.body);
      if (!input.preferences) return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Preferences are required.' } });
      const item = await tenancyService.updatePreferences(req.tenantContext!.tenantId, req.auth!.userId, input.preferences);
      if (!item) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Tenant profile not found.' } });
      res.json({ success: true, data: item.preferences });
    } catch (e) { next(e); }
  },
  async listTenantInvitations(req: Request, res: Response, next: NextFunction) {
    try {
      const query = tenantInvitationListQuerySchema.parse(req.query);
      const result = await tenancyService.listTenantInvitations(req.tenantContext!.tenantId, query);
      res.json({ success: true, data: result.items, pagination: result.pagination });
    } catch (e) { next(e); }
  },
  async createTenantInvitation(req: Request, res: Response, next: NextFunction) {
    try {
      const input = createTenantInvitationSchema.parse(req.body);
      const result = await tenancyService.createTenantInvitation(req.tenantContext!.tenantId, req.auth!.userId, req.tenantContext!.role, input);
      if (!result) return res.status(404).json({ success: false, error: { code: 'CLINIC_NOT_FOUND', message: 'The selected clinic does not belong to this tenant.' } });
      res.status(201).json({ success: true, data: result });
    } catch (e) { next(e); }
  },
  async revokeTenantInvitation(req: Request, res: Response, next: NextFunction) {
    try {
      const item = await tenancyService.revokeTenantInvitation(req.tenantContext!.tenantId, String(req.params.invitationId ?? ''), req.auth!.userId);
      if (!item) return res.status(404).json({ success: false, error: { code: 'INVITATION_NOT_FOUND', message: 'Pending invitation not found.' } });
      res.json({ success: true, data: item });
    } catch (e) { next(e); }
  },
  async resendTenantInvitation(req: Request, res: Response, next: NextFunction) {
    try {
      const item = await tenancyService.resendTenantInvitation(req.tenantContext!.tenantId, String(req.params.invitationId ?? ''), req.auth!.userId);
      if (!item) return res.status(404).json({ success: false, error: { code: 'INVITATION_NOT_FOUND', message: 'Pending or expired invitation not found.' } });
      res.json({ success: true, data: item });
    } catch (e) { next(e); }
  },
  async getTenantUserEffectiveAccess(req: Request, res: Response, next: NextFunction) {
    try {
      const item = await tenancyService.getTenantUserEffectiveAccess(
        req.tenantContext!.tenantId,
        String(req.params.userId ?? ''),
      );
      if (!item) return res.status(404).json({ success: false, error: { code: 'TENANT_USER_NOT_FOUND', message: 'User has no membership in this tenant.' } });
      res.json({ success: true, data: item });
    } catch (e) { next(e); }
  },
  async listTenantUsers(req: Request, res: Response, next: NextFunction) {
    try {
      const query = tenantUserListQuerySchema.parse(req.query);
      const result = await tenancyService.listTenantMemberships(req.tenantContext!.tenantId, query);
      res.json({ success: true, data: result.items, pagination: result.pagination });
    } catch (e) { next(e); }
  },
  async getTenantUserDetails(req: Request, res: Response, next: NextFunction) {
    try {
      const item = await tenancyService.getTenantUserDetails(
        req.tenantContext!.tenantId,
        String(req.params.userId ?? ''),
      );
      if (!item) return res.status(404).json({ success: false, error: { code: 'TENANT_USER_NOT_FOUND', message: 'User not found in this tenant.' } });
      res.json({ success: true, data: item });
    } catch (e) { next(e); }
  },
  async listTenantMembershipHistory(req: Request, res: Response, next: NextFunction) {
    try {
      const page = Math.max(1, Number(req.query.page) || 1);
      const perPage = Math.min(100, Math.max(1, Number(req.query.perPage) || 25));
      const result = await tenancyService.listTenantMembershipHistory(
        req.tenantContext!.tenantId,
        String(req.params.membershipId ?? ''),
        page,
        perPage,
      );
      if (!result) return res.status(404).json({ success: false, error: { code: 'MEMBERSHIP_NOT_FOUND', message: 'Membership not found.' } });
      res.json({ success: true, data: result.items, pagination: result.pagination });
    } catch (e) { next(e); }
  },
  async updateTenantMembership(req: Request, res: Response, next: NextFunction) {
    try {
      const input = updateTenantMembershipSchema.parse(req.body);
      const context = req.tenantContext!;
      const item = await tenancyService.updateTenantMembership(context.tenantId, String(req.params.membershipId ?? ''), req.auth!.userId, context.role, input);
      if (!item) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Membership not found.' } });
      res.json({ success: true, data: item });
    } catch (e) { next(e); }
  },
  async getTenantConfiguration(req: Request, res: Response, next: NextFunction) {
    try {
      res.json({ success: true, data: await tenancyService.getTenantConfiguration(req.tenantContext!.tenantId) });
    } catch (e) { next(e); }
  },
  async updateTenantConfiguration(req: Request, res: Response, next: NextFunction) {
    try {
      const input = updateTenantConfigurationSchema.parse(req.body);
      const item = await tenancyService.updateTenantConfiguration(req.tenantContext!.tenantId, req.auth!.userId, input.values);
      res.json({ success: true, data: item });
    } catch (e) { next(e); }
  },
  async previewTenantConfigurationApply(req: Request, res: Response, next: NextFunction) {
    try {
      const input = previewTenantConfigurationApplySchema.parse(req.body);
      const result = await tenancyService.previewTenantConfigurationApply(req.tenantContext!.tenantId, input);
      res.json({ success: true, data: result });
    } catch (e) { next(e); }
  },
  async applyTenantConfiguration(req: Request, res: Response, next: NextFunction) {
    try {
      const input = applyTenantConfigurationSchema.parse(req.body);
      const result = await tenancyService.applyTenantConfiguration(req.tenantContext!.tenantId, req.auth!.userId, input);
      res.json({ success: true, data: result });
    } catch (e) { next(e); }
  },
  async exportTenantAuditEvents(req: Request, res: Response, next: NextFunction) {
    try {
      const query = tenantAuditQuerySchema.parse(req.query);
      const result = await tenancyService.exportTenantAuditEvents(req.tenantContext!.tenantId, query);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="tenant-audit-logs.csv"');
      res.setHeader('X-Export-Truncated', String(result.truncated));
      res.setHeader('X-Exported-Rows', String(result.exported));
      res.send(result.csv);
    } catch (e) { next(e); }
  },
  async listTenantAuditEvents(req: Request, res: Response, next: NextFunction) {
    try {
      const query = tenantAuditQuerySchema.parse(req.query);
      const result = await tenancyService.listTenantAuditEvents(req.tenantContext!.tenantId, query);
      res.json({ success: true, data: result.items, pagination: result.pagination });
    } catch (e) { next(e); }
  },
  async getTenantSubscription(req: Request, res: Response, next: NextFunction) {
    try {
      const item = await tenancyService.getTenantSubscription(req.tenantContext!.tenantId);
      if (!item) return res.status(404).json({ success: false, error: { code: 'SUBSCRIPTION_NOT_FOUND', message: 'No subscription is configured for this tenant.' } });
      res.json({ success: true, data: item });
    } catch (e) { next(e); }
  },
  async getTenantSubscriptionUsage(req: Request, res: Response, next: NextFunction) {
    try {
      res.json({ success: true, data: await tenancyService.getTenantSubscriptionUsage(req.tenantContext!.tenantId) });
    } catch (e) { next(e); }
  },
  async listTenantInvoices(req: Request, res: Response, next: NextFunction) {
    try {
      res.json({ success: true, data: await tenancyService.listTenantInvoices(req.tenantContext!.tenantId) });
    } catch (e) { next(e); }
  },
  async getTenantInvoice(req: Request, res: Response, next: NextFunction) {
    try {
      const item = await tenancyService.getTenantInvoice(req.tenantContext!.tenantId, String(req.params.invoiceId ?? ''));
      if (!item) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Invoice not found.' } });
      res.json({ success: true, data: item });
    } catch (e) { next(e); }
  },
  async dashboardSummary(req: Request, res: Response, next: NextFunction) {
    try {
      const tenantId = req.tenantContext!.tenantId;
      const [tenant, counts, subscription] = await Promise.all([
        tenancyService.getProfile(tenantId),
        tenancyService.getDashboardCounts(tenantId),
        tenancyService.getSubscriptionOverview(tenantId),
      ]);
      if (!tenant) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Tenant not found.' } });
      res.json({ success: true, data: {
        organization: { id: String(tenant._id), name: tenant.displayName || tenant.name, status: tenant.status },
        counts,
        subscription,
        generatedAt: new Date().toISOString(),
      } });
    } catch (e) { next(e); }
  },
  async dashboardActivity(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await tenancyService.listTenantAuditEvents(req.tenantContext!.tenantId, { page: 1, perPage: 10 });
      res.json({ success: true, data: result.items, pagination: result.pagination });
    } catch (e) { next(e); }
  },
  async dashboardClinics(req: Request, res: Response, next: NextFunction) {
    try {
      res.json({ success: true, data: await tenancyService.listDashboardClinics(req.tenantContext!.tenantId) });
    } catch (e) { next(e); }
  },
  async dashboardAlerts(req: Request, res: Response, next: NextFunction) {
    try {
      const tenantId = req.tenantContext!.tenantId;
      const now = new Date();
      const expiryLimit = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
      const [counts, clinics, subscription, expiringDocuments] = await Promise.all([
        tenancyService.getDashboardCounts(tenantId),
        tenancyService.listDashboardClinics(tenantId),
        tenancyService.getSubscriptionOverview(tenantId),
        tenancyService.countExpiringTenantDocuments(tenantId, now, expiryLimit),
      ]);
      const alerts = [];
      if (counts.pendingInvitations > 0) alerts.push({ code: 'PENDING_INVITATIONS', severity: 'info', count: counts.pendingInvitations });
      if (counts.clinics.suspended > 0) alerts.push({ code: 'SUSPENDED_CLINICS', severity: 'warning', count: counts.clinics.suspended });
      if (subscription?.status === 'past_due') alerts.push({ code: 'SUBSCRIPTION_PAST_DUE', severity: 'critical' });
      if (clinics.some((clinic: any) => clinic.status === 'suspended')) alerts.push({ code: 'CLINIC_ACCESS_RESTRICTED', severity: 'warning' });
      if (expiringDocuments > 0) alerts.push({ code: 'ORGANIZATION_DOCUMENTS_EXPIRING', severity: 'warning', count: expiringDocuments });
      res.json({ success: true, data: { items: alerts, generatedAt: new Date().toISOString() } });
    } catch (e) { next(e); }
  },
  async listTenantDocuments(req: Request, res: Response, next: NextFunction) {
    try {
      res.json({ success: true, data: await tenancyService.listTenantDocuments(req.tenantContext!.tenantId) });
    } catch (e) { next(e); }
  },
  async createTenantDocument(req: Request, res: Response, next: NextFunction) {
    try {
      const input = createTenantDocumentSchema.parse(req.body);
      const item = await tenancyService.createTenantDocument(req.tenantContext!.tenantId, req.auth!.userId, input);
      res.status(201).json({ success: true, data: item });
    } catch (e) { next(e); }
  },
  async replaceTenantDocument(req: Request, res: Response, next: NextFunction) {
    try {
      const input = replaceTenantDocumentSchema.parse(req.body);
      const item = await tenancyService.replaceTenantDocument(
        req.tenantContext!.tenantId,
        String(req.params.documentId ?? ''),
        req.auth!.userId,
        input,
      );
      if (!item) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Document not found.' } });
      res.json({ success: true, data: item });
    } catch (e) { next(e); }
  },
  async getTenantDocumentVersionHistory(req: Request, res: Response, next: NextFunction) {
    try {
      const versions = await tenancyService.getTenantDocumentVersionHistory(
        req.tenantContext!.tenantId,
        String(req.params.documentId ?? ''),
      );
      if (!versions) return res.status(404).json({ success: false, error: { code: 'DOCUMENT_NOT_FOUND', message: 'Document not found.' } });
      res.json({ success: true, data: versions });
    } catch (e) { next(e); }
  },
  async getTenantDocument(req: Request, res: Response, next: NextFunction) {
    try {
      const item = await tenancyService.getTenantDocumentMetadata(req.tenantContext!.tenantId, String(req.params.documentId ?? ''));
      if (!item) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Document not found.' } });
      res.json({ success: true, data: item });
    } catch (e) { next(e); }
  },
  async downloadTenantDocument(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await tenancyService.getTenantDocument(req.tenantContext!.tenantId, String(req.params.documentId ?? ''));
      if (!result) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Document not found.' } });
      const safeName = String(result.document.name).replace(/[^a-zA-Z0-9._-]/g, '_');
      res.setHeader('Content-Type', result.document.mimeType);
      res.setHeader('Content-Length', result.content.length);
      res.setHeader('Content-Disposition', `attachment; filename="${safeName}"`);
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.send(result.content);
    } catch (e) { next(e); }
  },
  async archiveTenantDocument(req: Request, res: Response, next: NextFunction) {
    try {
      const item = await tenancyService.archiveTenantDocument(req.tenantContext!.tenantId, String(req.params.documentId ?? ''), req.auth!.userId);
      if (!item) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Document not found.' } });
      res.json({ success: true, data: { id: String(item._id), status: item.status, archivedAt: item.archivedAt } });
    } catch (e) { next(e); }
  },
  async listClinicActivity(req: Request, res: Response, next: NextFunction) {
    try {
      const context = req.tenantContext!;
      const clinicId = String(req.params.clinicId ?? '');
      if (context.scope === 'branch' || (context.scope === 'clinic' && context.clinicId !== clinicId)) {
        return res.status(403).json({ success: false, error: { code: 'CLINIC_ACCESS_DENIED', message: 'You do not have access to this clinic activity.' } });
      }
      const clinic = await tenancyService.getClinic(clinicId, context.tenantId);
      if (!clinic) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Clinic not found.' } });
      const query = tenantAuditQuerySchema.parse(req.query);
      const result = await tenancyService.listTenantAuditEvents(context.tenantId, {
        ...query,
        clinicId,
        branchId: undefined,
      });
      res.json({ success: true, data: result.items, pagination: result.pagination });
    } catch (e) { next(e); }
  },
  async listClinicUsers(req: Request, res: Response, next: NextFunction) {
    try {
      const context = req.tenantContext!;
      const clinicId = String(req.params.clinicId ?? '');
      if (context.scope === 'branch' || (context.scope === 'clinic' && context.clinicId !== clinicId)) {
        return res.status(403).json({ success: false, error: { code: 'CLINIC_ACCESS_DENIED', message: 'You do not have access to this clinic.' } });
      }
      const clinic = await tenancyService.getClinic(clinicId, context.tenantId);
      if (!clinic) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Clinic not found.' } });
      const query = tenantUserListQuerySchema.parse(req.query);
      const result = await tenancyService.listTenantMemberships(context.tenantId, {
        ...query,
        clinicId,
        branchId: undefined,
      });
      res.json({ success: true, data: result.items, pagination: result.pagination });
    } catch (e) { next(e); }
  },
  async listClinicDocuments(req: Request, res: Response, next: NextFunction) {
    try {
      const context = req.tenantContext!;
      const clinicId = String(req.params.clinicId ?? '');
      if (context.scope === 'branch' || (context.scope === 'clinic' && context.clinicId !== clinicId)) {
        return res.status(403).json({ success: false, error: { code: 'CLINIC_ACCESS_DENIED', message: 'You do not have access to this clinic.' } });
      }
      const clinic = await tenancyService.getClinic(clinicId, context.tenantId);
      if (!clinic) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Clinic not found.' } });
      res.json({ success: true, data: await tenancyService.listTenantDocuments(context.tenantId, clinicId) });
    } catch (e) { next(e); }
  },
  async createClinicDocument(req: Request, res: Response, next: NextFunction) {
    try {
      const context = req.tenantContext!;
      const clinicId = String(req.params.clinicId ?? '');
      if (context.scope === 'branch' || (context.scope === 'clinic' && context.clinicId !== clinicId)) {
        return res.status(403).json({ success: false, error: { code: 'CLINIC_ACCESS_DENIED', message: 'You do not have access to this clinic.' } });
      }
      const input = createTenantDocumentSchema.parse(req.body);
      const item = await tenancyService.createTenantDocument(context.tenantId, req.auth!.userId, input, clinicId);
      if (!item) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Clinic not found.' } });
      res.status(201).json({ success: true, data: item });
    } catch (e) { next(e); }
  },
  async replaceClinicDocument(req: Request, res: Response, next: NextFunction) {
    try {
      const context = req.tenantContext!;
      const clinicId = String(req.params.clinicId ?? '');
      if (context.scope === 'branch' || (context.scope === 'clinic' && context.clinicId !== clinicId)) {
        return res.status(403).json({ success: false, error: { code: 'CLINIC_ACCESS_DENIED', message: 'You do not have access to this clinic.' } });
      }
      const input = replaceTenantDocumentSchema.parse(req.body);
      const item = await tenancyService.replaceTenantDocument(context.tenantId, String(req.params.documentId ?? ''), req.auth!.userId, input, clinicId);
      if (!item) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Clinic document not found.' } });
      res.json({ success: true, data: item });
    } catch (e) { next(e); }
  },
  async getClinicDocumentVersions(req: Request, res: Response, next: NextFunction) {
    try {
      const context = req.tenantContext!;
      const clinicId = String(req.params.clinicId ?? '');
      if (context.scope === 'branch' || (context.scope === 'clinic' && context.clinicId !== clinicId)) {
        return res.status(403).json({ success: false, error: { code: 'CLINIC_ACCESS_DENIED', message: 'You do not have access to this clinic.' } });
      }
      const versions = await tenancyService.getTenantDocumentVersionHistory(context.tenantId, String(req.params.documentId ?? ''), clinicId);
      if (!versions) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Clinic document not found.' } });
      res.json({ success: true, data: versions });
    } catch (e) { next(e); }
  },
  async getClinicDocument(req: Request, res: Response, next: NextFunction) {
    try {
      const context = req.tenantContext!;
      const clinicId = String(req.params.clinicId ?? '');
      if (context.scope === 'branch' || (context.scope === 'clinic' && context.clinicId !== clinicId)) {
        return res.status(403).json({ success: false, error: { code: 'CLINIC_ACCESS_DENIED', message: 'You do not have access to this clinic.' } });
      }
      const item = await tenancyService.getTenantDocumentMetadata(context.tenantId, String(req.params.documentId ?? ''), clinicId);
      if (!item) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Clinic document not found.' } });
      res.json({ success: true, data: item });
    } catch (e) { next(e); }
  },
  async downloadClinicDocument(req: Request, res: Response, next: NextFunction) {
    try {
      const context = req.tenantContext!;
      const clinicId = String(req.params.clinicId ?? '');
      if (context.scope === 'branch' || (context.scope === 'clinic' && context.clinicId !== clinicId)) {
        return res.status(403).json({ success: false, error: { code: 'CLINIC_ACCESS_DENIED', message: 'You do not have access to this clinic.' } });
      }
      const result = await tenancyService.getTenantDocument(context.tenantId, String(req.params.documentId ?? ''), clinicId);
      if (!result) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Clinic document not found.' } });
      const safeName = String(result.document.name).replace(/[^a-zA-Z0-9._-]/g, '_');
      res.setHeader('Content-Type', result.document.mimeType);
      res.setHeader('Content-Length', result.content.length);
      res.setHeader('Content-Disposition', `attachment; filename="${safeName}"`);
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.send(result.content);
    } catch (e) { next(e); }
  },
  async archiveClinicDocument(req: Request, res: Response, next: NextFunction) {
    try {
      const context = req.tenantContext!;
      const clinicId = String(req.params.clinicId ?? '');
      if (context.scope === 'branch' || (context.scope === 'clinic' && context.clinicId !== clinicId)) {
        return res.status(403).json({ success: false, error: { code: 'CLINIC_ACCESS_DENIED', message: 'You do not have access to this clinic.' } });
      }
      const item = await tenancyService.archiveTenantDocument(context.tenantId, String(req.params.documentId ?? ''), req.auth!.userId, clinicId);
      if (!item) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Clinic document not found.' } });
      res.json({ success: true, data: { id: String(item._id), status: item.status, archivedAt: item.archivedAt } });
    } catch (e) { next(e); }
  },
  async listGeo(req: Request, res: Response, next: NextFunction) {
    try {
      const resource = geoResourceSchema.parse(req.params.resource);
      const query = clinicGeoListSchema.parse(req.query);
      res.json({ success: true, ...await tenancyService.listGeo(resource, query) });
    } catch (e) { next(e); }
  },
  async listTenantRoles(req: Request, res: Response) {
    res.json({ success: true, data: getTenantRoleCatalog(req.tenantContext!.role) });
  },
  async getPermissions(req: Request, res: Response) {
    const context = req.tenantContext!;
    res.json({ success: true, data: { role: context.role, scope: context.scope, permissions: getTenantRolePermissions(context.role) } });
  },
  async context(req: Request, res: Response, next: NextFunction) {
    try {
      const [tenant, clinic, branch] = await tenancyService.getContext(req.tenantContext!);
      res.json({ success: true, data: { tenant, clinic, branch, access: req.tenantContext } });
    } catch (e) { next(e); }
  },
  async listClinics(req: Request, res: Response, next: NextFunction) {
    try {
      const query = clinicListQuerySchema.parse(req.query);
      const result = await tenancyService.listClinics(req.tenantContext!.tenantId, query);
      res.json({ success: true, data: result.items, pagination: result.pagination });
    } catch (e) { next(e); }
  },
  async getClinicSettings(req: Request, res: Response, next: NextFunction) {
    try {
      const context = req.tenantContext!;
      const clinicId = String(req.params.clinicId ?? '');
      if (context.scope === 'clinic' && context.clinicId !== clinicId) return res.status(403).json({ success: false, error: { code: 'CLINIC_ACCESS_DENIED', message: 'You do not have access to this clinic.' } });
      if (context.scope === 'branch') return res.status(403).json({ success: false, error: { code: 'CLINIC_ACCESS_DENIED', message: 'Branch-scoped users cannot manage clinic settings.' } });
      const item = await tenancyService.getClinicSettings(context.tenantId, clinicId);
      if (!item) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Clinic not found.' } });
      res.json({ success: true, data: item });
    } catch (e) { next(e); }
  },
  async updateClinicSettings(req: Request, res: Response, next: NextFunction) {
    try {
      const context = req.tenantContext!;
      const clinicId = String(req.params.clinicId ?? '');
      if (context.scope === 'clinic' && context.clinicId !== clinicId) return res.status(403).json({ success: false, error: { code: 'CLINIC_ACCESS_DENIED', message: 'You do not have access to this clinic.' } });
      if (context.scope === 'branch') return res.status(403).json({ success: false, error: { code: 'CLINIC_ACCESS_DENIED', message: 'Branch-scoped users cannot manage clinic settings.' } });
      const { overrides } = updateClinicSettingsSchema.parse(req.body);
      const item = await tenancyService.updateClinicSettings(context.tenantId, clinicId, req.auth!.userId, overrides);
      if (!item) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Clinic not found.' } });
      res.json({ success: true, data: item });
    } catch (e) { next(e); }
  },
  async getClinic(req: Request, res: Response, next: NextFunction) {
    try {
      const item = await tenancyService.getClinic(String(req.params.clinicId ?? ''), req.tenantContext!.tenantId);
      if (!item) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Clinic not found.' } });
      res.json({ success: true, data: item });
    } catch (e) { next(e); }
  },
  async createClinic(req: Request, res: Response, next: NextFunction) {
    try {
      const input = createClinicSchema.parse(req.body);
      res.status(201).json({ success: true, data: await tenancyService.createClinic(input, req.tenantContext!.tenantId, req.auth!.userId) });
    } catch (e) { next(e); }
  },
  async updateClinic(req: Request, res: Response, next: NextFunction) {
    try {
      const input = updateClinicSchema.parse(req.body);
      const item = await tenancyService.updateClinic(String(req.params.clinicId ?? ''), input, req.tenantContext!.tenantId, req.auth!.userId);
      if (!item) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Clinic not found.' } });
      res.json({ success: true, data: item });
    } catch (e) { next(e); }
  },
  async activateClinic(req: Request, res: Response, next: NextFunction) {
    try {
      const item = await tenancyService.updateClinic(String(req.params.clinicId ?? ''), { status: 'active' }, req.tenantContext!.tenantId, req.auth!.userId);
      if (!item) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Clinic not found.' } });
      res.json({ success: true, data: item });
    } catch (e) { next(e); }
  },
  async deactivateClinic(req: Request, res: Response, next: NextFunction) {
    try {
      const item = await tenancyService.updateClinic(String(req.params.clinicId ?? ''), { status: 'suspended' }, req.tenantContext!.tenantId, req.auth!.userId);
      if (!item) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Clinic not found.' } });
      res.json({ success: true, data: item });
    } catch (e) { next(e); }
  },
  async activateBranch(req: Request, res: Response, next: NextFunction) {
    try {
      const context = req.tenantContext!;
      if (!context.clinicId) return res.status(400).json({ success: false, error: { code: 'CLINIC_CONTEXT_REQUIRED', message: 'Select a clinic using X-Clinic-Id.' } });
      const item = await tenancyService.activateBranch(String(req.params.branchId ?? ''), context.tenantId, context.clinicId, req.auth!.userId);
      if (!item) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Branch not found.' } });
      res.json({ success: true, data: item });
    } catch (e) { next(e); }
  },
  async deactivateBranch(req: Request, res: Response, next: NextFunction) {
    try {
      const context = req.tenantContext!;
      if (!context.clinicId) return res.status(400).json({ success: false, error: { code: 'CLINIC_CONTEXT_REQUIRED', message: 'Select a clinic using X-Clinic-Id.' } });
      const item = await tenancyService.deactivateBranch(String(req.params.branchId ?? ''), context.tenantId, context.clinicId, req.auth!.userId);
      if (!item) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Branch not found.' } });
      res.json({ success: true, data: item });
    } catch (e) { next(e); }
  },
  async temporarilyCloseBranch(req: Request, res: Response, next: NextFunction) {
    try {
      const context = req.tenantContext!;
      if (!context.clinicId) return res.status(400).json({ success: false, error: { code: 'CLINIC_CONTEXT_REQUIRED', message: 'Select a clinic using X-Clinic-Id.' } });
      const { reason } = branchLifecycleReasonSchema.parse(req.body);
      const item = await tenancyService.temporarilyCloseBranch(String(req.params.branchId ?? ''), context.tenantId, context.clinicId, req.auth!.userId, reason);
      if (!item) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Branch not found.' } });
      res.json({ success: true, data: item });
    } catch (e) { next(e); }
  },
  async permanentlyCloseBranch(req: Request, res: Response, next: NextFunction) {
    try {
      const context = req.tenantContext!;
      if (!context.clinicId) return res.status(400).json({ success: false, error: { code: 'CLINIC_CONTEXT_REQUIRED', message: 'Select a clinic using X-Clinic-Id.' } });
      const { reason } = branchLifecycleReasonSchema.parse(req.body);
      const item = await tenancyService.permanentlyCloseBranch(String(req.params.branchId ?? ''), context.tenantId, context.clinicId, req.auth!.userId, reason);
      if (!item) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Branch not found.' } });
      res.json({ success: true, data: item });
    } catch (e) { next(e); }
  },
  async listClinicBranches(req: Request, res: Response, next: NextFunction) {
    try {
      const context = req.tenantContext!;
      const clinicId = String(req.params.clinicId ?? '');
      if (context.scope === 'clinic' && context.clinicId !== clinicId) return res.status(403).json({ success: false, error: { code: 'CLINIC_ACCESS_DENIED', message: 'You do not have access to this clinic.' } });
      if (context.scope === 'branch' && context.clinicId !== clinicId) return res.status(403).json({ success: false, error: { code: 'CLINIC_ACCESS_DENIED', message: 'You do not have access to this clinic.' } });
      const query = branchListQuerySchema.parse(req.query);
      const result = await tenancyService.listClinicBranches(context.tenantId, clinicId, context.scope === 'branch' ? context.branchId : null, query);
      if (!result) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Clinic not found.' } });
      res.json({ success: true, data: result.items, pagination: result.pagination });
    } catch (e) { next(e); }
  },
  async listBranches(req: Request, res: Response, next: NextFunction) {
    try {
      const context = req.tenantContext!;
      const query = branchListQuerySchema.parse(req.query);

      if (context.scope === 'tenant') {
        const result = await tenancyService.listBranches(context.tenantId, query.clinicId ?? null, null, query);
        if (!result) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Clinic not found in this tenant.' } });
        return res.json({ success: true, data: result.items, pagination: result.pagination });
      }

      if (!context.clinicId) return res.status(400).json({ success: false, error: { code: 'CLINIC_CONTEXT_REQUIRED', message: 'Select a clinic using X-Clinic-Id.' } });
      if (query.clinicId && query.clinicId !== context.clinicId) {
        return res.status(403).json({ success: false, error: { code: 'CLINIC_ACCESS_DENIED', message: 'You do not have access to this clinic.' } });
      }

      const branchId = context.scope === 'branch' ? context.branchId : null;
      const result = await tenancyService.listBranches(context.tenantId, context.clinicId, branchId, query);
      if (!result) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Branch scope not found.' } });
      res.json({ success: true, data: result.items, pagination: result.pagination });
    } catch (e) { next(e); }
  },
  async listBranchActivity(req: Request, res: Response, next: NextFunction) {
    try {
      const context = req.tenantContext!;
      if (!context.clinicId) return res.status(400).json({ success: false, error: { code: 'CLINIC_CONTEXT_REQUIRED', message: 'Select a clinic using X-Clinic-Id.' } });
      const branchId = String(req.params.branchId ?? '');
      if (context.scope === 'branch' && context.branchId !== branchId) {
        return res.status(403).json({ success: false, error: { code: 'BRANCH_ACCESS_DENIED', message: 'You do not have access to this branch activity.' } });
      }
      const branch = await tenancyService.getBranch(branchId, context.tenantId, context.clinicId);
      if (!branch) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Branch not found.' } });
      const query = tenantAuditQuerySchema.parse(req.query);
      const result = await tenancyService.listTenantAuditEvents(context.tenantId, {
        ...query,
        clinicId: context.clinicId,
        branchId,
      });
      res.json({ success: true, data: result.items, pagination: result.pagination });
    } catch (e) { next(e); }
  },
  async listBranchUsers(req: Request, res: Response, next: NextFunction) {
    try {
      const context = req.tenantContext!;
      if (!context.clinicId) return res.status(400).json({ success: false, error: { code: 'CLINIC_CONTEXT_REQUIRED', message: 'Select a clinic using X-Clinic-Id.' } });
      const branchId = String(req.params.branchId ?? '');
      if (context.scope === 'branch' && context.branchId !== branchId) {
        return res.status(403).json({ success: false, error: { code: 'BRANCH_ACCESS_DENIED', message: 'You do not have access to this branch.' } });
      }
      const branch = await tenancyService.getBranch(branchId, context.tenantId, context.clinicId);
      if (!branch) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Branch not found.' } });
      const query = tenantUserListQuerySchema.parse(req.query);
      const result = await tenancyService.listTenantMemberships(context.tenantId, {
        ...query,
        clinicId: context.clinicId,
        branchId,
      });
      res.json({ success: true, data: result.items, pagination: result.pagination });
    } catch (e) { next(e); }
  },
  async getBranchSettings(req: Request, res: Response, next: NextFunction) {
    try {
      const context = req.tenantContext!;
      if (!context.clinicId) return res.status(400).json({ success: false, error: { code: 'CLINIC_CONTEXT_REQUIRED', message: 'Select a clinic using X-Clinic-Id.' } });
      const branchId = String(req.params.branchId ?? '');
      if (context.scope === 'branch' && context.branchId !== branchId) return res.status(403).json({ success: false, error: { code: 'BRANCH_ACCESS_DENIED', message: 'You do not have access to this branch.' } });
      const item = await tenancyService.getBranchSettings(context.tenantId, context.clinicId, branchId);
      if (!item) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Branch not found.' } });
      res.json({ success: true, data: item });
    } catch (e) { next(e); }
  },
  async updateBranchSettings(req: Request, res: Response, next: NextFunction) {
    try {
      const context = req.tenantContext!;
      if (!context.clinicId) return res.status(400).json({ success: false, error: { code: 'CLINIC_CONTEXT_REQUIRED', message: 'Select a clinic using X-Clinic-Id.' } });
      const branchId = String(req.params.branchId ?? '');
      if (context.scope === 'branch' && context.branchId !== branchId) return res.status(403).json({ success: false, error: { code: 'BRANCH_ACCESS_DENIED', message: 'You do not have access to this branch.' } });
      const { overrides } = updateBranchSettingsSchema.parse(req.body);
      const item = await tenancyService.updateBranchSettings(context.tenantId, context.clinicId, branchId, req.auth!.userId, overrides);
      if (!item) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Branch not found.' } });
      res.json({ success: true, data: item });
    } catch (e) { next(e); }
  },
  async listBranchHolidays(req: Request, res: Response, next: NextFunction) {
    try {
      const context = req.tenantContext!;
      if (!context.clinicId) return res.status(400).json({ success: false, error: { code: 'CLINIC_CONTEXT_REQUIRED', message: 'Select a clinic using X-Clinic-Id.' } });
      const branchId = String(req.params.branchId ?? '');
      if (context.scope === 'branch' && context.branchId !== branchId) return res.status(403).json({ success: false, error: { code: 'BRANCH_ACCESS_DENIED', message: 'You do not have access to this branch.' } });
      const items = await tenancyService.listBranchHolidays(context.tenantId, context.clinicId, branchId);
      if (!items) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Branch not found.' } });
      res.json({ success: true, data: items });
    } catch (e) { next(e); }
  },
  async createBranchHoliday(req: Request, res: Response, next: NextFunction) {
    try {
      const context = req.tenantContext!;
      if (!context.clinicId) return res.status(400).json({ success: false, error: { code: 'CLINIC_CONTEXT_REQUIRED', message: 'Select a clinic using X-Clinic-Id.' } });
      const branchId = String(req.params.branchId ?? '');
      if (context.scope === 'branch' && context.branchId !== branchId) return res.status(403).json({ success: false, error: { code: 'BRANCH_ACCESS_DENIED', message: 'You do not have access to this branch.' } });
      const input = createBranchHolidaySchema.parse(req.body);
      const item = await tenancyService.createBranchHoliday(context.tenantId, context.clinicId, branchId, req.auth!.userId, input);
      if (!item) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Branch not found.' } });
      res.status(201).json({ success: true, data: item });
    } catch (e) { next(e); }
  },
  async updateBranchHoliday(req: Request, res: Response, next: NextFunction) {
    try {
      const context = req.tenantContext!;
      if (!context.clinicId) return res.status(400).json({ success: false, error: { code: 'CLINIC_CONTEXT_REQUIRED', message: 'Select a clinic using X-Clinic-Id.' } });
      const branchId = String(req.params.branchId ?? '');
      if (context.scope === 'branch' && context.branchId !== branchId) return res.status(403).json({ success: false, error: { code: 'BRANCH_ACCESS_DENIED', message: 'You do not have access to this branch.' } });
      const input = createBranchHolidaySchema.parse(req.body);
      const item = await tenancyService.updateBranchHoliday(context.tenantId, context.clinicId, branchId, String(req.params.holidayId ?? ''), req.auth!.userId, input);
      if (!item) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Active holiday not found.' } });
      res.json({ success: true, data: item });
    } catch (e) { next(e); }
  },
  async cancelBranchHoliday(req: Request, res: Response, next: NextFunction) {
    try {
      const context = req.tenantContext!;
      if (!context.clinicId) return res.status(400).json({ success: false, error: { code: 'CLINIC_CONTEXT_REQUIRED', message: 'Select a clinic using X-Clinic-Id.' } });
      const branchId = String(req.params.branchId ?? '');
      if (context.scope === 'branch' && context.branchId !== branchId) return res.status(403).json({ success: false, error: { code: 'BRANCH_ACCESS_DENIED', message: 'You do not have access to this branch.' } });
      const item = await tenancyService.cancelBranchHoliday(context.tenantId, context.clinicId, branchId, String(req.params.holidayId ?? ''), req.auth!.userId);
      if (!item) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Holiday not found.' } });
      res.json({ success: true, data: item });
    } catch (e) { next(e); }
  },
  async getBranchBusinessHours(req: Request, res: Response, next: NextFunction) {
    try {
      const context = req.tenantContext!;
      if (!context.clinicId) return res.status(400).json({ success: false, error: { code: 'CLINIC_CONTEXT_REQUIRED', message: 'Select a clinic using X-Clinic-Id.' } });
      const branchId = String(req.params.branchId ?? '');
      if (context.scope === 'branch' && context.branchId !== branchId) {
        return res.status(403).json({ success: false, error: { code: 'BRANCH_ACCESS_DENIED', message: 'You do not have access to this branch.' } });
      }
      const branch = await tenancyService.getBranch(branchId, context.tenantId, context.clinicId);
      if (!branch) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Branch not found.' } });
      res.json({ success: true, data: { timezone: branch.timezone, operatingHours: branch.operatingHours ?? [] } });
    } catch (e) { next(e); }
  },
  async updateBranchBusinessHours(req: Request, res: Response, next: NextFunction) {
    try {
      const context = req.tenantContext!;
      if (!context.clinicId) return res.status(400).json({ success: false, error: { code: 'CLINIC_CONTEXT_REQUIRED', message: 'Select a clinic using X-Clinic-Id.' } });
      const branchId = String(req.params.branchId ?? '');
      if (context.scope === 'branch' && context.branchId !== branchId) {
        return res.status(403).json({ success: false, error: { code: 'BRANCH_ACCESS_DENIED', message: 'You do not have access to this branch.' } });
      }
      const input = updateBranchOperatingHoursSchema.parse(req.body);
      const branch = await tenancyService.updateBranch(branchId, input, context.tenantId, context.clinicId, req.auth!.userId);
      if (!branch) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Branch not found.' } });
      res.json({ success: true, data: { timezone: branch.timezone, operatingHours: branch.operatingHours ?? [] } });
    } catch (e) { next(e); }
  },
  async getBranch(req: Request, res: Response, next: NextFunction) {
    try {
      const context = req.tenantContext!;
      if (!context.clinicId) return res.status(400).json({ success: false, error: { code: 'CLINIC_CONTEXT_REQUIRED', message: 'Select a clinic using X-Clinic-Id.' } });
      const branchId = String(req.params.branchId ?? '');
      if (context.scope === 'branch' && context.branchId !== branchId) {
        return res.status(403).json({ success: false, error: { code: 'BRANCH_ACCESS_DENIED', message: 'You do not have access to this branch.' } });
      }
      const item = await tenancyService.getBranch(branchId, context.tenantId, context.clinicId);
      if (!item) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Branch not found.' } });
      res.json({ success: true, data: item });
    } catch (e) { next(e); }
  },
  async createBranch(req: Request, res: Response, next: NextFunction) {
    try {
      const context = req.tenantContext!;
      if (!context.clinicId) return res.status(400).json({ success: false, error: { code: 'CLINIC_CONTEXT_REQUIRED', message: 'Select a clinic using X-Clinic-Id.' } });
      const input = createBranchSchema.parse(req.body);
      const item = await tenancyService.createBranch(input, context.tenantId, context.clinicId, req.auth!.userId);
      if (!item) return res.status(404).json({ success: false, error: { code: 'CLINIC_NOT_FOUND', message: 'Clinic not found.' } });
      res.status(201).json({ success: true, data: item });
    } catch (e) { next(e); }
  },
  async updateBranch(req: Request, res: Response, next: NextFunction) {
    try {
      const context = req.tenantContext!;
      if (!context.clinicId) return res.status(400).json({ success: false, error: { code: 'CLINIC_CONTEXT_REQUIRED', message: 'Select a clinic using X-Clinic-Id.' } });
      const branchId = String(req.params.branchId ?? '');
      if (context.scope === 'branch' && context.branchId !== branchId) {
        return res.status(403).json({ success: false, error: { code: 'BRANCH_ACCESS_DENIED', message: 'You do not have access to this branch.' } });
      }
      if (context.scope === 'branch' && req.body && Object.prototype.hasOwnProperty.call(req.body, 'status')) {
        return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Branch managers cannot change branch lifecycle status.' } });
      }
      const input = updateBranchSchema.parse(req.body);
      const item = await tenancyService.updateBranch(branchId, input, context.tenantId, context.clinicId, req.auth!.userId);
      if (!item) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Branch not found.' } });
      res.json({ success: true, data: item });
    } catch (e) { next(e); }
  },
};
