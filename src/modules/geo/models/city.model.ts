import { Schema, model, models, type Model } from 'mongoose';
const schema = new Schema({
  governorateId: { type: Schema.Types.ObjectId, ref: 'Governorate', required: true, index: true },
  nameEn: { type: String, required: true, trim: true },
  nameAr: { type: String, default: null, trim: true },
  code: { type: String, default: null, trim: true },
}, { timestamps: true });
schema.index({ governorateId: 1, nameEn: 1 }, { unique: true });
schema.index({ governorateId: 1, code: 1 }, { unique: true, partialFilterExpression: { code: { $type: 'string' } } });
export const City = (models.City || model('City', schema)) as Model<any>;