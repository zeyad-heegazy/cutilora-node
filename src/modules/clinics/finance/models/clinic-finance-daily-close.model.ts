import { Schema, model, models, type Model } from 'mongoose';

const schema = new Schema({
  tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, immutable: true },
  clinicId: { type: Schema.Types.ObjectId, ref: 'Clinic', required: true, immutable: true },
  branchId: { type: Schema.Types.ObjectId, ref: 'Branch', default: null, immutable: true },
  businessDate: { type: String, required: true, match: /^\d{4}-\\d{2}-\\d{2}$/, immutable: true },
  timezone: { type: String, required: true, maxlength: 80, immutable: true },
  currency: { type: String, required: true, uppercase: true, minlength: 3, maxlength: 3, immutable: true },
  periodStartAt: { type: Date, required: true, immutable: true },
  periodEndAt: { type: Date, required: true, immutable: true },
  openingCash: { type: Number, required: true, min: 0, immutable: true },
  expectedCash: { type: Number, default: null },
  countedCash: { type: Number, default: null },
  variance: { type: Number, default: null },
  varianceReason: { type: String, trim: true, maxlength: 500, default: null },
  cashPayments: { type: Number, default: 0 },
  cashRefunds: { type: Number, default: 0 },
  cashExpenses: { type: Number, default: 0 },
  status: { type: String, enum: ['open', 'closed', 'approved'], default: 'open' },
  openedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true, immutable: true },
  closedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  approvedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  closedAt: { type: Date, default: null },
  approvedAt: { type: Date, default: null },
}, { timestamps: true, minimize: false });
schema.index({ tenantId: 1, clinicId: 1, branchId: 1, businessDate: 1, currency: 1 }, { unique: true });
schema.index({ tenantId: 1, clinicId: 1, status: 1, periodStartAt: -1 });
export const ClinicFinanceDailyClose = (models.ClinicFinanceDailyClose || model('ClinicFinanceDailyClose', schema)) as Model<any>;
