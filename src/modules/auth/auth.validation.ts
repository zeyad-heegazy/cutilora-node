import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().email().transform(value => value.toLowerCase()),
  password: z.string().min(1),
});
export const bootstrapAdminSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(12),
});
