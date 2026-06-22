import { ImageProcessingError } from '../adapters/imageProcessingAdapter';
import { ValidationError } from './serviceErrors';

/**
 * Translate an image worker client-rejection (HTTP 400: too small, too large,
 * or extreme aspect ratio) into a ValidationError, so the upload controllers
 * render it as an inline form error (422) instead of a generic "service
 * unavailable" (503). A worker-down / server failure keeps its
 * ImageProcessingError and the existing 503 path.
 */
export async function rejectImageAsValidation<T>(work: Promise<T>): Promise<T> {
  try {
    return await work;
  } catch (err) {
    if (err instanceof ImageProcessingError && err.status === 400) {
      throw new ValidationError(err.message);
    }
    throw err;
  }
}
