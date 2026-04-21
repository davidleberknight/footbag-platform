/**
 * Small, explicit service-layer error types.
 *
 * These are intentionally simple. Controllers can map them to HTTP behavior
 * without this module knowing anything about Express or response objects.
 */
export abstract class ServiceError extends Error {
  public readonly code: string;
  public readonly details?: Record<string, unknown>;

  protected constructor(code: string, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = new.target.name;
    this.code = code;
    this.details = details;
  }
}

export class ValidationError extends ServiceError {
  constructor(message: string, details?: Record<string, unknown>) {
    super('validation_error', message, details);
  }
}

export class NotFoundError extends ServiceError {
  constructor(message: string, details?: Record<string, unknown>) {
    super('not_found', message, details);
  }
}

export class ServiceUnavailableError extends ServiceError {
  constructor(message: string, details?: Record<string, unknown>) {
    super('service_unavailable', message, details);
  }
}

export class ConflictError extends ServiceError {
  constructor(message: string, details?: Record<string, unknown>) {
    super('conflict', message, details);
  }
}

export class RateLimitedError extends ServiceError {
  public readonly retryAfterSeconds?: number;
  constructor(message: string, retryAfterSeconds?: number) {
    super('rate_limited', message);
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export function isServiceError(error: unknown): error is ServiceError {
  return error instanceof ServiceError;
}
