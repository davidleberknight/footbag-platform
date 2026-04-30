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
