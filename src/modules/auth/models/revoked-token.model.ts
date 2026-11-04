import { Schema, model, models, type Model } from 'mongoose';

const schema = new Schema({
  tokenHash: { type: String, required: true, unique: true },
  expiresAt: { type: Date, required: true },
}, { timestamps: true });

schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const RevokedToken = (models.RevokedToken || model('RevokedToken', schema)) as Model<any>;
