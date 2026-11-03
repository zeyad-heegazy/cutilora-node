import { Schema, model, models } from 'mongoose';

const userSchema = new Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true, select: false },
  platformRole: { type: String, enum: ['platform_admin', 'user'], default: 'user', required: true },
  isActive: { type: Boolean, default: true, required: true },
}, { timestamps: true });

const clinicSchema = new Schema({
  name: { type: String, required: true, trim: true },
  slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
  status: { type: String, enum: ['active', 'suspended'], default: 'active', required: true },
  countryId: { type: Schema.Types.ObjectId, ref: 'Country', default: null },
  timezone: { type: String, default: 'Africa/Cairo' },
  settings: { type: Schema.Types.Mixed, default: {} },
}, { timestamps: true });

const membershipSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  clinicId: { type: Schema.Types.ObjectId, ref: 'Clinic', required: true, index: true },
  role: { type: String, enum: ['owner', 'admin', 'manager', 'staff'], required: true },
  status: { type: String, enum: ['active', 'invited', 'suspended'], default: 'active', required: true },
}, { timestamps: true });
membershipSchema.index({ userId: 1, clinicId: 1 }, { unique: true });

export const User = models.User || model('User', userSchema);
export const Clinic = models.Clinic || model('Clinic', clinicSchema);
export const ClinicMembership = models.ClinicMembership || model('ClinicMembership', membershipSchema);
