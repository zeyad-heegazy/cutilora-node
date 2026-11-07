import type { Request, Response, NextFunction } from 'express';
import { platformTenantService } from '../services/platform-tenant.service.js';
import {
  createPaymentSchema,
  createTenantSchema,
  tenantStatusSchema,
  updateTenantSchema,
  upsertSubscriptionSchema,
} from '../../../tenancy/validation/tenancy.validation.js';

export const platformTenantController = {
  async list(req: Request, res: Response, next: NextFunction) {
    try {
      res.json({
        success: true,
        data: await platformTenantService.listTenants(),
      });
    } catch (e) {
      next(e);
    }
  },
  async get(req: Request, res: Response, next: NextFunction) {
    try {
      const item = await platformTenantService.getTenantDetails(
        String(req.params.tenantId ?? ''),
      );
      if (!item)
        return res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Tenant not found.' },
        });
      res.json({ success: true, data: item });
    } catch (e) {
      next(e);
    }
  },
  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const input = createTenantSchema.parse(req.body);
      res.status(201).json({
        success: true,
        data: await platformTenantService.createTenant(input),
      });
    } catch (e) {
      next(e);
    }
  },
  async update(req: Request, res: Response, next: NextFunction) {
    try {
      const input = updateTenantSchema.parse(req.body);
      const item = await platformTenantService.updateTenant(
        String(req.params.tenantId ?? ''),
        input,
      );
      if (!item)
        return res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Tenant not found.' },
        });
      res.json({ success: true, data: item });
    } catch (e) {
      next(e);
    }
  },
  async updateStatus(req: Request, res: Response, next: NextFunction) {
    try {
      const { status } = tenantStatusSchema.parse(req.body);
      const item = await platformTenantService.updateTenantStatus(
        String(req.params.tenantId ?? ''),
        status,
      );
      if (!item)
        return res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Tenant not found.' },
        });
      res.json({ success: true, data: item });
    } catch (e) {
      next(e);
    }
  },
  async upsertSubscription(req: Request, res: Response, next: NextFunction) {
    try {
      const input = upsertSubscriptionSchema.parse(req.body);
      const item = await platformTenantService.upsertSubscription(
        String(req.params.tenantId ?? ''),
        input,
      );
      if (!item)
        return res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Tenant not found.' },
        });
      res.json({ success: true, data: item });
    } catch (e) {
      next(e);
    }
  },
  async addSubscriptionPayment(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const input = createPaymentSchema.parse(req.body);
      const item = await platformTenantService.addSubscriptionPayment(
        String(req.params.tenantId ?? ''),
        input,
      );
      if (!item)
        return res.status(404).json({
          success: false,
          error: {
            code: 'SUBSCRIPTION_NOT_FOUND',
            message: 'Tenant subscription not found.',
          },
        });
      res.status(201).json({ success: true, data: item });
    } catch (e) {
      next(e);
    }
  },
};
