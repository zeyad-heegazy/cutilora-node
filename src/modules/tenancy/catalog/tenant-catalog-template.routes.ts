import { Router } from 'express';
import { requireTenantScope } from '../middleware/tenant-context.js';
import { requireTenantPermission } from '../middleware/tenant-permissions.js';
import { tenantCatalogTemplateController } from './tenant-catalog-template.controller.js';

export const tenantCatalogTemplateRouter = Router();
tenantCatalogTemplateRouter.use(requireTenantScope, requireTenantPermission('configuration.manage'));
tenantCatalogTemplateRouter.get('/', tenantCatalogTemplateController.list);
tenantCatalogTemplateRouter.post('/', tenantCatalogTemplateController.create);
tenantCatalogTemplateRouter.get('/:templateId', tenantCatalogTemplateController.get);
tenantCatalogTemplateRouter.patch('/:templateId', tenantCatalogTemplateController.update);
tenantCatalogTemplateRouter.post('/:templateId/preview-publish', tenantCatalogTemplateController.previewPublish);
tenantCatalogTemplateRouter.post('/:templateId/publish', tenantCatalogTemplateController.publish);
tenantCatalogTemplateRouter.post('/:templateId/archive', tenantCatalogTemplateController.archive);
