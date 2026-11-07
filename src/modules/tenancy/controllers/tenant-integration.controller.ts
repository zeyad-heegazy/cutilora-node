import type { Request, Response, NextFunction } from 'express';
import { schema, rotateCredentialsSchema, integrationStatusSchema } from '../validation/tenant-integration.validation.js';
import { tenantIntegrationService } from '../services/tenant-integration.service.js';

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
  async rotateCredentials(req: Request, res: Response, next: NextFunction) {
    try {
      const input = rotateCredentialsSchema.parse(req.body);
      const item = await tenantIntegrationService.rotateCredentials(req.tenantContext!.tenantId, req.auth!.userId, String(req.params.integrationId ?? ''), input.secrets);
      if (!item) return res.status(404).json({ success: false, error: { code: 'INTEGRATION_NOT_FOUND', message: 'Integration not found in this tenant.' } });
      res.json({ success: true, data: item });
    } catch (error) { next(error); }
  },
  async revokeCredentials(req: Request, res: Response, next: NextFunction) {
    try {
      const item = await tenantIntegrationService.revokeCredentials(req.tenantContext!.tenantId, req.auth!.userId, String(req.params.integrationId ?? ''));
      if (!item) return res.status(404).json({ success: false, error: { code: 'INTEGRATION_NOT_FOUND', message: 'Integration not found in this tenant.' } });
      res.json({ success: true, data: item });
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
      const input = integrationStatusSchema.parse(req.body);
      const item = await tenantIntegrationService.setStatus(req.tenantContext!.tenantId, req.auth!.userId, String(req.params.integrationId ?? ''), input.status);
      if (!item) return res.status(404).json({ success: false, error: { code: 'INTEGRATION_NOT_FOUND', message: 'Integration not found in this tenant.' } });
      res.json({ success: true, data: item });
    } catch (error) { next(error); }
  },
};
