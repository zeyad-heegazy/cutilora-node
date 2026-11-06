import { Schema, model, models, type Model } from 'mongoose';

const schema = new Schema({
  tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  name: { type: String, required: true, trim: true, minlength: 2, maxlength: 80 },
  key: { type: String, required: true, trim: true, lowercase: true },
  description: { type: String, trim: true, maxlength: 500, default: '' },
  scope: { type: String, enum: ['tenant', 'clinic', 'branch'], required: true },
  permissions: { type: [String], required: true, default: [] },
  version: { type: Number, required: true, default: 1 },
  history: [{
    version: { type: Number, required: true },
    action: { type: String, enum: ['created', 'updated', 'archived'], required: true },
    name: { type: String, required: true },
    description: { type: String, default: '' },
    scope: { type: String, enum: ['tenant', 'clinic', 'branch'], required: true },
    permissions: { type: [String], default: [] },
    changedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    changedAt: { type: Date, required: true },
  }],
  status: { type: String, enum: ['active', 'archived'], default: 'active', required: true },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  updatedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true });

schema.index({ tenantId: 1, key: 1 }, { unique: true });
schema.index({ tenantId: 1, status: 1, scope: 1 });
export const TenantRole = (models.TenantRole || model('TenantRole', schema)) as Model<any>;
