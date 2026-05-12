import express from 'express';
import path from 'path';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { engine } from 'express-handlebars';
import { logger } from './config/logger';
import { config } from './config/env';
import { authMiddleware } from './middleware/auth';
import { FLASH_KIND, readFlash, clearFlash } from './lib/flashCookie';
import { healthRouter }   from './routes/healthRoutes';
import { internalRouter } from './routes/internalRoutes';
import { ipcRouter }      from './routes/ipcRoutes';
import { adminRouter }    from './routes/adminRoutes';
import { publicRouter }   from './routes/publicRoutes';
import { redactTokenPaths } from './lib/redactTokenPaths';
import { countryFlag } from './services/countryUtils';
import { externalLinkHelper } from './web/helpers/externalLink';
import { ForbiddenError } from './services/serviceErrors';

const NAV_SECTIONS: ReadonlyArray<{ href: string; section: string; label: string }> = [
  { href: '/',          section: 'home',      label: 'Home' },
  { href: '/events',    section: 'events',    label: 'Events' },
  { href: '/clubs',     section: 'clubs',     label: 'Clubs' },
  { href: '/net',       section: 'net',       label: 'Net' },
  { href: '/freestyle', section: 'freestyle', label: 'Freestyle' },
  { href: '/sideline',  section: 'sideline',  label: 'Sideline' },
  { href: '/ifpa',      section: 'ifpa',      label: 'IFPA' },
  { href: '/rules',     section: 'rules',     label: 'Rules' },
  { href: '/records',   section: 'records',   label: 'Records' },
  { href: '/hof',       section: 'hof',       label: 'HoF' },
  { href: '/bap',       section: 'bap',       label: 'BAP' },
  { href: '/media',     section: 'media',     label: 'Media' },
];

/**
 * Factory that returns a configured Express application without
 * binding to a port. Keeping this as a factory (not a module singleton)
 * lets integration tests call createApp() directly without an HTTP server.
 */
export function createApp(): express.Application {
  const app = express();

  // Trust XFF only when the immediate peer is a private/loopback IP. Inside
  // the docker bridge the only inbound path is nginx, which is itself behind
  // CloudFront's X-Origin-Verify shared secret (terraform/.../cloudfront.tf
  // + docker/nginx/nginx.conf.template). Prod default is the named-range
  // string; dev/test defaults to 0.
  app.set('trust proxy', config.trustProxy);

  // Host-header injection is closed at the nginx layer (proxy_set_header Host
  // ${PUBLIC_HOST}, rendered from PUBLIC_BASE_URL). Express therefore always
  // sees the canonical host on req.hostname, regardless of which domain the
  // viewer used (CloudFront default *.cloudfront.net domain, custom CNAME,
  // future aliases). No app-layer middleware needed.

  // Strict Content-Security-Policy: 'self' for scripts and styles, no inline
  // execution, no inline event handlers, no framing. Third-party origins are
  // added only when a template or a script references them — currently
  // i.ytimg.com and i.vimeocdn.com (YouTube/Vimeo thumbnail CDNs used by the
  // curator gallery tiles for external-platform reference videos),
  // www.youtube-nocookie.com (the privacy-friendly YouTube embed iframe loaded
  // after the user clicks a facade), player.vimeo.com (the Vimeo embed iframe,
  // same facade pattern), and the configured S3 media bucket origin
  // (admin curator video upload PUTs source bytes directly to S3 via a
  // presigned URL, bypassing nginx and CloudFront). data: is allowed in
  // img-src as a future allowance for small inline SVG icons (no current
  // consumer). HSTS preload stays off until the custom domain lands.
  const s3MediaOrigin =
    config.mediaStorageAdapter === 's3' &&
    config.mediaStorageS3Bucket &&
    config.awsRegion
      ? `https://${config.mediaStorageS3Bucket}.s3.${config.awsRegion}.amazonaws.com`
      : null;

  app.use(helmet({
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        defaultSrc:     ["'self'"],
        scriptSrc:      ["'self'"],
        scriptSrcAttr:  ["'none'"],
        styleSrc:       ["'self'"],
        imgSrc:         ["'self'", 'data:', 'https://i.ytimg.com', 'https://i.vimeocdn.com'],
        fontSrc:        ["'self'"],
        connectSrc:     ["'self'", ...(s3MediaOrigin ? [s3MediaOrigin] : [])],
        frameSrc:       ['https://www.youtube-nocookie.com', 'https://player.vimeo.com'],
        objectSrc:      ["'none'"],
        baseUri:        ["'self'"],
        formAction:     ["'self'"],
        frameAncestors: ["'none'"],
        upgradeInsecureRequests: [],
        // Browser POSTs CSP violation reports to this path so the
        // /csp-report handler (below, before route mounting) can log them.
        // Catches regressions of the inline-attr ban (DD §3.3 / HIGH-2)
        // and missing-origin gaps (HIGH-1) at runtime without any
        // operator visibility loss.
        reportUri: ['/csp-report'],
      },
    },
    hsts: { maxAge: 15552000, includeSubDomains: true, preload: false },
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  }));

  // ── Static assets ────────────────────────────────────────────────────────
  // Served from src/public/ so .hbs templates can reference /css/style.css etc.
  // process.cwd() resolves correctly from both tsx (dev) and dist/ (prod).
  app.use(express.static(path.join(process.cwd(), 'src', 'public')));

  // ── Media storage (member photos, system-account video bytes and posters) ─
  // Mounted at `/media-store/*` to mirror the production CloudFront cache
  // behavior. The prefix is dedicated to binary storage so it does not
  // collide with the user-facing `/media` app section (routes `/media`,
  // `/media/:galleryId`, `/media/browse`). The dev local-FS emulation
  // directory (`config.mediaDir`) stands in for the S3 bucket; the URL
  // prefix is identical in dev and prod so
  // `mediaStorageAdapter.constructURL()` returns one shape.
  // Cache header matches the production S3 PUT contract
  // (Cache-Control: public, max-age=31536000, immutable). URL-versioning
  // via `?v={media_id}` makes `immutable` semantically correct: each
  // emitted URL is unique to its upload, replacement uploads emit a fresh
  // `?v=` and become a distinct cache entry.
  // index: false + redirect: false avoid express.static auto-redirects on
  // the bare `/media-store` path.
  app.use(
    '/media-store',
    express.static(config.mediaDir, {
      maxAge: '1y',
      immutable: true,
      index: false,
      redirect: false,
    }),
  );

  // ── View engine ──────────────────────────────────────────────────────────
  app.engine(
    'hbs',
    engine({
      extname: '.hbs',
      defaultLayout: 'main',
      layoutsDir:   path.join(process.cwd(), 'src', 'views', 'layouts'),
      partialsDir:  path.join(process.cwd(), 'src', 'views', 'partials'),
      helpers: {
        countryFlag: (country: string) => countryFlag(country),
        eq:  (a: unknown, b: unknown) => a === b,
        gt:  (a: unknown, b: unknown) => (a as number) > (b as number),
        add: (a: unknown, b: unknown) => (a as number) + (b as number),
        not: (a: unknown) => !a,
        or:  (a: unknown, b: unknown) => Boolean(a) || Boolean(b),
        formatDate: (iso: string) => {
          const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
          const parts = String(iso).split('-');
          const year  = parts[0];
          const month = parseInt(parts[1], 10);
          const day   = parseInt(parts[2], 10);
          if (!parts[1]) return year;
          if (!parts[2] || isNaN(day)) return `${months[month - 1]} ${year}`;
          return `${day} ${months[month - 1]} ${year}`;
        },
        formatLocation: (city: unknown, region: unknown, country: unknown) => {
          const c = typeof city === 'string' ? city.trim() : '';
          const r = typeof region === 'string' ? region.trim() : '';
          const co = typeof country === 'string' ? country.trim() : '';
          if (!c && (!co || co.toLowerCase() === 'unknown')) return 'Location under investigation';
          const parts = [c, r, co].filter(Boolean);
          return parts.join(', ');
        },
        yearFromDate: (iso: string) => String(iso).split('-')[0],
        externalLink: externalLinkHelper,
      },
    }),
  );
  app.set('view engine', 'hbs');
  app.set('views', path.join(process.cwd(), 'src', 'views'));

  // ── Body parsing ─────────────────────────────────────────────────────────
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));
  app.use(cookieParser(config.sessionSecret));

  // ── CSP violation reports ────────────────────────────────────────────────
  // Browser POSTs here with `Content-Type: application/csp-report` (legacy)
  // or `application/reports+json` (modern Reporting API) when an inline
  // event handler, an inline style, an unauthorized frame origin, or any
  // other CSP directive is violated. Logged at warn level so operators
  // can spot regressions of HIGH-1 (frame-src) and HIGH-2 (inline attrs)
  // without manual template scanning. Mounted before auth so unauthenticated
  // page renders that violate CSP still get reported. Body is unauthenticated
  // input; the only consumer is the logger, which does its own redaction.
  app.post(
    '/csp-report',
    express.json({ type: ['application/csp-report', 'application/reports+json', 'application/json'] }),
    (req, res) => {
      logger.warn('csp violation reported', {
        body: req.body,
        userAgent: req.get('User-Agent'),
      });
      res.status(204).end();
    },
  );

  // ── Auth (JWT session + per-request passwordVersion check) ──────────────
  app.use(authMiddleware());

  // ── No-store on authenticated responses ──────────────────────────────────
  // Prevents CloudFront (and other shared caches) from storing personalized
  // HTML. Without this, post-upload redirects serve cached HTML carrying
  // stale avatar version tokens, making new uploads appear to not take effect.
  //
  // Current implementation is at the app layer. Target is the AWS managed
  // `CachingDisabled` CloudFront cache policy; this middleware is
  // functionally equivalent until the CloudFront policy is wired up.
  app.use((req, res, next) => {
    if (req.isAuthenticated) {
      res.setHeader('Cache-Control', 'private, no-store');
    }
    next();
  });

  // ── Active nav section + auth locals ─────────────────────────────────────
  app.use((req, res, next) => {
    res.locals.currentSection = req.path === '/' ? 'home'
      : req.path.startsWith('/events') ? 'events'
      : req.path.startsWith('/members') ? 'members'
      : req.path.startsWith('/history') ? 'history'
      : req.path.startsWith('/clubs') ? 'clubs'
      : req.path.startsWith('/media') ? 'media'
      : req.path.startsWith('/hof') ? 'hof'
      : req.path.startsWith('/bap') ? 'bap'
      : req.path.startsWith('/freestyle') ? 'freestyle'
      : req.path.startsWith('/records') ? 'records'
      : req.path.startsWith('/net') ? 'net'
      : req.path.startsWith('/sideline') ? 'sideline'
      : req.path.startsWith('/ifpa') ? 'ifpa'
      : req.path.startsWith('/rules') ? 'rules'
      : req.path.startsWith('/admin') ? 'admin'
      : '';
    res.locals.navLinks = NAV_SECTIONS.map(item => ({
      ...item,
      isActive: item.section === res.locals.currentSection,
    }));
    res.locals.isAuthenticated = req.isAuthenticated;
    res.locals.currentUser = req.user;
    const flash = readFlash(req);
    if (flash?.kind === FLASH_KIND.LOGOUT) {
      res.locals.flashLoggedOut = true;
      // Clear only when the banner actually renders, not on redirects.
      // Otherwise a logout that redirects through an auth-gated page consumes
      // the cookie on the 302 response before the banner ever surfaces.
      const origRender = res.render.bind(res);
      res.render = ((...args: Parameters<typeof origRender>) => {
        clearFlash(res);
        return origRender(...args);
      }) as typeof res.render;
    }
    next();
  });

  // ── Request logging ──────────────────────────────────────────────────────
  app.use((req, _res, next) => {
    logger.debug('incoming request', { method: req.method, url: redactTokenPaths(req.url) });
    next();
  });

  // ── Routes ───────────────────────────────────────────────────────────────
  app.use('/health',   healthRouter);
  app.use('/ipc',      ipcRouter);
  app.use('/internal', internalRouter);
  app.use('/admin',    adminRouter);
  app.use('/',         publicRouter);

  // ── 404 handler ──────────────────────────────────────────────────────────
  app.use((_req, res) => {
    res.status(404).render('errors/not-found', {
      seo:  { title: 'Page Not Found' },
      page: { sectionKey: '', pageKey: 'error_404', title: 'Page Not Found' },
    });
  });

  // ── ServiceError → HTTP mapping (must precede the catch-all 500) ─────
  // Controllers `next(err)` on errors they don't recognize. Service-layer
  // ForbiddenError (e.g. defense-in-depth tier check in curatorMediaService)
  // maps to a 403 render; everything else falls through to the 500 handler.
  app.use((err: unknown, _req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (err instanceof ForbiddenError) {
      res.status(403).render('errors/forbidden', {
        seo: { title: 'Forbidden' },
        page: { sectionKey: '', pageKey: 'error_403', title: 'Forbidden' },
      });
      return;
    }
    next(err);
  });

  // ── 500 error handler ────────────────────────────────────────────────────
  app.use((err: unknown, req: express.Request, res: express.Response, _next: express.NextFunction) => {
    logger.error('unhandled error', {
      method: req.method,
      url: req.url,
      error: err instanceof Error ? err.message : String(err),
    });
    res.status(500).render('errors/unavailable', {
      seo:  { title: 'Service Unavailable' },
      page: { sectionKey: '', pageKey: 'error_500', title: 'Service Unavailable' },
      statusCode: 500,
    });
  });

  return app;
}
