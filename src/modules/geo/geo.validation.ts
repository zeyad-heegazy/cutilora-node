import { z } from 'zod';
import { GEO_RESOURCES } from './geo.types.js';
export const geoResourceSchema = z.enum(GEO_RESOURCES);
export const geoListSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  per_page: z.coerce.number().int().min(1).max(100).default(15),
  country_id: z.string().optional(),
  governorate_id: z.string().optional(),
  city_id: z.string().optional(),
});
export const geoCreateSchema = z.object({
  name: z.string().trim().min(1).max(255),
  name_ar: z.string().trim().max(255).nullable().optional(),
  code: z.string().trim().max(64).nullable().optional(),
  country_id: z.string().optional(),
  governorate_id: z.string().optional(),
  city_id: z.string().optional(),
});
export const geoUpdateSchema = geoCreateSchema.partial();