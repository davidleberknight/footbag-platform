import { describe, it, expect } from 'vitest';
import {
  ValidationError,
  NotFoundError,
  ServiceUnavailableError,
  isServiceError,
} from '../../src/services/serviceErrors';

describe('ValidationError', () => {
  it('has correct code and message', () => {
    const err = new ValidationError('bad input');
    expect(err.code).toBe('validation_error');
    expect(err.message).toBe('bad input');
    expect(err.name).toBe('ValidationError');
  });

  it('stores details', () => {
    const err = new ValidationError('bad', { field: 'email' });
    expect(err.details).toEqual({ field: 'email' });
  });

  it('extends Error', () => {
    expect(new ValidationError('x')).toBeInstanceOf(Error);
  });
});

describe('NotFoundError', () => {
  it('has correct code and message', () => {
    const err = new NotFoundError('missing');
    expect(err.code).toBe('not_found');
    expect(err.message).toBe('missing');
    expect(err.name).toBe('NotFoundError');
  });

  it('extends Error', () => {
    expect(new NotFoundError('x')).toBeInstanceOf(Error);
  });
});

describe('ServiceUnavailableError', () => {
  it('has correct code and message', () => {
    const err = new ServiceUnavailableError('busy');
    expect(err.code).toBe('service_unavailable');
    expect(err.message).toBe('busy');
    expect(err.name).toBe('ServiceUnavailableError');
  });

  it('extends Error', () => {
    expect(new ServiceUnavailableError('x')).toBeInstanceOf(Error);
  });
});

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
