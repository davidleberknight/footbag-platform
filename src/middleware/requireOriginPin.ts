import { Request, Response, NextFunction } from 'express';
import { config } from '../config/env';
import { STRIPE_WEBHOOK_PATH } from '../routes/publicRoutes';
import { UNSUBSCRIBE_PATH } from '../services/communicationService';
import { renderForbidden } from '../lib/controllerErrors';

export const MUTATION_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

// `/ipc/*` is exempt as a whole namespace: it is machine-only, called
// server-to-server without an Origin header, and the requireInternalSecret
// guard checks the shared secret on every route in it.
export const EXEMPT_PREFIXES = ['/ipc/'];

// Every other exemption is an exact route, never a prefix: the Stripe
// webhook receiver is server-to-server (no Origin) and authenticates via the
// Stripe-Signature HMAC, verified before any state write. Exact-match so sibling
// browser routes (e.g. /payments/checkout/:id/confirm) stay origin-pinned.
// The one-click unsubscribe endpoint joins them for the same reason: the caller
// is the recipient's mail client acting on a List-Unsubscribe header, which
// sends no Origin, and the request authenticates on the signed token in its
// query string, verified before any state write.
// Exported so the route-inventory fixture and the black-box perimeter probe read
// the perimeter's own exemption set rather than keeping copies of it. A copy that
// drifts stops testing a route that should be pinned, and reports a route that is
// pinned by design as a hole.
export const EXEMPT_EXACT = new Set<string>([
  STRIPE_WEBHOOK_PATH, UNSUBSCRIBE_PATH,
]);

let cachedExpectedOrigin: string | null = null;
function expectedOrigin(): string {
  if (cachedExpectedOrigin === null) {
    cachedExpectedOrigin = new URL(config.publicBaseUrl).origin;
  }
  return cachedExpectedOrigin;
}

// Test-only seam: clear the cached origin so a test can mutate `config.publicBaseUrl`
// (or its underlying env var) between cases without ESM-module-cache surgery.
export function _resetExpectedOriginForTests(): void {
  cachedExpectedOrigin = null;
}

function safeUrlOrigin(value: string | undefined): string | null {
  if (!value) return null;
  try { return new URL(value).origin; } catch { return null; }
}

function reject(res: Response): void {
  renderForbidden(res);
}

export function requireOriginPin(req: Request, res: Response, next: NextFunction): void {
  if (!MUTATION_METHODS.has(req.method)) { next(); return; }
  if (EXEMPT_EXACT.has(req.path)) { next(); return; }
  if (EXEMPT_PREFIXES.some(p => req.path.startsWith(p))) { next(); return; }

  const expected = expectedOrigin();
  const originHdr = req.get('origin');

  if (originHdr === expected) { next(); return; }
  if (originHdr !== undefined) { reject(res); return; }

  const refererOrigin = safeUrlOrigin(req.get('referer'));
  if (refererOrigin === expected) { next(); return; }
  reject(res);
}
