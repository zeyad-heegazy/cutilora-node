import type { Model } from 'mongoose';
import { Country } from '../models/country.model.js';
import { Governorate } from '../models/governorate.model.js';
import { City } from '../models/city.model.js';
import { District } from '../models/district.model.js';
import { Clinic } from '../../tenancy/models/clinic.model.js';
import type { GeoResource } from '../types/geo.types.js';

const models: Record<GeoResource, Model<any>> = { countries: Country, governorates: Governorate, cities: City, districts: District };
const parentFields: Partial<Record<GeoResource, string>> = { governorates: 'countryId', cities: 'governorateId', districts: 'cityId' };

function populateParentChain(resource: GeoResource, query: any) {
  if (resource === 'governorates') query.populate('countryId');
  if (resource === 'cities') query.populate({ path: 'governorateId', populate: { path: 'countryId' } });
  if (resource === 'districts') query.populate({ path: 'cityId', populate: { path: 'governorateId', populate: { path: 'countryId' } } });
  return query;
}

export const geoRepository = {
  list(resource: GeoResource, filter: Record<string, unknown>, skip: number, limit: number) {
    return Promise.all([models[resource].find(filter).sort({ nameEn: 1 }).skip(skip).limit(limit).lean(), models[resource].countDocuments(filter)]);
  },
  listWithParents(resource: GeoResource, filter: Record<string, unknown>, skip: number, limit: number) {
    const query = models[resource].find(filter).sort({ nameEn: 1 }).skip(skip).limit(limit);
    return Promise.all([populateParentChain(resource, query).lean(), models[resource].countDocuments(filter)]);
  },
  listForClinic(resource: GeoResource, filter: Record<string, unknown>, skip: number, limit: number) {
    return this.listWithParents(resource, filter, skip, limit);
  },
  find(resource: GeoResource, id: string) { return models[resource].findById(id).lean(); },
  findWithParents(resource: GeoResource, id: string) {
    return populateParentChain(resource, models[resource].findById(id)).lean();
  },
  create(resource: GeoResource, data: Record<string, unknown>) { return models[resource].create(data); },
  update(resource: GeoResource, id: string, data: Record<string, unknown>) { return models[resource].findByIdAndUpdate(id, { $set: data }, { new: true, runValidators: true }).lean(); },
  async hasClinicReferences(resource: GeoResource, id: string) {
    const field = resource === 'countries' ? 'countryId' : resource === 'governorates' ? 'governorateId' : resource === 'cities' ? 'cityId' : 'districtId';
    return Clinic.exists({ [field]: id });
  },
  async delete(resource: GeoResource, id: string) {
    if (resource === 'countries') {
      const governorates = await Governorate.find({ countryId: id }).select('_id').lean();
      const governorateIds = governorates.map(x => x._id);
      const cities = await City.find({ governorateId: { $in: governorateIds } }).select('_id').lean();
      await District.deleteMany({ cityId: { $in: cities.map(x => x._id) } });
      await City.deleteMany({ governorateId: { $in: governorateIds } });
      await Governorate.deleteMany({ countryId: id });
    } else if (resource === 'governorates') {
      const cities = await City.find({ governorateId: id }).select('_id').lean();
      await District.deleteMany({ cityId: { $in: cities.map(x => x._id) } });
      await City.deleteMany({ governorateId: id });
    } else if (resource === 'cities') {
      await District.deleteMany({ cityId: id });
    }
    return models[resource].deleteOne({ _id: id });
  },
  async validateClinicLocation(location: { countryId?: string; governorateId?: string; cityId?: string; districtId?: string }) {
    const { countryId, governorateId, cityId, districtId } = location;
    const invalid = (message: string) => Object.assign(new Error(message), { code: 'INVALID_GEO_HIERARCHY', status: 422 });
    if ((governorateId || cityId || districtId) && !countryId) throw invalid('countryId is required when a lower geographic level is selected.');
    if ((cityId || districtId) && !governorateId) throw invalid('governorateId is required when a city or district is selected.');
    if (districtId && !cityId) throw invalid('cityId is required when a district is selected.');
    if (countryId && !await Country.exists({ _id: countryId })) throw invalid('Country not found.');
    if (governorateId && !await Governorate.exists({ _id: governorateId, countryId })) throw invalid('Governorate does not belong to the selected country.');
    if (cityId && !await City.exists({ _id: cityId, governorateId })) throw invalid('City does not belong to the selected governorate.');
    if (districtId && !await District.exists({ _id: districtId, cityId })) throw invalid('District does not belong to the selected city.');
  },
  parentExists(resource: GeoResource, parentId: string) {
    const field = parentFields[resource];
    if (!field) return Promise.resolve(true);
    const parentModel = resource === 'governorates' ? Country : resource === 'cities' ? Governorate : City;
    return parentModel.exists({ _id: parentId });
  },
  parentField(resource: GeoResource) { return parentFields[resource]; },
};
