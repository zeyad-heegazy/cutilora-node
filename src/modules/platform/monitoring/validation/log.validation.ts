import { z } from 'zod';
export const logIdSchema = z.string().trim().min(1);
export const logQuerySchema = z.record(z.unknown());
