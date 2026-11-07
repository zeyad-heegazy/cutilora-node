import { Schema, model, models, type Model } from 'mongoose';

const schema = new Schema({
  tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, immutable: true },
  clinicId: { type: Schema.Types.ObjectId, ref: 'Clinic', required: true, immutable: true },
  actorUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true, immutable: true },
  patientId: { type: String, required: true, trim: true, maxlength: 120, immutable: true },
  accessReason: { type: String, required: true, trim: true, maxlength: 500, immutable: true },
  resourceType: { type: String, required: true, trim: true, maxlength: 80, immutable: true },
  resourceId: { type: String, trim: true, maxlength: 120, default: null, immutable: true },
  correlationId: { type: String, trim: true, maxlength: 120, default: null, immutable: true },
  accessedAt: { type: Date, required: true, default: Date.now, immutable: true },
}, { timestamps: false, versionKey: false, minimize: false });

for (const operation of ['updateOne', 'updateMany', 'findOneAndUpdate', 'replaceOne', 'deleteOne', 'deleteMany', 'findOneAndDelete']) {
  schema.pre(operation as any, function () { throw new Error('Data access logs are append-only.'); });
}

schema.index({ tenantId: 1, clinicId: 1, patientId: 1, accessedAt: -1 });
schema.index({ tenantId: 1, actorUserId: 1, accessedAt: -1 });
export const DataAccessLog = (models.DataAccessLog || model('DataAccessLog', schema)) as Model<any>;
