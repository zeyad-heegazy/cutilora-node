import { z } from 'zod';

const slug = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

export const createTenantSchema = z.object({
  name: z.string().trim().min(2),
  owner: z.object({
    name: z.string().min(2),
    email: z.string().email(),
    password: z.string().min(12),
  }),
  initialClinic: z.object({ name: z.string().min(2) }).optional(),
});

export const updateTenantSchema = z.object({
  name: z.string().trim().min(2),
});

export const tenantStatusSchema = z.object({
  status: z.enum(['active', 'suspended']),
});
export const createClinicSchema = z.object({
  name: z.string().trim().min(2),
  timezone: z.string().default('Africa/Cairo'),
  countryId: z.string().optional(),
  governorateId: z.string().optional(),
  cityId: z.string().optional(),
  districtId: z.string().optional(),
});
export const updateClinicSchema = z.object({
  name: z.string().trim().min(2).optional(),
  timezone: z.string().optional(),
  countryId: z.string().optional(),
  governorateId: z.string().optional(),
  cityId: z.string().optional(),
  districtId: z.string().optional(),
}).refine((data) => Object.keys(data).length > 0, {
  message: 'At least one field must be provided.',
});
export const createBranchSchema = z.object({
  name: z.string().min(2),
  slug,
  address: z.string().optional(),
  cityId: z.string().optional(),
  timezone: z.string().default('Africa/Cairo'),
});
