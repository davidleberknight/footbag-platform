/**
 * The gate on the machine-to-machine /ipc channel: the caller must present the
 * shared secret in the X-Internal-Secret header. No human session is involved.
 *
 * An unconfigured secret refuses every call with 503 rather than letting any
 * through, and the comparison is constant-time so the secret cannot be guessed
 * a byte at a time from response timing.
 */
import * as crypto from 'crypto';
import type { NextFunction, Request, Response } from 'express';
import { config } from '../config/env';

const SECRET_HEADER = 'x-internal-secret';

export function requireInternalSecret(req: Request, res: Response, next: NextFunction): void {
  const secret = config.internalEventSecret;
  if (!secret) {
    res.status(503).json({ error: 'INTERNAL_EVENT_SECRET not configured' });
    return;
  }
  const provided = Buffer.from(req.header(SECRET_HEADER) ?? '');
  const expected = Buffer.from(secret);
  if (provided.length !== expected.length || !crypto.timingSafeEqual(provided, expected)) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }
  next();
}
