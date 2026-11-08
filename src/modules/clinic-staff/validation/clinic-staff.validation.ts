import { z } from 'zod';

const id = z.string().regex(/^[a-f\d]{24}$/i, 'Must be a valid identifier.');
const optionalText = (max: number) => z.string().trim().max(max).optional();
const branchIds = z.array(id).max(100).default([]);
const pagination = {
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(25),
  search: z.string().trim().max(120).optional(),
  status: z.string().optional(),
  branchId: id.optional(),
};

export const employeeListSchema = z.object(pagination);
export const createEmployeeSchema = z.object({
  employeeCode: optionalText(40),
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  displayName: optionalText(160),
  email: z.string().trim().email().max(254).optional().or(z.literal('')),
  phone: optionalText(40),
  jobTitle: optionalText(120),
  employmentType: z.enum(['full_time', 'part_time', 'contractor', 'temporary']).default('full_time'),
  branchIds,
  userId: id.nullable().optional(),
  status: z.enum(['active', 'inactive']).default('active'),
});
export const updateEmployeeSchema = createEmployeeSchema.partial().extend({ branchIds: z.array(id).max(100).optional() });
export const providerListSchema = z.object({ ...pagination, specialtyId: id.optional(), expiringWithinDays: z.coerce.number().int().min(1).max(365).optional() });
export const createProviderSchema = z.object({
  employeeId: id,
  licenseNumber: optionalText(120),
  licenseExpiresAt: z.coerce.date().nullable().optional(),
  specialtyIds: z.array(id).max(50).default([]),
  branchIds: z.array(id).min(1).max(100),
  serviceIds: z.array(id).max(200).default([]),
  workingHours: z.array(z.object({
    dayOfWeek: z.number().int().min(0).max(6),
    isAvailable: z.boolean().default(true),
    startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable().optional(),
    endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable().optional(),
    breaks: z.array(z.object({ startTime: z.string(), endTime: z.string() })).default([]),
  })).max(7).default([]),
  status: z.enum(['active', 'inactive', 'suspended']).default('active'),
});
export const updateProviderSchema = createProviderSchema.omit({ employeeId: true }).partial();
export const providerBranchSchema = z.object({ branchIds: z.array(id).min(1).max(100) });
export const providerServicesSchema = z.object({ serviceIds: z.array(id).max(200) });
export const providerWorkingHoursSchema = z.object({ workingHours: createProviderSchema.shape.workingHours });
export const createSpecialtySchema = z.object({ name: z.string().trim().min(2).max(120), code: optionalText(40), description: optionalText(500) });
export const updateSpecialtySchema = createSpecialtySchema.partial().extend({ status: z.enum(['active', 'archived']).optional() });
export const routeIdSchema = id;
