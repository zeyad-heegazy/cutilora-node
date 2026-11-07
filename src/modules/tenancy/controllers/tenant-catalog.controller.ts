import type { Request, Response, NextFunction } from 'express';
import { createSchema, updateSchema, publishSchema, listQuerySchema, rollbackSchema, archiveSchema } from './validation/tenant-catalog.validation.js';
import { tenantCatalogService } from '../services/tenant-catalog.service.js';

function tenant(req: Request) { return req.tenantContext!.tenantId; }
function actor(req: Request) { return req.auth!.userId; }

export const tenantCatalogController = {
  async list(req: Request, res: Response, next: NextFunction) {
    try {
      const query = listQuerySchema.parse(req.query);
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
  async rollback(req: Request, res: Response, next: NextFunction) {
    try {
      const input = rollbackSchema.parse(req.body);
      const item = await tenantCatalogService.rollback(tenant(req), actor(req), String(req.params.templateId ?? ''), input.expectedVersion, input.targetVersion);
      if (!item) return res.status(404).json({ success: false, error: { code: 'TEMPLATE_NOT_FOUND', message: 'Template not found.' } });
      res.json({ success: true, data: item });
    } catch (error) { next(error); }
  },
  async archive(req: Request, res: Response, next: NextFunction) {
    try {
      const input = archiveSchema.parse(req.body);
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
