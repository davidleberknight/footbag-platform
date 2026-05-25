import { Router } from 'express';
import { homeController } from '../controllers/homeController';
import { clubController } from '../controllers/clubController';
import { mediaController } from '../controllers/mediaController';
import { eventController } from '../controllers/eventController';
import { historyController } from '../controllers/historyController';
import { memberController } from '../controllers/memberController';
import { memberAccountController } from '../controllers/memberAccountController';
import { memberGalleryController } from '../controllers/memberGalleryController';
import { memberMediaUploadController } from '../controllers/memberMediaUploadController';
import { memberMediaEditController } from '../controllers/memberMediaEditController';
import { claimController } from '../controllers/claimController';
import { contactRequestController } from '../controllers/contactRequestController';
import { authController } from '../controllers/authController';
import { memberOnboardingController } from '../controllers/memberOnboardingController';
import { hofController } from '../controllers/hofController';
import { bapController } from '../controllers/bapController';
import { freestyleController } from '../controllers/freestyleController';
import { recordsController } from '../controllers/recordsController';
import { netController } from '../controllers/netController';
import { sidelineController } from '../controllers/sidelineController';
import { rulesController } from '../controllers/rulesController';
import { ifpaController } from '../controllers/ifpaController';
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
publicRouter.get('/freestyle/add-analysis', freestyleController.addAnalysis);
publicRouter.get('/freestyle/combo-analysis', freestyleController.comboAnalysis);
// SET-SYSTEM-REFACTOR Phase B (2026-05-25): /freestyle/sets is now the Set
// Hub URL (301 to the canonical hub at /freestyle/tricks?view=sets); the
// flat Holden reference table moved to /freestyle/sets/reference; per-set
// detail pages live at /freestyle/sets/:slug.
// Literal sub-routes (reference) MUST register before the :slug param
// route. Old /freestyle/moves URL continues to redirect for back-compat.
publicRouter.get('/freestyle/sets/reference', freestyleController.moves);
publicRouter.get('/freestyle/sets/:slug',     freestyleController.setDetail);
publicRouter.get('/freestyle/sets',           (_req, res) => res.redirect(301, '/freestyle/tricks?view=sets'));
publicRouter.get('/freestyle/moves',          (_req, res) => res.redirect(301, '/freestyle/sets/reference'));
publicRouter.get('/freestyle/compositional-sets', freestyleController.compositionalSets);
publicRouter.get('/freestyle/glossary',    freestyleController.glossary);
publicRouter.get('/freestyle/operators',   freestyleController.operators);
publicRouter.get('/freestyle/observational', freestyleController.observational);
publicRouter.get('/freestyle/tricks',      freestyleController.tricksIndex);
publicRouter.get('/freestyle/insights',    freestyleController.insights);
publicRouter.get('/freestyle/learn',       freestyleController.symbolicLearn);
publicRouter.get('/freestyle/progression/walking-family', freestyleController.walkingProgression);
publicRouter.get('/freestyle/modifier/:slug', freestyleController.modifierFamily);
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

publicRouter.get('/ifpa',           ifpaController.index);
publicRouter.get('/ifpa/:docSlug',  ifpaController.detail);

// IMPORTANT: /events/year/:year MUST be registered before /events/:eventKey.
// Express matches routes in registration order. Without this ordering,
// the literal segment "year" would be captured as the :eventKey param,
// which would fail PUBLIC_EVENT_KEY_PATTERN validation and return 404
// instead of routing to the year archive page.
publicRouter.get('/events',              eventController.landing);
publicRouter.get('/events/year/:year',   eventController.year);
publicRouter.get('/events/:eventKey',    eventController.event);

// HP-only self-serve claim (scenarios D and E). The legacy account-claim and
// auto-link flows live in the onboarding wizard at /register/wizard/legacy_claim
// (see memberOnboardingController). /history/:personId/claim remains the
// documented destination for HP-card deep-links from inside the wizard's
// legacy_claim view (USER_STORIES M_Complete_Onboarding_Wizard).
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
publicRouter.get('/members/:memberKey/contact-admin',  requireAuth, contactRequestController.getForm);
publicRouter.post('/members/:memberKey/contact-admin', requireAuth, contactRequestController.postSubmit);

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

// Per-item edit (caption + tags + external URL). MUST be registered
// after /media/upload so the literal `upload` segment wins on POST;
// controller also defends with an `:mediaId === 'upload'` 404.
publicRouter.get('/members/:memberKey/media/:mediaId/edit',  requireAuth, memberMediaEditController.getEdit);
publicRouter.post('/members/:memberKey/media/:mediaId/edit', requireAuth, requireTier1Benefits(), memberMediaEditController.postUpdate);

// Silent auto-link card / profile-settings actions. Three POSTs on a
// fixed-path namespace so they don't collide with the :memberKey/:section
// catch-all below; the controller resolves the acting member from the
// session, not the URL.
publicRouter.post('/members/me/auto-link/confirm',          requireAuth, memberAccountController.postAutoLinkConfirm);
publicRouter.post('/members/me/auto-link/dismiss',          requireAuth, memberAccountController.postAutoLinkDismiss);
publicRouter.post('/members/me/auto-link/report-incorrect', requireAuth, memberAccountController.postAutoLinkReportIncorrect);

publicRouter.get('/members/:memberKey/:section',      requireAuth, memberController.getStub);

publicRouter.get('/legal',      legalController.index);

publicRouter.get('/login',      authController.getLogin);
publicRouter.post('/login',     authController.postLogin);
publicRouter.get('/register',               authController.getRegister);
publicRouter.post('/register',              authController.postRegister);
publicRouter.get('/register/check-email',   authController.getCheckEmail);
publicRouter.get('/verify/:token',          authController.getVerify);
publicRouter.post('/verify/resend',         authController.postVerifyResend);

// Tokened "report incorrect" link delivered in the silent-claim notification
// email. Returns a uniform 200 result page for reverted / already-reverted /
// not-found outcomes (anti-enumeration).
publicRouter.get('/auto-link/report-incorrect/:token', authController.getReportIncorrectLink);

// Onboarding wizard. Per-action sub-paths land before the catch-all
// `:taskType` routes so literal segments (find, skip, auto-link, claim,
// submit) are not captured as :taskType. Order matters: Express matches
// in registration order.
publicRouter.post('/register/wizard/legacy_claim/find',                 requireAuth, memberOnboardingController.postLegacyClaimFind);
publicRouter.post('/register/wizard/legacy_claim/auto-link/confirm',    requireAuth, memberOnboardingController.postLegacyClaimAutoLinkConfirm);
publicRouter.get('/register/wizard/legacy_claim/claim/confirm/:token',  requireAuth, memberOnboardingController.getLegacyClaimTokenConfirm);
publicRouter.post('/register/wizard/legacy_claim/claim/confirm',        requireAuth, memberOnboardingController.postLegacyClaimTokenConfirm);
publicRouter.post('/register/wizard/first_competition_year/submit',     requireAuth, memberOnboardingController.postFirstCompetitionYearSubmit);
publicRouter.post('/register/wizard/show_competitive_results/submit',   requireAuth, memberOnboardingController.postShowCompetitiveResultsSubmit);
publicRouter.post('/register/wizard/club_affiliations/submit',          requireAuth, memberOnboardingController.postClubAffiliationsSubmit);
publicRouter.post('/register/wizard/:taskType/skip',                    requireAuth, memberOnboardingController.postSkip);
publicRouter.get('/register/wizard/complete',                           requireAuth, memberOnboardingController.getComplete);
publicRouter.get('/register/wizard/:taskType',                          requireAuth, memberOnboardingController.getTask);
publicRouter.get('/password/forgot',        authController.getPasswordForgot);
publicRouter.post('/password/forgot',       authController.postPasswordForgot);
publicRouter.get('/password/reset/:token',  authController.getPasswordReset);
publicRouter.post('/password/reset/:token', authController.postPasswordReset);
publicRouter.get('/logout',                 authController.getLogout);
publicRouter.post('/logout',                authController.postLogout);
