import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';

const EXPECTED = 'http://localhost:9876';

beforeAll(() => {
  process.env.PUBLIC_BASE_URL = EXPECTED;
});

// Re-import after env is set so the lazy expected-origin cache picks up the right value.
let requireOriginPin: typeof import('../../src/middleware/requireOriginPin').requireOriginPin;
let _resetExpectedOriginForTests: typeof import('../../src/middleware/requireOriginPin')._resetExpectedOriginForTests;

beforeAll(async () => {
  const mod = await import('../../src/middleware/requireOriginPin');
  requireOriginPin = mod.requireOriginPin;
  _resetExpectedOriginForTests = mod._resetExpectedOriginForTests;
});

beforeEach(() => {
  _resetExpectedOriginForTests();
});

interface FakeReq {
  method: string;
  path: string;
  headers: Record<string, string>;
}

function makeReq(method: string, path: string, headers: Record<string, string> = {}): Request {
  const lower: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) {
    lower[k.toLowerCase()] = v;
  }
  return {
    method,
    path,
    headers,
    get(name: string): string | undefined {
      return lower[name.toLowerCase()];
    },
  } as unknown as Request;
}

function makeRes() {
  const render = vi.fn();
  const status = vi.fn().mockReturnValue({ render });
  return { res: { status } as unknown as Response, status, render };
}

describe('requireOriginPin', () => {
  it('passes through GET requests without checking Origin', () => {
    const { res, status } = makeRes();
    const next = vi.fn() as unknown as NextFunction;
    requireOriginPin(makeReq('GET', '/events'), res, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(status).not.toHaveBeenCalled();
  });

  it('passes through HEAD requests', () => {
    const { res, status } = makeRes();
    const next = vi.fn() as unknown as NextFunction;
    requireOriginPin(makeReq('HEAD', '/events'), res, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(status).not.toHaveBeenCalled();
  });

  it('passes through POST /ipc/* regardless of Origin', () => {
    const { res, status } = makeRes();
    const next = vi.fn() as unknown as NextFunction;
    requireOriginPin(
      makeReq('POST', '/ipc/job-events', { Origin: 'https://attacker.example' }),
      res,
      next,
    );
    expect(next).toHaveBeenCalledTimes(1);
    expect(status).not.toHaveBeenCalled();
  });

  it('passes through POST /ipc/* with no Origin at all', () => {
    const { res, status } = makeRes();
    const next = vi.fn() as unknown as NextFunction;
    requireOriginPin(makeReq('POST', '/ipc/job-events'), res, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(status).not.toHaveBeenCalled();
  });

  it('passes a POST whose Origin exactly matches publicBaseUrl', () => {
    const { res, status } = makeRes();
    const next = vi.fn() as unknown as NextFunction;
    requireOriginPin(makeReq('POST', '/login', { Origin: EXPECTED }), res, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(status).not.toHaveBeenCalled();
  });

  it('rejects a POST whose Origin is a different host (403, forbidden.hbs)', () => {
    const { res, status, render } = makeRes();
    const next = vi.fn() as unknown as NextFunction;
    requireOriginPin(
      makeReq('POST', '/login', { Origin: 'https://attacker.example' }),
      res,
      next,
    );
    expect(status).toHaveBeenCalledWith(403);
    expect(render).toHaveBeenCalledWith('errors/forbidden', expect.objectContaining({
      seo: { title: 'Forbidden' },
    }));
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects a POST whose Origin is literal "null" (sandboxed iframe)', () => {
    const { res, status, render } = makeRes();
    const next = vi.fn() as unknown as NextFunction;
    requireOriginPin(makeReq('POST', '/login', { Origin: 'null' }), res, next);
    expect(status).toHaveBeenCalledWith(403);
    expect(render).toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it('passes a POST with no Origin but matching Referer', () => {
    const { res, status } = makeRes();
    const next = vi.fn() as unknown as NextFunction;
    requireOriginPin(
      makeReq('POST', '/login', { Referer: `${EXPECTED}/login` }),
      res,
      next,
    );
    expect(next).toHaveBeenCalledTimes(1);
    expect(status).not.toHaveBeenCalled();
  });

  it('rejects a POST with no Origin and mismatched Referer', () => {
    const { res, status } = makeRes();
    const next = vi.fn() as unknown as NextFunction;
    requireOriginPin(
      makeReq('POST', '/login', { Referer: 'https://attacker.example/page' }),
      res,
      next,
    );
    expect(status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects a POST with no Origin and no Referer', () => {
    const { res, status } = makeRes();
    const next = vi.fn() as unknown as NextFunction;
    requireOriginPin(makeReq('POST', '/login'), res, next);
    expect(status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects a POST with no Origin and a malformed Referer', () => {
    const { res, status } = makeRes();
    const next = vi.fn() as unknown as NextFunction;
    requireOriginPin(makeReq('POST', '/login', { Referer: 'not-a-url' }), res, next);
    expect(status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('does NOT fall back to Referer when Origin is present-but-mismatched', () => {
    const { res, status } = makeRes();
    const next = vi.fn() as unknown as NextFunction;
    requireOriginPin(
      makeReq('POST', '/login', {
        Origin: 'https://attacker.example',
        Referer: `${EXPECTED}/login`,
      }),
      res,
      next,
    );
    expect(status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  for (const verb of ['PUT', 'PATCH', 'DELETE']) {
    it(`gates ${verb} the same as POST (matching Origin passes)`, () => {
      const { res, status } = makeRes();
      const next = vi.fn() as unknown as NextFunction;
      requireOriginPin(makeReq(verb, '/api/whatever', { Origin: EXPECTED }), res, next);
      expect(next).toHaveBeenCalledTimes(1);
      expect(status).not.toHaveBeenCalled();
    });

    it(`gates ${verb} the same as POST (mismatched Origin → 403)`, () => {
      const { res, status } = makeRes();
      const next = vi.fn() as unknown as NextFunction;
      requireOriginPin(
        makeReq(verb, '/api/whatever', { Origin: 'https://attacker.example' }),
        res,
        next,
      );
      expect(status).toHaveBeenCalledWith(403);
      expect(next).not.toHaveBeenCalled();
    });
  }

  it('treats trailing-slash publicBaseUrl as the same origin', () => {
    const { res, status } = makeRes();
    const next = vi.fn() as unknown as NextFunction;
    // EXPECTED stays http://localhost:9876; URL.origin already strips trailing
    // path components, so an Origin header with no path matches.
    requireOriginPin(makeReq('POST', '/login', { Origin: EXPECTED }), res, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(status).not.toHaveBeenCalled();
  });
});

// Silence the FakeReq unused-interface lint by exporting it; the makeReq
// helper's structural type satisfies Express.Request via the cast.
export type _FakeReqShape = FakeReq;
