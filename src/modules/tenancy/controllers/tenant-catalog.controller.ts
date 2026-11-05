import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { tenantCatalogService } from '../services/tenant-catalog.service.js';

const objectId = z.string().regex(/^[a-f\\d]{24}$/i);
const templateTypes = ['service_treatment', 'pricing', 'appointment_policy', 'cancellation_policy', 'rescheduling_policy', 'message_template', 'notification_template', 'operational_policy'] as const;
const content = z.record(z.unknown());
const createSchema = z.object({
  name: z.string().trim().min(1).max(120),
  key: z.string().trim().min(2).max(140).regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/),
  type: z.enum(templateTypes),
  description: z.string().trim().max(1000).optional(),
  content,
});
const updateSchema = createSchema.partial().extend({ expectedVersion: z.number().int().positive() }).refine((v) => Object.keys(v).some((key) => key !== 'expectedVersion'), 'At least one template field is required.');
const publishSchema = z.object({
  expectedVersion: z.number().int().positive(),
  applyTo: z.enum(['none', 'all', 'selected']),
  clinicIds: z.array(objectId).min(1).max(100).optional(),
  confirm: z.boolean(),
}).refine((v) => v.applyTo !== 'selected' || Boolean(v.clinicIds?.length), { message: 'clinicIds are required when applyTo=selected.', path: ['clinicIds'] });

function tenant(req: Request) { return req.tenantContext!.tenantId; }
function actor(req: Request) { return req.auth!.userId; }

export const tenantCatalogController = {
  async list(req: Request, res: Response, next: NextFunction) {
    try {
      const query = z.object({ type: z.enum(templateTypes).optional(), status: z.enum(['draft', 'published', 'archived']).optional() }).parse(req.query);
      res.json({ success: true, data: await tenantCatalogService.list(tenant(req), query) });
    } catch (error) { next(error); }
  },
  async get(req: Request, res: Response, next: NextFunction) {
    try {
      const item = await tenantCatalogService.get(tenant(req), String(req.params.templateId ?? ''));
      if (!item) return res.status(404).json({ success: false, error: { code: 'TEMPLATE_NOT_FOUND', message: 'Template not found.' } });
      res.json({ success: true, data: item });
    } catch (error) { next(error); }
  },
  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const input = createSchema.parse(req.body);
      res.status(201).json({ success: true, data: await tenantCatalogService.create(tenant(req), actor(req), input) });
    } catch (error) { next(error); }
  },
  async update(req: Request, res: Response, next: NextFunction) {
    try {
      const input = updateSchema.parse(req.body);
      const { expectedVersion, ...changes } = input;
      const item = await tenantCatalogService.update(tenant(req), actor(req), String(req.params.templateId ?? ''), expectedVersion, changes);
      if (!item) return res.status(404).json({ success: false, error: { code: 'TEMPLATE_NOT_FOUND', message: 'Template not found.' } });
      res.json({ success: true, data: item });
    } catch (error) { next(error); }
  },
  async archive(req: Request, res: Response, next: NextFunction) {
    try {
      const input = z.object({ expectedVersion: z.number().int().positive() }).parse(req.body);
      const item = await tenantCatalogService.archive(tenant(req), actor(req), String(req.params.templateId ?? ''), input.expectedVersion);
      res.json({ success: true, data: item });
    } catch (error) { next(error); }
  },
  async publish(req: Request, res: Response, next: NextFunction) {
    try {
      const input = publishSchema.parse(req.body);
      const result = await tenantCatalogService.publish(tenant(req), actor(req), String(req.params.templateId ?? ''), input);
      if (!result) return res.status(404).json({ success: false, error: { code: 'TEMPLATE_NOT_FOUND', message: 'Template not found.' } });
      res.json({ success: true, data: result });
    } catch (error) { next(error); }
  },
};
