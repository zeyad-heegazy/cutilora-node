import { beforeEach, describe, expect, it, vi } from 'vitest';

const reportMocks = vi.hoisted(() => ({
  clinicAggregate: vi.fn(), clinicCount: vi.fn(),
  branchAggregate: vi.fn(), branchCount: vi.fn(),
  membershipAggregate: vi.fn(), membershipCount: vi.fn(),
  invitationAggregate: vi.fn(), invitationCount: vi.fn(),
  auditAggregate: vi.fn(),
}));
vi.mock('../../src/modules/tenancy/models/clinic.model.js', () => ({ Clinic: { aggregate: reportMocks.clinicAggregate, countDocuments: reportMocks.clinicCount } }));
vi.mock('../../src/modules/tenancy/models/branch.model.js', () => ({ Branch: { aggregate: reportMocks.branchAggregate, countDocuments: reportMocks.branchCount } }));
vi.mock('../../src/modules/tenancy/models/tenant-membership.model.js', () => ({ TenantMembership: { aggregate: reportMocks.membershipAggregate, countDocuments: reportMocks.membershipCount } }));
vi.mock('../../src/modules/tenancy/models/tenant-invitation.model.js', () => ({ TenantInvitation: { aggregate: reportMocks.invitationAggregate, countDocuments: reportMocks.invitationCount } }));
vi.mock('../../src/modules/tenancy/models/tenant-audit-event.model.js', () => ({ TenantAuditEvent: { aggregate: reportMocks.auditAggregate } }));

import { tenantReportsService } from '../../src/modules/tenancy/services/tenant-reports.service.js';

const tenantId = '64b000000000000000000001';
describe('tenant organization reports', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    reportMocks.clinicAggregate.mockResolvedValue([{ _id: 'active', count: 2 }]);
    reportMocks.branchAggregate.mockResolvedValue([{ _id: 'active', count: 3 }]);
    reportMocks.membershipAggregate.mockResolvedValue([{ _id: { status: 'active', role: 'tenant_admin' }, count: 4 }]);
    reportMocks.invitationAggregate.mockResolvedValue([{ _id: 'pending', count: 1 }]);
    reportMocks.clinicCount.mockResolvedValue(2);
    reportMocks.branchCount.mockResolvedValue(3);
    reportMocks.membershipCount.mockResolvedValue(4);
    reportMocks.invitationCount.mockResolvedValue(1);
    reportMocks.auditAggregate.mockResolvedValue([{ _id: 'clinic.created', count: 2 }]);
  });

  it('scopes every report query to the requested tenant and returns definitions and freshness', async () => {
    const from = new Date('2026-01-01T00:00:00.000Z');
    const to = new Date('2026-01-31T23:59:59.999Z');
    const report = await tenantReportsService.organizationOverview(tenantId, { from, to });

    for (const aggregate of [reportMocks.clinicAggregate, reportMocks.branchAggregate, reportMocks.membershipAggregate, reportMocks.invitationAggregate, reportMocks.auditAggregate]) {
      expect(aggregate).toHaveBeenCalled();
      expect(aggregate.mock.calls[0][0][0].$match.tenantId.toString()).toBe(tenantId);
    }
    for (const count of [reportMocks.clinicCount, reportMocks.branchCount, reportMocks.membershipCount, reportMocks.invitationCount]) {
      expect(count).toHaveBeenCalledWith(expect.objectContaining({ tenantId: expect.anything(), createdAt: { $gte: from, $lte: to } }));
    }
    expect(report).toMatchObject({
      timezone: 'UTC',
      freshness: expect.stringContaining('Live query'),
      clinics: { byStatus: { active: 2 }, createdInRange: 2 },
      branches: { byStatus: { active: 3 }, createdInRange: 3 },
      invitations: { byStatus: { pending: 1 }, createdInRange: 1 },
    });
    expect(report.definitions.excluded).toContain('Appointment');
  });

  it('does not widen a report query beyond the supplied tenant when no date filter is used', async () => {
    await tenantReportsService.organizationOverview(tenantId, {});
    expect(reportMocks.clinicCount).toHaveBeenCalledWith({ tenantId: expect.anything() });
    expect(reportMocks.auditAggregate.mock.calls[0][0][0].$match).toEqual({ tenantId: expect.anything() });
  });
});
