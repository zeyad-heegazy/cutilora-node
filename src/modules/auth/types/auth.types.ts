import type { MembershipRole, TenantContext } from '../../tenancy/types/tenancy.types.js';
export type PlatformRole = 'platform_admin' | 'user';
export interface AuthenticatedUser { userId: string; platformRole: PlatformRole; activeClinicId: string | null; clinicRole: MembershipRole | 'custom' | null; }
declare global {
  namespace Express {
    interface Request { auth?: AuthenticatedUser; tenantId?: string; tenantContext?: TenantContext; }
  }
}