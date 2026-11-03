import type { MembershipRole, TenantContext } from '../tenancy/tenancy.types.js';

export type PlatformRole = 'platform_admin' | 'user';
export interface AuthenticatedUser {
  userId: string;
  platformRole: PlatformRole;
  activeClinicId: string | null;
  clinicRole: MembershipRole | null;
}
declare global {
  namespace Express {
    interface Request {
      auth?: AuthenticatedUser;
      tenantId?: string;
      tenantContext?: TenantContext;
    }
  }
}
