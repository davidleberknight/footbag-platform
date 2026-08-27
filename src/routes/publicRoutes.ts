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
import { memberQuestionController } from '../controllers/memberQuestionController';
import { authController } from '../controllers/authController';
import { memberOnboardingController } from '../controllers/memberOnboardingController';
import { emailPreferenceController } from '../controllers/emailPreferenceController';
import { memberAnnounceController } from '../controllers/memberAnnounceController';
import { UNSUBSCRIBE_PATH } from '../services/communicationService';
import { hofController } from '../controllers/hofController';
import { bapController } from '../controllers/bapController';
import { freestyleController } from '../controllers/freestyleController';
import { recordsController } from '../controllers/recordsController';
import { netController } from '../controllers/netController';
import { sidelineController } from '../controllers/sidelineController';
import { rulesController } from '../controllers/rulesController';
import { ifpaController } from '../controllers/ifpaController';
import { officialRosterController } from '../controllers/officialRosterController';
import { legalController } from '../controllers/legalController';
import { tagSuggestController } from '../controllers/tagSuggestController';
import { requireAuth, requireMember } from '../middleware/auth';
import { requireTier1Benefits, requireMayCreateClub, requireTier2Plus } from '../middleware/requireTier';

export const publicRouter = Router();
// Membership is an authorization level: an account is pending until every
// onboarding task completes, and a pending registrant holds a session but no
// member authorization. Every member-capability route below carries
// requireMember, which routes a pending request to its next wizard task; bare
// requireAuth appears only on the wizard's own routes and the historical-record
// claim routes, because claiming is part of finishing onboarding. A conformance
// test pins that split.

publicRouter.get('/',      homeController.home);
// Login-gated hop to the archive landing page, for deployments where the
// archive edge cannot share the platform session cookie.
publicRouter.get('/archive', requireMember, homeController.archiveRedirect);
publicRouter.get('/clubs',                  clubController.index);
publicRouter.post('/clubs/swap-primary',    requireMember, clubController.postSwapPrimary);
publicRouter.get('/clubs/create',           requireMember, requireMayCreateClub(), clubController.getCreate);
publicRouter.post('/clubs/create',          requireMember, requireMayCreateClub(), clubController.postCreate);
publicRouter.get('/clubs/:key',             clubController.byKey);
publicRouter.post('/clubs/:key/join',           requireMember, clubController.postJoin);
publicRouter.post('/clubs/:key/leave',          requireMember, clubController.postLeave);
publicRouter.post('/clubs/:key/volunteer',      requireMember, requireTier1Benefits(), clubController.postVolunteer);
publicRouter.post('/clubs/:key/invite',         requireMember, clubController.postInvite);
publicRouter.post('/clubs/:key/step-down',      requireMember, clubController.postStepDown);
publicRouter.post('/clubs/:key/mark-inactive',  requireMember, clubController.postMarkInactive);
publicRouter.post('/clubs/:key/reactivate',     requireMember, clubController.postReactivate);
publicRouter.post('/clubs/:key/hashtag',        requireMember, clubController.postUpdateHashtag);
publicRouter.post('/clubs/:key/content/edit',    requireMember, clubController.postContentEdit);
publicRouter.get('/tags/suggest',       tagSuggestController.suggest);
// The hashtag index moved onto the browse landing; this path redirects there.
// The autocomplete endpoint above is an exact path, so it is unaffected.
publicRouter.get('/tags',               mediaController.tagsIndex);
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
// Standalone item viewer reached from any tag-query surface (browse, profile,
// teaching). It shares the two-segment depth of /media/:galleryId/:mediaId, so
// it MUST be registered before that route or "item" is captured as a galleryId.
publicRouter.get('/media/item/:mediaId',    mediaController.mediaItem);
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
// /freestyle/tricks?view=modifier (the Trick Dictionary's modifier-grouped
// trick browse) and from
// /freestyle/compositional-sets (exploratory hub). Per-set detail pages
// live at /freestyle/sets/:slug; flat Holden reference table at
// /freestyle/sets/reference.
// Literal sub-routes (reference) MUST register before the :slug param
// route.
publicRouter.get('/freestyle/sets/reference', freestyleController.moves);
publicRouter.get('/freestyle/sets/:slug',     freestyleController.setDetail);
publicRouter.get('/freestyle/sets',           freestyleController.setsEncyclopedia);
publicRouter.get('/freestyle/compositional-sets', freestyleController.compositionalSets);
// Three distinct reference resources: /freestyle/tricks finds tricks (with
// "Reading the Dictionary" folded in at the top), /freestyle/glossary looks up
// terminology (the A–Z list), /freestyle/concepts explains concepts in depth
// (the chapter-based reference; every #term-/#section- deep link lands here).
publicRouter.get('/freestyle/glossary',    freestyleController.glossary);
publicRouter.get('/freestyle/concepts',    freestyleController.concepts);
publicRouter.get('/freestyle/notation-article', freestyleController.notationArticle);
publicRouter.get('/freestyle/operators',   freestyleController.operators);
publicRouter.get('/freestyle/observational', freestyleController.observational);
publicRouter.get('/freestyle/tricks',      freestyleController.tricksIndex);
publicRouter.get('/freestyle/insights',    freestyleController.insights);
publicRouter.get('/freestyle/by-the-numbers', freestyleController.byTheNumbers);
publicRouter.get('/freestyle/learn',       freestyleController.symbolicLearn);
// Novice entry page: the landing "Start here" CTA destination. /freestyle/learn
// stays the broader educational-pathways index.
publicRouter.get('/freestyle/start',       freestyleController.start);
publicRouter.get('/freestyle/progression/walking-family', freestyleController.walkingProgression);
publicRouter.get('/freestyle/modifier/:slug', freestyleController.modifierFamily);
// Family detail pages: first-class Family Parents only (anything else 404s
// in the service). The bare /freestyle/families path redirects to the
// dictionary's By-family browse; no standalone hub. Registered before the
// /freestyle/tricks/:slug and /freestyle catch-alls.
publicRouter.get('/freestyle/families/:slug', freestyleController.familyDetail);
publicRouter.get('/freestyle/families',       freestyleController.familiesHub);
// Canonical per-ADD-tier dictionary view: /freestyle/tricks/5 is the 5-ADD
// browse view. The all-digits segment cannot collide with a trick slug
// (slugs are lowercase word tokens; the digit-led ones like 2_bag_juggling
// carry a non-digit suffix), and it registers ahead of the :slug route so a
// numeric segment never reaches the trick-detail resolver.
publicRouter.get('/freestyle/tricks/:add(\\d+)', freestyleController.tricksByAdd);
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
// IMPORTANT: /ifpa/roster MUST be registered before /ifpa/:docSlug. Express
// matches routes in registration order, so without this the literal segment
// "roster" is captured as :docSlug and 404s as an unknown governance document.
//
// The tier gate is the IFPA membership rules' own grant: Tier 2 (IFPA
// Organizer Member) and above may access the roster for official IFPA event
// and organizer purposes. Site administrators must already hold Tier 2 or
// Tier 3, so this one gate serves administrators, directors and organizers.
publicRouter.get('/ifpa/roster',    requireMember, requireTier2Plus(), officialRosterController.index);
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
publicRouter.get('/members/:memberKey',             memberController.getProfile);
publicRouter.get('/members/:memberKey/edit',          requireMember, memberController.getProfileEdit);
publicRouter.post('/members/:memberKey/edit',         requireMember, memberController.postProfileEdit);
publicRouter.get('/members/:memberKey/edit/password', requireMember, memberController.getPasswordEdit);
publicRouter.post('/members/:memberKey/edit/password',requireMember, memberController.postPasswordEdit);
publicRouter.post('/members/:memberKey/avatar',       requireMember, memberController.postAvatarUpload);
publicRouter.post('/members/:memberKey/purchase-tier', requireMember, memberController.postPurchaseTier);
publicRouter.get('/members/:memberKey/payments',       requireMember, paymentController.getPaymentHistory);
publicRouter.post('/members/:memberKey/recurring-donations/:stripeSubscriptionId/cancel',
  requireMember, paymentController.postCancelRecurringDonation);
// The member's own mailing choices. The signed-in member is who the write acts
// on; the path's member key must be theirs, and a mismatch is a 404.
// The community announcement an organizer-tier member sends. The tier gate sits
// beside the member gate; ownership of the member key is checked in the handler.
publicRouter.get('/members/:memberKey/announce',  requireMember, requireTier2Plus(), memberAnnounceController.getForm);
publicRouter.post('/members/:memberKey/announce', requireMember, requireTier2Plus(), memberAnnounceController.postSend);
publicRouter.get('/members/:memberKey/email-preferences',  requireMember, emailPreferenceController.getSubscriptions);
publicRouter.post('/members/:memberKey/email-preferences', requireMember, emailPreferenceController.postSubscription);
publicRouter.get('/members/:memberKey/contact-admin',  requireMember, contactRequestController.getForm);
publicRouter.post('/members/:memberKey/contact-admin', requireMember, contactRequestController.postSubmit);
// The other direction: questions an administrator has put to this member.
// "questions" is a literal segment and must precede the :section catch-all.
publicRouter.get('/members/:memberKey/questions', requireMember, memberQuestionController.index);
publicRouter.post('/members/:memberKey/questions/:messageId/answer',
  requireMember, memberQuestionController.answer);

// Owner-only named-gallery management. Order matters: literal `new`
// must precede `:id`; literal `edit`/`delete` sub-paths sit at a deeper
// level than `:id` so are unambiguous, but registering them explicitly
// keeps intent clear. All routes 404 (anti-enumeration) when the
// authenticated user's slug does not match :memberKey.
// The list stays open to every owner: a member whose benefits lapsed keeps the
// read of what they own, and it is the page that tells them what they no longer
// hold. Every form behind it carries the gate, so no member is handed a form
// that will refuse the submission.
publicRouter.get('/members/:memberKey/galleries',                requireMember, memberGalleryController.getList);
publicRouter.get('/members/:memberKey/galleries/new',            requireMember, requireTier1Benefits('media'), memberGalleryController.getNew);
publicRouter.post('/members/:memberKey/galleries',               requireMember, requireTier1Benefits('media'), memberGalleryController.postCreate);
publicRouter.get('/members/:memberKey/galleries/:id/edit',       requireMember, requireTier1Benefits('media'), memberGalleryController.getEdit);
publicRouter.post('/members/:memberKey/galleries/:id/edit',      requireMember, requireTier1Benefits('media'), memberGalleryController.postUpdate);
publicRouter.post('/members/:memberKey/galleries/:id/delete',    requireMember, requireTier1Benefits('media'), memberGalleryController.postDelete);

// Owner-only member upload. Same anti-enumeration 404 pattern as the
// gallery routes above. POST is multipart/form-data (busboy in the
// controller); the service layer auto-applies #<slug> as the
// uploader tag and materializes the per-member Personal Gallery on
// first upload. Defense in depth behind the gate:
// curatorMediaService.assertTier1Benefits enforces the same predicate at
// upload time.
publicRouter.get('/members/:memberKey/media/upload',  requireMember, requireTier1Benefits('media'), memberMediaUploadController.getUpload);
publicRouter.post('/members/:memberKey/media/upload', requireMember, requireTier1Benefits('media'), memberMediaUploadController.postUpload);

// Per-item edit (caption + tags + external URL) and permanent delete.
// MUST be registered after /media/upload so the literal `upload` segment
// wins on POST; controller also defends with an `:mediaId === 'upload'` 404.
publicRouter.get('/members/:memberKey/media/:mediaId/edit',  requireMember, requireTier1Benefits('media'), memberMediaEditController.getEdit);
publicRouter.post('/members/:memberKey/media/:mediaId/edit', requireMember, requireTier1Benefits('media'), memberMediaEditController.postUpdate);
publicRouter.post('/members/:memberKey/media/:mediaId/delete', requireMember, requireTier1Benefits('media'), memberMediaEditController.postDelete);

// The catch-all for this prefix, so it decides what every unrecognized
// /members/<a>/<b> URL looks like — including the old site's member-profile
// links, which keep arriving from mail sent before cutover. Whether the page
// exists is settled before whether the visitor may see it: an unknown section
// gets the not-found page signed in or not, while a real section gates on
// authentication as usual and a signed-out visitor is sent to sign in and back.
publicRouter.get('/members/:memberKey/:section',
                 memberController.rejectUnknownSection, requireMember, memberController.getStub);

publicRouter.get('/legal',      legalController.index);

publicRouter.get('/login',      authController.getLogin);
publicRouter.post('/login',     authController.postLogin);
publicRouter.get('/register',               authController.getRegister);
publicRouter.post('/register',              authController.postRegister);
publicRouter.get('/register/check-email',   authController.getCheckEmail);
publicRouter.get('/verify/:token',          authController.getVerify);
publicRouter.post('/verify/resend',         authController.postVerifyResend);


// Onboarding wizard. Per-action sub-paths land before the catch-all
// `:taskType` routes so literal segments (find, none, auto-link, claim,
// submit) are not captured as :taskType. Order matters: Express matches
// in registration order. Every task exit is an explicit answer: there is no
// skip, dismiss, or detour route.
publicRouter.post('/register/wizard/personal_details/submit',           requireAuth, memberOnboardingController.postPersonalDetailsSubmit);
publicRouter.post('/register/wizard/legacy_claim/find',                 requireAuth, memberOnboardingController.postLegacyClaimFind);
publicRouter.post('/register/wizard/legacy_claim/auto-link/confirm',    requireAuth, memberOnboardingController.postLegacyClaimAutoLinkConfirm);
publicRouter.post('/register/wizard/legacy_claim/auto-link/decline',    requireAuth, memberOnboardingController.postLegacyClaimAutoLinkDecline);
publicRouter.post('/register/wizard/legacy_claim/cross-source/confirm', requireAuth, memberOnboardingController.postCrossSourceLegacyConfirm);
publicRouter.post('/register/wizard/legacy_claim/anchors/send-verification', requireAuth, memberOnboardingController.postAnchorSendVerification);
publicRouter.get('/register/wizard/legacy_claim/anchors/verify/:token',      requireAuth, memberOnboardingController.getAnchorVerify);
publicRouter.get('/register/wizard/legacy_claim/claim/confirm/:token',  requireAuth, memberOnboardingController.getLegacyClaimTokenConfirm);
publicRouter.post('/register/wizard/legacy_claim/claim/confirm',        requireAuth, memberOnboardingController.postLegacyClaimTokenConfirm);
// The last attempt at the match offers the date on file for correction: the
// matcher runs on it, and a registrant who mistyped it had no way to put it
// right once the details step closed behind them.
publicRouter.post('/register/wizard/legacy_claim/birth-date',           requireAuth, memberOnboardingController.postLegacyClaimBirthDate);
publicRouter.post('/register/wizard/legacy_claim/anchors/add',          requireAuth, memberOnboardingController.postAddAnchor);
publicRouter.post('/register/wizard/legacy_claim/anchors/remove',       requireAuth, memberOnboardingController.postRemoveAnchor);
publicRouter.post('/register/wizard/club_affiliations/submit',          requireAuth, memberOnboardingController.postClubAffiliationsSubmit);
publicRouter.post('/register/wizard/club_affiliations/none',            requireAuth, memberOnboardingController.postNoClubs);
publicRouter.post('/register/wizard/legacy_claim/continue-without-linking', requireAuth, memberOnboardingController.postContinueWithoutLinking);
publicRouter.get('/register/wizard/complete',                           requireAuth, memberOnboardingController.getComplete);
publicRouter.get('/register/wizard/:taskType',                          requireAuth, memberOnboardingController.getTask);
publicRouter.get('/password/forgot',        authController.getPasswordForgot);
publicRouter.post('/password/forgot',       authController.postPasswordForgot);
publicRouter.get('/password/reset/:token',  authController.getPasswordReset);
publicRouter.post('/password/reset/:token', authController.postPasswordReset);
// POST only: logging out is a state change, and a GET route to it would be
// reachable from any other site by a plain link.
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

// One-click unsubscribe: the recipient's mail client posts here from the
// List-Unsubscribe headers on a bulk message. There is no session and no Origin
// header, exactly as with the webhooks above, and the signed token in the query
// string is the whole of the authority, so it takes the same Origin-pin
// exemption. The path is the shared constant the send path mints its URLs from.
publicRouter.post(UNSUBSCRIBE_PATH, emailPreferenceController.postOneClickUnsubscribe);

publicRouter.post(
  STRIPE_WEBHOOK_PATH,
  express.raw({ type: 'application/json', limit: '1mb' }),
  paymentController.postPaymentWebhook,
);
publicRouter.get('/payments/success', requireMember, paymentController.getPaymentSuccess);
publicRouter.get('/payments/cancel',  requireMember, paymentController.getPaymentCancel);

// Donations. Signed-in only: a donation is attributed to a member record, and
// the note defaults from the member's honors.
publicRouter.get('/donate',  requireMember, paymentController.getDonate);
publicRouter.post('/donate', requireMember, paymentController.postDonate);

// Stub-mode checkout pass-through: registered only when PAYMENT_ADAPTER=stub.
// In live mode, members are redirected to checkout.stripe.com instead and
// these routes never fire. Keeping the registration conditional avoids
// exposing a stub-only surface in production.
if (config.paymentAdapter === 'stub') {
  publicRouter.get('/payments/checkout/:sessionId',         requireMember, paymentController.getCheckout);
  publicRouter.post('/payments/checkout/:sessionId/confirm', requireMember, paymentController.postCheckoutConfirm);
  publicRouter.post('/payments/checkout/:sessionId/cancel',  requireMember, paymentController.postCheckoutCancel);
  publicRouter.post('/payments/checkout/:sessionId/decline', requireMember, paymentController.postCheckoutDecline);
}
