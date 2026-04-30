/**
 * Image worker entry point.
 *
 * Standalone Express server that wraps the Sharp pipeline behind an HTTP
 * boundary. Phase 2 will package this as the `image` Docker container; in
 * Phase 1 it runs locally via `npm run dev:image`. Reads its own env vars
 * directly because it is a separate process from the web app and must not
 * require web-only config (FOOTBAG_DB_PATH, SESSION_SECRET, etc.).
 */
import express, { Request, Response, NextFunction } from 'express';
import { detectImageType, processAvatar, processPhoto, type ProcessedImage } from './lib/imageProcessing';
import { Semaphore } from './lib/semaphore';

const AVATAR_MAX_BYTES = 5 * 1024 * 1024;
const PHOTO_MAX_BYTES = 25 * 1024 * 1024;

function parseIntEnv(name: string, fallback: number, min: number, max: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  if (!/^\d+$/.test(raw)) {
    throw new Error(`${name} must be a positive integer, got: ${raw}`);
  }
  const n = parseInt(raw, 10);
  if (n < min || n > max) {
    throw new Error(`${name} must be between ${min} and ${max}, got: ${raw}`);
  }
  return n;
}

export interface ImageWorkerOptions {
  maxConcurrent?: number;
  semaphoreWaitMs?: number;
  // Test seam: substitute the Sharp pipeline with a slow / failing impl
  // so semaphore-busy and error paths can be exercised without flake.
  processAvatarImpl?: (data: Buffer) => Promise<ProcessedImage>;
  processPhotoImpl?: (data: Buffer) => Promise<ProcessedImage>;
}

export function createImageWorkerApp(opts: ImageWorkerOptions = {}): express.Express {
  const maxConcurrent =
    opts.maxConcurrent ?? parseIntEnv('IMAGE_MAX_CONCURRENT', 2, 1, 16);
  const semaphoreWaitMs =
    opts.semaphoreWaitMs ?? parseIntEnv('IMAGE_SEMAPHORE_WAIT_MS', 30000, 1, 600000);
  const processAvatarFn = opts.processAvatarImpl ?? processAvatar;
  const processPhotoFn = opts.processPhotoImpl ?? processPhoto;
  const semaphore = new Semaphore(maxConcurrent, semaphoreWaitMs);

  async function runProcess(
    req: Request,
    res: Response,
    next: NextFunction,
    impl: (data: Buffer) => Promise<ProcessedImage>,
  ): Promise<void> {
    const buf = req.body;
    if (!Buffer.isBuffer(buf) || buf.length === 0) {
      res.status(400).json({ error: 'empty body' });
      return;
    }
    if (!detectImageType(buf)) {
      res.status(400).json({ error: 'unrecognized image type' });
      return;
    }

    try {
      await semaphore.acquire();
    } catch {
      res.set('Retry-After', '1');
      res.status(503).json({ error: 'image worker busy' });
      return;
    }

    try {
      const processed = await impl(buf);
      res.status(200).json({
        thumb: processed.thumb.toString('base64'),
        display: processed.display.toString('base64'),
        widthPx: processed.widthPx,
        heightPx: processed.heightPx,
      });
    } catch (err: unknown) {
      next(err);
    } finally {
      semaphore.release();
    }
  }

  const app = express();

  app.get('/health', (_req: Request, res: Response) => {
    res.status(200).json({ status: 'ok' });
  });

  app.post(
    '/process/avatar',
    express.raw({ type: 'application/octet-stream', limit: AVATAR_MAX_BYTES }),
    (req, res, next) => runProcess(req, res, next, processAvatarFn),
  );

  app.post(
    '/process/photo',
    express.raw({ type: 'application/octet-stream', limit: PHOTO_MAX_BYTES }),
    (req, res, next) => runProcess(req, res, next, processPhotoFn),
  );

  app.use((err: Error & { type?: string }, _req: Request, res: Response, _next: NextFunction) => {
    if (err.type === 'entity.too.large') {
      res.status(413).json({ error: 'payload too large' });
      return;
    }
    res.status(500).json({ error: err.message || 'image processing failed' });
  });

  return app;
}

/* c8 ignore start -- standalone entry block, exercised by `npm run dev:image` */
if (require.main === module) {
  const port = parseIntEnv('IMAGE_PORT', 4000, 1, 65535);
  const app = createImageWorkerApp();
  app.listen(port, () => {
    process.stdout.write(
      JSON.stringify({ ts: new Date().toISOString(), level: 'info', msg: 'image worker listening', port }) + '\n',
    );
  });
}
/* c8 ignore stop */
