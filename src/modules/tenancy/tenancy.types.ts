export type TenantRole = 'tenant_owner' | 'tenant_admin' | 'billing_admin';
export type ClinicRole = 'clinic_admin' | 'clinic_manager' | 'branch_manager' | 'staff' | 'provider' | 'receptionist';
export type MembershipRole = TenantRole | ClinicRole;
export type AccessScope = 'tenant' | 'clinic' | 'branch';

export interface TenantContext {
  tenantId: string;
  clinicId: string | null;
  branchId: string | null;
  role: MembershipRole;
  scope: AccessScope;
}
