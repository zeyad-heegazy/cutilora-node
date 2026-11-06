import { Schema, model, models, type Model } from 'mongoose';

const schema = new Schema({
  tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, unique: true, index: true },
  plan: {
    code: { type: String, required: true, trim: true, lowercase: true },
    name: { type: String, required: true, trim: true },
    amount: { type: Number, min: 0, default: 0 },
    currency: { type: String, uppercase: true, minlength: 3, maxlength: 3, default: 'EGP' },
    limits: {
      maxClinics: { type: Number, min: 0, default: null },
      maxBranches: { type: Number, min: 0, default: null },
      maxUsers: { type: Number, min: 0, default: null },
      maxStorageBytes: { type: Number, min: 0, default: null },
    },
    features: [{ type: String, trim: true, lowercase: true }],
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
  paymentMethod: {
    provider: { type: String, trim: true, default: '' },
    reference: { type: String, trim: true, default: '', select: false },
    type: { type: String, trim: true, default: '' },
    brand: { type: String, trim: true, default: '' },
    last4: { type: String, trim: true, maxlength: 4, default: '' },
    expiryMonth: { type: Number, min: 1, max: 12, default: null },
    expiryYear: { type: Number, min: 2020, max: 2200, default: null },
    updatedAt: { type: Date, default: null },
  },
  paymentRecovery: {
    failedAt: { type: Date, default: null },
    failureCode: { type: String, trim: true, maxlength: 80, default: '' },
    retryAt: { type: Date, default: null },
    retryCount: { type: Number, min: 0, default: 0 },
    gracePeriodEndsAt: { type: Date, default: null },
    suspensionAt: { type: Date, default: null },
  },
  notes: { type: String, trim: true, default: '' },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true, minimize: false });

schema.index({ status: 1, nextBillingAt: 1 });
export const Subscription = (models.Subscription || model('Subscription', schema)) as Model<any>;
