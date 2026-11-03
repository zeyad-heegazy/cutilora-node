import { Schema, model, models } from 'mongoose';
const schema = new Schema({
  countryId: { type: Schema.Types.ObjectId, ref: 'Country', required: true, index: true },
  nameEn: { type: String, required: true, trim: true },
  nameAr: { type: String, default: null, trim: true },
  code: { type: String, default: null, trim: true },
}, { timestamps: true });
schema.index({ countryId: 1, nameEn: 1 }, { unique: true });
schema.index({ countryId: 1, code: 1 }, { unique: true, partialFilterExpression: { code: { $type: 'string' } } });
export const Governorate = models.Governorate || model('Governorate', schema);