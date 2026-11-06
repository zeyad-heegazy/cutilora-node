import { Schema, model, models, type Model } from 'mongoose';

const schema = new Schema({
  tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, immutable: true },
  clinicId: { type: Schema.Types.ObjectId, ref: 'Clinic', required: true, immutable: true },
  branchId: { type: Schema.Types.ObjectId, ref: 'Branch', default: null, immutable: true },
  patientId: { type: Schema.Types.ObjectId, required: true, immutable: true },
  invoiceId: { type: Schema.Types.ObjectId, ref: 'ClinicFinanceEntry', required: true, immutable: true },
  paymentId: { type: Schema.Types.ObjectId, ref: 'ClinicFinanceEntry', required: true, immutable: true },
  name: { type: String, required: true, trim: true, maxlength: 120, immutable: true },
  currency: { type: String, required: true, uppercase: true, minlength: 3, maxlength: 3, immutable: true },
  saleAmount: { type: Number, required: true, min: 0, immutable: true },
  sessionsPurchased: { type: Number, required: true, min: 1, immutable: true },
  sessionsRemaining: { type: Number, required: true, min: 0 },
  status: { type: String, enum: ['active', 'fully_redeemed', 'refund_pending', 'refunded', 'expired'], default: 'active' },
  expiresAt: { type: Date, default: null, immutable: true },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true, immutable: true },
  updatedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true, minimize: false });
schema.index({ tenantId: 1, clinicId: 1, patientId: 1, status: 1 });
schema.index({ tenantId: 1, invoiceId: 1 }, { unique: true });
export const ClinicFinancePackage = (models.ClinicFinancePackage || model('ClinicFinancePackage', schema)) as Model<any>;
