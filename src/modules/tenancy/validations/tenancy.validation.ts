import { z } from 'zod';
const slug = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
export const createTenantSchema = z.object({ name: z.string().min(2), slug, owner: z.object({ name: z.string().min(2), email: z.string().email(), password: z.string().min(12) }), initialClinic: z.object({ name: z.string().min(2), slug }).optional() });
export const tenantStatusSchema = z.object({ status: z.enum(['active', 'suspended']) });
export const createClinicSchema = z.object({ name: z.string().min(2), slug, timezone: z.string().default('Africa/Cairo'), countryId: z.string().optional() });
export const createBranchSchema = z.object({ name: z.string().min(2), slug, address: z.string().optional(), cityId: z.string().optional(), timezone: z.string().default('Africa/Cairo') });