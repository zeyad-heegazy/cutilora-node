import { geoRepository } from './repositories/geo.repository.js';
import type { GeoResource } from './geo.types.js';

const parentApiFields: Record<string, string> = { country_id: 'countryId', governorate_id: 'governorateId', city_id: 'cityId' };
const parentForResource: Partial<Record<GeoResource, string>> = { governorates: 'country_id', cities: 'governorate_id', districts: 'city_id' };
function toDb(data: Record<string, unknown>) {
  const result: Record<string, unknown> = {};
  if (data.name !== undefined) result.name = data.name;
  if (data.name_ar !== undefined) result.nameAr = data.name_ar;
  if (data.code !== undefined) result.code = data.code || null;
  for (const [api, db] of Object.entries(parentApiFields)) if (data[api] !== undefined) result[db] = data[api];
  return result;
}
function transform(resource: GeoResource, doc: any) {
  if (!doc) return null;
  const result: Record<string, unknown> = { id: String(doc._id), name_en: doc.name, name_ar: doc.nameAr ?? null, code: doc.code ?? null, created_at: doc.createdAt, updated_at: doc.updatedAt };
  const parent = parentForResource[resource];
  if (parent) result[parent] = String(doc[parentApiFields[parent]]);
  return result;
}
function inputError(code: string, message: string) { return Object.assign(new Error(message), { code, status: 422 }); }

export const geoService = {
  validateClinicLocation(location: { countryId?: string; governorateId?: string; cityId?: string; districtId?: string }) { return geoRepository.validateClinicLocation(location); },
  async list(resource: GeoResource, query: { page: number; per_page: number; country_id?: string; governorate_id?: string; city_id?: string }) {
    const filter: Record<string, unknown> = {};
    const parent = parentForResource[resource];
    if (parent && query[parent as keyof typeof query]) filter[parentApiFields[parent]] = query[parent as keyof typeof query];
    const [rows, total] = await geoRepository.list(resource, filter, (query.page - 1) * query.per_page, query.per_page);
    return { data: rows.map(row => transform(resource, row)), meta: { current_page: query.page, per_page: query.per_page, total, last_page: Math.max(1, Math.ceil(total / query.per_page)) } };
  },
  async show(resource: GeoResource, id: string) { return transform(resource, await geoRepository.find(resource, id)); },
  async create(resource: GeoResource, input: Record<string, unknown>) {
    const parent = parentForResource[resource];
    if (resource === 'countries' && (typeof input.code !== 'string' || !/^[A-Z]{2}$/.test(input.code))) throw inputError('INVALID_COUNTRY_CODE', 'Country code must be two uppercase letters.');
    if (parent && !input[parent]) throw inputError('PARENT_REQUIRED', `${parent} is required.`);
    if (parent && !await geoRepository.parentExists(resource, String(input[parent]))) throw inputError('PARENT_NOT_FOUND', 'Parent resource not found.');
    return transform(resource, await geoRepository.create(resource, toDb(input)));
  },
  async update(resource: GeoResource, id: string, input: Record<string, unknown>) {
    const current = await geoRepository.find(resource, id);
    if (!current) return null;
    if (resource === 'countries' && input.code !== undefined && (typeof input.code !== 'string' || !/^[A-Z]{2}$/.test(input.code))) throw inputError('INVALID_COUNTRY_CODE', 'Country code must be two uppercase letters.');
    const parent = parentForResource[resource];
    if (parent && input[parent] && !await geoRepository.parentExists(resource, String(input[parent]))) throw inputError('PARENT_NOT_FOUND', 'Parent resource not found.');
    return transform(resource, await geoRepository.update(resource, id, toDb(input)));
  },
  async remove(resource: GeoResource, id: string) {
    if (!await geoRepository.find(resource, id)) return false;
    if (await geoRepository.hasClinicReferences(resource, id)) throw Object.assign(new Error('This geo record is assigned to one or more clinics.'), { code: 'GEO_RECORD_IN_USE', status: 409 });
    await geoRepository.delete(resource, id);
    return true;
  },
};