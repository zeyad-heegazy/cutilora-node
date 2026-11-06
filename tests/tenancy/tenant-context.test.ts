import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/modules/tenancy/repositories/tenancy.repository.js', () => ({
  tenancyRepository: {
    findMembership: vi.fn(),
    findActiveTenant: vi.fn(),
    findActiveClinic: vi.fn(),
    findActiveBranch: vi.fn(),
    findActiveTenantRoleById: vi.fn(),
  },
}));

import { requireTenantScope, resolveTenantContext } from '../../src/modules/tenancy/middleware/tenant-context.js';
import { tenancyRepository } from '../../src/modules/tenancy/repositories/tenancy.repository.js';

const ids = {
  tenant: '64b000000000000000000001',
  clinic: '64b000000000000000000002',
  otherClinic: '64b000000000000000000003',
  branch: '64b000000000000000000004',
  otherBranch: '64b000000000000000000005',
};

function invoke(headers: Record<string, string> = {}) {
  const req: any = {
    auth: { userId: '64b000000000000000000099', activeClinicId: null, clinicRole: null },
    header: (name: string) => headers[name.toLowerCase()],
  };
  const response: any = {
    statusCode: 200,
    body: undefined,
    status(code: number) { this.statusCode = code; return this; },
    json(body: unknown) { this.body = body; return this; },
  };
  const next = vi.fn();
  return { req, response, next, run: () => resolveTenantContext(req, response, next) };
}

describe('resolveTenantContext scope enforcement', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(tenancyRepository.findActiveTenant).mockResolvedValue({ _id: ids.tenant } as any);
    vi.mocked(tenancyRepository.findActiveClinic).mockResolvedValue({ _id: ids.clinic } as any);
    vi.mocked(tenancyRepository.findActiveBranch).mockResolvedValue({ _id: ids.branch } as any);
  });

  it('requires tenant-wide scope for clinic administration', () => {
    const response: any = {
      statusCode: 200,
      status(code: number) { this.statusCode = code; return this; },
      json(body: unknown) { this.body = body; return this; },
    };
    const next = vi.fn();
    requireTenantScope({ tenantContext: { scope: 'clinic' } } as any, response, next);
    expect(response.statusCode).toBe(403);
    expect(response.body.error.code).toBe('TENANT_SCOPE_REQUIRED');
    expect(next).not.toHaveBeenCalled();
  });

  it('allows tenant-wide scope through the clinic administration guard', () => {
    const response: any = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    const next = vi.fn();
    requireTenantScope({ tenantContext: { scope: 'tenant' } } as any, response, next);
    expect(next).toHaveBeenCalledOnce();
  });

  it('rejects malformed tenant identifiers before querying MongoDB', async () => {
    const context = invoke({ 'x-tenant-id': 'not-an-object-id' });
    await context.run();
    expect(context.response.statusCode).toBe(400);
    expect(context.response.body.error.code).toBe('INVALID_TENANT_ID');
    expect(tenancyRepository.findMembership).not.toHaveBeenCalled();
  });

  it('requires a selected branch for branch-scoped memberships', async () => {
    vi.mocked(tenancyRepository.findMembership).mockResolvedValue({
      scope: 'branch', clinicId: ids.clinic, branchIds: [ids.branch], role: 'branch_manager',
    } as any);
    const context = invoke({ 'x-tenant-id': ids.tenant, 'x-clinic-id': ids.clinic });
    await context.run();
    expect(context.response.statusCode).toBe(400);
    expect(context.response.body.error.code).toBe('BRANCH_CONTEXT_REQUIRED');
  });

  it('rejects a branch outside the membership allowlist', async () => {
    vi.mocked(tenancyRepository.findMembership).mockResolvedValue({
      scope: 'branch', clinicId: ids.clinic, branchIds: [ids.branch], role: 'branch_manager',
    } as any);
    const context = invoke({
      'x-tenant-id': ids.tenant,
      'x-clinic-id': ids.clinic,
      'x-branch-id': ids.otherBranch,
    });
    await context.run();
    expect(context.response.statusCode).toBe(403);
    expect(context.response.body.error.code).toBe('BRANCH_ACCESS_DENIED');
    expect(tenancyRepository.findActiveBranch).not.toHaveBeenCalled();
  });

  it('rejects clinic-scoped memberships selecting a different clinic', async () => {
    vi.mocked(tenancyRepository.findMembership).mockResolvedValue({
      scope: 'clinic', clinicId: ids.clinic, branchIds: [], role: 'clinic_manager',
    } as any);
    const context = invoke({
      'x-tenant-id': ids.tenant,
      'x-clinic-id': ids.otherClinic,
    });
    await context.run();
    expect(context.response.statusCode).toBe(403);
    expect(context.response.body.error.code).toBe('CLINIC_ACCESS_DENIED');
  });

  it('resolves tenant-owned custom roles only inside the active tenant', async () => {
    const roleId = '64b000000000000000000006';
    vi.mocked(tenancyRepository.findMembership).mockResolvedValue({
      _id: '64b000000000000000000007', scope: 'clinic', clinicId: ids.clinic, branchIds: [],
      role: 'custom', customRoleId: roleId, permissionOverrides: { allow: ['branch.read'], deny: [] },
    } as any);
    vi.mocked(tenancyRepository.findActiveTenantRoleById).mockResolvedValue({
      _id: roleId, scope: 'clinic', permissions: ['clinic.settings.read'],
    } as any);
    const context = invoke({ 'x-tenant-id': ids.tenant, 'x-clinic-id': ids.clinic });
    await context.run();
    expect(tenancyRepository.findActiveTenantRoleById).toHaveBeenCalledWith(ids.tenant, roleId);
    expect(context.req.tenantContext).toMatchObject({
      role: 'custom', customRoleId: roleId,
      customPermissions: ['clinic.settings.read'],
      permissionOverrides: { allow: ['branch.read'], deny: [] },
    });
  });

  it('rejects custom roles that do not belong to the active tenant or scope', async () => {
    const roleId = '64b000000000000000000006';
    vi.mocked(tenancyRepository.findMembership).mockResolvedValue({
      _id: '64b000000000000000000007', scope: 'clinic', clinicId: ids.clinic, branchIds: [],
      role: 'custom', customRoleId: roleId,
    } as any);
    vi.mocked(tenancyRepository.findActiveTenantRoleById).mockResolvedValue(null as any);
    const context = invoke({ 'x-tenant-id': ids.tenant, 'x-clinic-id': ids.clinic });
    await context.run();
    expect(context.response.statusCode).toBe(403);
    expect(context.response.body.error.code).toBe('CUSTOM_ROLE_UNAVAILABLE');
    expect(context.next).not.toHaveBeenCalled();
  });

  it('does not resolve a membership from a different tenant', async () => {
    vi.mocked(tenancyRepository.findMembership).mockResolvedValue(null as any);
    const context = invoke({ 'x-tenant-id': ids.tenant });
    await context.run();
    expect(tenancyRepository.findMembership).toHaveBeenCalledWith('64b000000000000000000099', ids.tenant, null);
    expect(context.response.statusCode).toBe(403);
    expect(context.response.body.error.code).toBe('TENANT_ACCESS_DENIED');
  });

  it('allows tenant-scoped memberships to select an active clinic', async () => {
    vi.mocked(tenancyRepository.findMembership).mockResolvedValue({
      scope: 'tenant', clinicId: null, branchIds: [], role: 'tenant_admin',
    } as any);
    const context = invoke({
      'x-tenant-id': ids.tenant,
      'x-clinic-id': ids.clinic,
    });
    await context.run();
    expect(context.next).toHaveBeenCalledOnce();
    expect(context.req.tenantContext).toMatchObject({
      tenantId: ids.tenant, clinicId: ids.clinic, scope: 'tenant', role: 'tenant_admin',
    });
  });
});
