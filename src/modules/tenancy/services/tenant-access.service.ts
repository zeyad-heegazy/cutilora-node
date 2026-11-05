export const TENANT_ROLE_PERMISSIONS: Record<string, readonly string[]> = {
  tenant_owner: ['*'],
  tenant_admin: [
    'organization.manage', 'dashboard.read', 'clinic.manage', 'clinic.settings.read', 'clinic.settings.manage', 'branch.manage',
    'branch.update', 'branch.schedule.manage', 'branch.settings.manage', 'branch.members.read', 'branch.activity.read', 'branch.lifecycle.manage', 'branch.read', 'branch.holidays.read', 'branch.holidays.manage',
    'documents.manage', 'clinic.documents.read', 'clinic.documents.manage', 'clinic.members.read', 'clinic.activity.read', 'configuration.manage', 'memberships.manage', 'audit.read', 'audit.export', 'billing.read',
  ],
  billing_admin: ['billing.read', 'finance.read', 'finance.invoices.read', 'finance.expenses.read', 'finance.receivables.read', 'finance.reports.read'],
  clinic_admin: ['clinic.settings.read', 'clinic.settings.manage', 'clinic.documents.read', 'clinic.documents.manage', 'clinic.members.read', 'clinic.activity.read', 'branch.read', 'branch.manage', 'branch.update', 'branch.schedule.manage', 'branch.settings.manage', 'branch.members.read', 'branch.activity.read', 'branch.holidays.read', 'branch.holidays.manage'],
  clinic_manager: ['clinic.settings.read', 'clinic.settings.manage', 'clinic.documents.read', 'clinic.documents.manage', 'clinic.members.read', 'clinic.activity.read', 'branch.read', 'branch.manage', 'branch.update', 'branch.schedule.manage', 'branch.settings.manage', 'branch.members.read', 'branch.activity.read', 'branch.holidays.read', 'branch.holidays.manage'],
  branch_manager: ['branch.read', 'branch.members.read', 'branch.activity.read', 'branch.schedule.manage', 'branch.settings.manage', 'branch.holidays.read', 'branch.holidays.manage'],
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

const FINANCE_PERMISSION_CATALOG = ['finance.read', 'finance.invoices.read', 'finance.invoices.manage', 'finance.payments.manage', 'finance.refunds.manage', 'finance.expenses.read', 'finance.expenses.manage', 'finance.cash.read', 'finance.cash.manage', 'finance.cash.approve', 'finance.receivables.read', 'finance.reports.read', 'finance.credit-notes.manage'];
export const TENANT_PERMISSION_CATALOG = [...new Set([...Object.values(TENANT_ROLE_PERMISSIONS).flat().filter((permission) => permission !== '*'), ...FINANCE_PERMISSION_CATALOG])].sort();

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


export function getTenantRoleGrants(
  role: string,
  context: { scope: 'tenant' | 'clinic' | 'branch'; clinicId?: string | null; branchId?: string | null; customPermissions?: string[]; permissionOverrides?: { allow?: string[]; deny?: string[] } },
) {
  const denied = new Set(context.permissionOverrides?.deny ?? []);
  const permissions = [...new Set([
    ...(context.customPermissions ?? getTenantRolePermissions(role)),
    ...(context.permissionOverrides?.allow ?? []),
  ])].filter((permission) => !denied.has(permission));
  return permissions.map((permission) => ({
    permission,
    scope: context.scope,
    ...(context.clinicId ? { clinicId: context.clinicId } : {}),
    ...(context.branchId ? { branchId: context.branchId } : {}),
  })) as Array<{
    permission: string;
    scope: 'tenant' | 'clinic' | 'branch';
    clinicId?: string;
    branchId?: string;
  }>;
}
