import {Schema,model,models,type Model} from 'mongoose';
const schema=new Schema({tenantId:{type:Schema.Types.ObjectId,ref:'Tenant',required:true},clinicId:{type:Schema.Types.ObjectId,ref:'Clinic',required:true},value:{type:Number,default:0,required:true}},{timestamps:false});
schema.index({tenantId:1,clinicId:1},{unique:true});
export const PatientNumberCounter=(models.PatientNumberCounter||model('PatientNumberCounter',schema)) as Model<any>;
