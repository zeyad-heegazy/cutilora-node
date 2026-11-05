import { describe, expect, it, vi } from 'vitest';
import { getPlatformRolePermissions, requirePlatformPermission } from '../../src/modules/platform/auth/middleware/platform-permissions.js';

function run(role: string | undefined, permission: string) {
  const req = { auth: role ? { platformRole: role } : undefined } as any;
  const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as any;
  const next = vi.fn();
  requirePlatformPermission(permission)(req, res, next);
  return { res, next };
}

describe('Platform RBAC adapter', () => {
  it('uses shared permission evaluation and grants platform admin the current full access', () => {
    expect(getPlatformRolePermissions('platform_admin')).toEqual(['*']);
    expect(run('platform_admin', 'platform.tenants.create').next).toHaveBeenCalledOnce();
  });

  it('denies missing and unknown platform roles by default', () => {
    expect(run(undefined, 'platform.tenants.read').res.status).toHaveBeenCalledWith(403);
    expect(run('unknown', 'platform.tenants.read').next).not.toHaveBeenCalled();
  });
});
