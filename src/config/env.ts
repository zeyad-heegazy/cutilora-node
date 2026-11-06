import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  API_PREFIX: z.string().default('/api/v1'),
  MONGODB_URI: z.string().min(1, 'MONGODB_URI is required'),
  MONGODB_DB_NAME: z.string().min(1).default('cutilora'),
  JWT_SECRET: z
    .string()
    .min(32, 'JWT_SECRET must contain at least 32 characters'),
  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(3600),
  INTEGRATION_ENCRYPTION_KEY: z.string().min(32).optional(),
}).superRefine((value, context) => {
  if (value.NODE_ENV === 'production' && !value.INTEGRATION_ENCRYPTION_KEY) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['INTEGRATION_ENCRYPTION_KEY'], message: 'INTEGRATION_ENCRYPTION_KEY is required in production.' });
  }
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error(
    'Invalid environment configuration:',
    parsed.error.flatten().fieldErrors,
  );
  process.exit(1);
}

export const env = {
  ...parsed.data,
  INTEGRATION_ENCRYPTION_KEY: parsed.data.INTEGRATION_ENCRYPTION_KEY ?? parsed.data.JWT_SECRET,
};
