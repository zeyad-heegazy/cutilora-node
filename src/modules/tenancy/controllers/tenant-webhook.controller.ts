import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { tenantWebhookService } from '../services/tenant-webhook.service.js';

const id = z.string().regex(/^[a-f0-9]{24}$/i);
const createSchema = z.object({
  name: z.string().trim().min(2).max(120),
  url: z.string().url().max(2048),
  clinicId: id.nullable().optional(),
  events: z.array(z.string().trim().min(1).max(120)).min(1).max(100),
}).strict();
const updateSchema = createSchema.partial().refine(value => Object.keys(value).length > 0, 'At least one webhook field must be provided.');

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
  async deliveries(req: Request, res: Response, next: NextFunction) {
    try {
      const limit = z.coerce.number().int().min(1).max(100).default(50).parse(req.query.limit);
      const items = await tenantWebhookService.listDeliveries(req.tenantContext!.tenantId, String(req.params.endpointId ?? ''), limit);
      if (!items) return res.status(404).json({ success: false, error: { code: 'WEBHOOK_NOT_FOUND', message: 'Webhook endpoint not found.' } });
      res.json({ success: true, data: items });
    } catch (error) { next(error); }
  },
};
