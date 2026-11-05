import { Schema, model, models, type Model } from 'mongoose';

const historySchema = new Schema({
  version: { type: Number, required: true },
  action: { type: String, enum: ['created', 'updated', 'published', 'archived'], required: true },
  name: { type: String, required: true },
  description: { type: String, default: '' },
  content: { type: Schema.Types.Mixed, required: true },
  changedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  changedAt: { type: Date, default: Date.now, required: true },
}, { _id: false });

const schema = new Schema({
  tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  type: {
    type: String,
    enum: ['service', 'treatment', 'message', 'notification', 'appointment_policy', 'cancellation_policy', 'rescheduling_policy', 'operational_preferences'],
    required: true,
  },
  name: { type: String, required: true, trim: true, maxlength: 160 },
  description: { type: String, default: '', maxlength: 1000 },
  content: { type: Schema.Types.Mixed, required: true },
  status: { type: String, enum: ['draft', 'published', 'archived'], default: 'draft', index: true },
  version: { type: Number, default: 1, min: 1 },
  publishedVersion: { type: Number, default: null },
  publishedAt: { type: Date, default: null },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  updatedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  history: { type: [historySchema], default: [] },
}, { timestamps: true, minimize: false });

schema.index({ tenantId: 1, type: 1, name: 1, status: 1 });
schema.index({ tenantId: 1, updatedAt: -1 });

export const TenantCatalogTemplate = (models.TenantCatalogTemplate || model('TenantCatalogTemplate', schema)) as Model<any>;
