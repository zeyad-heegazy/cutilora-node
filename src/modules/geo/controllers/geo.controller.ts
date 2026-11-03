import type { NextFunction, Request, Response } from 'express';
import { geoService } from '../services/geo.service.js';
import { geoCreateSchema, geoListSchema, geoResourceSchema, geoUpdateSchema } from '../validations/geo.validation.js';

export const geoController = {
  async index(req: Request, res: Response, next: NextFunction) {
    try { const resource = geoResourceSchema.parse(req.params.resource); const query = geoListSchema.parse(req.query); res.json({ success: true, ...await geoService.list(resource, query) }); } catch (error) { next(error); }
  },
  async show(req: Request, res: Response, next: NextFunction) {
    try { const resource = geoResourceSchema.parse(req.params.resource); const entry = await geoService.show(resource, req.params.entry); if (!entry) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Geo entry not found.' } }); res.json({ success: true, data: entry }); } catch (error) { next(error); }
  },
  async store(req: Request, res: Response, next: NextFunction) {
    try { const resource = geoResourceSchema.parse(req.params.resource); const input = geoCreateSchema.parse(req.body); res.status(201).json({ success: true, data: await geoService.create(resource, input) }); } catch (error) { next(error); }
  },
  async update(req: Request, res: Response, next: NextFunction) {
    try { const resource = geoResourceSchema.parse(req.params.resource); const input = geoUpdateSchema.parse(req.body); const entry = await geoService.update(resource, req.params.entry, input); if (!entry) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Geo entry not found.' } }); res.json({ success: true, data: entry }); } catch (error) { next(error); }
  },
  async destroy(req: Request, res: Response, next: NextFunction) {
    try { const resource = geoResourceSchema.parse(req.params.resource); if (!await geoService.remove(resource, req.params.entry)) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Geo entry not found.' } }); res.json({ success: true, message: 'Geo entry deleted.' }); } catch (error) { next(error); }
  },
};
