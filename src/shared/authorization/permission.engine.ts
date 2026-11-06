export type AuthorizationScope = 'platform' | 'tenant' | 'clinic' | 'branch';

export interface PermissionGrant {
  permission: string;
  scope: AuthorizationScope;
  clinicId?: string | null;
  branchId?: string | null;
}

/**
 * Shared deny-by-default permission evaluator used by Platform and Tenant
 * authorization adapters. Domain and scope selection stay with the caller;
 * this module only evaluates explicit grants.
 */
export function hasPermission(
  grants: readonly (string | PermissionGrant)[],
  requiredPermission: string,
): boolean {
  return grants.some((grant) => {
    if (typeof grant === 'string') {
      return grant === '*' || grant === requiredPermission;
    }
    return grant.permission === '*' || grant.permission === requiredPermission;
  });
}

export function hasScopedPermission(
  grants: readonly PermissionGrant[],
  requiredPermission: string,
  requestedScope: { scope: AuthorizationScope; clinicId?: string | null; branchId?: string | null },
): boolean {
  return grants.some((grant) => {
    if (grant.permission !== '*' && grant.permission !== requiredPermission) return false;
    if (grant.scope === 'platform') return requestedScope.scope === 'platform';
    if (grant.scope === 'tenant') return requestedScope.scope !== 'platform';
    if (grant.scope === 'clinic') {
      return requestedScope.scope === 'clinic' || requestedScope.scope === 'branch'
        ? Boolean(grant.clinicId && requestedScope.clinicId && grant.clinicId === requestedScope.clinicId)
        : false;
    }
    return requestedScope.scope === 'branch'
      && Boolean(grant.clinicId && grant.branchId && grant.clinicId === requestedScope.clinicId && grant.branchId === requestedScope.branchId);
  });
}
