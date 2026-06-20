import { Request, Response, NextFunction } from 'express';
import { mediaService } from '../services/mediaService';
import { handleControllerError } from '../lib/controllerErrors';

export const mediaController = {
  hub(_req: Request, res: Response, next: NextFunction): void {
    try {
      const vm = mediaService.getMediaHubPage();
      res.render('media/index', vm);
    } catch (err) {
      handleControllerError(err, res, next, 'media controller (hub)');
    }
  },

  memberGalleries(req: Request, res: Response, next: NextFunction): void {
    try {
      const vm = mediaService.getMemberGalleriesPage({ authenticated: req.user != null });
      res.render('media/member-galleries', vm);
    } catch (err) {
      handleControllerError(err, res, next, 'media controller (member galleries)');
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

  namedGalleryItem(req: Request, res: Response, next: NextFunction): void {
    try {
      const vm = mediaService.getNamedGalleryItemPage(
        req.params.galleryId,
        req.params.mediaId,
        { authenticated: req.user != null },
      );
      res.render('media/gallery-item', vm);
    } catch (err) {
      handleControllerError(err, res, next, 'media controller (named gallery item)');
    }
  },

  browse(req: Request, res: Response, next: NextFunction): void {
    try {
      const vm = mediaService.getMediaBrowsePage(
        {
          rawTags: collectQueryArg(req.query.tag),
          rawExcludes: collectQueryArg(req.query.exclude),
          rawPage: req.query.page,
        },
        { authenticated: req.user != null },
      );
      res.render('media/browse', vm);
    } catch (err) {
      handleControllerError(err, res, next, 'media controller (browse)');
    }
  },

  freestyleMedia(_req: Request, res: Response, next: NextFunction): void {
    try {
      const vm = mediaService.getFreestyleMediaSection();
      res.render('freestyle/media', vm);
    } catch (err) {
      handleControllerError(err, res, next, 'media controller (freestyle media)');
    }
  },

  // The former tutorials index folded into the Freestyle Media section; keep the
  // old path working by sending it to the consolidated page.
  freestyleTutorials(_req: Request, res: Response): void {
    res.redirect(301, '/freestyle/media');
  },
};

// Express+qs surfaces a repeated `?tag=a&tag=b` as a string[]; a single
// `?tag=a+b` as one string (which the service may further split on
// whitespace, since the form posts a single space-separated input).
// Anything else (objects, missing) → empty array.
function collectQueryArg(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.filter((x): x is string => typeof x === 'string').flatMap(splitOnWhitespace);
  }
  if (typeof raw === 'string') return splitOnWhitespace(raw);
  return [];
}

function splitOnWhitespace(s: string): string[] {
  return s.split(/\s+/).filter((t) => t.length > 0);
}
