import express, { Router } from 'express';
import { paymentController } from '../controllers/paymentController';
import { config } from '../config/env';
import { homeController } from '../controllers/homeController';
import { clubController } from '../controllers/clubController';
import { mediaController } from '../controllers/mediaController';
import { eventController } from '../controllers/eventController';
import { historyController } from '../controllers/historyController';
import { memberController } from '../controllers/memberController';
import { memberGalleryController } from '../controllers/memberGalleryController';
import { memberMediaUploadController } from '../controllers/memberMediaUploadController';
import { memberMediaEditController } from '../controllers/memberMediaEditController';
import { claimController } from '../controllers/claimController';
import { contactRequestController } from '../controllers/contactRequestController';
import { authController } from '../controllers/authController';
import { memberOnboardingController } from '../controllers/memberOnboardingController';
import { legacyRedirectController } from '../controllers/legacyRedirectController';
import { ipcController } from '../controllers/ipcController';
import { hofController } from '../controllers/hofController';
import { bapController } from '../controllers/bapController';
import { freestyleController } from '../controllers/freestyleController';
import { recordsController } from '../controllers/recordsController';
import { netController } from '../controllers/netController';
import { sidelineController } from '../controllers/sidelineController';
import { rulesController } from '../controllers/rulesController';
import { ifpaController } from '../controllers/ifpaController';
import { legalController } from '../controllers/legalController';
import { tagSuggestController } from '../controllers/tagSuggestController';
import { requireAuth } from '../middleware/auth';
import { requireTier1Benefits } from '../middleware/requireTier';
import { requireOnboardingComplete } from '../middleware/requireOnboardingComplete';

export const publicRouter = Router();
publicRouter.use(requireOnboardingComplete);

publicRouter.get('/',      homeController.home);
// Legacy forum URLs live on the member-gated archive mirror.
publicRouter.get(['/forum', '/forum/*', '/forums', '/forums/*'], legacyRedirectController.forum);
publicRouter.get('/clubs',                  clubController.index);
publicRouter.post('/clubs/swap-primary',    requireAuth, clubController.postSwapPrimary);
publicRouter.get('/clubs/create',           requireAuth, clubController.getCreate);
publicRouter.post('/clubs/create',          requireAuth, requireTier1Benefits(), clubController.postCreate);
publicRouter.get('/clubs/:key',             clubController.byKey);
publicRouter.post('/clubs/:key/join',           requireAuth, clubController.postJoin);
publicRouter.post('/clubs/:key/leave',          requireAuth, clubController.postLeave);
publicRouter.post('/clubs/:key/volunteer',      requireAuth, clubController.postVolunteer);
publicRouter.post('/clubs/:key/invite',         requireAuth, clubController.postInvite);
publicRouter.post('/clubs/:key/step-down',      requireAuth, clubController.postStepDown);
publicRouter.post('/clubs/:key/mark-inactive',  requireAuth, clubController.postMarkInactive);
publicRouter.post('/clubs/:key/reactivate',     requireAuth, clubController.postReactivate);
publicRouter.post('/clubs/:key/hashtag',        requireAuth, clubController.postUpdateHashtag);
publicRouter.post('/clubs/:key/content/edit',    requireAuth, clubController.postContentEdit);
publicRouter.get('/tags/suggest',       tagSuggestController.suggest);
publicRouter.get('/media',              mediaController.hub);
// IMPORTANT: /media/browse is a literal sub-route and MUST be registered
// before /media/:galleryId. Without this ordering, "browse" would be
// captured as the :galleryId param and the browse page would 404 through
// the named-gallery NotFound branch.
publicRouter.get('/media/browse',       mediaController.browse);
// Literal sub-route; like /media/browse it MUST precede /media/:galleryId.
publicRouter.get('/media/freestyle-tutorials', mediaController.freestyleTutorials);
// Literal sub-route; like /media/browse it MUST precede /media/:galleryId so
// the member-galleries list page is not captured as a gallery id.
publicRouter.get('/media/member-galleries', mediaController.memberGalleries);
publicRouter.get('/media/:galleryId',    mediaController.namedGallery);
// Two-segment item-detail page within a named gallery; distinct depth from the
// single-segment routes above, so ordering against them does not matter.
publicRouter.get('/media/:galleryId/:mediaId', mediaController.namedGalleryItem);
publicRouter.get('/hof',   hofController.index);
publicRouter.get('/bap',   bapController.index);

// IMPORTANT: literal sub-routes registered before param routes (/freestyle/tricks/:slug)
// and before /freestyle itself.
publicRouter.get('/freestyle/records',     freestyleController.records);
// Trick search. The suggest endpoint backs the typeahead; the page is the
// no-JS fallback. Both are literal paths registered ahead of /freestyle/tricks/:slug.
publicRouter.get('/freestyle/search/suggest', freestyleController.searchSuggest);
publicRouter.get('/freestyle/search',         freestyleController.search);
// Freestyle Media section; built by mediaService and also reached from the
// /media hub's Freestyle card, so both surfaces share one structure.
publicRouter.get('/freestyle/media',       mediaController.freestyleMedia);
publicRouter.get('/freestyle/leaders',     freestyleController.leaders);
publicRouter.get('/freestyle/competition',   freestyleController.competition);
publicRouter.get('/freestyle/partnerships',  freestyleController.partnerships);
publicRouter.get('/freestyle/history',     freestyleController.history);
publicRouter.get('/freestyle/about',       freestyleController.about);
publicRouter.get('/freestyle/add-analysis', freestyleController.addAnalysis);
publicRouter.get('/freestyle/combo-analysis', freestyleController.comboAnalysis);
// /freestyle/sets is the standalone Set Encyclopedia, a minimalist index
// of canonical sets as first-class ontology objects, distinct from
// /freestyle/tricks?view=sets (Trick Dictionary's By-Set view) and from
// /freestyle/compositional-sets (exploratory hub). Per-set detail pages
// live at /freestyle/sets/:slug; flat Holden reference table at
// /freestyle/sets/reference.
// Literal sub-routes (reference) MUST register before the :slug param
// route.
publicRouter.get('/freestyle/sets/reference', freestyleController.moves);
publicRouter.get('/freestyle/sets/:slug',     freestyleController.setDetail);
publicRouter.get('/freestyle/sets',           freestyleController.setsEncyclopedia);
publicRouter.get('/freestyle/compositional-sets', freestyleController.compositionalSets);
publicRouter.get('/freestyle/glossary',    freestyleController.glossary);
publicRouter.get('/freestyle/notation-article', freestyleController.notationArticle);
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
// legacy_claim view.
publicRouter.get('/history/:personId/claim',         requireAuth, claimController.getClaimHp);
publicRouter.post('/history/:personId/claim/confirm', requireAuth, claimController.postClaimHpConfirm);
publicRouter.get('/history/:personId',   historyController.detail);

// IMPORTANT: /members/:memberKey/edit and /members/:memberKey/avatar must be
// registered before /members/:memberKey/:section so literal segments are not
// captured as :section. The /members/:memberKey/galleries/* tree must
// also precede the catch-all so "galleries" is not captured as :section.
publicRouter.get('/members',                       memberController.landing);
// Legacy-URL forwarding: must match BEFORE the slug route so old
// /members/profile/<legacy id> emails never resolve as a slug lookup.
publicRouter.get('/members/profile/:legacyMemberId', legacyRedirectController.memberProfile);
publicRouter.get('/members/:memberKey',             memberController.getProfile);
publicRouter.get('/members/:memberKey/edit',          requireAuth, memberController.getProfileEdit);
publicRouter.post('/members/:memberKey/edit',         requireAuth, memberController.postProfileEdit);
publicRouter.get('/members/:memberKey/edit/password', requireAuth, memberController.getPasswordEdit);
publicRouter.post('/members/:memberKey/edit/password',requireAuth, memberController.postPasswordEdit);
publicRouter.post('/members/:memberKey/avatar',       requireAuth, memberController.postAvatarUpload);
publicRouter.post('/members/:memberKey/purchase-tier', requireAuth, memberController.postPurchaseTier);
publicRouter.get('/members/:memberKey/payments',       requireAuth, paymentController.getPaymentHistory);
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

// Per-item edit (caption + tags + external URL) and permanent delete.
// MUST be registered after /media/upload so the literal `upload` segment
// wins on POST; controller also defends with an `:mediaId === 'upload'` 404.
publicRouter.get('/members/:memberKey/media/:mediaId/edit',  requireAuth, memberMediaEditController.getEdit);
publicRouter.post('/members/:memberKey/media/:mediaId/edit', requireAuth, requireTier1Benefits(), memberMediaEditController.postUpdate);
publicRouter.post('/members/:memberKey/media/:mediaId/delete', requireAuth, requireTier1Benefits(), memberMediaEditController.postDelete);

publicRouter.get('/members/:memberKey/:section',      requireAuth, memberController.getStub);

publicRouter.get('/legal',      legalController.index);

publicRouter.get('/login',      authController.getLogin);
publicRouter.post('/login',     authController.postLogin);
publicRouter.get('/register',               authController.getRegister);
publicRouter.post('/register',              authController.postRegister);
publicRouter.get('/register/check-email',   authController.getCheckEmail);
publicRouter.get('/verify/:token',          authController.getVerify);
publicRouter.post('/verify/resend',         authController.postVerifyResend);


// Onboarding wizard. Per-action sub-paths land before the catch-all
// `:taskType` routes so literal segments (find, skip, auto-link, claim,
// submit) are not captured as :taskType. Order matters: Express matches
// in registration order.
publicRouter.post('/register/wizard/personal_details/submit',           requireAuth, memberOnboardingController.postPersonalDetailsSubmit);
publicRouter.post('/register/wizard/legacy_claim/find',                 requireAuth, memberOnboardingController.postLegacyClaimFind);
publicRouter.post('/register/wizard/legacy_claim/auto-link/confirm',    requireAuth, memberOnboardingController.postLegacyClaimAutoLinkConfirm);
publicRouter.post('/register/wizard/legacy_claim/auto-link/decline',    requireAuth, memberOnboardingController.postLegacyClaimAutoLinkDecline);
publicRouter.post('/register/wizard/legacy_claim/help-request',         requireAuth, memberOnboardingController.postLegacyClaimHelpRequest);
publicRouter.post('/register/wizard/legacy_claim/cross-source/confirm', requireAuth, memberOnboardingController.postCrossSourceLegacyConfirm);
publicRouter.post('/register/wizard/legacy_claim/anchors/send-verification', requireAuth, memberOnboardingController.postAnchorSendVerification);
publicRouter.get('/register/wizard/legacy_claim/anchors/verify/:token',      requireAuth, memberOnboardingController.getAnchorVerify);
publicRouter.get('/register/wizard/legacy_claim/claim/confirm/:token',  requireAuth, memberOnboardingController.getLegacyClaimTokenConfirm);
publicRouter.post('/register/wizard/legacy_claim/claim/confirm',        requireAuth, memberOnboardingController.postLegacyClaimTokenConfirm);
publicRouter.post('/register/wizard/legacy_claim/anchors/add',          requireAuth, memberOnboardingController.postAddAnchor);
publicRouter.post('/register/wizard/legacy_claim/anchors/remove',       requireAuth, memberOnboardingController.postRemoveAnchor);
publicRouter.post('/register/wizard/club_affiliations/submit',          requireAuth, memberOnboardingController.postClubAffiliationsSubmit);
publicRouter.post('/register/wizard/club_affiliations/leadership-offer', requireAuth, memberOnboardingController.postLeadershipOffer);
publicRouter.post('/register/wizard/:taskType/skip',                    requireAuth, memberOnboardingController.postSkip);
publicRouter.get('/register/wizard/complete',                           requireAuth, memberOnboardingController.getComplete);
publicRouter.get('/register/wizard/:taskType',                          requireAuth, memberOnboardingController.getTask);
publicRouter.get('/password/forgot',        authController.getPasswordForgot);
publicRouter.post('/password/forgot',       authController.postPasswordForgot);
publicRouter.get('/password/reset/:token',  authController.getPasswordReset);
publicRouter.post('/password/reset/:token', authController.postPasswordReset);
publicRouter.get('/logout',                 authController.getLogout);
publicRouter.post('/logout',                authController.postLogout);

// ── Payments (Stripe-flow workflow per DD §6.1) ────────────────────────────
//
// The webhook receiver MUST be mounted with express.raw() so Stripe's
// signature verification has access to the original byte sequence. Real Stripe
// deliveries arrive as application/json, which the global express.json() in
// app.ts would otherwise consume before the controller runs; app.ts therefore
// skips STRIPE_WEBHOOK_PATH explicitly. The route is also exempt from the
// Origin-pin CSRF gate (it authenticates via the Stripe-Signature HMAC, not an
// Origin header) per DD §3.3. The path is one shared constant so the
// parser-skip and the origin exemption can never drift from the route.
export const STRIPE_WEBHOOK_PATH = '/payments/webhook';

// SES feedback webhook: SNS delivers bounce/complaint notifications here as
// text/plain (the global JSON parser ignores that type, so the route mounts
// its own text parser). Auth is the shared-secret query key checked in the
// controller; like Stripe, the path is exempt from the Origin-pin gate.
export const SES_FEEDBACK_WEBHOOK_PATH = '/webhooks/ses-feedback';
publicRouter.post(
  SES_FEEDBACK_WEBHOOK_PATH,
  express.text({ type: '*/*', limit: '1mb' }),
  ipcController.receiveSesFeedback,
);
publicRouter.post(
  STRIPE_WEBHOOK_PATH,
  express.raw({ type: 'application/json', limit: '1mb' }),
  paymentController.postPaymentWebhook,
);
publicRouter.get('/payments/success', requireAuth, paymentController.getPaymentSuccess);
publicRouter.get('/payments/cancel',  requireAuth, paymentController.getPaymentCancel);

// Stub-mode checkout pass-through: registered only when PAYMENT_ADAPTER=stub.
// In live mode, members are redirected to checkout.stripe.com instead and
// these routes never fire. Keeping the registration conditional avoids
// exposing a stub-only surface in production.
if (config.paymentAdapter === 'stub') {
  publicRouter.get('/payments/checkout/:sessionId',         requireAuth, paymentController.getCheckout);
  publicRouter.post('/payments/checkout/:sessionId/confirm', requireAuth, paymentController.postCheckoutConfirm);
  publicRouter.post('/payments/checkout/:sessionId/cancel',  requireAuth, paymentController.postCheckoutCancel);
  publicRouter.post('/payments/checkout/:sessionId/decline', requireAuth, paymentController.postCheckoutDecline);
}
