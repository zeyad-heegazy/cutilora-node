import { Schema, model, models, type Model } from 'mongoose';

const TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;
const breakSchema = new Schema({
  startTime: { type: String, required: true, match: TIME_REGEX },
  endTime: { type: String, required: true, match: TIME_REGEX },
}, { _id: false });
const scheduleSchema = new Schema({
  dayOfWeek: { type: Number, required: true, min: 0, max: 6 },
  isAvailable: { type: Boolean, default: true },
  startTime: { type: String, match: TIME_REGEX, default: null },
  endTime: { type: String, match: TIME_REGEX, default: null },
  breaks: { type: [breakSchema], default: [] },
}, { _id: false });

const schema = new Schema({
  tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, immutable: true, index: true },
  clinicId: { type: Schema.Types.ObjectId, ref: 'Clinic', required: true, immutable: true, index: true },
  employeeId: { type: Schema.Types.ObjectId, ref: 'Employee', required: true },
  licenseNumber: { type: String, trim: true, maxlength: 120, default: '' },
  licenseExpiresAt: { type: Date, default: null },
  specialtyIds: [{ type: Schema.Types.ObjectId, ref: 'Specialty' }],
  branchIds: [{ type: Schema.Types.ObjectId, ref: 'Branch' }],
  serviceIds: [{ type: Schema.Types.ObjectId, ref: 'Service' }],
  workingHours: { type: [scheduleSchema], default: [] },
  status: { type: String, enum: ['active', 'inactive', 'suspended'], default: 'active', required: true },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true, minimize: false });

schema.index({ tenantId: 1, clinicId: 1, employeeId: 1 }, { unique: true });
schema.index({ tenantId: 1, clinicId: 1, status: 1 });
schema.index({ tenantId: 1, clinicId: 1, branchIds: 1, status: 1 });
schema.index({ tenantId: 1, clinicId: 1, licenseExpiresAt: 1 });
export const Provider = (models.Provider || model('Provider', schema)) as Model<any>;
