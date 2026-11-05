import { Schema, model, models, type Model } from 'mongoose';

const TIME_REGEX = /^([01]\\d|2[0-3]):[0-5]\\d$/;
const operatingHoursSchema = new Schema({
  dayOfWeek: { type: Number, min: 0, max: 6, required: true },
  isClosed: { type: Boolean, default: false },
  openTime: { type: String, match: [TIME_REGEX, 'openTime must be HH:mm'] },
  closeTime: { type: String, match: [TIME_REGEX, 'closeTime must be HH:mm'] },
  breakTimes: [{
    _id: false,
    startTime: { type: String, match: [TIME_REGEX, 'startTime must be HH:mm'] },
    endTime: { type: String, match: [TIME_REGEX, 'endTime must be HH:mm'] },
  }],
}, { _id: false });

const schema = new Schema({
  tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  clinicId: { type: Schema.Types.ObjectId, ref: 'Clinic', required: true, index: true },
  name: { type: String, required: true, trim: true, maxlength: 160 },
  slug: { type: String, required: true, lowercase: true, trim: true },
  status: { type: String, enum: ['active', 'suspended'], default: 'active', required: true },
  address: { type: String, default: '' },
  cityId: { type: Schema.Types.ObjectId, ref: 'City', default: null },
  timezone: { type: String, default: 'Africa/Cairo' },
  operatingHours: { type: [operatingHoursSchema], default: [] },
}, { timestamps: true });

schema.index({ clinicId: 1, slug: 1 }, { unique: true });
schema.index({ tenantId: 1, clinicId: 1, status: 1 });
export const Branch = (models.Branch || model('Branch', schema)) as Model<any>;
