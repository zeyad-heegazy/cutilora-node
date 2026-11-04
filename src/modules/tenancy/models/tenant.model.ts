import { Schema, model, models, type Model } from 'mongoose';

const contactSchema = new Schema({
  email: { type: String, lowercase: true, trim: true, default: null },
  phone: { type: String, trim: true, default: null },
  alternatePhone: { type: String, trim: true, default: null },
  whatsapp: { type: String, trim: true, default: null },
  website: { type: String, trim: true, default: null },
}, { _id: false });

const addressSchema = new Schema({
  countryId: { type: Schema.Types.ObjectId, ref: 'Country', default: null },
  governorateId: { type: Schema.Types.ObjectId, ref: 'Governorate', default: null },
  cityId: { type: Schema.Types.ObjectId, ref: 'City', default: null },
  districtId: { type: Schema.Types.ObjectId, ref: 'District', default: null },
  addressLine1: { type: String, trim: true, default: '' },
  addressLine2: { type: String, trim: true, default: '' },
  building: { type: String, trim: true, default: '' },
  floor: { type: String, trim: true, default: '' },
  unit: { type: String, trim: true, default: '' },
  postalCode: { type: String, trim: true, default: '' },
  latitude: { type: Number, min: -90, max: 90, default: null },
  longitude: { type: Number, min: -180, max: 180, default: null },
}, { _id: false });

const schema = new Schema({
  name: { type: String, required: true, trim: true, maxlength: 160 },
  displayName: { type: String, trim: true, maxlength: 160, default: '' },
  legalName: { type: String, trim: true, maxlength: 200, default: '' },
  slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
  businessType: { type: String, enum: ['single_clinic', 'clinic_group', 'medical_center'], default: 'single_clinic', required: true },
  description: { type: String, trim: true, maxlength: 2000, default: '' },
  industry: { type: String, trim: true, default: 'aesthetic_medicine' },
  status: { type: String, enum: ['active', 'suspended'], default: 'active', required: true },
  contact: { type: contactSchema, default: () => ({}) },
  address: { type: addressSchema, default: () => ({}) },
  legal: {
    taxNumber: { type: String, trim: true, default: '' },
    vatNumber: { type: String, trim: true, default: '' },
    commercialRegistrationNumber: { type: String, trim: true, default: '' },
  },
  branding: {
    logoUrl: { type: String, trim: true, default: '' },
    coverImageUrl: { type: String, trim: true, default: '' },
    primaryColor: { type: String, trim: true, default: '#2563eb' },
  },
  preferences: {
    timezone: { type: String, default: 'Africa/Cairo' },
    locale: { type: String, default: 'en' },
    currency: { type: String, uppercase: true, default: 'EGP' },
    dateFormat: { type: String, default: 'YYYY-MM-DD' },
    weekStartsOn: { type: Number, min: 0, max: 6, default: 6 },
    supportedLanguages: { type: [String], default: ['en', 'ar'] },
  },
  settings: { type: Schema.Types.Mixed, default: {} },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true, minimize: false });

schema.index({ status: 1, createdAt: -1 });
schema.index({ businessType: 1, status: 1 });
export const Tenant = (models.Tenant || model('Tenant', schema)) as Model<any>;
