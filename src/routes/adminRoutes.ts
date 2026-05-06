import { Router } from 'express';
import { adminController } from '../controllers/adminController';
import { adminCuratorController } from '../controllers/adminCuratorController';
import { requireAuth } from '../middleware/auth';
import { requireAdmin } from '../middleware/requireAdmin';

export const adminRouter = Router();

adminRouter.use(requireAuth, requireAdmin);

adminRouter.get('/', adminController.index);
adminRouter.get('/curator/upload', adminCuratorController.getUpload);
adminRouter.post('/curator/upload', adminCuratorController.postUpload);
adminRouter.get('/curator/media', adminCuratorController.getList);
adminRouter.get('/curator/media/:id/edit', adminCuratorController.getEdit);
adminRouter.post('/curator/media/:id/edit', adminCuratorController.postEdit);
adminRouter.post('/curator/media/:id/delete', adminCuratorController.postDelete);
adminRouter.get('/curator/galleries', adminCuratorController.getGalleryList);
adminRouter.get('/curator/galleries/new', adminCuratorController.getGalleryNew);
adminRouter.post('/curator/galleries', adminCuratorController.postGalleryCreate);
adminRouter.get('/curator/galleries/:id/edit', adminCuratorController.getGalleryEdit);
adminRouter.post('/curator/galleries/:id/edit', adminCuratorController.postGalleryEdit);
adminRouter.post('/curator/galleries/:id/delete', adminCuratorController.postGalleryDelete);
