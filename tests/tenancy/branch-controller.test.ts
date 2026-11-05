import { describe, expect, it, vi } from 'vitest';

vi.mock('../../src/modules/tenancy/services/tenancy.service.js', () => ({
  tenancyService: { updateBranch: vi.fn(), getBranch: vi.fn() },
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
