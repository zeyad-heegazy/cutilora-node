import { Schema, model, models, type Model } from 'mongoose';

const schema = new Schema(
  {
    tenantId: {
      type: Schema.Types.ObjectId,
      ref: 'Tenant',
      required: true,
      index: true,
    },
    subscriptionId: {
      type: Schema.Types.ObjectId,
      ref: 'Subscription',
      required: true,
      index: true,
    },
    amount: { type: Number, required: true, min: 0 },
    currency: {
      type: String,
      required: true,
      uppercase: true,
      minlength: 3,
      maxlength: 3,
    },
    status: {
      type: String,
      enum: ['pending', 'paid', 'failed', 'refunded'],
      required: true,
    },
    method: { type: String, trim: true, default: '' },
    provider: { type: String, trim: true, default: '' },
    providerReference: { type: String, trim: true, default: '' },
    invoiceNumber: { type: String, trim: true, default: '' },
    invoiceUrl: { type: String, trim: true, default: '' },
    paidAt: { type: Date, default: null },
    failureReason: { type: String, trim: true, default: '' },
    recordedAt: { type: Date, default: Date.now },
    recordedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true, minimize: false },
);

schema.index({ tenantId: 1, createdAt: 1 });
schema.index({ subscriptionId: 1, createdAt: 1 });
schema.index(
  { provider: 1, providerReference: 1 },
  {
    unique: true,
    partialFilterExpression: {
      providerReference: { $type: 'string', $gt: '' },
    },
  },
);
export const SubscriptionPayment = (models.SubscriptionPayment ||
  model('SubscriptionPayment', schema)) as Model<any>;
