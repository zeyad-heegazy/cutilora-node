import { Schema, model, models, type Model } from 'mongoose';

const schema = new Schema({
  tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, immutable: true },
  endpointId: { type: Schema.Types.ObjectId, ref: 'TenantWebhookEndpoint', required: true, immutable: true },
  eventId: { type: String, required: true, immutable: true, maxlength: 120 },
  eventType: { type: String, required: true, immutable: true, maxlength: 120 },
  payload: { type: Schema.Types.Mixed, required: true, immutable: true },
  status: { type: String, enum: ['pending', 'processing', 'delivered', 'retrying', 'failed'], default: 'pending' },
  attempts: { type: Number, default: 0, min: 0 },
  nextAttemptAt: { type: Date, default: Date.now },
  lockedUntil: { type: Date, default: null },
  responseStatus: { type: Number, default: null },
  responseExcerpt: { type: String, default: '', maxlength: 500 },
  lastErrorCode: { type: String, default: '', maxlength: 80 },
  deliveredAt: { type: Date, default: null },
}, { timestamps: true, minimize: false });
schema.index({ endpointId: 1, eventId: 1 }, { unique: true });
schema.index({ status: 1, nextAttemptAt: 1, lockedUntil: 1 });
schema.index({ tenantId: 1, endpointId: 1, createdAt: -1 });
export const TenantWebhookDelivery = (models.TenantWebhookDelivery || model('TenantWebhookDelivery', schema)) as Model<any>;
