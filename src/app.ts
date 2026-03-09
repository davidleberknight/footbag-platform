import express from 'express';
import path from 'path';
import { engine } from 'express-handlebars';
import { logger } from './config/logger';
import { healthRouter } from './routes/healthRoutes';
import { publicRouter } from './routes/publicRoutes';

/**
 * Factory function — returns a configured Express application without
 * binding to a port. Keeping this as a factory (not a module singleton)
 * lets integration tests call createApp() directly without an HTTP server.
 */
export function createApp(): express.Application {
  const app = express();

  // ── Static assets ────────────────────────────────────────────────────────
  // Served from src/public/ so .hbs templates can reference /css/style.css etc.
  // process.cwd() resolves correctly from both tsx (dev) and dist/ (prod).
  app.use(express.static(path.join(process.cwd(), 'src', 'public')));

  // ── View engine ──────────────────────────────────────────────────────────
  app.engine(
    'hbs',
    engine({
      extname: '.hbs',
      defaultLayout: 'main',
      layoutsDir:   path.join(process.cwd(), 'src', 'views', 'layouts'),
      partialsDir:  path.join(process.cwd(), 'src', 'views', 'partials'),
    }),
  );
  app.set('view engine', 'hbs');
  app.set('views', path.join(process.cwd(), 'src', 'views'));

  // ── Body parsing ─────────────────────────────────────────────────────────
  app.use(express.json());

  // ── Request logging ──────────────────────────────────────────────────────
  app.use((req, _res, next) => {
    logger.debug('incoming request', { method: req.method, url: req.url });
    next();
  });

  // ── Routes ───────────────────────────────────────────────────────────────
  app.use('/health', healthRouter);
  app.use('/', publicRouter);

  // ── 404 handler ──────────────────────────────────────────────────────────
  app.use((_req, res) => {
    res.status(404).render('errors/not-found', { pageTitle: 'Page Not Found' });
  });

  // ── 500 error handler ────────────────────────────────────────────────────
  app.use((err: unknown, req: express.Request, res: express.Response, _next: express.NextFunction) => {
    logger.error('unhandled error', {
      method: req.method,
      url: req.url,
      error: err instanceof Error ? err.message : String(err),
    });
    res.status(500).render('errors/unavailable', { pageTitle: 'Something Went Wrong' });
  });

  return app;
}
