import { Schema, model, models, type Model } from 'mongoose';

const schema = new Schema({
  tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  subscriptionId: { type: Schema.Types.ObjectId, ref: 'Subscription', required: true, index: true },
  requestedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  type: { type: String, enum: ['upgrade', 'downgrade', 'cancel', 'reactivate'], required: true },
  targetPlanCode: { type: String, trim: true, lowercase: true, default: null },
  targetBillingCycle: { type: String, enum: ['monthly', 'quarterly', 'yearly', null], default: null },
  effectiveAt: { type: String, enum: ['immediate', 'period_end'], required: true, default: 'period_end' },
  reason: { type: String, trim: true, maxlength: 1000, default: '' },
  status: { type: String, enum: ['pending', 'approved', 'rejected', 'withdrawn'], default: 'pending', required: true },
  reviewedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  reviewedAt: { type: Date, default: null },
  reviewNote: { type: String, trim: true, maxlength: 1000, default: '' },
}, { timestamps: true, minimize: false });

schema.index({ tenantId: 1, status: 1, createdAt: -1 });
schema.index({ tenantId: 1 }, { unique: true, partialFilterExpression: { status: 'pending' } });
export const SubscriptionChangeRequest = (models.SubscriptionChangeRequest || model('SubscriptionChangeRequest', schema)) as Model<any>;
