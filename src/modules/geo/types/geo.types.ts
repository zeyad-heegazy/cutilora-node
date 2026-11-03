export const GEO_RESOURCES = ['countries', 'governorates', 'cities', 'districts'] as const;
export type GeoResource = (typeof GEO_RESOURCES)[number];

export interface GeoEntryInput {
  name: string;
  name_ar?: string | null;
  code?: string | null;
  country_id?: string;
  governorate_id?: string;
  city_id?: string;
}
export interface GeoListQuery {
  page?: number;
  per_page?: number;
  country_id?: string;
  governorate_id?: string;
  city_id?: string;
}
export interface GeoEntryResponse {
  id: string;
  name_en: string;
  name_ar: string | null;
  code: string | null;
  country_id?: string;
  governorate_id?: string;
  city_id?: string;
  created_at: Date;
  updated_at: Date;
}
