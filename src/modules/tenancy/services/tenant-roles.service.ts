import { Types } from 'mongoose';
import { TenantRole } from '../models/tenant-role.model.js';
import { TenantMembership } from '../models/tenant-membership.model.js';
import { TenantAuditEvent } from '../models/tenant-audit-event.model.js';
import { Branch } from '../models/branch.model.js';
import { Clinic } from '../models/clinic.model.js';
import { getTenantRolePermissions } from './tenant-access.service.js';
import { tenancyRepository } from '../repositories/tenancy.repository.js';
import { hasScopedPermission, type PermissionGrant } from '../../../shared/authorization/permission.engine.js';

export const TENANT_PERMISSION_CATALOG = [
  { module: 'clinics', actions: ['clinic.manage', 'clinic.settings.read', 'clinic.settings.manage', 'clinic.members.read', 'clinic.documents.read', 'clinic.documents.manage', 'clinic.activity.read'] },
  { module: 'branches', actions: ['branch.read', 'branch.manage', 'branch.update', 'branch.schedule.manage', 'branch.settings.manage', 'branch.members.read', 'branch.activity.read', 'branch.lifecycle.manage', 'branch.holidays.read', 'branch.holidays.manage'] },
  { module: 'users', actions: ['memberships.manage'] },
  { module: 'settings', actions: ['organization.manage', 'configuration.manage'] },
  { module: 'finance', actions: ['billing.read'] },
  { module: 'reports', actions: ['dashboard.read', 'audit.read', 'audit.export'] },
  { module: 'integrations', actions: [] },
] as const;

const permissionKeys = new Set(TENANT_PERMISSION_CATALOG.flatMap((item) => item.actions));
export const TENANT_ROLE_TEMPLATES = [
  { key: 'tenant-admin', name: 'Tenant Admin', scope: 'tenant', permissions: getTenantRolePermissions('tenant_admin'), description: 'Tenant-wide administration using the current tenant-admin permission set.' },
  { key: 'organization-manager', name: 'Organization Manager', scope: 'tenant', permissions: ['organization.manage', 'dashboard.read', 'clinic.manage', 'clinic.settings.read', 'clinic.settings.manage', 'branch.manage', 'branch.update', 'branch.schedule.manage', 'branch.settings.manage', 'branch.lifecycle.manage', 'branch.read', 'branch.holidays.read', 'branch.holidays.manage', 'documents.manage', 'clinic.documents.read', 'clinic.documents.manage', 'clinic.members.read', 'clinic.activity.read', 'branch.members.read', 'branch.activity.read', 'configuration.manage', 'memberships.manage', 'audit.read'], description: 'Manages tenant organization structure and users without billing access.' },
  { key: 'clinic-manager', name: 'Clinic Manager', scope: 'clinic', permissions: getTenantRolePermissions('clinic_manager'), description: 'Manages one selected clinic and its branches.' },
  { key: 'branch-manager', name: 'Branch Manager', scope: 'branch', permissions: getTenantRolePermissions('branch_manager'), description: 'Manages only the explicitly selected branches.' },
  { key: 'finance-viewer', name: 'Finance Viewer', scope: 'tenant', permissions: ['billing.read'], description: 'Read-only access to existing subscription and invoice APIs.' },
  { key: 'finance-manager', name: 'Finance Manager', scope: 'tenant', permissions: ['billing.read'], description: 'Current billing APIs are read-only; management grants will be added with the Finance domain.' },
  { key: 'read-only-analyst', name: 'Read-only Analyst', scope: 'tenant', permissions: ['dashboard.read', 'audit.read', 'clinic.members.read', 'clinic.activity.read', 'branch.read', 'branch.members.read', 'branch.activity.read'], description: 'Read-only operational visibility without mutation or membership-management permissions.' },
] as const;

const builtInScopes: Record<string, 'tenant' | 'clinic' | 'branch'> = {
  tenant_owner: 'tenant', tenant_admin: 'tenant', billing_admin: 'tenant',
  clinic_admin: 'clinic', clinic_manager: 'clinic', branch_manager: 'branch',
  staff: 'clinic', provider: 'clinic', receptionist: 'clinic',
};

function objectId(value: string) { return Types.ObjectId.isValid(value) && /^[0-9a-f]{24}$/i.test(value); }
function normalizeKey(value: string) { return value.trim().toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''); }
  return value.trim().toLowerCase().normalize('NFKD').replace(/[\\u0300-\\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}
function fail(status: number, code: string, message: string): never { throw { status, code, message }; }

function validateGrantShape(grant: any, roleScope: string) {
  if (!grant || !permissionKeys.has(grant.permission)) fail(400, 'PERMISSION_INVALID', 'One or more permissions are not in the supported permission catalog.');
  if (!['tenant', 'clinic', 'branch'].includes(grant.scope)) fail(400, 'PERMISSION_SCOPE_INVALID', 'Permission scope is invalid.');
  if (roleScope === 'clinic' && grant.scope === 'tenant') fail(400, 'ROLE_SCOPE_ESCALATION', 'Clinic roles cannot contain tenant-wide grants.');
  if (roleScope === 'branch' && grant.scope !== 'branch') fail(400, 'ROLE_SCOPE_ESCALATION', 'Branch roles may contain branch-only grants.');
  if (grant.scope === 'tenant' && (grant.clinicId || grant.branchId)) fail(400, 'PERMISSION_SCOPE_INVALID', 'Tenant grants cannot target a clinic or branch.');
  if (grant.scope === 'clinic' && (!grant.clinicId || grant.branchId)) fail(400, 'PERMISSION_SCOPE_INVALID', 'Clinic grants require a clinic and cannot target a branch.');
  if (grant.scope === 'branch' && (!grant.clinicId || !grant.branchId)) fail(400, 'PERMISSION_SCOPE_INVALID', 'Branch grants require both clinic and branch IDs.');
}

async function actorGrants(tenantId: string, actorId: string, clinicId: string | null): Promise<PermissionGrant[]> {
  const membership = await TenantMembership.findOne({
    userId: actorId, tenantId, status: 'active',
    ...(clinicId ? { $or: [{ clinicId }, { clinicId: null }] } : { clinicId: null }),
  }).sort({ clinicId: clinicId ? -1 : 1 }).lean() as any;
  if (!membership) fail(403, 'TENANT_ACCESS_DENIED', 'An active tenant membership is required.');
  if (membership.roleId) {
    const role = await TenantRole.findOne({ _id: membership.roleId, tenantId, status: 'active' }).lean() as any;
    if (!role) fail(403, 'ROLE_UNAVAILABLE', 'The assigned custom role is unavailable.');
    return role.permissions as PermissionGrant[];
  }
  const scope = builtInScopes[membership.role] ?? 'branch';
  const permissions = getTenantRolePermissions(membership.role);
  return permissions.map((permission) => ({
    permission, scope,
    ...(scope === 'clinic' || scope === 'branch' ? { clinicId: membership.clinicId ? String(membership.clinicId) : null } : {}),
    ...(scope === 'branch' ? { branchId: null } : {}),
  }));
}

async function assertActorCanGrant(tenantId: string, actorId: string, actorClinicId: string | null, grants: PermissionGrant[]) {
  const authority = await actorGrants(tenantId, actorId, actorClinicId);
  for (const grant of grants) {
    if (!hasScopedPermission(authority, grant.permission, { scope: grant.scope, clinicId: grant.clinicId, branchId: grant.branchId })) {
      fail(403, 'GRANT_EXCEEDS_ACTOR_AUTHORITY', `You cannot grant permission ${grant.permission} at the selected scope.`);
    }
  }
}

async function validateGrantTargets(tenantId: string, grants: PermissionGrant[]) {
  for (const grant of grants) {
    validateGrantShape(grant, grant.scope);
    if (grant.scope === 'clinic' && !await Clinic.exists({ _id: grant.clinicId, tenantId, status: 'active' })) {
      fail(400, 'PERMISSION_TARGET_INVALID', 'The selected clinic must be active and belong to this tenant.');
    }
    if (grant.scope === 'branch' && !await Branch.exists({ _id: grant.branchId, tenantId, clinicId: grant.clinicId, status: 'active' })) {
      fail(400, 'PERMISSION_TARGET_INVALID', 'The selected branch must be active and belong to the selected clinic and tenant.');
    }
  }
}

async function audit(tenantId: string, actorUserId: string, action: string, targetId: string, metadata: Record<string, unknown> = {}) {
  await TenantAuditEvent.create({ tenantId, actorUserId, action, targetType: 'tenant_role', targetId, metadata });
}

const scopeRank: Record<string, number> = { tenant: 0, clinic: 1, branch: 2 };
function withGrantSource(grant: PermissionGrant, requestedScope: string) {
  return { ...grant, source: scopeRank[grant.scope] < scopeRank[requestedScope] ? 'inherited' : 'direct' };
}

function serialize(role: any) {
  return {
    id: String(role._id), key: role.key, name: role.name, description: role.description,
    scope: role.scope, permissions: role.permissions, version: role.version,
    status: role.status, createdAt: role.createdAt, updatedAt: role.updatedAt,
  };
}

export const tenantRolesService = {
  list(tenantId: string) {
    return TenantRole.find({ tenantId }).sort({ status: 1, name: 1 }).lean().then((items: any[]) => items.map(serialize));
  },
  async get(tenantId: string, roleId: string) {
    if (!objectId(roleId)) return null;
    const role = await TenantRole.findOne({ _id: roleId, tenantId }).lean();
    return role ? serialize(role) : null;
  },
  async create(tenantId: string, actorId: string, actorClinicId: string | null, input: any) {
    const key = normalizeKey(input.key || input.name);
    if (!key) fail(400, 'ROLE_KEY_INVALID', 'A valid role key is required.');
    if (['tenant-owner', 'tenant-admin', 'platform-admin'].includes(key)) fail(400, 'ROLE_KEY_RESERVED', 'This role key is reserved.');
    const grants = input.permissions as PermissionGrant[];
    for (const grant of grants) validateGrantShape(grant, input.scope);
    await validateGrantTargets(tenantId, grants);
    await assertActorCanGrant(tenantId, actorId, actorClinicId, grants);
    const role = await TenantRole.create({ tenantId, key, name: input.name, description: input.description ?? '', scope: input.scope, permissions: grants, createdBy: actorId, updatedBy: actorId });
    await audit(tenantId, actorId, 'access.role.created', String(role._id), { key, scope: role.scope, version: role.version });
    return serialize(role.toObject());
  },
  async update(tenantId: string, actorId: string, actorClinicId: string | null, roleId: string, input: any) {
    if (!objectId(roleId)) return null;
    const current = await TenantRole.findOne({ _id: roleId, tenantId, status: 'active' });
    if (!current) return null;
    if (input.expectedVersion !== current.version) fail(409, 'ROLE_VERSION_CONFLICT', 'The role version is stale. Reload the role before saving changes.');
    const nextScope = input.scope ?? current.scope;
    const grants = input.permissions ?? current.permissions;
    for (const grant of grants) validateGrantShape(grant, nextScope);
    await validateGrantTargets(tenantId, grants);
    await assertActorCanGrant(tenantId, actorId, actorClinicId, grants);
    const updated = await TenantRole.findOneAndUpdate(
      { _id: roleId, tenantId, status: 'active', version: current.version },
      { $set: { ...(input.name ? { name: input.name } : {}), ...(input.description !== undefined ? { description: input.description } : {}), scope: nextScope, permissions: grants, updatedBy: actorId, version: current.version + 1 } },
      { new: true, runValidators: true },
    );
    if (!updated) fail(409, 'ROLE_VERSION_CONFLICT', 'This role changed while you were editing it. Reload and retry.');
    await audit(tenantId, actorId, 'access.role.updated', roleId, { previousVersion: current.version, version: updated.version, permissionsChanged: input.permissions !== undefined });
    return serialize(updated.toObject());
  },
  async clone(tenantId: string, actorId: string, actorClinicId: string | null, roleId: string, input: any) {
    if (roleId.startsWith('template:')) {
      const template = TENANT_ROLE_TEMPLATES.find((item) => item.key === roleId.slice('template:'.length));
      if (!template) return null;
      let grants: PermissionGrant[];
      if (template.scope === 'tenant') {
        grants = template.permissions.map((permission) => ({ permission, scope: 'tenant' }));
      } else if (template.scope === 'clinic') {
        if (!input.clinicId) fail(400, 'CLINIC_REQUIRED', 'Cloning a clinic role template requires clinicId.');
        grants = template.permissions.map((permission) => ({ permission, scope: 'clinic', clinicId: input.clinicId }));
      } else {
        if (!input.clinicId || !input.branchIds?.length) fail(400, 'BRANCH_REQUIRED', 'Cloning a branch role template requires clinicId and at least one branchId.');
        grants = input.branchIds.flatMap((branchId: string) => template.permissions.map((permission) => ({ permission, scope: 'branch' as const, clinicId: input.clinicId, branchId })));
      }
      return this.create(tenantId, actorId, actorClinicId, { key: input.key, name: input.name, description: input.description ?? template.description, scope: template.scope, permissions: grants });
    }
    if (!objectId(roleId)) return null;
    const source = await TenantRole.findOne({ _id: roleId, tenantId, status: 'active' }).lean() as any;
    if (!source) return null;
    return this.create(tenantId, actorId, actorClinicId, { key: input.key, name: input.name, description: input.description ?? source.description, scope: source.scope, permissions: source.permissions });
  },
  async deactivate(tenantId: string, actorId: string, roleId: string) {
    if (!objectId(roleId)) return null;
    const role = await TenantRole.findOneAndUpdate({ _id: roleId, tenantId, status: 'active' }, { $set: { status: 'deactivated', deactivatedAt: new Date(), deactivatedBy: actorId, updatedBy: actorId }, $inc: { version: 1 } }, { new: true });
    if (!role) return null;
    const assigned = await TenantMembership.countDocuments({ tenantId, roleId: role._id, status: { $in: ['active', 'invited'] } });
    if (assigned) {
      await TenantRole.updateOne({ _id: role._id, tenantId }, { $set: { status: 'active', deactivatedAt: null, deactivatedBy: null }, $inc: { version: 1 } });
      fail(409, 'ROLE_IN_USE', 'A role assigned to active memberships cannot be deactivated. Reassign those users first.');
    }
    await audit(tenantId, actorId, 'access.role.deactivated', String(role._id), { version: role.version });
    return serialize(role.toObject());
  },
  async assign(tenantId: string, actorId: string, actorRole: string, membershipId: string, roleId: string) {
    if (!objectId(membershipId) || !objectId(roleId)) return null;
    if (actorRole !== 'tenant_owner' && actorRole !== 'tenant_admin') fail(403, 'ROLE_ASSIGNMENT_FORBIDDEN', 'Only Tenant Owners and Tenant Admins may assign roles.');
    const membership = await TenantMembership.findOne({ _id: membershipId, tenantId, status: { $in: ['active', 'invited'] } });
    if (!membership) return null;
    if (String(membership.userId) === actorId) fail(403, 'SELF_ROLE_ESCALATION', 'You cannot change your own role assignment.');
    if (actorRole !== 'tenant_owner' && membership.scope === 'tenant') fail(403, 'TENANT_OWNER_REQUIRED', 'Only the Tenant Owner can change tenant-wide role assignments.');
    const role = await TenantRole.findOne({ _id: roleId, tenantId, status: 'active' }).lean() as any;
    if (!role) fail(404, 'ROLE_NOT_FOUND', 'Active custom role not found.');
    if (role.scope !== membership.scope) fail(400, 'ROLE_SCOPE_MISMATCH', 'The custom role scope must match the membership scope.');
    if (role.scope === 'clinic' && !membership.clinicId) fail(400, 'ROLE_SCOPE_MISMATCH', 'Clinic-scoped roles require a clinic membership.');
    if (role.scope === 'branch' && !membership.branchIds?.length) fail(400, 'ROLE_SCOPE_MISMATCH', 'Branch-scoped roles require at least one assigned branch.');
    for (const grant of role.permissions as PermissionGrant[]) {
      if (grant.scope !== 'tenant' && String(grant.clinicId) !== String(membership.clinicId)) fail(400, 'ROLE_SCOPE_MISMATCH', 'A scoped permission must target the membership clinic.');
      if (grant.scope === 'branch' && !(membership.branchIds ?? []).some((id: unknown) => String(id) === String(grant.branchId))) fail(400, 'ROLE_SCOPE_MISMATCH', 'A branch permission must target a branch assigned to this membership.');
    }
    await assertActorCanGrant(tenantId, actorId, null, role.permissions as PermissionGrant[]);
    const oldRole = membership.role;
    const demotingLastOwnerCandidate = membership.scope === 'tenant' && membership.role === 'tenant_owner' && membership.status === 'active';
    let ownerLock = false;
    if (demotingLastOwnerCandidate) {
      const acquired = await tenancyRepository.acquireTenantOwnerMutationLock(tenantId, new Date(), 30_000);
      if (!acquired) fail(409, 'OWNER_CHANGE_IN_PROGRESS', 'Another Tenant Owner change is in progress. Retry shortly.');
      ownerLock = true;
    }
    try {
      if (demotingLastOwnerCandidate && await tenancyRepository.countActiveTenantOwners(tenantId) <= 1) fail(409, 'LAST_TENANT_OWNER_REQUIRED', 'The last active Tenant Owner cannot be demoted.');
      membership.role = 'custom_role';
      membership.roleId = role._id;
      membership.updatedBy = actorId as any;
      await membership.save();
    } finally {
      if (ownerLock) await tenancyRepository.releaseTenantOwnerMutationLock(tenantId).catch(() => null);
    }
    await audit(tenantId, actorId, 'access.role.assigned', membershipId, { oldRole, roleId, roleKey: role.key, scope: role.scope, roleVersion: role.version });
    return { membershipId, userId: String(membership.userId), role: 'custom_role', roleId, roleName: role.name, scope: membership.scope, clinicId: membership.clinicId ? String(membership.clinicId) : null, branchIds: (membership.branchIds ?? []).map(String) };
  },
  async currentAccess(tenantId: string, userId: string, clinicId: string | null, branchId: string | null) {
    const membership = await TenantMembership.findOne({ userId, tenantId, status: 'active', ...(clinicId ? { $or: [{ clinicId }, { clinicId: null }] } : { clinicId: null }) }).sort({ clinicId: clinicId ? -1 : 1 }).lean() as any;
    if (!membership) return null;
    if (membership.roleId) {
      const role = await TenantRole.findOne({ _id: membership.roleId, tenantId, status: 'active' }).lean() as any;
      if (!role) return { role: 'custom_role', roleId: String(membership.roleId), scope: membership.scope, permissions: [], status: 'role_unavailable' };
      const requestedScope = branchId ? 'branch' : clinicId ? 'clinic' : 'tenant';
      const grants = (role.permissions as PermissionGrant[]).filter((grant) => hasScopedPermission([grant], grant.permission, { scope: requestedScope, clinicId, branchId })).map((grant) => withGrantSource(grant, requestedScope));
      return { role: 'custom_role', roleId: String(role._id), roleName: role.name, scope: membership.scope, clinicId: membership.clinicId ? String(membership.clinicId) : null, branchIds: (membership.branchIds ?? []).map(String), permissions: grants, roleVersion: role.version };
    }
    return { role: membership.role, scope: membership.scope, clinicId: membership.clinicId ? String(membership.clinicId) : null, branchIds: (membership.branchIds ?? []).map(String), permissions: getTenantRolePermissions(membership.role) };
  },
  async effectiveAccess(tenantId: string, userId: string) {
    if (!objectId(userId)) return null;
    const memberships = await TenantMembership.find({ tenantId, userId }).lean() as any[];
    if (!memberships.length) return null;
    const access = [];
    for (const membership of memberships) {
      let role = null as any;
      let permissions: any[] = [];
      if (membership.status === 'active') {
        if (membership.roleId) {
          role = await TenantRole.findOne({ _id: membership.roleId, tenantId, status: 'active' }).lean();
          permissions = (role?.permissions ?? []).map((grant: PermissionGrant) => withGrantSource(grant, membership.scope));
        } else permissions = getTenantRolePermissions(membership.role);
      }
      access.push({ membershipId: String(membership._id), status: membership.status, role: membership.role, roleId: membership.roleId ? String(membership.roleId) : null, roleName: role?.name ?? null, roleVersion: role?.version ?? null, scope: membership.scope, clinicId: membership.clinicId ? String(membership.clinicId) : null, branchIds: (membership.branchIds ?? []).map(String), permissions });
    }
    return { userId, memberships: access };
  },
};
