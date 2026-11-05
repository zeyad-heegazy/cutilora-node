import { Schema, model, models, type Model } from 'mongoose';

const movementSchema = new Schema({
  idempotencyKey: { type: String, required: true, trim: true, maxlength: 128 },
  direction: { type: String, enum: ['in', 'out'], required: true },
  amountMinor: { type: Number, required: true, min: 1, max: Number.MAX_SAFE_INTEGER },
  reason: { type: String, required: true, trim: true, maxlength: 240 },
  recordedAt: { type: Date, required: true },
  recordedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
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
  currency: { type: String, required: true, uppercase: true, minlength: 3, maxlength: 3, immutable: true },
  status: { type: String, enum: ['open', 'pending_review', 'approved'], default: 'open', required: true },
  openedAt: { type: Date, required: true, immutable: true },
  openedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true, immutable: true },
  openingBalanceMinor: { type: Number, required: true, min: 0 },
  movements: { type: [movementSchema], default: [] },
  expectedBalanceMinor: { type: Number, default: null },
  countedBalanceMinor: { type: Number, default: null },
  varianceMinor: { type: Number, default: null },
  varianceReason: { type: String, trim: true, maxlength: 500, default: '' },
  closedAt: { type: Date, default: null },
  closedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  reviewedAt: { type: Date, default: null },
  reviewedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  events: { type: [eventSchema], default: [] },
  cashMutationLockToken: { type: String, default: null, select: false },
  cashMutationLockExpiresAt: { type: Date, default: null, select: false },
  version: { type: Number, default: 1, min: 1 },
}, { timestamps: true, minimize: false });

schema.index({ tenantId: 1, clinicId: 1, branchId: 1, openedAt: -1 });
schema.index({ tenantId: 1, clinicId: 1, status: 1, openedAt: -1 });
schema.index({ tenantId: 1, clinicId: 1, branchId: 1, status: 1 }, { unique: true, partialFilterExpression: { status: 'open' } });
export const ClinicCashSession = (models.ClinicCashSession || model('ClinicCashSession', schema)) as Model<any>;
