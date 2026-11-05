import { Schema, model, models, type Model } from 'mongoose';

const lineItemSchema = new Schema({ category: { type: String, trim: true, maxlength: 80, default: 'Uncategorized' }, description: { type: String, required: true, trim: true, maxlength: 240 }, quantity: { type: Number, required: true, min: 0.0001 }, unitPrice: { type: Number, required: true, min: 0 }, total: { type: Number, required: true, min: 0 } }, { _id: false });
const schema = new Schema({
  tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true },
  clinicId: { type: Schema.Types.ObjectId, ref: 'Clinic', required: true },
  branchId: { type: Schema.Types.ObjectId, ref: 'Branch', default: null },
  type: { type: String, enum: ['invoice','payment','refund','expense'], required: true },
  status: { type: String, enum: ['draft','issued','posted','void'], required: true },
  currency: { type: String, required: true, uppercase: true, minlength: 3, maxlength: 3 },
  amount: { type: Number, required: true, min: 0 },
  settledAmount: { type: Number, default: 0, min: 0 },
  refundedAmount: { type: Number, default: 0, min: 0 },
  patientId: { type: Schema.Types.ObjectId, default: null },
  invoiceId: { type: Schema.Types.ObjectId, default: null },
  paymentId: { type: Schema.Types.ObjectId, default: null },
  invoiceNumber: { type: String, trim: true, maxlength: 80, default: null },
  description: { type: String, trim: true, maxlength: 500, default: '' },
  lineItems: { type: [lineItemSchema], default: [] },
  method: { type: String, trim: true, maxlength: 50, default: null },
  category: { type: String, trim: true, maxlength: 80, default: null },
  reference: { type: String, trim: true, maxlength: 120, default: null },
  idempotencyKey: { type: String, trim: true, maxlength: 120, default: null },
  occurredAt: { type: Date, required: true, default: Date.now },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  voidedAt: { type: Date, default: null },
  voidedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  voidReason: { type: String, trim: true, maxlength: 500, default: null },
}, { timestamps: true, minimize: false });
schema.index({ tenantId: 1, clinicId: 1, branchId: 1, type: 1, status: 1, occurredAt: -1 });
schema.index({ tenantId: 1, invoiceNumber: 1 }, { unique: true, partialFilterExpression: { invoiceNumber: { $type: 'string' } } });
schema.index({ tenantId: 1, idempotencyKey: 1 }, { unique: true, partialFilterExpression: { idempotencyKey: { $type: 'string' } } });
schema.index({ tenantId: 1, invoiceId: 1, type: 1, status: 1 });
export const ClinicFinanceEntry = (models.ClinicFinanceEntry || model('ClinicFinanceEntry', schema)) as Model<any>;
