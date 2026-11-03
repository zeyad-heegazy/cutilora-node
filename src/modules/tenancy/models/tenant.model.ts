import { Schema, model, models, type Model } from 'mongoose';

const schema = new Schema({
  name: { type: String, required: true, trim: true },
  slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
  status: { type: String, enum: ['active', 'suspended'], default: 'active', required: true },
  plan: { type: String, default: 'starter' },
  settings: { type: Schema.Types.Mixed, default: {} },
}, { timestamps: true });

export const Tenant = (models.Tenant || model('Tenant', schema)) as Model<any>;