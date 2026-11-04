import { Schema, model, models, type Model } from 'mongoose';

const paymentSchema = new Schema({
  amount: { type: Number, required: true, min: 0 },
  currency: { type: String, required: true, uppercase: true, minlength: 3, maxlength: 3 },
  status: { type: String, enum: ['pending', 'paid', 'failed', 'refunded'], required: true },
  method: { type: String, trim: true, default: '' },
  provider: { type: String, trim: true, default: '' },
  providerReference: { type: String, trim: true, default: '' },
  invoiceNumber: { type: String, trim: true, default: '' },
  invoiceUrl: { type: String, trim: true, default: '' },
  paidAt: { type: Date, default: null },
  failureReason: { type: String, trim: true, default: '' },
  recordedAt: { type: Date, default: Date.now },
}, { _id: true });

const schema = new Schema({
  tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, unique: true, index: true },
  plan: {
    code: { type: String, required: true, trim: true, lowercase: true },
    name: { type: String, required: true, trim: true },
    amount: { type: Number, min: 0, default: 0 },
    currency: { type: String, uppercase: true, minlength: 3, maxlength: 3, default: 'EGP' },
  },
  billingCycle: { type: String, enum: ['monthly', 'quarterly', 'yearly'], required: true, default: 'monthly' },
  status: { type: String, enum: ['pending', 'trialing', 'active', 'past_due', 'canceled', 'expired'], required: true, default: 'pending' },
  trialStartsAt: { type: Date, default: null },
  trialEndsAt: { type: Date, default: null },
  currentPeriodStartsAt: { type: Date, default: null },
  currentPeriodEndsAt: { type: Date, default: null },
  nextBillingAt: { type: Date, default: null },
  cancelAtPeriodEnd: { type: Boolean, default: false },
  canceledAt: { type: Date, default: null },
  paymentHistory: { type: [paymentSchema], default: [] },
  notes: { type: String, trim: true, default: '' },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true, minimize: false });

schema.index({ status: 1, nextBillingAt: 1 });
export const Subscription = (models.Subscription || model('Subscription', schema)) as Model<any>;
