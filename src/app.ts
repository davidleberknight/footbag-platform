import express from 'express';
import path from 'path';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { engine } from 'express-handlebars';
import { logger } from './config/logger';
import { config } from './config/env';
import { authMiddleware } from './middleware/auth';
import { requireOriginPin } from './middleware/requireOriginPin';
import { FLASH_KIND, readFlash, clearFlash } from './lib/flashCookie';
import { healthRouter }   from './routes/healthRoutes';
import { seoRouter }      from './routes/seoRoutes';
import { ipcRouter }      from './routes/ipcRoutes';
// The internal QC subsystem router. Production images strip dist/internal-qc
// and replace this module with a stub exporting null, so the import is safe
// everywhere and the null guard below keeps production from mounting it.
import { internalRouter } from './routes/internalRoutes';
import { adminRouter }    from './routes/adminRoutes';
import { publicRouter, STRIPE_WEBHOOK_PATH }   from './routes/publicRoutes';
// Permanent test scaffolding: the persona harness dev router. Mounted only in
// development and staging (see the mount block below); never mounted in
// production. Production images strip dist/testkit and stub this module to
// export null, so the import is safe everywhere.
import { devRouter }      from './testkit/devRoutes';
import { redactTokenPaths } from './lib/redactTokenPaths';
import { assetUrl } from './lib/assetVersion';
import { countryFlag } from './services/countryUtils';
import { externalLinkHelper } from './web/helpers/externalLink';
import { formatDate } from './lib/handlebarsHelpers';
import { ForbiddenError, RateLimitedError } from './services/serviceErrors';

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
  // added only when a template or a script references them, currently
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
        scriptSrc:      ["'self'", 'https://challenges.cloudflare.com'],
        scriptSrcAttr:  ["'none'"],
        styleSrc:       ["'self'"],
        imgSrc:         ["'self'", 'data:', 'https://i.ytimg.com', 'https://i.vimeocdn.com'],
        fontSrc:        ["'self'"],
        connectSrc:     ["'self'", 'https://challenges.cloudflare.com', ...(s3MediaOrigin ? [s3MediaOrigin] : [])],
        frameSrc:       ['https://www.youtube-nocookie.com', 'https://player.vimeo.com', 'https://challenges.cloudflare.com'],
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

  // Keep every non-production environment out of search indexes. Staging and
  // development must never have their content indexed even if a URL leaks, so
  // every response carries a noindex directive. Production omits the header so
  // public pages are indexable; private production pages are handled per-response
  // (authenticated) and per-page (thin auth pages) below and in the layout.
  if (config.footbagEnv !== 'production') {
    app.use((_req, res, next) => {
      res.setHeader('X-Robots-Tag', 'noindex, nofollow');
      next();
    });
  }

  // Served from src/public/ so .hbs templates can reference /css/style.css etc.
  // process.cwd() resolves correctly from both tsx (dev) and dist/ (prod).
  // A request carrying a `?v=<hash>` version token (emitted by the `asset` helper)
  // is immutable: the hash changes when the bytes change, so the URL is safe to
  // cache forever. Unversioned fetches (/img, /fonts referenced from CSS) keep
  // express defaults.
  app.use(express.static(path.join(process.cwd(), 'src', 'public'), {
    setHeaders(res) {
      const query = res.req?.url?.split('?')[1] ?? '';
      if (query && new URLSearchParams(query).has('v')) {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      }
    },
  }));

  // ── Media storage (member photos, system-account video bytes and posters) ─
  // Local-adapter mode only: these mounts are the dev stand-in for the S3
  // bucket. In S3-adapter mode (staging/prod) media is served by CloudFront
  // from S3, the local dirs do not exist in the container, and registering
  // these mounts would risk serving filesystem bytes if the host were ever
  // misconfigured to local, so they are gated on the adapter mode.
  //
  // Two lanes mirror the single prod bucket: `config.mediaDir` (runtime
  // member/curator uploads) and the read-only `config.curatedMediaDir`
  // (curated media built separately so the two never mix on disk). Keys are
  // disjoint, so a curated key falls through the uploads mount to the curated
  // mount. Both mount at `/media-store/*` to mirror the CloudFront cache
  // behavior; the prefix is dedicated to binary storage so it does not collide
  // with the user-facing `/media` app section (`/media`, `/media/:galleryId`,
  // `/media/browse`). The URL prefix is identical in dev and prod so
  // `mediaStorageAdapter.constructURL()` returns one shape.
  // Cache header matches the production S3 PUT contract
  // (Cache-Control: public, max-age=31536000, immutable). URL-versioning via
  // `?v={media_id}` makes `immutable` semantically correct: each emitted URL is
  // unique to its upload; replacement uploads emit a fresh `?v=` and become a
  // distinct cache entry. index: false + redirect: false avoid express.static
  // auto-redirects on the bare `/media-store` path.
  if (config.mediaStorageAdapter === 'local') {
    app.use(
      '/media-store',
      express.static(config.mediaDir, {
        maxAge: '1y',
        immutable: true,
        index: false,
        redirect: false,
      }),
    );
    app.use(
      '/media-store',
      express.static(config.curatedMediaDir, {
        maxAge: '1y',
        immutable: true,
        index: false,
        redirect: false,
      }),
    );
  }

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
        formatDate: (iso: string) => formatDate(iso),
        formatLocation: (city: unknown, region: unknown, country: unknown) => {
          const c = typeof city === 'string' ? city.trim() : '';
          const r = typeof region === 'string' ? region.trim() : '';
          const co = typeof country === 'string' ? country.trim() : '';
          if (!c && (!co || co.toLowerCase() === 'unknown')) return 'Location under investigation';
          const parts = [c, r, co].filter(Boolean);
          return parts.join(', ');
        },
        yearFromDate: (iso: string) => String(iso).split('-')[0],
        // Versioned static-asset URL: `{{{asset 'css/style.css'}}}` ->
        // `/css/style.css?v=<content-hash>`, so a deploy self-cache-busts.
        asset: (relPath: unknown) => assetUrl(typeof relPath === 'string' ? relPath : ''),
        externalLink: externalLinkHelper,
        // Splits curator-authored prose on blank lines into paragraph
        // strings. Used by trick-detail ontology partials (L2-L4) so
        // multi-paragraph entries render as separate <p> blocks.
        splitParagraphs: (text: unknown) => {
          if (typeof text !== 'string') return [];
          return text.split(/\n\n+/).map(p => p.trim()).filter(p => p.length > 0);
        },
      },
    }),
  );
  app.set('view engine', 'hbs');
  app.set('views', path.join(process.cwd(), 'src', 'views'));

  // ── Body parsing ─────────────────────────────────────────────────────────
  // The Stripe webhook receiver needs the raw, unparsed body to verify the
  // Stripe-Signature HMAC, so it is mounted with express.raw() at its route and
  // must be excluded from the global JSON parser (which would otherwise consume
  // the stream and leave the route with no Buffer to verify).
  const jsonParser = express.json();
  app.use((req, res, next) => {
    // Exact-match skip (Stripe is configured at exactly this path); a different
    // path falls through to JSON parsing, which is harmless for non-webhook
    // requests.
    if (req.path === STRIPE_WEBHOOK_PATH) return next();
    jsonParser(req, res, next);
  });
  app.use(express.urlencoded({ extended: false }));
  app.use(cookieParser(config.sessionSecret));

  // ── CSP violation reports ────────────────────────────────────────────────
  // Browser POSTs here with `Content-Type: application/csp-report` (legacy)
  // or `application/reports+json` (modern Reporting API) when an inline
  // event handler, an inline style, an unauthorized frame origin, or any
  // other CSP directive is violated. Logged at warn level so operators
  // can spot regressions of HIGH-1 (frame-src) and HIGH-2 (inline attrs)
  // without manual template scanning. Mounted before auth so unauthenticated
  // page renders that violate CSP still get reported.
  //
  // Body is unauthenticated input bounded by the body-parser cap; only the
  // standard `csp-report` key is forwarded to the logger so an attacker
  // cannot inflate log volume by POSTing arbitrarily-structured JSON. The
  // accepted content types are restricted to the two browser CSP-report
  // shapes; `application/json` would otherwise admit any JSON payload.
  app.post(
    '/csp-report',
    express.json({ type: ['application/csp-report', 'application/reports+json'] }),
    (req, res) => {
      const body = (req.body ?? {}) as Record<string, unknown>;
      logger.warn('csp violation reported', {
        cspReport: body['csp-report'],
        userAgent: req.get('User-Agent'),
      });
      res.status(204).end();
    },
  );

  // ── CSRF: Origin-header pinning on state-changing requests (DD §3.3) ─────
  // Mounted after /csp-report (so violation beacons reach their handler) and
  // before authMiddleware (so a cross-site POST is rejected at the perimeter
  // before any session work).
  app.use(requireOriginPin);

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
      // Authenticated pages are personalized and must not be indexed. The header
      // covers private content without naming any path in robots.txt (a Disallow
      // line is public and would advertise the paths it hides).
      res.setHeader('X-Robots-Tag', 'noindex');
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
    // Default social-preview image for the page head. Depends only on deploy
    // config, so it is set here like currentSection above. The self-referencing
    // canonical URL is set at render time below (it depends on the response
    // status, not just the request).
    const canonicalBase = config.publicBaseUrl.replace(/\/+$/, '');
    res.locals.ogImageUrl = canonicalBase + '/img/ifpa-logo.png';
    // Pre-shaped boolean so templates branch on `isAdmin` rather than the raw
    // `role` field (`{{#if isAdmin}}` over `{{#if (eq role 'admin')}}`).
    res.locals.isAdmin = req.user?.role === 'admin';
    const flash = readFlash(req);
    if (flash?.kind === FLASH_KIND.LOGOUT) {
      res.locals.flashLoggedOut = true;
    }
    // Wrap render so two render-time concerns are handled in one place:
    //  1. Emit a self-referencing canonical (and og:url) only for successful
    //     content responses. Error and not-found renders (status >= 400) must
    //     not canonicalize the requested URL: it would point search engines at
    //     a dead URL and, on anti-enumeration 404s, reflect the unknown
    //     identifier into the page body. Query strings are dropped so filter
    //     and sort variants of one page share a canonical.
    //  2. Clear the logout flash only when the banner actually renders, not on
    //     redirects: a logout that redirects through an auth-gated page would
    //     otherwise consume the cookie on the 303 before the banner surfaces.
    const origRender = res.render.bind(res);
    res.render = ((...args: Parameters<typeof origRender>) => {
      if (res.statusCode < 400) {
        res.locals.canonicalUrl = canonicalBase + req.path;
      }
      if (res.locals.flashLoggedOut) {
        clearFlash(res, req);
      }
      return origRender(...args);
    }) as typeof res.render;
    next();
  });

  app.use((req, _res, next) => {
    logger.debug('incoming request', { method: req.method, url: redactTokenPaths(req.url) });
    next();
  });

  app.use('/health',   healthRouter);
  // Crawler/AI-agent surfaces (/robots.txt, /sitemap.xml, /llms.txt). Public and
  // unauthenticated; mounted ahead of the onboarding-gated public router so a
  // crawler is never redirected through the onboarding flow.
  app.use(seoRouter);
  app.use('/ipc',      ipcRouter);
  // Internal QC subsystem: dev/staging tooling only, retired at go-live.
  // Double gate: env check plus the null guard (production images stub the
  // router module to null after stripping dist/internal-qc).
  if (config.footbagEnv !== 'production' && internalRouter) {
    app.use('/internal', internalRouter);
  }
  app.use('/admin',    adminRouter);
  // Permanent test scaffolding mount. Registered only when footbagEnv is
  // 'development' or 'staging', so the /dev surface (persona switch + listing)
  // is reachable in dev and staging but never in production. The harness lives
  // in src/testkit/ and is not removed at cutover; production exclusion is by
  // this env-gated mount plus the build-time image strip (which stubs the
  // module to null).
  if ((config.footbagEnv === 'development' || config.footbagEnv === 'staging') && devRouter) {
    app.use('/dev', devRouter);
  }
  app.use('/',         publicRouter);

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
    // Throttle hits from in-service rate limiting. Controllers that want a
    // form re-render catch RateLimitedError themselves; everything else gets
    // the canonical 429 with Retry-After here instead of a spurious 500.
    if (err instanceof RateLimitedError) {
      if (err.retryAfterSeconds) res.setHeader('Retry-After', String(err.retryAfterSeconds));
      res.status(429).type('text/plain').send(err.message);
      return;
    }
    // Body-parser rejects an oversized request body with a PayloadTooLargeError
    // (type 'entity.too.large', status 413). That is a client-input condition,
    // not a server fault, so return the canonical 413 here rather than letting
    // it fall through to the catch-all 500 (which would also emit a spurious
    // unhandled-error alarm line).
    if (
      typeof err === 'object' && err !== null &&
      ((err as { type?: unknown }).type === 'entity.too.large' ||
        (err as { status?: unknown }).status === 413)
    ) {
      res.status(413).type('text/plain').send('Request entity too large');
      return;
    }
    next(err);
  });

  // ── 500 error handler ────────────────────────────────────────────────────
  app.use((err: unknown, req: express.Request, res: express.Response, _next: express.NextFunction) => {
    logger.error('unhandled error', {
      method: req.method,
      url: redactTokenPaths(req.url),
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
