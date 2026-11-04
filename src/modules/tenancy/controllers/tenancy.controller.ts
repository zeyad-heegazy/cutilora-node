import type { Request, Response, NextFunction } from 'express';
import { tenancyService } from '../services/tenancy.service.js';
import { createBranchSchema, createClinicSchema } from '../validations/tenancy.validation.js';
export const tenancyController = {
  async context(req: Request,res: Response,next: NextFunction){try{const [tenant,clinic,branch]=await tenancyService.getContext(req.tenantContext!);res.json({success:true,data:{tenant,clinic,branch,access:req.tenantContext}});}catch(e){next(e);}},
  async listClinics(req: Request,res: Response,next: NextFunction){try{res.json({success:true,data:await tenancyService.listClinics(req.tenantContext!.tenantId)});}catch(e){next(e);}},
  async createClinic(req: Request,res: Response,next: NextFunction){try{const input=createClinicSchema.parse(req.body);res.status(201).json({success:true,data:await tenancyService.createClinic(input,req.tenantContext!.tenantId)});}catch(e){next(e);}},
  async listBranches(req: Request,res: Response,next: NextFunction){try{const c=req.tenantContext!;if(!c.clinicId)return res.status(400).json({success:false,error:{code:'CLINIC_CONTEXT_REQUIRED',message:'Select a clinic using X-Clinic-Id.'}});res.json({success:true,data:await tenancyService.listBranches(c.tenantId,c.clinicId,c.branchId)});}catch(e){next(e);}},
  async createBranch(req: Request,res: Response,next: NextFunction){try{const c=req.tenantContext!;if(!c.clinicId)return res.status(400).json({success:false,error:{code:'CLINIC_CONTEXT_REQUIRED',message:'Select a clinic using X-Clinic-Id.'}});const input=createBranchSchema.parse(req.body);res.status(201).json({success:true,data:await tenancyService.createBranch(input,c.tenantId,c.clinicId)});}catch(e){next(e);}},
};