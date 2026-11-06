import type { NextFunction, Request, Response } from 'express';
import { hasPermission } from '../../../../shared/authorization/permission.engine.js';

export const PLATFORM_ROLE_PERMISSIONS: Record<string, readonly string[]> = {
  platform_admin: ['*'],
};

export function getPlatformRolePermissions(role: string): string[] {
  const permissions = PLATFORM_ROLE_PERMISSIONS[role] ?? [];
  return permissions.includes('*') ? ['*'] : [...permissions];
}

export function requirePlatformPermission(permission: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const role = req.auth?.platformRole;
    if (!role || !hasPermission(getPlatformRolePermissions(role), permission)) {
      return res.status(403).json({
        success: false,
        error: { code: 'PLATFORM_PERMISSION_DENIED', message: `Missing platform permission: ${permission}.` },
      });
    }
    next();
  };
}
