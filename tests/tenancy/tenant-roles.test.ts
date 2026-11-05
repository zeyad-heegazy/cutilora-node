import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  membershipFindOne: vi.fn(),
  membershipCountDocuments: vi.fn(),
  roleFindOne: vi.fn(),
  roleCreate: vi.fn(),
  roleFindOneAndUpdate: vi.fn(),
  roleUpdateOne: vi.fn(),
  auditCreate: vi.fn(),
  branchExists: vi.fn(),
  clinicExists: vi.fn(),
}));

vi.mock('../../src/modules/tenancy/models/tenant-membership.model.js', () => ({
  TenantMembership: {
    findOne: (...args: any[]) => mocks.membershipFindOne(...args),
    countDocuments: (...args: any[]) => mocks.membershipCountDocuments(...args),
  },
}));
vi.mock('../../src/modules/tenancy/models/tenant-role.model.js', () => ({
  TenantRole: {
    findOne: (...args: any[]) => mocks.roleFindOne(...args),
    create: (...args: any[]) => mocks.roleCreate(...args),
    findOneAndUpdate: (...args: any[]) => mocks.roleFindOneAndUpdate(...args),
    updateOne: (...args: any[]) => mocks.roleUpdateOne(...args),
  },
}));
vi.mock('../../src/modules/tenancy/models/tenant-audit-event.model.js', () => ({
  TenantAuditEvent: { create: (...args: any[]) => mocks.auditCreate(...args) },
}));
vi.mock('../../src/modules/tenancy/models/branch.model.js', () => ({
  Branch: { exists: (...args: any[]) => mocks.branchExists(...args) },
}));
vi.mock('../../src/modules/tenancy/models/clinic.model.js', () => ({
  Clinic: { exists: (...args: any[]) => mocks.clinicExists(...args) },
}));

import { tenantRolesService, TENANT_ROLE_TEMPLATES } from '../../src/modules/tenancy/services/tenant-roles.service.js';

function query(value: any) {
  const chain: any = { sort: () => chain, select: () => chain, lean: async () => value, then: (resolve: any, reject: any) => Promise.resolve(value).then(resolve, reject) };
  return chain;
}

describe('tenant custom role service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.membershipFindOne.mockReturnValue(query({ role: 'tenant_owner', roleId: null, scope: 'tenant', clinicId: null }));
    mocks.roleFindOne.mockReturnValue(query(null));
    mocks.roleCreate.mockImplementation(async (input: any) => ({
      ...input, _id: 'role-new', version: 1, status: 'active', createdAt: new Date(), updatedAt: new Date(),
      toObject() { return this; },
    }));
    mocks.auditCreate.mockResolvedValue({});
    mocks.branchExists.mockResolvedValue(true);
    mocks.clinicExists.mockResolvedValue(true);
  });

  it('creates a tenant-scoped custom role within the Tenant Owner authority and audits it', async () => {
    const role = await tenantRolesService.create('tenant-a', 'owner-a', null, {
      key: 'finance-viewer',
      name: 'Finance Viewer',
      scope: 'tenant',
      permissions: [{ permission: 'billing.read', scope: 'tenant' }],
    });
    expect(role).toMatchObject({ id: 'role-new', key: 'finance-viewer', scope: 'tenant' });
    expect(mocks.roleCreate).toHaveBeenCalledOnce();
    expect(mocks.auditCreate).toHaveBeenCalledWith(expect.objectContaining({ action: 'access.role.created', tenantId: 'tenant-a' }));
  });

  it('rejects grants beyond a custom actor effective authority', async () => {
    mocks.membershipFindOne.mockReturnValue(query({ role: 'custom_role', roleId: 'role-actor', scope: 'tenant', clinicId: null }));
    mocks.roleFindOne.mockReturnValue(query({
      permissions: [{ permission: 'branch.read', scope: 'branch', clinicId: 'clinic-a', branchId: 'branch-a' }],
    }));
    await expect(tenantRolesService.create('tenant-a', 'manager-a', null, {
      key: 'elevated',
      name: 'Elevated',
      scope: 'tenant',
      permissions: [{ permission: 'clinic.manage', scope: 'tenant' }],
    })).rejects.toMatchObject({ status: 403, code: 'GRANT_EXCEEDS_ACTOR_AUTHORITY' });
    expect(mocks.roleCreate).not.toHaveBeenCalled();
  });

  it('rejects a branch grant whose target is not in the selected tenant and clinic', async () => {
    mocks.branchExists.mockResolvedValue(false);
    await expect(tenantRolesService.create('tenant-a', 'owner-a', null, {
      key: 'branch-reader',
      name: 'Branch Reader',
      scope: 'branch',
      permissions: [{ permission: 'branch.read', scope: 'branch', clinicId: 'clinic-a', branchId: 'branch-b' }],
    })).rejects.toMatchObject({ status: 400, code: 'PERMISSION_TARGET_INVALID' });
    expect(mocks.roleCreate).not.toHaveBeenCalled();
  });

  it('provides the requested configurable starter role templates', () => {
    expect(TENANT_ROLE_TEMPLATES.map((template) => template.name)).toEqual(expect.arrayContaining([
      'Tenant Admin', 'Organization Manager', 'Clinic Manager', 'Branch Manager', 'Finance Viewer', 'Finance Manager', 'Read-only Analyst',
    ]));
  });

  it('clones a branch manager starter template with explicit branch targets', async () => {
    await tenantRolesService.clone('tenant-a', 'owner-a', null, 'template:branch-manager', {
      key: 'north-branch-manager', name: 'North Branch Manager', clinicId: 'clinic-a', branchIds: ['branch-a'],
    });
    expect(mocks.roleCreate).toHaveBeenCalledWith(expect.objectContaining({
      scope: 'branch',
      permissions: expect.arrayContaining([expect.objectContaining({ permission: 'branch.read', scope: 'branch', clinicId: 'clinic-a', branchId: 'branch-a' })]),
    }));
  });

  it('rejects stale role edits instead of overwriting a newer permission version', async () => {
    mocks.roleFindOne.mockReturnValue(query({ _id: 'role-a', version: 4, scope: 'tenant', permissions: [] }));
    await expect(tenantRolesService.update('tenant-a', 'owner-a', null, '507f1f77bcf86cd799439011', {
      expectedVersion: 3,
      name: 'Stale Update',
    })).rejects.toMatchObject({ status: 409, code: 'ROLE_VERSION_CONFLICT' });
  });
});
