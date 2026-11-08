import type {Request,Response,NextFunction} from 'express';
import {PatientTag} from '../models/patient-tag.model.js';
import {z} from 'zod';
const body=z.object({name:z.string().trim().min(1).max(40),color:z.string().regex(/^#[0-9a-fA-F]{6}$/).optional()});
const scope=(req:Request)=>{if(!req.tenantContext?.clinicId)throw {status:400,code:'CLINIC_CONTEXT_REQUIRED',message:'Select a clinic using X-Clinic-Id.'};return {tenantId:req.tenantContext.tenantId,clinicId:req.tenantContext.clinicId,userId:req.auth!.userId};};
const wrap=(fn:(req:Request,res:Response)=>Promise<any>)=>(req:Request,res:Response,next:NextFunction)=>Promise.resolve(fn(req,res)).catch(next);
export const patientTagController={
 list:wrap(async(req,res)=>{const s=scope(req);const items=await PatientTag.find({tenantId:s.tenantId,clinicId:s.clinicId}).sort({name:1}).lean();res.json({success:true,data:items});}),
 create:wrap(async(req,res)=>{const s=scope(req);const input=body.parse(req.body);try{const item=await PatientTag.create({...input,name:input.name.toLocaleLowerCase('en-US'),tenantId:s.tenantId,clinicId:s.clinicId,createdBy:s.userId});res.status(201).json({success:true,data:item});}catch(e:any){if(e?.code===11000)throw {status:409,code:'PATIENT_TAG_EXISTS',message:'A tag with this name already exists in this clinic.'};throw e;}})
};
