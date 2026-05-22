/**
 * Per-route assertion helper for the Origin-pin CSRF perimeter.
 *
 * The perimeter is implemented as a single app-level middleware that runs
 * before every route, and the cross-cutting matrix (Origin-present /
 * Origin-mismatched / Referer-fallback / verb coverage) is exercised
 * centrally. The value of this helper is per-route: a future refactor that
 * mounts a sub-router outside the global middleware would not fail the
 * cross-cutting tests, only the route's own. Each state-changing route
 * should reuse this helper to assert that mismatched-Origin and
 * no-Origin-no-Referer requests are both rejected with a 403 and the
 * forbidden page body.
 *
 * Why `supertest` is imported here directly (not via
 * `tests/fixtures/supertestWithOrigin.ts`): the wrapper auto-sets the
 * matching Origin on mutations, which would defeat the negative case this
 * helper is designed to drive.
 *
 * When `opts.cookie` is supplied (a valid `footbag_session=...` cookie),
 * the helper proves that the perimeter rejects EVEN authenticated requests.
 * Without that, a regression that mounted a route outside the perimeter
 * could be masked by `requireAuth`'s 302-to-login on routes behind the
 * auth gate. For unauthenticated routes (login, register, forgot, etc.)
 * the cookie is unnecessary and may be omitted.
 */
import { expect } from 'vitest';
import baseRequest from 'supertest';
import type { Express } from 'express';

type Method = 'post' | 'put' | 'patch' | 'delete';

const ATTACKER_ORIGIN = 'https://attacker.example';

export interface ExpectCsrfRejectOpts {
  body?: Record<string, unknown>;
  cookie?: string;
}

export async function expectCsrfReject(
  app: Express,
  method: Method,
  path: string,
  opts: ExpectCsrfRejectOpts = {},
): Promise<void> {
  // Two attack vectors the perimeter must reject:
  //   1. mismatched Origin (attacker page that DOES send Origin)
  //   2. no Origin AND no Referer (stripped-headers client)
  // Both must produce a 403 with the forbidden-page body, and neither
  // may issue a footbag_session cookie (which would prove a controller ran).
  const headerVariants: Array<{ label: string; headers: Record<string, string> }> = [
    { label: 'mismatched Origin', headers: { Origin: ATTACKER_ORIGIN } },
    { label: 'no Origin, no Referer', headers: {} },
  ];

  for (const variant of headerVariants) {
    let req = baseRequest(app)[method](path);
    for (const [k, v] of Object.entries(variant.headers)) {
      req = req.set(k, v);
    }
    if (opts.cookie) req = req.set('Cookie', opts.cookie);
    if (opts.body)   req = req.type('form').send(opts.body);

    const res = await req;
    const tag = `${method.toUpperCase()} ${path} [${variant.label}]`;

    expect(res.status, `${tag}: expected 403, got ${res.status}`).toBe(403);
    expect(res.text, `${tag}: 403 body did not match /Forbidden/i`).toMatch(/Forbidden/i);

    const setCookies = (res.headers['set-cookie'] as string[] | undefined) ?? [];
    const sessionIssued = setCookies.some((c) => c.startsWith('footbag_session='));
    expect(sessionIssued, `${tag}: footbag_session issued despite CSRF reject`).toBe(false);
  }
}
