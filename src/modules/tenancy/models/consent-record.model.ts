import { Schema, model, models, type Model } from 'mongoose';

const schema = new Schema({
  tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, immutable: true },
  clinicId: { type: Schema.Types.ObjectId, ref: 'Clinic', required: true, immutable: true },
  patientId: { type: String, required: true, trim: true, maxlength: 120, immutable: true },
  consentType: { type: String, required: true, trim: true, maxlength: 100, immutable: true },
  documentVersion: { type: String, required: true, trim: true, maxlength: 80, immutable: true },
  documentHash: { type: String, required: true, trim: true, maxlength: 128, immutable: true },
  documentSnapshot: { type: String, required: true, maxlength: 100000, select: false, immutable: true },
  status: { type: String, enum: ['granted', 'declined', 'revoked'], required: true, immutable: true },
  actorUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true, immutable: true },
  source: { type: String, enum: ['clinic_portal', 'patient_portal', 'import', 'other'], required: true, immutable: true },
  signedAt: { type: Date, required: true, immutable: true },
  revokedAt: { type: Date, default: null, immutable: true },
  revocationReason: { type: String, trim: true, maxlength: 500, default: null, immutable: true },
  revokesConsentId: { type: Schema.Types.ObjectId, ref: 'ConsentRecord', default: null, immutable: true },
}, { timestamps: { createdAt: true, updatedAt: false }, versionKey: false, minimize: false });

for (const operation of ['updateOne', 'updateMany', 'findOneAndUpdate', 'replaceOne', 'deleteOne', 'deleteMany', 'findOneAndDelete']) {
  schema.pre(operation as any, function () { throw new Error('Consent records are immutable. Record revocation as a new event/record.'); });
}

schema.index({ tenantId: 1, clinicId: 1, patientId: 1, consentType: 1, createdAt: -1 });
schema.index({ tenantId: 1, patientId: 1, status: 1 });
schema.index({ tenantId: 1, revokesConsentId: 1 }, { unique: true, partialFilterExpression: { revokesConsentId: { $type: 'objectId' } } });
export const ConsentRecord = (models.ConsentRecord || model('ConsentRecord', schema)) as Model<any>;
