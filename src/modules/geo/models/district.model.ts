import { Schema, model, models, type Model } from 'mongoose';
const schema = new Schema({
  cityId: { type: Schema.Types.ObjectId, ref: 'City', required: true, index: true },
  nameEn: { type: String, required: true, trim: true },
  nameAr: { type: String, default: null, trim: true },
  code: { type: String, default: null, trim: true },
}, { timestamps: true });
schema.index({ cityId: 1, nameEn: 1 }, { unique: true });
schema.index({ cityId: 1, code: 1 }, { unique: true, partialFilterExpression: { code: { $type: 'string' } } });
export const District = (models.District || model('District', schema)) as Model<any>;