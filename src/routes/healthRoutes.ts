import { Router } from 'express';
import { healthController } from '../controllers/healthController';

export const healthRouter = Router();

healthRouter.get('/live',  healthController.live);
healthRouter.get('/ready', healthController.ready);
