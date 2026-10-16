import { describe, it, expect, vi } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { config } from '../../src/config/env';
import { requireInternalSecret } from '../../src/middleware/requireInternalSecret';

const configured = config.internalEventSecret;

function makeReq(secret?: string): Request {
  return {
    header(name: string): string | undefined {
      return name.toLowerCase() === 'x-internal-secret' ? secret : undefined;
    },
  } as unknown as Request;
}

function makeRes() {
  const json = vi.fn();
  const status = vi.fn().mockReturnValue({ json });
  return { res: { status } as unknown as Response, status, json };
}

describe('requireInternalSecret', () => {
  it('lets the worker through with the configured secret', () => {
    const { res, status } = makeRes();
    const next = vi.fn() as unknown as NextFunction;
    requireInternalSecret(makeReq(configured), res, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(status).not.toHaveBeenCalled();
  });

  it('refuses a same-length wrong secret, so only the exact value publishes', () => {
    const { res, status, json } = makeRes();
    const next = vi.fn() as unknown as NextFunction;
    const wrong = configured.slice(0, -1) + (configured.endsWith('x') ? 'y' : 'x');
    requireInternalSecret(makeReq(wrong), res, next);
    expect(next).not.toHaveBeenCalled();
    expect(status).toHaveBeenCalledWith(401);
    expect(json).toHaveBeenCalledWith({ error: 'unauthorized' });
  });
});
