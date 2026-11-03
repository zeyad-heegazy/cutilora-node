import { Schema, model, models } from 'mongoose';

const schema = new Schema({
  tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  clinicId: { type: Schema.Types.ObjectId, ref: 'Clinic', required: true, index: true },
  name: { type: String, required: true, trim: true },
  slug: { type: String, required: true, lowercase: true, trim: true },
  status: { type: String, enum: ['active', 'suspended'], default: 'active', required: true },
  address: { type: String, default: '' },
  cityId: { type: Schema.Types.ObjectId, ref: 'City', default: null },
  timezone: { type: String, default: 'Africa/Cairo' },
}, { timestamps: true });
schema.index({ clinicId: 1, slug: 1 }, { unique: true });
schema.index({ tenantId: 1, clinicId: 1, status: 1 });
export const Branch = models.Branch || model('Branch', schema);