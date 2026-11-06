import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { tenantIntegrationService } from '../services/tenant-integration.service.js';

const schema = z.object({
  clinicId: z.string().regex(/^[a-f\\d]{24}$/i).nullable().optional(),
  provider: z.string().trim().min(2).max(80),
  integrationType: z.enum(['communication', 'payment_gateway', 'calendar', 'other']),
  displayName: z.string().trim().min(2).max(120),
  config: z.record(z.unknown()).optional(),
  secrets: z.record(z.string().max(4096)).optional(),
}).strict();

export const tenantIntegrationController = {
  async providers(_req: Request, res: Response) { res.json({ success: true, data: tenantIntegrationService.listProviders() }); },
  async list(req: Request, res: Response, next: NextFunction) {
    try { res.json({ success: true, data: await tenantIntegrationService.list(req.tenantContext!.tenantId) }); }
    catch (error) { next(error); }
  },
  async save(req: Request, res: Response, next: NextFunction) {
    try {
      const input = schema.parse(req.body);
      const item = await tenantIntegrationService.save(req.tenantContext!.tenantId, req.auth!.userId, input);
      res.status(200).json({ success: true, data: item });
    } catch (error) { next(error); }
  },
  async testConnection(req: Request, res: Response, next: NextFunction) {
    try {
      const item = await tenantIntegrationService.testConnection(req.tenantContext!.tenantId, req.auth!.userId, String(req.params.integrationId ?? ''));
      if (!item) return res.status(404).json({ success: false, error: { code: 'INTEGRATION_NOT_FOUND', message: 'Integration not found in this tenant.' } });
      res.json({ success: true, data: item });
    } catch (error) { next(error); }
  },
  async updateStatus(req: Request, res: Response, next: NextFunction) {
    try {
      const input = z.object({ status: z.enum(['configured', 'disabled']) }).strict().parse(req.body);
      const item = await tenantIntegrationService.setStatus(req.tenantContext!.tenantId, req.auth!.userId, String(req.params.integrationId ?? ''), input.status);
      if (!item) return res.status(404).json({ success: false, error: { code: 'INTEGRATION_NOT_FOUND', message: 'Integration not found in this tenant.' } });
      res.json({ success: true, data: item });
    } catch (error) { next(error); }
  },
};
