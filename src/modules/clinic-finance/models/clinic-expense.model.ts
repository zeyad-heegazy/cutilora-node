import { Schema, model, models, type Model } from 'mongoose';

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
  description: { type: String, required: true, trim: true, maxlength: 240 },
  category: { type: String, required: true, trim: true, lowercase: true, maxlength: 80 },
  supplier: {
    name: { type: String, trim: true, maxlength: 160, default: '' },
    reference: { type: String, trim: true, maxlength: 120, default: '' },
  },
  amountMinor: { type: Number, required: true, min: 1, max: Number.MAX_SAFE_INTEGER },
  currency: { type: String, required: true, uppercase: true, minlength: 3, maxlength: 3, immutable: true },
  dueAt: { type: Date, default: null },
  incurredAt: { type: Date, required: true },
  status: { type: String, enum: ['recorded', 'paid', 'void'], default: 'recorded', required: true },
  paymentMethod: { type: String, enum: ['cash', 'card', 'bank_transfer', 'online', 'wallet', 'other'], default: null },
  paidAt: { type: Date, default: null },
  voidedAt: { type: Date, default: null },
  voidReason: { type: String, trim: true, maxlength: 500, default: '' },
  events: { type: [eventSchema], default: [] },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true, immutable: true },
  updatedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true, minimize: false });

schema.index({ tenantId: 1, clinicId: 1, incurredAt: -1 });
schema.index({ tenantId: 1, clinicId: 1, category: 1, incurredAt: -1 });
schema.index({ tenantId: 1, clinicId: 1, branchId: 1, status: 1 });
export const ClinicExpense = (models.ClinicExpense || model('ClinicExpense', schema)) as Model<any>;
