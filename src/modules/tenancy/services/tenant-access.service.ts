export const TENANT_ROLE_PERMISSIONS: Record<string, readonly string[]> = {
  tenant_owner: ['*'],
  tenant_admin: [
    'organization.manage', 'dashboard.read', 'clinic.manage', 'clinic.settings.read', 'clinic.settings.manage', 'branch.manage',
    'branch.update', 'branch.lifecycle.manage', 'branch.read', 'branch.holidays.read', 'branch.holidays.manage',
    'documents.manage', 'configuration.manage', 'memberships.manage', 'audit.read', 'billing.read',
  ],
  billing_admin: ['billing.read'],
  clinic_admin: ['clinic.settings.read', 'clinic.settings.manage', 'branch.read', 'branch.manage', 'branch.update', 'branch.holidays.read', 'branch.holidays.manage'],
  clinic_manager: ['clinic.settings.read', 'clinic.settings.manage', 'branch.read', 'branch.manage', 'branch.update', 'branch.holidays.read', 'branch.holidays.manage'],
  branch_manager: ['branch.read', 'branch.holidays.read', 'branch.holidays.manage'],
  staff: ['branch.read', 'branch.holidays.read'],
  provider: ['branch.read', 'branch.holidays.read'],
  receptionist: ['branch.read', 'branch.holidays.read'],
};

const TENANT_ROLE_SCOPES: Record<string, readonly string[]> = {
  tenant_owner: ['tenant'],
  tenant_admin: ['tenant'],
  billing_admin: ['tenant'],
  clinic_admin: ['clinic'],
  clinic_manager: ['clinic'],
  branch_manager: ['branch'],
  staff: ['clinic', 'branch'],
  provider: ['clinic', 'branch'],
  receptionist: ['clinic', 'branch'],
};

const TENANT_ROLE_LABELS: Record<string, string> = {
  tenant_owner: 'Tenant Owner',
  tenant_admin: 'Tenant Admin',
  billing_admin: 'Billing Admin',
  clinic_admin: 'Clinic Admin',
  clinic_manager: 'Clinic Manager',
  branch_manager: 'Branch Manager',
  staff: 'Staff',
  provider: 'Provider',
  receptionist: 'Receptionist',
};

export function getTenantRolePermissions(role: string): string[] {
  const permissions = TENANT_ROLE_PERMISSIONS[role] ?? [];
  return permissions.includes('*') ? ['*'] : [...permissions];
}

export function getTenantRoleCatalog(actorRole: string) {
  const grantableByOwner = ['tenant_admin', 'billing_admin', 'clinic_admin', 'clinic_manager', 'branch_manager', 'staff', 'provider', 'receptionist'];
  const grantableByAdmin = ['billing_admin', 'clinic_admin', 'clinic_manager', 'branch_manager', 'staff', 'provider', 'receptionist'];
  const grantable = actorRole === 'tenant_owner' ? grantableByOwner : actorRole === 'tenant_admin' ? grantableByAdmin : [];
  return Object.entries(TENANT_ROLE_PERMISSIONS).map(([role, permissions]) => ({
    role,
    label: TENANT_ROLE_LABELS[role] ?? role,
    scopes: [...(TENANT_ROLE_SCOPES[role] ?? [])],
    permissions: permissions.includes('*') ? ['*'] : [...permissions],
    assignableByCurrentUser: grantable.includes(role),
    customizable: false,
  }));
}
