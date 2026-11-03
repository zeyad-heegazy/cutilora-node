import { Schema, model, models } from 'mongoose';

const userSchema = new Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true, select: false },
  platformRole: { type: String, enum: ['platform_admin', 'user'], default: 'user', required: true },
  isActive: { type: Boolean, default: true, required: true },
}, { timestamps: true });

const tenantMembershipSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true },
  clinicId: { type: Schema.Types.ObjectId, ref: 'Clinic', default: null },
  branchIds: [{ type: Schema.Types.ObjectId, ref: 'Branch' }],
  scope: { type: String, enum: ['tenant', 'clinic', 'branch'], required: true },
  role: { type: String, enum: ['tenant_owner', 'tenant_admin', 'billing_admin', 'clinic_admin', 'clinic_manager', 'branch_manager', 'staff', 'provider', 'receptionist'], required: true },
  status: { type: String, enum: ['active', 'invited', 'suspended'], default: 'active', required: true },
}, { timestamps: true });
tenantMembershipSchema.index({ userId: 1, tenantId: 1, clinicId: 1 }, { unique: true });
tenantMembershipSchema.index({ tenantId: 1, clinicId: 1, status: 1 });

export const User = models.User || model('User', userSchema);
export const TenantMembership = models.TenantMembership || model('TenantMembership', tenantMembershipSchema);
