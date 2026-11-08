import { Schema, model, models, type Model } from 'mongoose';

const schema = new Schema({
  tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, immutable: true, index: true },
  clinicId: { type: Schema.Types.ObjectId, ref: 'Clinic', required: true, immutable: true, index: true },
  name: { type: String, required: true, trim: true, maxlength: 120 },
  code: { type: String, trim: true, uppercase: true, maxlength: 40, default: '' },
  description: { type: String, trim: true, maxlength: 500, default: '' },
  status: { type: String, enum: ['active', 'archived'], default: 'active', required: true },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true });

schema.index({ tenantId: 1, clinicId: 1, name: 1 }, { unique: true });
schema.index({ tenantId: 1, clinicId: 1, code: 1 }, { unique: true, partialFilterExpression: { code: { $type: 'string', $gt: '' } } });
export const Specialty = (models.Specialty || model('Specialty', schema)) as Model<any>;
