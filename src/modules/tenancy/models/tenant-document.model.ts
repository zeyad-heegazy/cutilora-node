import { Schema, model, models, type Model } from 'mongoose';

const schema = new Schema({
  tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  category: { type: String, enum: ['registration', 'tax', 'license', 'insurance', 'contract', 'other'], required: true },
  name: { type: String, required: true, trim: true, maxlength: 180 },
  mimeType: { type: String, required: true, enum: ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'] },
  sizeBytes: { type: Number, required: true, min: 1, max: 10 * 1024 * 1024 },
  storageKey: { type: String, required: true, select: false },
  expiresAt: { type: Date, default: null },
  status: { type: String, enum: ['active', 'archived'], default: 'active', required: true },
  uploadedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  archivedAt: { type: Date, default: null },
  archivedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true, minimize: false });

schema.index({ tenantId: 1, status: 1, category: 1, createdAt: -1 });
export const TenantDocument = (models.TenantDocument || model('TenantDocument', schema)) as Model<any>;
