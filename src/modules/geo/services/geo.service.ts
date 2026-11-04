import { geoRepository } from '../repositories/geo.repository.js';
export const geoService = {
  validateClinicLocation(location: { countryId?: string; governorateId?: string; cityId?: string; districtId?: string }) {
    return geoRepository.validateClinicLocation(location);
  },
};