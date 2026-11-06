import { Schema, model, models, type Model } from 'mongoose';

const versionSchema = new Schema({
  version: { type: Number, required: true },
  content: { type: Schema.Types.Mixed, required: true },
  changedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  changedAt: { type: Date, required: true, default: Date.now },
}, { _id: false });

const schema = new Schema({
  tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true, immutable: true },
  name: { type: String, required: true, trim: true, maxlength: 120 },
  key: { type: String, required: true, trim: true, lowercase: true, maxlength: 140 },
  type: { type: String, required: true, enum: ['service_treatment', 'pricing', 'appointment_policy', 'cancellation_policy', 'rescheduling_policy', 'message_template', 'notification_template', 'operational_policy'] },
  description: { type: String, default: '', maxlength: 1000 },
  status: { type: String, enum: ['draft', 'published', 'archived'], default: 'draft', index: true },
  version: { type: Number, required: true, default: 1 },
  content: { type: Schema.Types.Mixed, required: true, default: () => ({}) },
  history: { type: [versionSchema], default: [] },
  publishedAt: { type: Date, default: null },
  publishedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true, minimize: false });

schema.index({ tenantId: 1, key: 1 }, { unique: true });
schema.index({ tenantId: 1, type: 1, status: 1, updatedAt: -1 });

export const TenantCatalogTemplate = (models.TenantCatalogTemplate || model('TenantCatalogTemplate', schema)) as Model<any>;
