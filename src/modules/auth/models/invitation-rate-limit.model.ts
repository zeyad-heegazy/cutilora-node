import { Schema, model, models, type Model } from 'mongoose';

const schema = new Schema({
  key: { type: String, required: true, unique: true, immutable: true },
  count: { type: Number, required: true, default: 0 },
  windowStartedAt: { type: Date, required: true },
  expiresAt: { type: Date, required: true },
}, { versionKey: false });

schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export const InvitationRateLimit = (models.InvitationRateLimit || model('InvitationRateLimit', schema)) as Model<any>;
