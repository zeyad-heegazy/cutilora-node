import {Schema,model,models,type Model} from 'mongoose';
const schema=new Schema({tenantId:{type:Schema.Types.ObjectId,ref:'Tenant',required:true,immutable:true},clinicId:{type:Schema.Types.ObjectId,ref:'Clinic',required:true,immutable:true},name:{type:String,required:true,trim:true,lowercase:true,maxlength:40},color:{type:String,trim:true,match:/^#[0-9a-fA-F]{6}$/ ,default:'#64748b'},createdBy:{type:Schema.Types.ObjectId,ref:'User',required:true}},{timestamps:true});
schema.index({tenantId:1,clinicId:1,name:1},{unique:true});
export const PatientTag=(models.PatientTag||model('PatientTag',schema)) as Model<any>;
