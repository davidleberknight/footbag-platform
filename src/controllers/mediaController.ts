import { Request, Response, NextFunction } from 'express';
import { mediaService, canonicalFilterPath } from '../services/mediaService';
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
      const galleryId = req.params.galleryId;
      // The batch filter form posts an `apply` marker; fold the submitted state
      // into one canonical URL and redirect (PRG), so the rendered gallery never
      // carries the form's transient or empty fields. The saved row is untouched.
      if (req.query.apply !== undefined) {
        res.redirect(302, canonicalFilterPath({
          basePath: `/media/${galleryId}`,
          rawTags: collectQueryArg(req.query.tag),
          rawExcludes: collectQueryArg(req.query.exclude),
          curatedOff: req.query.curated === 'off',
        }));
        return;
      }
      const vm = mediaService.getNamedGalleryPage(
        galleryId,
        {
          rawTags: collectQueryArg(req.query.tag),
          rawExcludes: collectQueryArg(req.query.exclude),
          curated: typeof req.query.curated === 'string' ? req.query.curated : undefined,
        },
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

  mediaItem(req: Request, res: Response, next: NextFunction): void {
    try {
      const vm = mediaService.getMediaItemPage(
        {
          mediaId: req.params.mediaId,
          rawTags: collectQueryArg(req.query.tag),
          rawExcludes: collectQueryArg(req.query.exclude),
          rawSort: req.query.sort,
          rawBack: req.query.back,
        },
        { authenticated: req.user != null },
      );
      res.render('media/gallery-item', vm);
    } catch (err) {
      handleControllerError(err, res, next, 'media controller (media item)');
    }
  },

  browse(req: Request, res: Response, next: NextFunction): void {
    try {
      // The batch filter form posts an `apply` marker; fold the submitted state
      // into one canonical, shareable URL and redirect (PRG, GET-only, no JS) so
      // the rendered page never carries the form's transient or empty fields.
      if (req.query.apply !== undefined) {
        res.redirect(302, canonicalFilterPath({
          basePath: '/media/browse',
          rawContext: collectQueryArg(req.query.context),
          rawTags: collectQueryArg(req.query.tag),
          rawExcludes: collectQueryArg(req.query.exclude),
        }));
        return;
      }
      const vm = mediaService.getMediaBrowsePage(
        {
          rawTags: collectQueryArg(req.query.tag),
          rawExcludes: collectQueryArg(req.query.exclude),
          rawContext: collectQueryArg(req.query.context),
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
