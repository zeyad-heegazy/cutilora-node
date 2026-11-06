import { Schema, model, models, type Model } from 'mongoose';

const schema = new Schema({
  tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, immutable: true },
  clinicId: { type: Schema.Types.ObjectId, ref: 'Clinic', default: null },
  provider: { type: String, required: true, trim: true, lowercase: true, maxlength: 80 },
  integrationType: { type: String, enum: ['communication', 'payment_gateway', 'calendar', 'other'], required: true },
  displayName: { type: String, required: true, trim: true, maxlength: 120 },
  config: { type: Schema.Types.Mixed, default: {} },
  encryptedSecrets: { type: String, select: false, default: '' },
  status: { type: String, enum: ['configured', 'connected', 'disabled', 'error'], default: 'configured' },
  lastCheckedAt: { type: Date, default: null },
  lastError: { type: String, default: '', maxlength: 300 },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  updatedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true, minimize: false });

schema.index({ tenantId: 1, provider: 1, clinicId: 1 }, { unique: true });
schema.index({ tenantId: 1, integrationType: 1, status: 1 });
export const TenantIntegration = (models.TenantIntegration || model('TenantIntegration', schema)) as Model<any>;
