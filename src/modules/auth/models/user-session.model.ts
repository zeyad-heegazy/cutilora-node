import { Schema, model, models, type Model } from 'mongoose';

const schema = new Schema({
  sessionId: { type: String, required: true, unique: true },
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  userAgent: { type: String, default: null, maxlength: 512 },
  lastSeenAt: { type: Date, required: true },
  expiresAt: { type: Date, required: true },
  revokedAt: { type: Date, default: null },
}, { timestamps: true });

schema.index({ userId: 1, createdAt: -1 });
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 15552000 });

export const UserSession = (models.UserSession || model('UserSession', schema)) as Model<any>;
