import { Request, Response, NextFunction } from 'express';
import { galleryService } from '../services/galleryService';
import { handleControllerError } from '../lib/controllerErrors';

export const galleryController = {
  index(req: Request, res: Response, next: NextFunction): void {
    try {
      const vm = galleryService.getPublicGalleryPage(req.query.page);
      res.render('gallery/index', vm);
    } catch (err) {
      handleControllerError(err, res, next, 'gallery controller');
    }
  },
};
