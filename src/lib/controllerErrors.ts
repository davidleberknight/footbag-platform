import { NextFunction, Response } from 'express';
import { NotFoundError, ServiceUnavailableError, ValidationError } from '../services/serviceErrors';
import { logger } from '../config/logger';

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
    });
    return;
  }
  logger.error(`unexpected error in ${context}`, {
    error: err instanceof Error ? err.message : String(err),
  });
  next(err);
}
