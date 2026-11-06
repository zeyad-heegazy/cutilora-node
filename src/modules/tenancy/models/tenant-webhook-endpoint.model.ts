import { Schema, model, models, type Model } from 'mongoose';

const schema = new Schema({
  tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, immutable: true },
  clinicId: { type: Schema.Types.ObjectId, ref: 'Clinic', default: null, immutable: true },
  name: { type: String, required: true, trim: true, maxlength: 120 },
  url: { type: String, required: true, trim: true, maxlength: 2048 },
  encryptedSigningSecret: { type: String, required: true, select: false },
  events: { type: [String], required: true, validate: (items: string[]) => items.length > 0 && items.length <= 100 },
  status: { type: String, enum: ['active', 'disabled'], default: 'active' },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true, immutable: true },
  updatedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  lastDeliveryAt: { type: Date, default: null },
  lastSuccessAt: { type: Date, default: null },
  lastFailureAt: { type: Date, default: null },
}, { timestamps: true, minimize: false });
schema.index({ tenantId: 1, status: 1, createdAt: -1 });
schema.index({ tenantId: 1, clinicId: 1, name: 1 }, { unique: true });
export const TenantWebhookEndpoint = (models.TenantWebhookEndpoint || model('TenantWebhookEndpoint', schema)) as Model<any>;
