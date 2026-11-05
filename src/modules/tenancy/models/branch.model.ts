import { Schema, model, models, type Model } from 'mongoose';

const TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;
const contactSchema = new Schema({
  email: { type: String, lowercase: true, trim: true, default: null },
  phone: { type: String, trim: true, default: null },
  alternatePhone: { type: String, trim: true, default: null },
  whatsapp: { type: String, trim: true, default: null },
  website: { type: String, trim: true, default: null },
}, { _id: false });
const addressDetailsSchema = new Schema({
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
const breakTimesSchema = {
  _id: false,
  startTime: { type: String, match: [TIME_REGEX, 'startTime must be HH:mm'] },
  endTime: { type: String, match: [TIME_REGEX, 'endTime must be HH:mm'] },
};
const operatingHoursSchema = new Schema({
  dayOfWeek: { type: Number, min: 0, max: 6, required: true },
  isClosed: { type: Boolean, default: false },
  openTime: { type: String, match: [TIME_REGEX, 'openTime must be HH:mm'] },
  closeTime: { type: String, match: [TIME_REGEX, 'closeTime must be HH:mm'] },
  breakTimes: [breakTimesSchema],
  shifts: [{
    _id: false,
    startTime: { type: String, match: [TIME_REGEX, 'shift startTime must be HH:mm'] },
    endTime: { type: String, match: [TIME_REGEX, 'shift endTime must be HH:mm'] },
    breakTimes: [breakTimesSchema],
  }],
}, { _id: false });

const schema = new Schema({
  tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  clinicId: { type: Schema.Types.ObjectId, ref: 'Clinic', required: true, index: true },
  name: { type: String, required: true, trim: true, maxlength: 160 },
  code: { type: String, uppercase: true, trim: true, default: '' },
  slug: { type: String, required: true, lowercase: true, trim: true },
  status: { type: String, enum: ['active', 'suspended'], default: 'active', required: true },
  address: { type: String, default: '' },
  addressDetails: { type: addressDetailsSchema, default: () => ({}) },
  contact: { type: contactSchema, default: () => ({}) },
  contactPerson: {
    name: { type: String, trim: true, default: '' },
    email: { type: String, lowercase: true, trim: true, default: '' },
    phone: { type: String, trim: true, default: '' },
  },
  cityId: { type: Schema.Types.ObjectId, ref: 'City', default: null },
  postalCode: { type: String, trim: true, default: '' },
  latitude: { type: Number, min: -90, max: 90, default: null },
  longitude: { type: Number, min: -180, max: 180, default: null },
  timezone: { type: String, default: 'Africa/Cairo' },
  operatingHours: { type: [operatingHoursSchema], default: [] },
  settings: { type: Schema.Types.Mixed, default: () => ({}) },
  openingDate: { type: Date, default: null },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true, minimize: false });

schema.index({ clinicId: 1, slug: 1 }, { unique: true });
schema.index({ clinicId: 1, code: 1 }, {
  unique: true,
  partialFilterExpression: { code: { $type: 'string', $gt: '' } },
});
schema.index({ tenantId: 1, clinicId: 1, status: 1 });
export const Branch = (models.Branch || model('Branch', schema)) as Model<any>;
