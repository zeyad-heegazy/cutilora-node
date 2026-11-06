import { Schema, model, models, type Model } from 'mongoose';

const schema = new Schema({
  tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, immutable: true },
  clinicId: { type: Schema.Types.ObjectId, ref: 'Clinic', required: true, immutable: true },
  branchId: { type: Schema.Types.ObjectId, ref: 'Branch', default: null, immutable: true },
  packageId: { type: Schema.Types.ObjectId, ref: 'ClinicFinancePackage', required: true, immutable: true },
  eventType: { type: String, enum: ['sold', 'redeemed', 'refunded', 'expired', 'adjusted'], required: true, immutable: true },
  sessionsDelta: { type: Number, required: true, immutable: true },
  amount: { type: Number, min: 0, default: 0, immutable: true },
  currency: { type: String, uppercase: true, minlength: 3, maxlength: 3, default: null, immutable: true },
  reference: { type: String, trim: true, maxlength: 120, default: null, immutable: true },
  reason: { type: String, trim: true, maxlength: 500, default: null, immutable: true },
  idempotencyKey: { type: String, trim: true, maxlength: 120, default: null, immutable: true },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true, immutable: true },
}, { timestamps: true, minimize: false });
schema.index({ tenantId: 1, packageId: 1, createdAt: -1 });
schema.index({ tenantId: 1, idempotencyKey: 1 }, { unique: true, partialFilterExpression: { idempotencyKey: { $type: 'string' } } });
export const ClinicFinancePackageEvent = (models.ClinicFinancePackageEvent || model('ClinicFinancePackageEvent', schema)) as Model<any>;
