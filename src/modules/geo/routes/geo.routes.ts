import { Router } from 'express';
import { authenticatePlatform } from '../../auth/middleware/authenticate-platform.js';
import { geoController } from '../controllers/geo.controller.js';

export const geoRouter = Router();
geoRouter.use(authenticatePlatform);
geoRouter.get('/:resource', geoController.index);
geoRouter.post('/:resource', geoController.store);
geoRouter.get('/:resource/:entry', geoController.show);
geoRouter.patch('/:resource/:entry', geoController.update);
geoRouter.delete('/:resource/:entry', geoController.destroy);
