import { Schema, model, models, type Model } from 'mongoose';

const historySchema = new Schema({
  version: { type: Number, required: true },
  values: { type: Schema.Types.Mixed, required: true },
  changedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  changedAt: { type: Date, required: true, default: Date.now },
}, { _id: false });

const schema = new Schema({
  tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, unique: true, index: true },
  version: { type: Number, required: true, default: 1 },
  values: { type: Schema.Types.Mixed, required: true, default: () => ({}) },
  history: { type: [historySchema], default: [] },
}, { timestamps: true, minimize: false });

export const TenantConfiguration = (models.TenantConfiguration || model('TenantConfiguration', schema)) as Model<any>;
