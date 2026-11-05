import { Schema, model, models, type Model } from 'mongoose';

const schema = new Schema({
  tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  email: { type: String, required: true, lowercase: true, trim: true },
  role: { type: String, enum: ['tenant_admin', 'billing_admin', 'clinic_admin', 'clinic_manager', 'branch_manager', 'staff', 'provider', 'receptionist'], required: true },
  scope: { type: String, enum: ['tenant', 'clinic', 'branch'], required: true },
  clinicId: { type: Schema.Types.ObjectId, ref: 'Clinic', default: null },
  branchIds: [{ type: Schema.Types.ObjectId, ref: 'Branch' }],
  invitedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  tokenHash: { type: String, required: true, select: false },
  status: { type: String, enum: ['pending', 'processing', 'accepted', 'revoked', 'expired'], default: 'pending', required: true },
  expiresAt: { type: Date, required: true },
  acceptedAt: { type: Date, default: null },
  acceptedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  revokedAt: { type: Date, default: null },
  revokedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true });

schema.index({ tenantId: 1, email: 1 }, { unique: true, partialFilterExpression: { status: 'pending' } });
schema.index({ tenantId: 1, status: 1, createdAt: -1 });
schema.index({ tokenHash: 1 }, { unique: true });
export const TenantInvitation = (models.TenantInvitation || model('TenantInvitation', schema)) as Model<any>;
