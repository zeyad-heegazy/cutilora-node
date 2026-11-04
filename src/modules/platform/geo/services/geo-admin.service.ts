import { geoRepository } from '../../../geo/repositories/geo.repository.js';
import type { GeoResource } from '../../../geo/types/geo.types.js';

const parentConfig: Partial<Record<GeoResource, { field: 'countryId' | 'governorateId' | 'cityId'; resource: GeoResource; output: 'country' | 'governorate' | 'city' }>> = {
  governorates: { field: 'countryId', resource: 'countries', output: 'country' },
  cities: { field: 'governorateId', resource: 'governorates', output: 'governorate' },
  districts: { field: 'cityId', resource: 'cities', output: 'city' },
};

function mapParent(doc: any, resource: GeoResource): Record<string, unknown> | null {
  if (!doc) return null;
  const result: Record<string, unknown> = {
    id: String(doc._id),
    name_en: doc.nameEn,
    name_ar: doc.nameAr ?? null,
    code: doc.code ?? null,
  };
  const config = parentConfig[resource];
  if (config) result[config.output] = mapParent(doc[config.field], config.resource);
  return result;
}

function transform(resource: GeoResource, doc: any) {
  if (!doc) return null;
  const result: Record<string, unknown> = {
    id: String(doc._id),
    name_en: doc.nameEn,
    name_ar: doc.nameAr ?? null,
    code: doc.code ?? null,
    created_at: doc.createdAt,
    updated_at: doc.updatedAt,
  };
  const parent = parentConfig[resource];
  if (parent) result[parent.output] = mapParent(doc[parent.field], parent.resource);
  return result;
}

function inputError(code: string, message: string) { return Object.assign(new Error(message), { code, status: 422 }); }

export const geoAdminService = {
  async list(resource: GeoResource, query: { page: number; per_page: number; search?: string; country_id?: string; governorate_id?: string; city_id?: string }) {
    const filter: Record<string, unknown> = {};
    const parent = parentConfig[resource];
    if (parent) {
      const parentId = query[parent.output === 'country' ? 'country_id' : parent.output === 'governorate' ? 'governorate_id' : 'city_id'];
      if (parentId) filter[parent.field] = parentId;
    }
    if (query.search?.trim()) {
      const expression = new RegExp(query.search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [{ nameEn: expression }, { nameAr: expression }, { code: expression }];
    }
    const [rows, total] = await geoRepository.listWithParents(resource, filter, (query.page - 1) * query.per_page, query.per_page);
    return { data: rows.map(row => transform(resource, row)), meta: { current_page: query.page, per_page: query.per_page, total, last_page: Math.max(1, Math.ceil(total / query.per_page)) } };
  },
  async show(resource: GeoResource, id: string) {
    return transform(resource, await geoRepository.findWithParents(resource, id));
  },
  async create(resource: GeoResource, input: Record<string, unknown>) {
    const parent = parentConfig[resource];
    const parentInput = parent?.output === 'country' ? 'country_id' : parent?.output === 'governorate' ? 'governorate_id' : 'city_id';
    if (resource === 'countries' && (typeof input.code !== 'string' || !/^[A-Z]{2}$/.test(input.code))) throw inputError('INVALID_COUNTRY_CODE', 'Country code must be two uppercase letters.');
    if (parent && !input[parentInput]) throw inputError('PARENT_REQUIRED', parentInput + ' is required.');
    if (parent && !await geoRepository.parentExists(resource, String(input[parentInput]))) throw inputError('PARENT_NOT_FOUND', 'Parent resource not found.');
    const data = { ...input, ...(parent ? { [parent.field]: input[parentInput] } : {}) };
    return transform(resource, await geoRepository.create(resource, toDb(data)));
  },
  async update(resource: GeoResource, id: string, input: Record<string, unknown>) {
    const current = await geoRepository.find(resource, id);
    if (!current) return null;
    if (resource === 'countries' && input.code !== undefined && (typeof input.code !== 'string' || !/^[A-Z]{2}$/.test(input.code))) throw inputError('INVALID_COUNTRY_CODE', 'Country code must be two uppercase letters.');
    const parent = parentConfig[resource];
    const parentInput = parent?.output === 'country' ? 'country_id' : parent?.output === 'governorate' ? 'governorate_id' : 'city_id';
    if (parent && input[parentInput] && !await geoRepository.parentExists(resource, String(input[parentInput]))) throw inputError('PARENT_NOT_FOUND', 'Parent resource not found.');
    const data = { ...input, ...(parent && input[parentInput] !== undefined ? { [parent.field]: input[parentInput] } : {}) };
    return transform(resource, await geoRepository.update(resource, id, toDb(data)));
  },
  async remove(resource: GeoResource, id: string) {
    if (!await geoRepository.find(resource, id)) return false;
    if (await geoRepository.hasClinicReferences(resource, id)) throw Object.assign(new Error('This geo record is assigned to one or more clinics.'), { code: 'GEO_RECORD_IN_USE', status: 409 });
    await geoRepository.delete(resource, id);
    return true;
  },
};

function toDb(data: Record<string, unknown>) {
  const result: Record<string, unknown> = {};
  if (data.name_en !== undefined) result.nameEn = data.name_en;
  if (data.name_ar !== undefined) result.nameAr = data.name_ar;
  if (data.code !== undefined) result.code = data.code || null;
  if (data.country_id !== undefined) result.countryId = data.country_id;
  if (data.governorate_id !== undefined) result.governorateId = data.governorate_id;
  if (data.city_id !== undefined) result.cityId = data.city_id;
  return result;
}
