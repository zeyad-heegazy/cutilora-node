import { z } from 'zod';
export const loginSchema = z.object({ email: z.string().email().transform(value => value.toLowerCase()), password: z.string().min(1) });
export const bootstrapAdminSchema = z.object({ name: z.string().min(2), email: z.string().email(), password: z.string().min(12) });

export const acceptInvitationSchema = z.object({
  token: z.string().min(32).max(256),
  name: z.string().trim().min(2).max(120).optional(),
  password: z.string().min(12).max(128).optional(),
}).refine((value) => Boolean(value.name) === Boolean(value.password), {
  message: 'Name and password must be provided together when creating a new account.',
  path: ['password'],
});
