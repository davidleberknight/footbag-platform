/**
 * Every place the application writes after reaching outside itself, and what
 * proves a failure there loses nothing.
 *
 * The defect this inventory exists for lives after an earlier step has already
 * happened: a provider call succeeded and the write recording it fails, or a
 * row was claimed and the side effect that should go with it fails. A happy-path
 * test never reaches that state. The external calls are found through the
 * adapter getters (`get...Adapter()`), the one way a service reaches an
 * adapter, plus the single direct network call listed below; the companion
 * check in `tests/integration/fault-points.sweep.test.ts` counts those call
 * sites in `src/services` and fails on any this file does not account for, so
 * a new external call is classified the day it ships.
 *
 * Each site is one of:
 *
 * - `swept`: a fault test in the named file makes the write after the call
 *   fail, asserts nothing is lost, doubled or reported done, then retries and
 *   asserts the outcome lands exactly once;
 * - `knownDefect`: swept the same way, and the test pins the defect it found,
 *   so the fix fails the test until this entry is updated;
 * - `noWriteAfter`: the call reads, signs, or builds an address, and nothing
 *   the platform records depends on it having happened;
 * - `pending`: a write follows the call and no fault test covers it yet.
 */

export type FaultStatus =
  | { swept: string }
  | { knownDefect: string; swept: string }
  | { noWriteAfter: string }
  | { pending: string };

export interface AdapterSite {
  /** Repository-relative source file. */
  file: string;
  /** The adapter getter called there. */
  getter: string;
  /** The operation it serves, by its function or method name. */
  operation: string;
  status: FaultStatus;
}

const SWEEP = 'tests/integration/fault-points.sweep.test.ts';
const WEBHOOK_SWEEP = 'tests/integration/paymentWebhook.fault-injection.sweep.test.ts';

const ADDRESS_ONLY = 'builds a public address from a storage key; no call leaves the process';
const CONSTRUCTS_SERVICE = 'hands the adapter to a service factory; the calls it makes are the factory\'s own sites below it';

export const ADAPTER_SITES: AdapterSite[] = [
  // ── Payments ──────────────────────────────────────────────────────────────
  {
    file: 'src/services/paymentService.ts', getter: 'getPaymentAdapter', operation: 'startMembershipPurchase',
    status: {
      swept: SWEEP,
      knownDefect: 'the payment row and its checkout audit row are written as two statements outside one transaction, so a failed audit write leaves a pending payment no audit row describes, and the retry is refused as a purchase already in progress',
    },
  },
  {
    file: 'src/services/paymentService.ts', getter: 'getPaymentAdapter', operation: 'handleWebhook',
    status: { swept: WEBHOOK_SWEEP },
  },
  {
    file: 'src/services/paymentService.ts', getter: 'getPaymentAdapter', operation: 'releaseAbandonedCheckout',
    status: { noWriteAfter: 'expires an abandoned provider session as a courtesy; a failure is logged and nothing is recorded either way' },
  },
  {
    file: 'src/services/paymentService.ts', getter: 'getPaymentAdapter', operation: 'startDonation',
    status: {
      swept: SWEEP,
      knownDefect: 'the pending donation row (or pending subscription row) and its checkout audit row are written as two statements outside one transaction, so a failed audit write leaves an orphan pending row no audit row describes, and the retry writes a second one',
    },
  },
  {
    file: 'src/services/paymentService.ts', getter: 'getPaymentAdapter', operation: 'cancelRecurringDonation',
    status: {
      swept: SWEEP,
      knownDefect: 'the cancellation audit row is written after the transaction that records the request, so a failed audit write reports failure for a cancellation the provider and the ledger both hold, the retry answers already-requested, and neither the audit row nor the member\'s confirmation mail is ever written',
    },
  },
  {
    file: 'src/services/paymentService.ts', getter: 'getPaymentAdapter', operation: 'stubCheckoutSessionFor',
    status: { noWriteAfter: 'reads a session from the stub provider used outside production; nothing is written' },
  },
  {
    file: 'src/services/paymentReconciliationService.ts', getter: 'getPaymentAdapter', operation: 'runReconciliation',
    status: { pending: 'reads provider records and then writes discrepancy rows and the run record; a fault between them is not yet injected' },
  },
  {
    file: 'src/services/paymentsHealthService.ts', getter: 'getPaymentAdapter', operation: 'loadedCredentialMode',
    status: { noWriteAfter: 'reports which credential mode the adapter loaded; no call leaves the process' },
  },

  // ── Mail and notification feeds ───────────────────────────────────────────
  {
    file: 'src/services/communicationService.ts', getter: 'getSesAdapter', operation: 'getCommunicationService',
    status: { swept: 'tests/integration/communication-service.test.ts' },
  },
  {
    file: 'src/services/simulatedEmailService.ts', getter: 'getSesAdapter', operation: 'getEmailPreview',
    status: { noWriteAfter: 'initialises the stub sender to read back captured mail outside production' },
  },
  {
    file: 'src/services/operationsPlatformService.ts', getter: 'getNotificationFeedAdapter', operation: 'runNotificationFeeds',
    status: { pending: 'receives queued bounce, complaint and alarm notices, records each under its message id, then deletes it from the queue; a fault between the record and the delete is not yet injected' },
  },

  // ── Media storage ─────────────────────────────────────────────────────────
  {
    file: 'src/services/accountDeletionService.ts', getter: 'getMediaStorageAdapter', operation: 'getDefaultAccountDeletionService',
    status: { pending: 'the deletion removes each item\'s stored objects and then its row, one item at a time; a fault on the row delete after the objects are gone is not yet injected' },
  },
  {
    file: 'src/services/mediaModerationService.ts', getter: 'getMediaStorageAdapter', operation: 'getDefaultMediaModerationService',
    status: { pending: 'a takedown settles the decision, then removes stored objects and records a failed removal as a work item; a fault on that work item write is not yet injected' },
  },
  {
    file: 'src/services/avatarService.ts', getter: 'getMediaStorageAdapter', operation: 'getDefaultAvatarService',
    status: { pending: 'an avatar upload stores processed images and then writes the media row and the member\'s avatar pointer; a fault on those writes after the store is not yet injected' },
  },
  {
    file: 'src/services/avatarService.ts', getter: 'getImageProcessingAdapter', operation: 'getDefaultAvatarService',
    status: { noWriteAfter: CONSTRUCTS_SERVICE },
  },
  { file: 'src/services/avatarService.ts', getter: 'getMediaStorageAdapter', operation: 'buildAvatarUrl', status: { noWriteAfter: ADDRESS_ONLY } },
  {
    file: 'src/services/curatorMediaService.ts', getter: 'getMediaStorageAdapter', operation: 'getDefaultCuratorMediaService',
    status: { pending: 'a curator upload stores objects and then writes the media rows and tags; a fault on those writes after the store is not yet injected' },
  },
  {
    file: 'src/services/curatorMediaService.ts', getter: 'getImageProcessingAdapter', operation: 'getDefaultCuratorMediaService',
    status: { noWriteAfter: CONSTRUCTS_SERVICE },
  },
  {
    file: 'src/services/curatorMediaService.ts', getter: 'getVideoTranscodingAdapter', operation: 'videoTranscoder',
    status: { pending: 'a curator video is transcoded and then its job and media rows are written; a fault after the transcode is not yet injected' },
  },
  { file: 'src/services/mediaService.ts', getter: 'getMediaStorageAdapter', operation: 'buildItemPage', status: { noWriteAfter: ADDRESS_ONLY } },
  { file: 'src/services/mediaService.ts', getter: 'getMediaStorageAdapter', operation: 'getNamedGalleryPage', status: { noWriteAfter: ADDRESS_ONLY } },
  { file: 'src/services/mediaService.ts', getter: 'getMediaStorageAdapter', operation: 'getMediaBrowsePage', status: { noWriteAfter: ADDRESS_ONLY } },
  { file: 'src/services/mediaService.ts', getter: 'getMediaStorageAdapter', operation: 'listRecentCommunityMedia', status: { noWriteAfter: ADDRESS_ONLY } },
  { file: 'src/services/freestyleService.ts', getter: 'getMediaStorageAdapter', operation: 'shapeReferenceMedia', status: { noWriteAfter: ADDRESS_ONLY } },
  { file: 'src/services/siteMediaService.ts', getter: 'getMediaStorageAdapter', operation: 'shapeVideo', status: { noWriteAfter: ADDRESS_ONLY } },
  { file: 'src/services/siteMediaService.ts', getter: 'getMediaStorageAdapter', operation: 'shapePhotoUrl', status: { noWriteAfter: ADDRESS_ONLY } },

  // ── Secrets, signing and verification ─────────────────────────────────────
  {
    file: 'src/services/adminBootstrapService.ts', getter: 'getSecretsAdapter', operation: 'claimBootstrapAdmin (read)',
    status: { noWriteAfter: 'reads the one-time token before anything is granted; a failed read grants nothing' },
  },
  {
    file: 'src/services/adminBootstrapService.ts', getter: 'getSecretsAdapter', operation: 'claimBootstrapAdmin (delete)',
    status: { pending: 'the token is deleted after the grant commits and a failed delete raises an operational error; that failure branch is not yet injected here' },
  },
  {
    file: 'src/services/dataOriginService.ts', getter: 'getSecretsAdapter', operation: 'initDataOrigin',
    status: { noWriteAfter: 'reads the go-live marker; nothing is written' },
  },
  {
    file: 'src/services/identityAccessService.ts', getter: 'getCaptchaAdapter', operation: 'verifyHumanChallenge',
    status: { noWriteAfter: 'verifies a challenge answer before any account is read; nothing is written' },
  },
  {
    file: 'src/services/jwtService.ts', getter: 'getJwtSigningAdapter', operation: 'createSessionJwt',
    status: { noWriteAfter: 'signs a session token; the caller writes nothing that depends on the signature' },
  },
];

/** Network calls a service makes without an adapter, each named here. */
export const DIRECT_NETWORK_CALLS: Array<{ file: string; operation: string; status: FaultStatus }> = [
  {
    file: 'src/services/transcodeDispatchClient.ts',
    operation: 'dispatch',
    status: { pending: 'pushes a queued media job to the worker; the job row is written before the push, and a failed push leaving the job for the worker\'s own sweep is not yet injected' },
  },
];

/**
 * Webhook events each write after their idempotency claim. They are swept by
 * the webhook suite, which reads the provider's required-event list itself and
 * fails on an event with no row.
 */
export const WEBHOOK_EVENT_SWEEP = WEBHOOK_SWEEP;
