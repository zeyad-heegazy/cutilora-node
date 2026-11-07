import { z } from 'zod';
export const grantSchema = z.object({
  permission: z.string().trim().min(3).max(120),
  scope: z.enum(['tenant', 'clinic', 'branch']),
  clinicId: z.string().regex(/^[a-fA-F0-9]{24}$/).nullable().optional(),
  branchId: z.string().regex(/^[a-fA-F0-9]{24}$/).nullable().optional(),
});
export const createRoleSchema = z.object({
  key: z.string().trim().min(2).max(80).optional(),
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(500).optional(),
  scope: z.enum(['tenant', 'clinic', 'branch']),
  permissions: z.array(grantSchema).max(200),
});
export const updateRoleSchema = z.object({
  expectedVersion: z.number().int().positive(),
  name: z.string().trim().min(2).max(120).optional(),
  description: z.string().trim().max(500).optional(),
  scope: z.enum(['tenant', 'clinic', 'branch']).optional(),
  permissions: z.array(grantSchema).max(200).optional(),
}).refine((value) => Object.keys(value).some((key) => key !== 'expectedVersion'), 'At least one role field must be provided.');
export const cloneRoleSchema = z.object({
  key: z.string().trim().min(2).max(80),
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(500).optional(),
  clinicId: z.string().regex(/^[a-fA-F0-9]{24}$/).optional(),
  branchIds: z.array(z.string().regex(/^[a-fA-F0-9]{24}$/)).max(20).optional(),
});
export const assignRoleSchema = z.object({ roleId: z.string().regex(/^[a-fA-F0-9]{24}$/) });
