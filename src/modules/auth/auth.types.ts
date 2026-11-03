export type PlatformRole = 'platform_admin' | 'user';
export type ClinicRole = 'owner' | 'admin' | 'manager' | 'staff';

export interface AuthenticatedUser {
  userId: string;
  platformRole: PlatformRole;
  activeClinicId: string | null;
  clinicRole: ClinicRole | null;
}

declare global {
  namespace Express {
    interface Request {
      auth?: AuthenticatedUser;
      tenantId?: string;
    }
  }
}
