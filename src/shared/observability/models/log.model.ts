import { Schema, model, models, type Model } from 'mongoose';
const schema = new Schema({
  level: { type: String, enum: ['debug', 'info', 'warn', 'error', 'fatal'], required: true, index: true },
  category: { type: String, enum: ['http', 'auth', 'authorization', 'database', 'business', 'security', 'system', 'application'], required: true, index: true },
  message: { type: String, required: true, maxlength: 2000 },
  module: { type: String, default: 'system', index: true },
  method: String, path: String, statusCode: Number, durationMs: Number,
  userId: { type: Schema.Types.ObjectId, ref: 'User', index: true },
  tenantId: { type: Schema.Types.ObjectId, index: true },
  requestId: { type: String, index: true },
  metadata: { type: Schema.Types.Mixed, default: {} },
  occurredAt: { type: Date, default: Date.now, required: true, index: true },
}, { versionKey: false });
schema.index({ occurredAt: -1, level: 1 });
schema.index({ occurredAt: 1 }, { expireAfterSeconds: 7776000 });
export const SystemLog = (models.SystemLog || model('SystemLog', schema)) as Model<any>;
