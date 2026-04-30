import { describe, it, expect, vi } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { requireAdmin } from '../../src/middleware/requireAdmin';
import type { SessionUser } from '../../src/middleware/auth';

function makeReq(user: SessionUser | null): Request {
  return { user } as unknown as Request;
}

function makeRes() {
  const render = vi.fn();
  const status = vi.fn().mockReturnValue({ render });
  const res = { status } as unknown as Response;
  return { res, status, render };
}

describe('requireAdmin middleware', () => {
  it('returns 403 when req.user is null', () => {
    const { res, status, render } = makeRes();
    const next = vi.fn() as unknown as NextFunction;
    requireAdmin(makeReq(null), res, next);
    expect(status).toHaveBeenCalledWith(403);
    expect(render).toHaveBeenCalledWith('errors/forbidden', expect.objectContaining({
      seo: { title: 'Forbidden' },
    }));
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 403 when req.user.role is "member"', () => {
    const { res, status, render } = makeRes();
    const next = vi.fn() as unknown as NextFunction;
    requireAdmin(
      makeReq({ userId: 'm1', slug: 's1', role: 'member' }),
      res,
      next,
    );
    expect(status).toHaveBeenCalledWith(403);
    expect(render).toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it('calls next() when req.user.role is "admin"', () => {
    const { res, status, render } = makeRes();
    const next = vi.fn() as unknown as NextFunction;
    requireAdmin(
      makeReq({ userId: 'a1', slug: 'admin1', role: 'admin' }),
      res,
      next,
    );
    expect(next).toHaveBeenCalledTimes(1);
    expect(status).not.toHaveBeenCalled();
    expect(render).not.toHaveBeenCalled();
  });
});
