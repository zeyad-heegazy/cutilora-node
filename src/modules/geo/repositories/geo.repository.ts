import type { Model } from 'mongoose';
import { Country } from '../models/country.model.js';
import { Governorate } from '../models/governorate.model.js';
import { City } from '../models/city.model.js';
import { District } from '../models/district.model.js';
import { Clinic } from '../../tenancy/models/clinic.model.js';
import type { GeoResource } from '../geo.types.js';

const models: Record<GeoResource, Model<any>> = { countries: Country, governorates: Governorate, cities: City, districts: District };
const parentFields: Partial<Record<GeoResource, string>> = { governorates: 'countryId', cities: 'governorateId', districts: 'cityId' };

export const geoRepository = {
  list(resource: GeoResource, filter: Record<string, unknown>, skip: number, limit: number) {
    return Promise.all([models[resource].find(filter).sort({ name: 1 }).skip(skip).limit(limit).lean(), models[resource].countDocuments(filter)]);
  },
  find(resource: GeoResource, id: string) { return models[resource].findById(id).lean(); },
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
  parentExists(resource: GeoResource, parentId: string) {
    const field = parentFields[resource];
    if (!field) return Promise.resolve(true);
    const parentModel = resource === 'governorates' ? Country : resource === 'cities' ? Governorate : City;
    return parentModel.exists({ _id: parentId });
  },
  parentField(resource: GeoResource) { return parentFields[resource]; },
};