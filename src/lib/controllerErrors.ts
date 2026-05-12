import { NextFunction, Response } from 'express';
import { NotFoundError, ServiceUnavailableError, ValidationError } from '../services/serviceErrors';
import { logger } from '../config/logger';

/**
 * Render the 503 Service Unavailable page directly. Used by controllers that
 * catch an image-worker / external-adapter failure and need to surface a
 * truthful 503 rather than fall through to the generic 500 handler (which
 * would mask the cause and historically rendered a "503"-labeled template
 * over a 500 status).
 */
export function renderServiceUnavailable(res: Response): void {
  res.status(503).render('errors/unavailable', {
    seo:  { title: 'Service Unavailable' },
    page: { sectionKey: '', pageKey: 'error_503', title: 'Service Unavailable' },
    statusCode: 503,
  });
}

/**
 * Map a service-layer error to an HTTP response. Renders 404 for
 * NotFoundError / ValidationError, 503 for ServiceUnavailableError, and
 * delegates everything else to the Express error middleware via next(err).
 *
 * ValidationError intentionally renders 404 on public pages so validation
 * detail is never leaked to visitors.
 */
export function handleControllerError(
  err: unknown,
  res: Response,
  next: NextFunction,
  context: string,
): void {
  if (err instanceof NotFoundError || err instanceof ValidationError) {
    res.status(404).render('errors/not-found', {
      seo:  { title: 'Page Not Found' },
      page: { sectionKey: '', pageKey: 'error_404', title: 'Page Not Found' },
    });
    return;
  }
  if (err instanceof ServiceUnavailableError) {
    res.status(503).render('errors/unavailable', {
      seo:  { title: 'Service Unavailable' },
      page: { sectionKey: '', pageKey: 'error_503', title: 'Service Unavailable' },
      statusCode: 503,
    });
    return;
  }
  logger.error(`unexpected error in ${context}`, {
    error: err instanceof Error ? err.message : String(err),
  });
  next(err);
}
