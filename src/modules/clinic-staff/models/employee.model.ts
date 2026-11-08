import { Schema, model, models, type Model } from 'mongoose';

const schema = new Schema({
  tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, immutable: true, index: true },
  clinicId: { type: Schema.Types.ObjectId, ref: 'Clinic', required: true, immutable: true, index: true },
  employeeCode: { type: String, trim: true, uppercase: true, default: '' },
  firstName: { type: String, required: true, trim: true, maxlength: 80 },
  lastName: { type: String, required: true, trim: true, maxlength: 80 },
  displayName: { type: String, trim: true, maxlength: 160, default: '' },
  email: { type: String, lowercase: true, trim: true, default: '' },
  phone: { type: String, trim: true, default: '' },
  jobTitle: { type: String, trim: true, maxlength: 120, default: '' },
  employmentType: { type: String, enum: ['full_time', 'part_time', 'contractor', 'temporary'], default: 'full_time' },
  branchIds: [{ type: Schema.Types.ObjectId, ref: 'Branch' }],
  userId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  status: { type: String, enum: ['active', 'inactive'], default: 'active', required: true },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true, minimize: false });

schema.index({ tenantId: 1, clinicId: 1, employeeCode: 1 }, { unique: true, partialFilterExpression: { employeeCode: { $type: 'string', $gt: '' } } });
schema.index({ tenantId: 1, clinicId: 1, status: 1, lastName: 1, firstName: 1 });
schema.index({ tenantId: 1, clinicId: 1, userId: 1 }, { unique: true, partialFilterExpression: { userId: { $type: 'objectId' } } });
export const Employee = (models.Employee || model('Employee', schema)) as Model<any>;
