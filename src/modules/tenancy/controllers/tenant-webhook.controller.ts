import type { Request, Response, NextFunction } from 'express';
import { createSchema, updateSchema } from '../validation/tenant-webhook.validation.js';
import { tenantWebhookService } from '../services/tenant-webhook.service.js';

export const tenantWebhookController = {
  async list(req: Request, res: Response, next: NextFunction) {
    try { res.json({ success: true, data: await tenantWebhookService.list(req.tenantContext!.tenantId) }); }
    catch (error) { next(error); }
  },
  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const input = createSchema.parse(req.body);
      const item = await tenantWebhookService.create(req.tenantContext!.tenantId, req.auth!.userId, input);
      res.status(201).json({ success: true, data: item, warning: 'The signing secret is shown only once. Store it securely.' });
    } catch (error) { next(error); }
  },
  async update(req: Request, res: Response, next: NextFunction) {
    try {
      const input = updateSchema.parse(req.body);
      const item = await tenantWebhookService.update(req.tenantContext!.tenantId, req.auth!.userId, String(req.params.endpointId ?? ''), input);
      if (!item) return res.status(404).json({ success: false, error: { code: 'WEBHOOK_NOT_FOUND', message: 'Webhook endpoint not found.' } });
      res.json({ success: true, data: item });
    } catch (error) { next(error); }
  },
  async rotateSecret(req: Request, res: Response, next: NextFunction) {
    try {
      const item = await tenantWebhookService.rotateSecret(req.tenantContext!.tenantId, req.auth!.userId, String(req.params.endpointId ?? ''));
      if (!item) return res.status(404).json({ success: false, error: { code: 'WEBHOOK_NOT_FOUND', message: 'Webhook endpoint not found.' } });
      res.json({ success: true, data: item, warning: 'The new signing secret is shown only once. The previous secret is no longer valid.' });
    } catch (error) { next(error); }
  },
  async setStatus(req: Request, res: Response, next: NextFunction) {
    try {
      const input = z.object({ status: z.enum(['active', 'disabled']) }).strict().parse(req.body);
      const item = await tenantWebhookService.setStatus(req.tenantContext!.tenantId, req.auth!.userId, String(req.params.endpointId ?? ''), input.status);
      if (!item) return res.status(404).json({ success: false, error: { code: 'WEBHOOK_NOT_FOUND', message: 'Webhook endpoint not found.' } });
      res.json({ success: true, data: item });
    } catch (error) { next(error); }
  },
  async retryDelivery(req: Request, res: Response, next: NextFunction) {
    try {
      const item = await tenantWebhookService.retryDelivery(
        req.tenantContext!.tenantId, req.auth!.userId,
        String(req.params.endpointId ?? ''), String(req.params.deliveryId ?? ''),
      );
      if (!item) return res.status(404).json({ success: false, error: { code: 'FAILED_DELIVERY_NOT_FOUND', message: 'Failed delivery not found for this endpoint and tenant.' } });
      res.json({ success: true, data: item });
    } catch (error) { next(error); }
  },
  async deliveries(req: Request, res: Response, next: NextFunction) {
    try {
      const limit = z.coerce.number().int().min(1).max(100).default(50).parse(req.query.limit);
      const items = await tenantWebhookService.listDeliveries(req.tenantContext!.tenantId, String(req.params.endpointId ?? ''), limit);
      if (!items) return res.status(404).json({ success: false, error: { code: 'WEBHOOK_NOT_FOUND', message: 'Webhook endpoint not found.' } });
      res.json({ success: true, data: items });
    } catch (error) { next(error); }
  },
};
