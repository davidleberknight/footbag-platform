import { Request, Response, NextFunction } from 'express';
import { mediaService } from '../services/mediaService';
import { handleControllerError } from '../lib/controllerErrors';

export const mediaController = {
  hub(req: Request, res: Response, next: NextFunction): void {
    try {
      const vm = mediaService.getMediaHubPage({ authenticated: req.user != null });
      res.render('media/index', vm);
    } catch (err) {
      handleControllerError(err, res, next, 'media controller (hub)');
    }
  },

  namedGallery(req: Request, res: Response, next: NextFunction): void {
    try {
      const vm = mediaService.getNamedGalleryPage(
        req.params.galleryId,
        req.query.page,
        { authenticated: req.user != null },
      );
      res.render('media/gallery', vm);
    } catch (err) {
      handleControllerError(err, res, next, 'media controller (named gallery)');
    }
  },
};
