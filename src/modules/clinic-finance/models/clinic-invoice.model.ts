import { Schema, model, models, type Model } from 'mongoose';

const lineSchema = new Schema({
  description: { type: String, required: true, trim: true, maxlength: 240 },
  serviceReference: { type: String, trim: true, default: null, maxlength: 100 },
  quantity: { type: Number, required: true, min: 1, max: 10000 },
  unitPriceMinor: { type: Number, required: true, min: 0, max: Number.MAX_SAFE_INTEGER },
  discountBps: { type: Number, min: 0, max: 10000, default: 0 },
  taxBps: { type: Number, min: 0, max: 10000, default: 0 },
  subtotalMinor: { type: Number, required: true, min: 0 },
  discountMinor: { type: Number, required: true, min: 0 },
  taxMinor: { type: Number, required: true, min: 0 },
  totalMinor: { type: Number, required: true, min: 0 },
}, { _id: true });

const refundSchema = new Schema({
  method: { type: String, enum: ['cash', 'card', 'bank_transfer', 'online', 'wallet', 'other'], required: true },
  cashSessionId: { type: Schema.Types.ObjectId, ref: 'ClinicCashSession', default: null },
  idempotencyKey: { type: String, required: true, trim: true, maxlength: 128 },
  amountMinor: { type: Number, required: true, min: 1 },
  reason: { type: String, required: true, trim: true, maxlength: 500 },
  refundedAt: { type: Date, required: true },
  recordedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: false });

const paymentSchema = new Schema({
  cashSessionId: { type: Schema.Types.ObjectId, ref: 'ClinicCashSession', default: null },
  idempotencyKey: { type: String, required: true, trim: true, maxlength: 128 },
  method: { type: String, enum: ['cash', 'card', 'bank_transfer', 'online', 'wallet', 'other'], required: true },
  amountMinor: { type: Number, required: true, min: 1 },
  currency: { type: String, required: true, uppercase: true, minlength: 3, maxlength: 3 },
  reference: { type: String, trim: true, maxlength: 160, default: '' },
  receivedAt: { type: Date, required: true },
  recordedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  refundedMinor: { type: Number, min: 0, default: 0 },
  refunds: { type: [refundSchema], default: [] },
}, { timestamps: false });

const eventSchema = new Schema({
  type: { type: String, required: true, maxlength: 80 },
  actorUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  occurredAt: { type: Date, required: true },
  metadata: { type: Schema.Types.Mixed, default: {} },
}, { _id: false });

const schema = new Schema({
  tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, immutable: true },
  clinicId: { type: Schema.Types.ObjectId, ref: 'Clinic', required: true, immutable: true },
  branchId: { type: Schema.Types.ObjectId, ref: 'Branch', default: null, immutable: true },
  invoiceNumber: { type: String, trim: true, default: null },
  dueAt: { type: Date, default: null },
  customer: {
    displayName: { type: String, required: true, trim: true, maxlength: 160 },
    phone: { type: String, trim: true, maxlength: 40, default: '' },
    email: { type: String, lowercase: true, trim: true, maxlength: 254, default: '' },
    externalPatientReference: { type: String, trim: true, maxlength: 100, default: null },
  },
  lines: { type: [lineSchema], required: true, validate: [(v: unknown[]) => v.length > 0 && v.length <= 100, 'Invoice must contain 1 to 100 lines.'] },
  currency: { type: String, required: true, uppercase: true, minlength: 3, maxlength: 3, immutable: true },
  subtotalMinor: { type: Number, required: true, min: 0 },
  discountMinor: { type: Number, required: true, min: 0 },
  taxMinor: { type: Number, required: true, min: 0 },
  totalMinor: { type: Number, required: true, min: 0 },
  paidMinor: { type: Number, default: 0, min: 0 },
  refundedMinor: { type: Number, default: 0, min: 0 },
  balanceDueMinor: { type: Number, required: true, min: 0 },
  status: { type: String, enum: ['draft', 'issued', 'partially_paid', 'paid', 'void'], default: 'draft', required: true },
  issuedAt: { type: Date, default: null },
  voidedAt: { type: Date, default: null },
  voidReason: { type: String, trim: true, maxlength: 500, default: '' },
  payments: { type: [paymentSchema], default: [] },
  events: { type: [eventSchema], default: [] },
  version: { type: Number, default: 1, min: 1 },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true, immutable: true },
  updatedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true, minimize: false });

schema.index({ tenantId: 1, clinicId: 1, createdAt: -1 });
schema.index({ tenantId: 1, clinicId: 1, status: 1, createdAt: -1 });
schema.index({ tenantId: 1, clinicId: 1, invoiceNumber: 1 }, { unique: true, partialFilterExpression: { invoiceNumber: { $type: 'string' } } });
schema.index({ tenantId: 1, clinicId: 1, branchId: 1, issuedAt: -1 });
export const ClinicInvoice = (models.ClinicInvoice || model('ClinicInvoice', schema)) as Model<any>;

const counterSchema = new Schema({
  tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true },
  clinicId: { type: Schema.Types.ObjectId, ref: 'Clinic', required: true },
  year: { type: Number, required: true },
  sequence: { type: Number, default: 0 },
}, { timestamps: true });
counterSchema.index({ tenantId: 1, clinicId: 1, year: 1 }, { unique: true });
export const ClinicInvoiceCounter = (models.ClinicInvoiceCounter || model('ClinicInvoiceCounter', counterSchema)) as Model<any>;
