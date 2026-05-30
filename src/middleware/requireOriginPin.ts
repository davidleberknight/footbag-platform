import { Request, Response, NextFunction } from 'express';
import { config } from '../config/env';
import { STRIPE_WEBHOOK_PATH } from '../routes/publicRoutes';

export const MUTATION_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

// `/ipc/*` authenticates with a shared-secret header inside the controller and
// is intentionally callable without an Origin header (server-to-server).
const EXEMPT_PREFIXES = ['/ipc/'];

// Per DD §3.3, the exemption is per-route (exact), not per-prefix: the Stripe
// webhook receiver is server-to-server (no Origin) and authenticates via the
// Stripe-Signature HMAC, verified before any state write. Exact-match so sibling
// browser routes (e.g. /payments/checkout/:id/confirm) stay origin-pinned.
const EXEMPT_EXACT = new Set<string>([STRIPE_WEBHOOK_PATH]);

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
  res.status(403).render('errors/forbidden', {
    seo: { title: 'Forbidden' },
    page: { sectionKey: '', pageKey: 'error_403', title: 'Forbidden' },
  });
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
