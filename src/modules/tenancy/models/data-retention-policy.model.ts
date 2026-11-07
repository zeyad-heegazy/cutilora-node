import { Schema, model, models, type Model } from 'mongoose';

const schema = new Schema({
  tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, immutable: true },
  recordType: { type: String, required: true, trim: true, maxlength: 100, immutable: true },
  retentionPeriodDays: { type: Number, min: 1, default: null, immutable: true },
  action: { type: String, enum: ['archive', 'anonymize', 'delete', 'manual_review'], default: 'manual_review', immutable: true },
  legalBasisReference: { type: String, trim: true, maxlength: 200, default: null, immutable: true },
  legalApprovalStatus: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
  approvedByUserId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  approvedAt: { type: Date, default: null },
  active: { type: Boolean, default: false },
}, { timestamps: { createdAt: true, updatedAt: false }, versionKey: false, minimize: false });

schema.index({ tenantId: 1, recordType: 1, createdAt: -1 });
export const DataRetentionPolicy = (models.DataRetentionPolicy || model('DataRetentionPolicy', schema)) as Model<any>;
