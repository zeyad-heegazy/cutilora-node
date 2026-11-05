import type { Request, Response, NextFunction } from 'express';
import { tenantCatalogTemplateService } from './tenant-catalog-template.service.js';
import { createCatalogTemplateSchema, listCatalogTemplatesQuerySchema, publishCatalogTemplateSchema, updateCatalogTemplateSchema } from './tenant-catalog-template.validation.js';

export const tenantCatalogTemplateController = {
  async list(req: Request, res: Response, next: NextFunction) {
    try {
      const query = listCatalogTemplatesQuerySchema.parse(req.query);
      const result = await tenantCatalogTemplateService.list(req.tenantContext!.tenantId, query);
      res.json({ success: true, data: result.items, pagination: result.pagination });
    } catch (error) { next(error); }
  },
  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const input = createCatalogTemplateSchema.parse(req.body);
      const item = await tenantCatalogTemplateService.create(req.tenantContext!.tenantId, req.auth!.userId, input);
      res.status(201).json({ success: true, data: item });
    } catch (error) { next(error); }
  },
  async get(req: Request, res: Response, next: NextFunction) {
    try {
      const item = await tenantCatalogTemplateService.get(req.tenantContext!.tenantId, String(req.params.templateId ?? ''));
      if (!item) return res.status(404).json({ success: false, error: { code: 'TEMPLATE_NOT_FOUND', message: 'Catalog template not found.' } });
      res.json({ success: true, data: item });
    } catch (error) { next(error); }
  },
  async update(req: Request, res: Response, next: NextFunction) {
    try {
      const input = updateCatalogTemplateSchema.parse(req.body);
      const item = await tenantCatalogTemplateService.update(req.tenantContext!.tenantId, String(req.params.templateId ?? ''), req.auth!.userId, input);
      if (!item) return res.status(404).json({ success: false, error: { code: 'TEMPLATE_NOT_FOUND', message: 'Catalog template not found.' } });
      res.json({ success: true, data: item });
    } catch (error) { next(error); }
  },
  async previewPublish(req: Request, res: Response, next: NextFunction) {
    try {
      const input = publishCatalogTemplateSchema.omit({ confirm: true }).parse(req.body);
      const item = await tenantCatalogTemplateService.previewPublish(req.tenantContext!.tenantId, String(req.params.templateId ?? ''), input);
      if (!item) return res.status(404).json({ success: false, error: { code: 'TEMPLATE_NOT_FOUND', message: 'Catalog template not found.' } });
      res.json({ success: true, data: item });
    } catch (error) { next(error); }
  },
  async publish(req: Request, res: Response, next: NextFunction) {
    try {
      const input = publishCatalogTemplateSchema.parse(req.body);
      const item = await tenantCatalogTemplateService.publish(req.tenantContext!.tenantId, String(req.params.templateId ?? ''), req.auth!.userId, input);
      if (!item) return res.status(404).json({ success: false, error: { code: 'TEMPLATE_NOT_FOUND', message: 'Catalog template not found.' } });
      res.json({ success: true, data: item });
    } catch (error) { next(error); }
  },
  async archive(req: Request, res: Response, next: NextFunction) {
    try {
      const item = await tenantCatalogTemplateService.archive(req.tenantContext!.tenantId, String(req.params.templateId ?? ''), req.auth!.userId);
      if (!item) return res.status(404).json({ success: false, error: { code: 'TEMPLATE_NOT_FOUND', message: 'Catalog template not found.' } });
      res.json({ success: true, data: item });
    } catch (error) { next(error); }
  },
};
