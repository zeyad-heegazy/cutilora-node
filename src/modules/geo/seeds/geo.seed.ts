import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Model } from 'mongoose';
import { connectDatabase, disconnectDatabase } from '../../../database/connection.js';
import { Country } from '../models/country.model.js';
import { Governorate } from '../models/governorate.model.js';
import { City } from '../models/city.model.js';
import { District } from '../models/district.model.js';

type Row = Record<string, any>;
type Stats = { countries: number; governorates: number; cities: number; districts: number };
const stats: Stats = { countries: 0, governorates: 0, cities: 0, districts: 0 };

function readDataset<T>(filename: string): T {
  const path = resolve(process.cwd(), 'src/modules/geo/data', filename);
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}
function localized(value: unknown, preferred: string[]): string | null {
  if (typeof value === 'string') return value.trim() || null;
  if (!value || typeof value !== 'object') return null;
  const record = value as Row;
  for (const key of preferred) if (typeof record[key] === 'string' && record[key].trim()) return record[key].trim();
  return null;
}
function englishName(row: Row): string {
  const name = localized(row.name, ['en', 'english', 'local']) ?? row.name_en ?? row.nameEn;
  if (typeof name !== 'string' || !name.trim()) throw new Error(`Geo record is missing its English name: ${JSON.stringify(row)}`);
  return name.trim();
}
function arabicName(row: Row): string | null {
  return localized(row.name, ['ar', 'arabic', 'local']) ?? row.name_ar ?? row.nameAr ?? null;
}
function sourceCode(row: Row, keys: string[]): string | null {
  for (const key of keys) {
    const value = row[key];
    const candidate = value && typeof value === 'object' ? value.id ?? value.code ?? value.en : value;
    if (typeof candidate === 'string' || typeof candidate === 'number') {
      const result = String(candidate).trim();
      if (result) return result;
    }
  }
  return null;
}
async function upsertChild(model: Model<any>, parentField: string, parentId: unknown, row: Row, codeKeys: string[]) {
  const name = englishName(row);
  const code = sourceCode(row, codeKeys);
  const identity = code ? { [parentField]: parentId, code } : { [parentField]: parentId, nameEn: name };
  await model.updateOne(identity, { $set: { [parentField]: parentId, nameEn: name, nameAr: arabicName(row), code } }, { upsert: true, setDefaultsOnInsert: true });
}

async function seedEgypt() {
  const dataset = readDataset<{ data: Row[] }>('egypt.json');
  const country = await Country.findOneAndUpdate(
    { code: 'EG' },
    { $set: { nameEn: 'Egypt', nameAr: 'مصر', code: 'EG' } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
  if (!country) throw new Error('Unable to create or load Egypt country record.');
  stats.countries++;
  for (const governorateData of dataset.data ?? []) {
    const governorateName = englishName(governorateData);
    const governorateCode = sourceCode(governorateData, ['code', 'id', 'governorate_id']);
    const governorate = await Governorate.findOneAndUpdate(
      governorateCode ? { countryId: country._id, code: governorateCode } : { countryId: country._id, nameEn: governorateName },
      { $set: { countryId: country._id, nameEn: governorateName, nameAr: arabicName(governorateData), code: governorateCode } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
    if (!governorate) throw new Error(`Unable to create or load governorate: ${governorateName}`);
    stats.governorates++;
    for (const cityData of governorateData.district ?? []) {
      const cityName = englishName(cityData);
      const cityCode = sourceCode(cityData, ['code', 'id', 'district_id']);
      const city = await City.findOneAndUpdate(
        cityCode ? { governorateId: governorate._id, code: cityCode } : { governorateId: governorate._id, nameEn: cityName },
        { $set: { governorateId: governorate._id, nameEn: cityName, nameAr: arabicName(cityData), code: cityCode } },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      );
      if (!city) throw new Error(`Unable to create or load city: ${cityName}`);
      stats.cities++;
      for (const districtData of cityData.shiyakha ?? []) {
        await upsertChild(District, 'cityId', city._id, districtData, ['code', 'id', 'shiyakha_id']);
        stats.districts++;
      }
    }
  }
}

async function seedSaudiArabia() {
  const regions = readDataset<Row[]>('saudi-regions.json');
  const cities = readDataset<Row[]>('saudi-cities.json');
  const districts = readDataset<Row[]>('saudi-districts.json');
  const country = await Country.findOneAndUpdate(
    { code: 'SA' },
    { $set: { nameEn: 'Saudi Arabia', nameAr: 'المملكة العربية السعودية', code: 'SA' } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
  if (!country) throw new Error('Unable to create or load Saudi Arabia country record.');
  stats.countries++;
  const citiesByRegion = new Map<string, Row[]>();
  for (const city of cities) {
    const key = String(city.region_id);
    citiesByRegion.set(key, [...(citiesByRegion.get(key) ?? []), city]);
  }
  const districtsByCity = new Map<string, Row[]>();
  for (const district of districts) {
    const key = String(district.city_id);
    districtsByCity.set(key, [...(districtsByCity.get(key) ?? []), district]);
  }
  for (const region of regions) {
    const regionCode = sourceCode(region, ['region_id', 'code', 'id']);
    const regionName = englishName(region);
    const governorate = await Governorate.findOneAndUpdate(
      regionCode ? { countryId: country._id, code: regionCode } : { countryId: country._id, nameEn: regionName },
      { $set: { countryId: country._id, nameEn: regionName, nameAr: arabicName(region), code: regionCode } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
    if (!governorate) throw new Error(`Unable to create or load Saudi region: ${regionName}`);
    stats.governorates++;
    for (const cityData of citiesByRegion.get(String(regionCode)) ?? []) {
      const cityCode = sourceCode(cityData, ['city_id', 'code', 'id']);
      const cityName = englishName(cityData);
      const city = await City.findOneAndUpdate(
        cityCode ? { governorateId: governorate._id, code: cityCode } : { governorateId: governorate._id, nameEn: cityName },
        { $set: { governorateId: governorate._id, nameEn: cityName, nameAr: arabicName(cityData), code: cityCode } },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      );
      if (!city) throw new Error(`Unable to create or load Saudi city: ${cityName}`);
      stats.cities++;
      for (const districtData of districtsByCity.get(String(cityCode)) ?? []) {
        await upsertChild(District, 'cityId', city._id, districtData, ['district_id', 'code', 'id']);
        stats.districts++;
      }
    }
  }
}

async function main() {
  await connectDatabase();
  try {
    await seedEgypt();
    await seedSaudiArabia();
    console.info('Geo seed completed:', stats);
  } finally {
    await disconnectDatabase();
  }
}
main().catch(error => { console.error('Geo seed failed:', error); process.exitCode = 1; });