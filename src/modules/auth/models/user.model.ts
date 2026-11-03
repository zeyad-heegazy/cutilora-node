import { Schema, model, models, type Model } from 'mongoose';

const schema = new Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true, select: false },
  platformRole: { type: String, enum: ['platform_admin', 'user'], default: 'user', required: true },
  isActive: { type: Boolean, default: true, required: true },
}, { timestamps: true });

export const User = (models.User || model('User', schema)) as Model<any>;