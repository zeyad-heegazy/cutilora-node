import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/modules/tenancy/services/tenancy.service.js', () => ({
  tenancyService: { updateBranch: vi.fn(), getBranch: vi.fn(), listBranches: vi.fn() },
}));

import { tenancyController } from '../../src/modules/tenancy/controllers/tenancy.controller.js';
import { tenancyService } from '../../src/modules/tenancy/services/tenancy.service.js';

function response() {
  return {
    statusCode: 200,
    body: undefined as any,
    status(code: number) { this.statusCode = code; return this; },
    json(body: unknown) { this.body = body; return this; },
  };
}

describe('branch controller access checks', () => {
  beforeEach(() => vi.resetAllMocks());

  it('allows tenant-scoped users to list branches across clinics without a clinic header', async () => {
    vi.mocked(tenancyService.listBranches).mockResolvedValue({
      items: [{ _id: 'branch-1', clinicId: 'clinic-1' }],
      pagination: { page: 1, perPage: 25, total: 1, pages: 1 },
    } as any);
    const res = response();
    const next = vi.fn();
    await tenancyController.listBranches({
      tenantContext: {
        tenantId: '64b000000000000000000001',
        clinicId: null,
        branchId: null,
        scope: 'tenant',
        role: 'tenant_admin',
      },
      query: {},
    } as any, res as any, next);
    expect(tenancyService.listBranches).toHaveBeenCalledWith(
      '64b000000000000000000001', null, null,
      { clinicId: undefined, search: undefined, status: undefined, page: 1, perPage: 25 },
    );
    expect(res.statusCode).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(next).not.toHaveBeenCalled();
  });

  it('prevents clinic-scoped users from widening the branch directory to another clinic', async () => {
    const res = response();
    const next = vi.fn();
    await tenancyController.listBranches({
      tenantContext: {
        tenantId: '64b000000000000000000001',
        clinicId: '64b000000000000000000002',
        branchId: null,
        scope: 'clinic',
        role: 'clinic_manager',
      },
      query: { clinicId: '64b000000000000000000003' },
    } as any, res as any, next);
    expect(res.statusCode).toBe(403);
    expect(res.body.error.code).toBe('CLINIC_ACCESS_DENIED');
    expect(tenancyService.listBranches).not.toHaveBeenCalled();
  });

  it('prevents branch managers from changing branch lifecycle status', async () => {
    const res = response();
    const next = vi.fn();
    await tenancyController.updateBranch({
      tenantContext: {
        tenantId: '64b000000000000000000001',
        clinicId: '64b000000000000000000002',
        branchId: '64b000000000000000000003',
        scope: 'branch',
        role: 'branch_manager',
      },
      params: { branchId: '64b000000000000000000003' },
      body: { status: 'suspended' },
    } as any, res as any, next);
    expect(res.statusCode).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
    expect(tenancyService.updateBranch).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it('prevents a branch-scoped user from reading another branch', async () => {
    const res = response();
    const next = vi.fn();
    await tenancyController.getBranch({
      tenantContext: {
        tenantId: '64b000000000000000000001',
        clinicId: '64b000000000000000000002',
        branchId: '64b000000000000000000003',
        scope: 'branch',
        role: 'branch_manager',
      },
      params: { branchId: '64b000000000000000000004' },
    } as any, res as any, next);
    expect(res.statusCode).toBe(403);
    expect(res.body.error.code).toBe('BRANCH_ACCESS_DENIED');
    expect(tenancyService.getBranch).not.toHaveBeenCalled();
  });
});
