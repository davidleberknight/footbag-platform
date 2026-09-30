import { describe, it, expect } from 'vitest';
import {
  ValidationError,
  NotFoundError,
  ServiceUnavailableError,
  ForbiddenError,
  isServiceError,
} from '../../src/services/serviceErrors';

describe('isServiceError', () => {
  it('returns true for ValidationError', () => {
    expect(isServiceError(new ValidationError('x'))).toBe(true);
  });

  it('returns true for NotFoundError', () => {
    expect(isServiceError(new NotFoundError('x'))).toBe(true);
  });

  it('returns true for ServiceUnavailableError', () => {
    expect(isServiceError(new ServiceUnavailableError('x'))).toBe(true);
  });

  it('returns true for ForbiddenError', () => {
    expect(isServiceError(new ForbiddenError('x'))).toBe(true);
  });

  it('returns false for plain Error', () => {
    expect(isServiceError(new Error('x'))).toBe(false);
  });

  it('returns false for string', () => {
    expect(isServiceError('oops')).toBe(false);
  });

  it('returns false for null', () => {
    expect(isServiceError(null)).toBe(false);
  });

  it('returns false for undefined', () => {
    expect(isServiceError(undefined)).toBe(false);
  });
});
