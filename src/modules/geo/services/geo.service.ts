import { geoRepository } from '../repositories/geo.repository.js';
import type { GeoResource } from '../types/geo.types.js';

type ClinicGeoQuery = {
  page: number;
  per_page: number;
  search?: string;
  country_id?: string;
  governorate_id?: string;
  city_id?: string;
};

function mapParent(doc: any, resource: GeoResource): Record<string, unknown> | null {
  if (!doc) return null;
  const result: Record<string, unknown> = {
    id: String(doc._id),
    name_en: doc.nameEn,
    name_ar: doc.nameAr ?? null,
    code: doc.code ?? null,
  };
  if (resource === 'governorates' && doc.countryId) result.country = mapParent(doc.countryId, 'countries');
  if (resource === 'cities' && doc.governorateId) result.governorate = mapParent(doc.governorateId, 'governorates');
  if (resource === 'districts' && doc.cityId) result.city = mapParent(doc.cityId, 'cities');
  return result;
}

function mapEntry(resource: GeoResource, doc: any): Record<string, unknown> {
  const result: Record<string, unknown> = {
    id: String(doc._id),
    name_en: doc.nameEn,
    name_ar: doc.nameAr ?? null,
    code: doc.code ?? null,
  };
  if (resource === 'governorates') result.country = mapParent(doc.countryId, 'countries');
  if (resource === 'cities') result.governorate = mapParent(doc.governorateId, 'governorates');
  if (resource === 'districts') result.city = mapParent(doc.cityId, 'cities');
  return result;
}

export const geoService = {
  validateClinicLocation(location: { countryId?: string; governorateId?: string; cityId?: string; districtId?: string }) {
    return geoRepository.validateClinicLocation(location);
  },
  async listForClinic(resource: GeoResource, query: ClinicGeoQuery) {
    const filter: Record<string, unknown> = {};
    if (resource === 'governorates' && query.country_id) filter.countryId = query.country_id;
    if (resource === 'cities') {
      if (query.governorate_id) filter.governorateId = query.governorate_id;
      else if (query.country_id) {
        const [governorates] = await geoRepository.list('governorates', { countryId: query.country_id }, 0, 10000);
        filter.governorateId = { $in: governorates.map(item => item._id) };
      }
    }
    if (resource === 'districts') {
      if (query.city_id) filter.cityId = query.city_id;
      else if (query.governorate_id) {
        const [cities] = await geoRepository.list('cities', { governorateId: query.governorate_id }, 0, 10000);
        filter.cityId = { $in: cities.map(item => item._id) };
      } else if (query.country_id) {
        const [governorates] = await geoRepository.list('governorates', { countryId: query.country_id }, 0, 10000);
        const [cities] = await geoRepository.list('cities', { governorateId: { $in: governorates.map(item => item._id) } }, 0, 10000);
        filter.cityId = { $in: cities.map(item => item._id) };
      }
    }
    if (query.search?.trim()) {
      const expression = new RegExp(query.search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [{ nameEn: expression }, { nameAr: expression }, { code: expression }];
    }
    const [rows, total] = await geoRepository.listForClinic(resource, filter, (query.page - 1) * query.per_page, query.per_page);
    return {
      data: rows.map(row => mapEntry(resource, row)),
      meta: { current_page: query.page, per_page: query.per_page, total, last_page: Math.max(1, Math.ceil(total / query.per_page)) },
    };
  },
};
