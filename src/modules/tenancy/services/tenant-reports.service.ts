import { Types } from 'mongoose';
import { Clinic } from '../models/clinic.model.js';
import { Branch } from '../models/branch.model.js';
import { TenantMembership } from '../models/tenant-membership.model.js';
import { TenantInvitation } from '../models/tenant-invitation.model.js';
import { TenantAuditEvent } from '../models/tenant-audit-event.model.js';

export const tenantReportsService = {
  async organizationOverview(tenantId: string, range: { from?: Date; to?: Date }) {
    const tenantObjectId = new Types.ObjectId(tenantId);
    const createdAt = {
      ...(range.from ? { $gte: range.from } : {}),
      ...(range.to ? { $lte: range.to } : {}),
    };
    const dateFilter = Object.keys(createdAt).length ? { createdAt } : {};
    const [
      clinicStatus, branchStatus, membershipStatus, invitationStatus,
      clinicCreated, branchCreated, membershipChanges, invitationCreated, auditActions,
    ] = await Promise.all([
      Clinic.aggregate([{ $match: { tenantId: tenantObjectId } }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
      Branch.aggregate([{ $match: { tenantId: tenantObjectId } }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
      TenantMembership.aggregate([{ $match: { tenantId: tenantObjectId } }, { $group: { _id: { status: '$status', role: '$role' }, count: { $sum: 1 } } }]),
      TenantInvitation.aggregate([{ $match: { tenantId: tenantObjectId, ...dateFilter } }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
      Clinic.countDocuments({ tenantId: tenantObjectId, ...dateFilter }),
      Branch.countDocuments({ tenantId: tenantObjectId, ...dateFilter }),
      TenantMembership.countDocuments({ tenantId: tenantObjectId, ...dateFilter }),
      TenantInvitation.countDocuments({ tenantId: tenantObjectId, ...dateFilter }),
      TenantAuditEvent.aggregate([
        { $match: { tenantId: tenantObjectId, ...dateFilter } },
        { $group: { _id: '$action', count: { $sum: 1 } } },
        { $sort: { count: -1 } }, { $limit: 25 },
      ]),
    ]);
    const countMap = (rows: any[]) => Object.fromEntries(rows.map(row => [String(row._id ?? 'unknown'), row.count]));
    return {
      generatedAt: new Date().toISOString(),
      timezone: 'UTC',
      freshness: 'Live query; values reflect committed records at generation time.',
      range: { from: range.from?.toISOString() ?? null, to: range.to?.toISOString() ?? null },
      definitions: {
        clinicStatus: 'Current clinic counts grouped by persisted lifecycle status; not limited by the requested date range.',
        branchStatus: 'Current branch counts grouped by persisted lifecycle status; not limited by the requested date range.',
        membershipStatus: 'Current memberships grouped by status and built-in role; custom roles are grouped as custom_role.',
        invitationStatus: 'Invitations created in the requested date range grouped by their current status.',
        createdCounts: 'Clinic, branch, membership and invitation records created in the requested date range.',
        topAuditActions: 'Top 25 tenant audit actions created in the requested date range.',
        excluded: 'Appointment and patient-growth metrics are omitted until the Clinic scheduling/patient domains expose governed aggregate contracts.',
      },
      clinics: { byStatus: countMap(clinicStatus), createdInRange: clinicCreated },
      branches: { byStatus: countMap(branchStatus), createdInRange: branchCreated },
      memberships: {
        byStatusAndRole: membershipStatus.map(row => ({ status: row._id.status, role: row._id.role, count: row.count })),
        createdInRange: membershipChanges,
      },
      invitations: { byStatus: countMap(invitationStatus), createdInRange: invitationCreated },
      topAuditActions: auditActions.map(row => ({ action: row._id, count: row.count })),
    };
  },
};
