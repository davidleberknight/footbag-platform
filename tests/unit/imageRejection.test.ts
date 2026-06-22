import { describe, it, expect } from 'vitest';
import { rejectImageAsValidation } from '../../src/services/imageRejection';
import { ImageProcessingError } from '../../src/adapters/imageProcessingAdapter';
import { ValidationError } from '../../src/services/serviceErrors';

describe('rejectImageAsValidation', () => {
  it('returns the resolved value on success', async () => {
    await expect(rejectImageAsValidation(Promise.resolve('ok'))).resolves.toBe('ok');
  });

  it('maps a worker 400 rejection to a ValidationError with the same message', async () => {
    const message = 'Image is too small; please upload at least 200 by 200 pixels';
    await expect(
      rejectImageAsValidation(Promise.reject(new ImageProcessingError(message, 400))),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      rejectImageAsValidation(Promise.reject(new ImageProcessingError(message, 400))),
    ).rejects.toThrow(message);
  });

  it('passes a worker server failure (non-400) through unchanged', async () => {
    await expect(
      rejectImageAsValidation(Promise.reject(new ImageProcessingError('image worker returned 503', 503))),
    ).rejects.toBeInstanceOf(ImageProcessingError);
  });

  it('passes an unrelated error through unchanged', async () => {
    await expect(rejectImageAsValidation(Promise.reject(new Error('boom')))).rejects.toThrow('boom');
  });
});
