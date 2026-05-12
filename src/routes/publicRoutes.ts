import { Router } from 'express';
import { homeController } from '../controllers/homeController';
import { clubController } from '../controllers/clubController';
import { mediaController } from '../controllers/mediaController';
import { eventController } from '../controllers/eventController';
import { historyController } from '../controllers/historyController';
import { memberController } from '../controllers/memberController';
import { memberGalleryController } from '../controllers/memberGalleryController';
import { memberMediaUploadController } from '../controllers/memberMediaUploadController';
import { claimController } from '../controllers/claimController';
import { authController } from '../controllers/authController';
import { hofController } from '../controllers/hofController';
import { bapController } from '../controllers/bapController';
import { freestyleController } from '../controllers/freestyleController';
import { recordsController } from '../controllers/recordsController';
import { netController } from '../controllers/netController';
import { sidelineController } from '../controllers/sidelineController';
import { rulesController } from '../controllers/rulesController';
import { legalController } from '../controllers/legalController';
import { requireAuth } from '../middleware/auth';
import { requireTier1Benefits } from '../middleware/requireTier';

export const publicRouter = Router();

publicRouter.get('/',      homeController.home);
publicRouter.get('/clubs',       clubController.index);
publicRouter.get('/clubs/:key', clubController.byKey);
publicRouter.get('/media',              mediaController.hub);
// IMPORTANT: /media/browse is a literal sub-route and MUST be registered
// before /media/:galleryId. Without this ordering, "browse" would be
// captured as the :galleryId param and the browse page would 404 through
// the named-gallery NotFound branch.
publicRouter.get('/media/browse',       mediaController.browse);
publicRouter.get('/media/:galleryId',    mediaController.namedGallery);
publicRouter.get('/hof',   hofController.index);
publicRouter.get('/bap',   bapController.index);

// IMPORTANT: literal sub-routes registered before param routes (/freestyle/tricks/:slug)
// and before /freestyle itself.
publicRouter.get('/freestyle/records',     freestyleController.records);
publicRouter.get('/freestyle/leaders',     freestyleController.leaders);
publicRouter.get('/freestyle/competition',   freestyleController.competition);
publicRouter.get('/freestyle/partnerships',  freestyleController.partnerships);
publicRouter.get('/freestyle/history',     freestyleController.history);
publicRouter.get('/freestyle/about',       freestyleController.about);
publicRouter.get('/freestyle/moves',       freestyleController.moves);
publicRouter.get('/freestyle/glossary',    freestyleController.glossary);
publicRouter.get('/freestyle/tricks',      freestyleController.tricksIndex);
publicRouter.get('/freestyle/insights',    freestyleController.insights);
publicRouter.get('/freestyle/tricks/:slug', freestyleController.trick);
publicRouter.get('/freestyle',             freestyleController.landing);

publicRouter.get('/records', recordsController.records);

// IMPORTANT: /net must be registered before all /net/* sub-routes
publicRouter.get('/net',                  netController.homePage);

publicRouter.get('/net/events', netController.eventsPage);

publicRouter.get('/net/teams',             netController.teamsPage);
publicRouter.get('/net/teams/:teamId',    netController.teamDetail);

publicRouter.get('/sideline',              sidelineController.landing);

publicRouter.get('/rules',                                          rulesController.index);
publicRouter.get('/rules/:disciplineSlug/:ruleSlug',                rulesController.detail);

// IMPORTANT: /events/year/:year MUST be registered before /events/:eventKey.
// Express matches routes in registration order. Without this ordering,
// the literal segment "year" would be captured as the :eventKey param,
// which would fail PUBLIC_EVENT_KEY_PATTERN validation and return 404
// instead of routing to the year archive page.
publicRouter.get('/events',              eventController.landing);
publicRouter.get('/events/year/:year',   eventController.year);
publicRouter.get('/events/:eventKey',    eventController.event);

publicRouter.get('/history', (_req, res) => { res.redirect(301, '/members'); });
// IMPORTANT: /history/claim routes MUST be registered before /history/:personId.
// Without this ordering, "claim" would be captured as the :personId param.
// 301 redirects: GET /history/auto-link and GET /history/claim collapse into
// the unified link-history wizard at /members/:slug/link-history. Round-2
// "one place to link" decision: the standalone forms are no longer navigable.
// POST endpoints stay (form action targets); GET handlers redirect. Bookmark
// hits, stale emails, and accidental link clicks all flow through the wizard.
// Owner slug for the redirect target is read from the auth payload; an
// unauthenticated visit hits requireAuth FIRST and bounces to /login.
publicRouter.get('/history/auto-link',            requireAuth, (req, res) => {
  // 302 (not 301) because the redirect target depends on the current
  // session's slug. A cached 301 would let a later visit bypass requireAuth
  // and route a previous-session-owner's slug into the URL bar.
  res.redirect(302, `/members/${encodeURIComponent(req.user!.slug)}/link-history${req.url.includes('?') ? `?${req.url.split('?')[1]}` : ''}`);
});
publicRouter.post('/history/auto-link/confirm',   requireAuth, claimController.postAutoLinkConfirm);
publicRouter.get('/history/claim',                requireAuth, (req, res) => {
  // 302 (not 301) — same rationale as /history/auto-link above.
  res.redirect(302, `/members/${encodeURIComponent(req.user!.slug)}/link-history${req.url.includes('?') ? `?${req.url.split('?')[1]}` : ''}`);
});
publicRouter.post('/history/claim',               requireAuth, claimController.postClaim);
publicRouter.get('/history/claim/confirm/:token', requireAuth, claimController.getClaimToken);
publicRouter.post('/history/claim/confirm',       requireAuth, claimController.postClaimConfirm);
// HP-only self-serve claim (scenarios D and E). /history/:personId/claim routes
// sit at a deeper path than /history/:personId, so ordering is not strictly
// required, but keeping claim routes grouped.
publicRouter.get('/history/:personId/claim',         requireAuth, claimController.getClaimHp);
publicRouter.post('/history/:personId/claim/confirm', requireAuth, claimController.postClaimHpConfirm);
publicRouter.get('/history/:personId',   historyController.detail);

// IMPORTANT: /members/:memberKey/edit and /members/:memberKey/avatar must be
// registered before /members/:memberKey/:section so literal segments are not
// captured as :section. The /members/:memberKey/galleries/* tree must
// also precede the catch-all so "galleries" is not captured as :section.
publicRouter.get('/members',                       memberController.landing);
publicRouter.get('/members/:memberKey',             memberController.getProfile);
publicRouter.get('/members/:memberKey/edit',          requireAuth, memberController.getProfileEdit);
publicRouter.post('/members/:memberKey/edit',         requireAuth, memberController.postProfileEdit);
publicRouter.get('/members/:memberKey/edit/password', requireAuth, memberController.getPasswordEdit);
publicRouter.post('/members/:memberKey/edit/password',requireAuth, memberController.postPasswordEdit);
publicRouter.post('/members/:memberKey/avatar',       requireAuth, memberController.postAvatarUpload);
publicRouter.get('/members/:memberKey/link-history',  requireAuth, claimController.getLinkHistory);
publicRouter.post('/members/:memberKey/link-history/find', requireAuth, claimController.postLinkHistoryFind);

// Owner-only named-gallery management. Order matters: literal `new`
// must precede `:id`; literal `edit`/`delete` sub-paths sit at a deeper
// level than `:id` so are unambiguous, but registering them explicitly
// keeps intent clear. All routes 404 (anti-enumeration) when the
// authenticated user's slug does not match :memberKey.
publicRouter.get('/members/:memberKey/galleries',                requireAuth, memberGalleryController.getList);
publicRouter.get('/members/:memberKey/galleries/new',            requireAuth, memberGalleryController.getNew);
publicRouter.post('/members/:memberKey/galleries',               requireAuth, requireTier1Benefits(), memberGalleryController.postCreate);
publicRouter.get('/members/:memberKey/galleries/:id/edit',       requireAuth, memberGalleryController.getEdit);
publicRouter.post('/members/:memberKey/galleries/:id/edit',      requireAuth, requireTier1Benefits(), memberGalleryController.postUpdate);
publicRouter.post('/members/:memberKey/galleries/:id/delete',    requireAuth, requireTier1Benefits(), memberGalleryController.postDelete);

// Owner-only member upload. Same anti-enumeration 404 pattern as the
// gallery routes above. POST is multipart/form-data (busboy in the
// controller); the service layer auto-applies #<slug> as the
// uploader tag and materializes the per-member Personal Gallery on
// first upload.
// GET stays open to all authenticated owners as a read-only form preview
// (intentional UX; the under-tiered member can see the upload affordance,
// the form copy can communicate the tier requirement, and they get an
// actionable upgrade path without hitting a bare 403). POST is the gate:
// requireTier1Benefits returns 403 to under-tiered submissions, with
// defense-in-depth in curatorMediaService.assertTier1Benefits.
publicRouter.get('/members/:memberKey/media/upload',  requireAuth, memberMediaUploadController.getUpload);
publicRouter.post('/members/:memberKey/media/upload', requireAuth, requireTier1Benefits(), memberMediaUploadController.postUpload);

publicRouter.get('/members/:memberKey/:section',      requireAuth, memberController.getStub);

publicRouter.get('/legal',      legalController.index);

publicRouter.get('/login',      authController.getLogin);
publicRouter.post('/login',     authController.postLogin);
publicRouter.get('/register',               authController.getRegister);
publicRouter.post('/register',              authController.postRegister);
publicRouter.get('/register/check-email',   authController.getCheckEmail);
publicRouter.get('/verify/:token',          authController.getVerify);
publicRouter.post('/verify/resend',         authController.postVerifyResend);
publicRouter.get('/password/forgot',        authController.getPasswordForgot);
publicRouter.post('/password/forgot',       authController.postPasswordForgot);
publicRouter.get('/password/reset/:token',  authController.getPasswordReset);
publicRouter.post('/password/reset/:token', authController.postPasswordReset);
publicRouter.post('/logout',                authController.postLogout);
