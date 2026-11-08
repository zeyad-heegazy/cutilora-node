import { Schema, model, models, type Model } from 'mongoose';

const contactSchema = new Schema({ type: { type: String, enum: ['mobile','email','whatsapp','home','work','other'], required: true }, value: { type: String, required: true, trim: true, maxlength: 254 }, normalizedValue: { type: String, required: true, trim: true, lowercase: true }, isPrimary: { type: Boolean, default: false }, isVerified: { type: Boolean, default: false } }, { _id: true });
const addressSchema = new Schema({ label: { type: String, trim: true, maxlength: 60, default: 'home' }, countryCode: { type: String, uppercase: true, minlength: 2, maxlength: 2, default: '' }, governorateId: { type: Schema.Types.ObjectId, ref: 'Governorate', default: null }, cityId: { type: Schema.Types.ObjectId, ref: 'City', default: null }, districtId: { type: Schema.Types.ObjectId, ref: 'District', default: null }, line1: { type: String, trim: true, maxlength: 200, default: '' }, line2: { type: String, trim: true, maxlength: 200, default: '' }, postalCode: { type: String, trim: true, maxlength: 24, default: '' }, isPrimary: { type: Boolean, default: false } }, { _id: true });
const noteSchema = new Schema({ body: { type: String, required: true, trim: true, maxlength: 4000 }, visibility: { type: String, enum: ['clinical','administrative'], default: 'administrative' }, createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true }, createdAt: { type: Date, default: Date.now } });
const historySchema = new Schema({ from: { type: String, default: null }, to: { type: String, required: true }, reason: { type: String, trim: true, maxlength: 500, default: '' }, changedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true }, changedAt: { type: Date, default: Date.now } });
const emergencySchema = new Schema({ name: { type: String, required: true, trim: true, maxlength: 160 }, relationship: { type: String, trim: true, maxlength: 80, default: '' }, phone: { type: String, required: true, trim: true, maxlength: 40 } }, { _id: true });
const schema = new Schema({
 tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, immutable: true },
 clinicId: { type: Schema.Types.ObjectId, ref: 'Clinic', required: true, immutable: true },
 patientNumber: { type: String, required: true, trim: true, uppercase: true, immutable: true },
 firstName: { type: String, required: true, trim: true, maxlength: 80 }, lastName: { type: String, required: true, trim: true, maxlength: 80 }, displayName: { type: String, trim: true, maxlength: 160, default: '' },
 dateOfBirth: { type: Date, default: null }, gender: { type: String, enum: ['female','male','other','undisclosed'], default: 'undisclosed' },
 contacts: { type: [contactSchema], default: [] }, addresses: { type: [addressSchema], default: [] }, emergencyContacts: { type: [emergencySchema], default: [] },
 tags: { type: [String], default: [] }, notes: { type: [noteSchema], default: [] }, statusHistory: { type: [historySchema], default: [] },
 status: { type: String, enum: ['lead','active','inactive','blocked','archived'], default: 'active', required: true },
 globalUserId: { type: Schema.Types.ObjectId, ref: 'User', default: null }, linkedAt: { type: Date, default: null }, linkedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
 createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true }, updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true, minimize: false });
schema.index({ tenantId: 1, clinicId: 1, patientNumber: 1 }, { unique: true });
schema.index({ tenantId: 1, clinicId: 1, status: 1, lastName: 1, firstName: 1 });
schema.index({ tenantId: 1, clinicId: 1, 'contacts.normalizedValue': 1 });
schema.index({ tenantId: 1, clinicId: 1, globalUserId: 1 }, { unique: true, partialFilterExpression: { globalUserId: { $type: 'objectId' } } });
export const Patient = (models.Patient || model('Patient', schema)) as Model<any>;
