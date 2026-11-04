import { Schema, model, models, type Model } from 'mongoose';

const TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;

const contactSchema = new Schema(
  {
    email: { type: String, lowercase: true, trim: true, default: null },
    phone: { type: String, trim: true, default: null },
    alternatePhone: { type: String, trim: true, default: null },
    whatsapp: { type: String, trim: true, default: null },
    website: { type: String, trim: true, default: null },
  },
  { _id: false },
);

const addressSchema = new Schema(
  {
    countryId: { type: Schema.Types.ObjectId, ref: 'Country', default: null },
    governorateId: {
      type: Schema.Types.ObjectId,
      ref: 'Governorate',
      default: null,
    },
    cityId: { type: Schema.Types.ObjectId, ref: 'City', default: null },
    districtId: { type: Schema.Types.ObjectId, ref: 'District', default: null },
    addressLine1: { type: String, trim: true, default: '' },
    addressLine2: { type: String, trim: true, default: '' },
    building: { type: String, trim: true, default: '' },
    floor: { type: String, trim: true, default: '' },
    unit: { type: String, trim: true, default: '' },
    landmark: { type: String, trim: true, default: '' },
    postalCode: { type: String, trim: true, default: '' },
    latitude: { type: Number, min: -90, max: 90, default: null },
    longitude: { type: Number, min: -180, max: 180, default: null },
  },
  { _id: false },
);

const operatingHoursSchema = new Schema(
  {
    dayOfWeek: { type: Number, min: 0, max: 6, required: true },
    isClosed: { type: Boolean, default: false },
    openTime: {
      type: String,
      match: [TIME_REGEX, 'openTime must be in HH:mm format'],
    },
    closeTime: {
      type: String,
      match: [TIME_REGEX, 'closeTime must be in HH:mm format'],
    },
    breakTimes: [
      {
        _id: false,
        startTime: {
          type: String,
          match: [TIME_REGEX, 'startTime must be HH:mm'],
        },
        endTime: { type: String, match: [TIME_REGEX, 'endTime must be HH:mm'] },
      },
    ],
  },
  { _id: false },
);

const brandingSchema = new Schema(
  {
    logoUrl: { type: String, trim: true, default: '' },
    coverImageUrl: { type: String, trim: true, default: '' },
    primaryColor: { type: String, trim: true, default: '#2563eb' },
  },
  { _id: false },
);

const preferencesSchema = new Schema(
  {
    timezone: { type: String, default: 'Africa/Cairo' },
    locale: { type: String, default: 'en' },
    currency: { type: String, uppercase: true, default: 'EGP' },
    dateFormat: { type: String, default: 'YYYY-MM-DD' },
    weekStartsOn: { type: Number, min: 0, max: 6, default: 6 },
    supportedLanguages: { type: [String], default: ['en', 'ar'] },
  },
  { _id: false },
);

const bookingSettingsSchema = new Schema(
  {
    allowOnlineBooking: { type: Boolean, default: false },
    requireAppointmentConfirmation: { type: Boolean, default: true },
    defaultAppointmentDurationMinutes: {
      type: Number,
      min: 5,
      max: 480,
      default: 30,
    },
    bufferMinutes: { type: Number, min: 0, max: 240, default: 0 },
    cancellationWindowHours: { type: Number, min: 0, max: 720, default: 24 },
  },
  { _id: false },
);

const schema = new Schema(
  {
    tenantId: {
      type: Schema.Types.ObjectId,
      ref: 'Tenant',
      required: true,
      index: true,
    },
    name: { type: String, required: true, trim: true, maxlength: 160 },
    slug: { type: String, required: true, lowercase: true, trim: true },
    code: { type: String, uppercase: true, trim: true, default: '' },
    status: {
      type: String,
      enum: ['active', 'suspended'],
      default: 'active',
      required: true,
    },
    clinicType: {
      type: String,
      enum: ['dermatology', 'aesthetic', 'beauty', 'medical_center', 'other'],
      default: 'aesthetic',
    },
    description: { type: String, trim: true, maxlength: 2000, default: '' },
    specialties: { type: [String], default: [] },
    contact: { type: contactSchema, default: () => ({}) },
    address: { type: addressSchema, default: () => ({}) },
    timezone: { type: String, default: 'Africa/Cairo' },
    preferences: { type: preferencesSchema, default: () => ({}) },
    operatingHours: { type: [operatingHoursSchema], default: [] },
    branding: { type: brandingSchema, default: () => ({}) },
    bookingSettings: { type: bookingSettingsSchema, default: () => ({}) },
    openingDate: { type: Date, default: null },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true, minimize: false },
);

schema.index({ tenantId: 1, slug: 1 }, { unique: true });
schema.index(
  { tenantId: 1, code: 1 },
  {
    unique: true,
    partialFilterExpression: { code: { $type: 'string', $gt: '' } },
  },
);
schema.index({ tenantId: 1, status: 1, name: 1 });
export const Clinic = (models.Clinic || model('Clinic', schema)) as Model<any>;
