import { Schema, model, models, type Model } from 'mongoose';

const permissionGrantSchema = new Schema({
  permission: { type: String, required: true, trim: true, maxlength: 120 },
  scope: { type: String, enum: ['tenant', 'clinic', 'branch'], required: true },
  clinicId: { type: Schema.Types.ObjectId, ref: 'Clinic', default: null },
  branchId: { type: Schema.Types.ObjectId, ref: 'Branch', default: null },
}, { _id: false });

const schema = new Schema({
  tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, immutable: true },
  key: { type: String, required: true, trim: true, lowercase: true, match: /^[a-z0-9]+(?:-[a-z0-9]+)*$/, maxlength: 80 },
  name: { type: String, required: true, trim: true, minlength: 2, maxlength: 120 },
  description: { type: String, trim: true, maxlength: 500, default: '' },
  scope: { type: String, enum: ['tenant', 'clinic', 'branch'], required: true },
  permissions: { type: [permissionGrantSchema], default: [] },
  version: { type: Number, min: 1, default: 1 },
  status: { type: String, enum: ['active', 'deactivated'], default: 'active' },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true, immutable: true },
  updatedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  deactivatedAt: { type: Date, default: null },
  deactivatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true, versionKey: false });

schema.index({ tenantId: 1, key: 1 }, { unique: true });
schema.index({ tenantId: 1, status: 1, name: 1 });
export const TenantRole = (models.TenantRole || model('TenantRole', schema)) as Model<any>;
