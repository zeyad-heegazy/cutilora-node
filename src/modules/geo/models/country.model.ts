import { Schema, model, models } from 'mongoose';
const schema = new Schema({
  nameEn: { type: String, required: true, trim: true },
  nameAr: { type: String, default: null, trim: true },
  code: { type: String, required: true, uppercase: true, trim: true, minlength: 2, maxlength: 2, unique: true },
}, { timestamps: true });
schema.index({ nameEn: 1 }, { unique: true });
export const Country = models.Country || model('Country', schema);