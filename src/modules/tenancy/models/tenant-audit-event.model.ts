import { Schema, model, models, type Model } from 'mongoose';

const schema = new Schema({
  tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, immutable: true },
  actorUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true, immutable: true },
  action: { type: String, required: true, trim: true, maxlength: 120, immutable: true },
  targetType: { type: String, required: true, trim: true, maxlength: 80, immutable: true },
  targetId: { type: String, required: true, trim: true, maxlength: 100, immutable: true },
  clinicId: { type: Schema.Types.ObjectId, ref: 'Clinic', default: null, immutable: true },
  branchId: { type: Schema.Types.ObjectId, ref: 'Branch', default: null, immutable: true },
  result: { type: String, enum: ['success', 'failure'], default: 'success', immutable: true },
  requestId: { type: String, trim: true, maxlength: 120, default: '', immutable: true },
  metadata: { type: Schema.Types.Mixed, default: {}, immutable: true },
}, { timestamps: { createdAt: true, updatedAt: false }, versionKey: false, minimize: false });

schema.index({ tenantId: 1, createdAt: -1 });
schema.index({ tenantId: 1, actorUserId: 1, createdAt: -1 });
schema.index({ tenantId: 1, action: 1, createdAt: -1 });
schema.index({ tenantId: 1, clinicId: 1, createdAt: -1 });
export const TenantAuditEvent = (models.TenantAuditEvent || model('TenantAuditEvent', schema)) as Model<any>;
