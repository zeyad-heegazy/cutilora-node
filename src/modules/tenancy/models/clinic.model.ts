import { Schema, model, models } from 'mongoose';

const schema = new Schema({
  tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  name: { type: String, required: true, trim: true },
  slug: { type: String, required: true, lowercase: true, trim: true },
  status: { type: String, enum: ['active', 'suspended'], default: 'active', required: true },
  countryId: { type: Schema.Types.ObjectId, ref: 'Country', default: null },
  timezone: { type: String, default: 'Africa/Cairo' },
  settings: { type: Schema.Types.Mixed, default: {} },
}, { timestamps: true });
schema.index({ tenantId: 1, slug: 1 }, { unique: true });
export const Clinic = models.Clinic || model('Clinic', schema);