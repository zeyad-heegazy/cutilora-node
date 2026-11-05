import { Schema, model, models, type Model } from 'mongoose';

const schema = new Schema({
  tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  clinicId: { type: Schema.Types.ObjectId, ref: 'Clinic', required: true, index: true },
  branchId: { type: Schema.Types.ObjectId, ref: 'Branch', required: true, index: true },
  title: { type: String, required: true, trim: true, maxlength: 160 },
  type: { type: String, enum: ['closure', 'modified_hours'], required: true },
  startDate: { type: Date, required: true },
  endDate: { type: Date, required: true },
  isAllDay: { type: Boolean, default: true },
  startTime: { type: String, default: null, match: /^([01]\\d|2[0-3]):[0-5]\\d$/ },
  endTime: { type: String, default: null, match: /^([01]\\d|2[0-3]):[0-5]\\d$/ },
  reason: { type: String, trim: true, maxlength: 500, default: '' },
  status: { type: String, enum: ['active', 'cancelled'], default: 'active', required: true },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  cancelledAt: { type: Date, default: null },
  cancelledBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true, minimize: false });

schema.index({ tenantId: 1, clinicId: 1, branchId: 1, status: 1, startDate: 1 });
export const BranchHoliday = (models.BranchHoliday || model('BranchHoliday', schema)) as Model<any>;
