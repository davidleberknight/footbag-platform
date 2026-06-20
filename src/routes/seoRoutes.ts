import { Router } from 'express';
import { seoController } from '../controllers/seoController';

export const seoRouter = Router();

seoRouter.get('/robots.txt',  seoController.robots);
seoRouter.get('/sitemap.xml', seoController.sitemap);
seoRouter.get('/llms.txt',    seoController.llms);
