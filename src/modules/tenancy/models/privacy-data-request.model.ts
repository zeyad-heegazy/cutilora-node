import { Schema, model, models, type Model } from 'mongoose';

const schema = new Schema({
  tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, immutable: true },
  clinicId: { type: Schema.Types.ObjectId, ref: 'Clinic', required: true, immutable: true },
  patientId: { type: String, required: true, trim: true, maxlength: 120, immutable: true },
  requestType: { type: String, enum: ['access', 'export', 'correction', 'deletion'], required: true, immutable: true },
  status: { type: String, enum: ['submitted', 'identity_review', 'in_review', 'approved', 'rejected', 'fulfilled', 'cancelled'], default: 'submitted', required: true },
  requestedByUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true, immutable: true },
  reason: { type: String, trim: true, maxlength: 1000, default: '' },
  legalReviewRequired: { type: Boolean, default: true },
  legalReviewStatus: { type: String, enum: ['pending', 'approved', 'rejected', 'not_required'], default: 'pending' },
  legalReviewReference: { type: String, trim: true, maxlength: 160, default: null },
  decisionByUserId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  decisionAt: { type: Date, default: null },
  fulfilledAt: { type: Date, default: null },
  resolutionNote: { type: String, trim: true, maxlength: 2000, default: '' },
}, { timestamps: true, minimize: false });

schema.index({ tenantId: 1, clinicId: 1, patientId: 1, createdAt: -1 });
schema.index({ tenantId: 1, status: 1, createdAt: -1 });
export const PrivacyDataRequest = (models.PrivacyDataRequest || model('PrivacyDataRequest', schema)) as Model<any>;
