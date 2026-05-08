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
