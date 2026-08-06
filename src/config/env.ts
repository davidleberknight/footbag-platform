/**
 * Environment configuration for the Footbag platform.
 *
 * Canonical deploy-time configuration loader. Validates
 * required environment variables at module-load time so that
 * misconfiguration surfaces immediately at startup rather than at
 * first request. Expects dotenv to have been loaded before this module
 * is imported (i.e. `import 'dotenv/config'` must appear first in server.ts).
 *
 * Every module in src/ reads configuration through the exported `config`
 * singleton; no other module reads `process.env` directly. The singleton
 * is frozen after construction to prevent mutation.
 */
// The encoder bounds are defined by the transcode library and imported here
// rather than restated. The media container that runs that library is given
// none of this contract and cannot import this file, so the default has to be
// reachable from both sides; defining it once is what keeps the value this
// config validates and the value the encoder applies from drifting apart.
import { DEFAULT_FFMPEG_TIMEOUT_MS, DEFAULT_VIDEO_MAX_HEIGHT } from '../lib/videoProcessing';

/**
 * How long a transcode dispatch may spend politely waiting when the media
 * worker answers busy (a 503 with Retry-After: the concurrency slot is taken,
 * or the host is below its memory admission floor). Up to
 * TRANSCODE_BUSY_RETRIES waits of at most TRANSCODE_BUSY_WAIT_MAX_SECONDS
 * each, then the attempt fails through the normal retry path. Defined here so
 * the dispatcher and the lease cross-check below share one number: the job
 * lease has to outlast an attempt plus every wait it may legally take.
 */
export const TRANSCODE_BUSY_RETRIES = 3;
export const TRANSCODE_BUSY_WAIT_MAX_SECONDS = 60;
export const TRANSCODE_BUSY_WAIT_BUDGET_MS =
  TRANSCODE_BUSY_RETRIES * TRANSCODE_BUSY_WAIT_MAX_SECONDS * 1000;

export interface AppConfig {
  port: number;
  nodeEnv: string;
  logLevel: string;
  dbPath: string;
  publicBaseUrl: string;
  // True when this deployment answers on the canonical public host and its
  // pages belong in search indexes. False for every non-production environment
  // and for the temporary pre-cutover preview hostname, which serves the same
  // production build under a name that is withdrawn at cutover.
  searchIndexable: boolean;
  // Base URL of the members-only legacy archive (the preserved original
  // footbag.org, served by its own CloudFront distribution). The landing page
  // is the ONLY archive URL the platform ever emits; the mirror's interior
  // paths are the legacy site's URL space, never constructed platform-side.
  // Null when unset (dev/test default): archive-linking UI is omitted.
  archiveUrl: string | null;
  // Routes the Legacy Archive card through the platform's own login-gated
  // redirect (GET /archive) instead of linking the archive host directly.
  // Set only where the archive edge cannot validate a platform session: two
  // sibling cloudfront.net hosts can never share a cookie (public-suffix
  // rule), so such a deployment gates archive access by platform login and
  // serves its archive edge ungated. False by default: deployments with a
  // shared parent domain keep the direct link and the edge-gated design.
  archiveLoginRedirect: boolean;
  // Archive signed-cookie issuance. When a signer is configured, every
  // session-cookie issue site also mints the three CloudFront-* cookies that
  // the archive edge's trusted key group validates, and logout clears all
  // four. Null (the default) issues no archive cookies: a deployment stays
  // on whatever other access shape it runs (the login-gated redirect, or no
  // archive at all). 'ssm' reads the signing key from the secrets adapter at
  // boot (deployed environments); 'local' loads or creates a PEM file (dev
  // and test).
  archiveCookieSigner: 'ssm' | 'local' | null;
  // CloudFront public-key id (the CloudFront-Key-Pair-Id cookie value).
  // Required for 'ssm'; 'local' defaults a synthetic id.
  archiveKeyPairId: string | undefined;
  archiveSigningKeyPath: string;
  // Parent-domain scope for the archive cookies (production:
  // '.footbag.org'). Unset, the cookies are host-only, which is correct
  // everywhere a parent domain shared with the archive host does not exist.
  archiveCookieDomain: string | undefined;
  sessionSecret: string;
  mediaDir: string;
  curatedMediaDir: string;
  jwtSigner: 'kms' | 'local';
  jwtKmsKeyId: string | undefined;
  jwtLocalKeypairPath: string;
  awsRegion: string | undefined;
  sesAdapter: 'live' | 'stub';
  sesFromIdentity: string | undefined;
  // Production arming switch for outbound email. 'dark' keeps production on
  // the stub adapter (mail captured in memory, simulated-email card renders,
  // nothing delivered), exactly like staging; 'armed' requires the live
  // adapter with every strict check. Inert below production. Mandatory to
  // set explicitly in production-hardened boots; the deploy syncs it from
  // the SSM app/email_send_armed parameter and derives sesAdapter from it.
  emailSendArmed: 'armed' | 'dark';
  safeBrowsingAdapter: 'live' | 'stub';
  // CaptchaAdapter: server-side Cloudflare Turnstile verification on
  // claim-initiation surfaces. 'live' calls Turnstile siteverify (secret via
  // SecretsAdapter); 'stub' passes locally. Required to be explicit in prod.
  captchaAdapter: 'live' | 'stub';
  // Public Turnstile site key, rendered into the claim form widget. Null in
  // stub/dev (no widget); required when captchaAdapter is 'live'.
  turnstileSiteKey: string | null;
  // SecretsAdapter: Node consumers read SSM-stored third-party secrets
  // through this adapter. 'live' calls SSM GetParameter; 'stub' is an
  // in-memory map for tests; 'local' reads .local/secrets.json (gitignored
  // operator-local file co-located with .local/initial-admins.txt and the
  // .local/*-admin-seed.json files). Required to be explicit in production.
  secretsAdapter: 'live' | 'stub' | 'local';
  // Environment label used to derive SSM parameter prefixes for the live
  // SecretsAdapter (e.g. 'staging' → '/footbag/staging/secrets/...').
  // Required when secretsAdapter === 'live'. Must match the deploy-side
  // FOOTBAG_ENV reconciled into /srv/footbag/env.
  footbagEnv: 'staging' | 'production' | 'development' | undefined;
  // Derived: '/footbag/${footbagEnv}'. Undefined when footbagEnv is unset
  // (dev with secretsAdapter !== 'live').
  ssmPrefix: string | undefined;
  // Outbound-HEAD reachability check for user-supplied external URLs
  // (DD §3.17). 'live' performs HEAD with redirect-follow + per-hop SSRF
  // re-check; 'stub' consults in-memory state for tests/dev; 'disabled'
  // is a no-op for deployments that want zero outbound HTTP from the
  // validation path. Required to be explicit in production.
  httpReachabilityAdapter: 'live' | 'stub' | 'disabled';
  // Curator gallery sidecar writes target /curated/galleries/<slug>.json
  // which is the seed source-of-truth in git. Permitted in dev only;
  // staging/prod admin edits mutate the DB but skip the file write
  // because the deployed /curated/ tree is part of the build artifact.
  allowCuratedSidecarWrites: boolean;
  // Absolute path overriding the curated-media root directory. Lets a
  // non-test process (the e2e stack) redirect curated reads and writes to
  // a throwaway directory so they never touch the committed /curated/
  // tree. Null when unset; production falls through to <repo-root>/curated.
  curatedRootDirOverride: string | null;
  // Maximum number of external URLs that can be attached to a single
  // gallery. Distinct from the DD §3.17 per-profile cap (3) — galleries
  // and items have their own caps, tunable by the operator. Service
  // validates submitted count <= cap; form renders that many slots.
  galleryMaxExternalLinks: number;
  imageProcessorUrl: string;
  imageMaxConcurrent: number;
  imagePort: number;
  imageProcessTimeoutMs: number;
  // Video transcode HTTP boundary. Defaults to imageProcessorUrl because the
  // same worker container hosts both Sharp and ffmpeg. Separate config keys
  // allow a future split to a dedicated video container with a single
  // operator change.
  videoProcessorUrl: string;
  videoTranscodeTimeoutMs: number;
  mediaStorageAdapter: 's3' | 'local';
  mediaStorageS3Bucket: string | undefined;
  // TTL for presigned PUT URLs the browser uses to upload curator video bytes
  // directly to S3. 15 min (900s) gives generous wall-clock for picking files,
  // filling the form, and uploading on a slow link without leaving long-lived
  // signed URLs sitting in browser history.
  mediaPresignedPutTtlSeconds: number;
  // S3 prefix for pending-upload objects. The worker deletes objects under this
  // prefix on success; an S3 lifecycle rule expires orphans (24h) as defense in
  // depth. Lowercase letters, digits, underscores, ending with a slash.
  mediaPendingUploadPrefix: string;
  // Port the worker container's HTTP dispatch server binds to. Reachable only
  // from the docker internal network; web container POSTs to ${workerInternalUrl}
  // when a finalize request is ready to be transcoded.
  workerInternalPort: number;
  // URL the web container uses to dispatch jobs to the worker (intra-docker).
  // Required when MEDIA_STORAGE_ADAPTER=s3 (production-like flow); defaults to
  // http://localhost:${workerInternalPort} for local dev.
  workerInternalUrl: string;
  // URL the worker container uses to call back into the web container for job
  // event notifications. Required in production.
  webInternalUrl: string;
  // Shared secret for the worker<->web internal-event channel. Always
  // required: the /ipc router that trusts it is always mounted.
  internalEventSecret: string;
  sesFeedbackWebhookKey: string | undefined;
  // Lease duration for a worker's claim on a media_jobs row. Worker boot-time
  // recovery considers any 'processing' row whose lease has expired to be
  // orphaned by a crash and resets it to pending_transcode for re-dispatch.
  mediaJobLeaseSeconds: number;
  // Maximum total attempts before a media job transitions to terminal 'failed'.
  // Today every failure is terminal (max=1). Reserved for later work that
  // wants in-process retry on transient S3/ffmpeg blips.
  mediaJobMaxRetries: number;
  // Output height ceiling for curator video, in pixels. Never upscales, so a
  // source at or below it passes through unscaled. This is the lever that
  // bounds per-frame encoding cost: measured on the same source, 1080p costs
  // about 2.1x what 720p does, which on a two-vCPU host is the difference
  // between roughly realtime and roughly twice realtime.
  videoMaxHeight: number;
  // Largest curator video accepted, in bytes. Sized so the pipeline can
  // actually transcode a file at the limit within the encoder's time budget on
  // the production host, rather than advertising a ceiling that fails at the
  // top of its own range. Raising it without also raising the time budget, or
  // moving to a faster preset or a bigger worker, reintroduces that mismatch.
  videoMaxBytes: number;
  // Ceiling on a single ffmpeg run in the curator transcode pipeline. A
  // malformed input can put the encoder into a loop that consumes a core and
  // produces nothing; unbounded, that holds the worker's video slot forever and
  // the job neither completes nor fails. Raise it on a slow host or for an
  // unusually long source.
  ffmpegTimeoutSeconds: number;
  // SSE heartbeat cadence (seconds). The status-page stream from web to admin
  // browser sends a heartbeat event at this interval to keep nginx and
  // CloudFront from idle-killing the connection during long transcodes.
  sseHeartbeatSeconds: number;
  // Operator-supplied initial-admin email list for the permanent dev/staging
  // register-allowlist bootstrap: each registering member whose email appears
  // here gets is_admin=1 plus an admin.dev_register_allowlist_grant audit row.
  // Default is .local/initial-admins.txt (gitignored); production reads are
  // refused at the helper level regardless of this value.
  initialAdminFile: string;
  // Value for Express's `trust proxy` setting. Hosts set the exact
  // X-Forwarded-For hop count of the proxy chain in front of the app
  // (nginx + CloudFront = 2; the clean-cutover chain has no additional
  // front-door hop) so req.ip resolves to the real client. Unset in
  // production falls back to the named IP ranges, which fail closed: the
  // trust walk stops at CloudFront's public edge address, so req.ip becomes
  // the edge IP and per-IP rate limiting coarsens to per-edge buckets.
  // Outside production: 0 unless overridden. The boolean form is refused at
  // boot (it would trust every forwarded hop).
  trustProxy: number | string;
  // Test-only password-hashing cost switch. When true, hashPassword() uses a
  // cheap argon2 profile so the suite does not run memory-hard hashing across
  // ~20 parallel forks (which oversubscribes RAM/threads and times out
  // unrelated boot hooks). env.ts refuses to enable it outside the Vitest
  // runner, so it is unreachable in development/staging/production.
  useCheapPasswordHash: boolean;
  // PaymentAdapter selector. 'live' wraps the Stripe SDK; the live factory is
  // implemented and resolves the API key lazily from SSM, so activation pends a
  // real Stripe key in SSM plus STRIPE_WEBHOOK_SECRET, not further code.
  // 'stub' is a programmable in-memory simulation that exercises the same
  // Stripe-shaped webhook plumbing end-to-end. Required to be explicit in
  // production; the paymentsArmed switch selects which value production
  // requires, and the live SDK boots only on production.
  paymentAdapter: 'live' | 'stub';
  // Production arming switch for payments. 'dark' keeps production on the
  // stub adapter (checkout flows clickable, no real money can move), exactly
  // like staging; 'armed' requires the live adapter with every strict check.
  // Inert below production. Mandatory to set explicitly in
  // production-hardened boots; the deploy syncs it from the SSM
  // app/payments_armed parameter and derives paymentAdapter from it.
  paymentsArmed: 'armed' | 'dark';
  // Stripe webhook signing secret. Required when paymentAdapter='live' (the
  // live verifier validates inbound Stripe-Signature headers against it).
  // Undefined in stub mode, which signs and verifies with
  // stripeWebhookSecretStub instead. Production refuses a stub-prefixed value.
  stripeWebhookSecret: string | undefined;
  // The outgoing secret during a Stripe secret roll. Stripe signs each delivery
  // with both secrets for the length of the roll window; accepting both is what
  // lets the rotation happen without dropping deliveries. Unset outside a roll.
  stripeWebhookSecretPrevious: string | undefined;
  // Per-deployment signing secret for the stub payment adapter. The stub's
  // fallback constant is committed source, so any host that kept it would
  // accept a webhook forged by anyone holding a checkout of this repository.
  // Required wherever the stub serves a deployed host (staging, and
  // production while payments are dark); undefined in development and test,
  // where the adapter falls back to its own constant.
  stripeWebhookSecretStub: string | undefined;
  // Test-only override for container memory-utilization readings. When set,
  // OperationsPlatformService.readContainerMemoryUsedPercent returns this
  // value instead of reading /sys/fs/cgroup/memory.{max,current}, so tests
  // can drive readiness gating without manipulating real cgroup state.
  //   - undefined: no override (read real cgroup)
  //   - null:      simulates "cgroup unavailable"
  //   - number:    simulates that utilization percent
  // Boot-time guard refuses production start with this var set; an env
  // injection in production must not be able to forge readiness state.
  testMemoryPercent: number | null | undefined;
  // True when the process runs inside the Vitest test runner. The live SES
  // and payment adapter accessors refuse to resolve while it is set, so no
  // test driving the application path can send real mail or move real money.
  isTestRunner: boolean;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

// Enum-valued selector vars are compared against exact literals, so a trailing
// newline or space from a hand-edited host env file (a CRLF paste is the common
// case) would refuse an otherwise-correct boot. Outer whitespace is never
// significant in these values; strip it before comparing, and treat a
// whitespace-only value as unset.
function trimmedEnv(name: string): string | undefined {
  const value = process.env[name];
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
}

function loadConfig(): AppConfig {
  const rawPort = requireEnv('PORT');
  const port = parseInt(rawPort, 10);
  if (isNaN(port) || port < 1 || port > 65535) {
    throw new Error(`PORT must be a valid integer between 1 and 65535, got: ${rawPort}`);
  }

  const nodeEnv = requireEnv('NODE_ENV').trim();
  const isProd = nodeEnv === 'production';

  const rawJwtSigner = trimmedEnv('JWT_SIGNER');
  let jwtSigner: 'kms' | 'local';
  if (rawJwtSigner === 'kms' || rawJwtSigner === 'local') {
    jwtSigner = rawJwtSigner;
  } else if (rawJwtSigner) {
    throw new Error(`JWT_SIGNER must be 'kms' or 'local', got: ${rawJwtSigner}`);
  } else if (isProd) {
    throw new Error('JWT_SIGNER must be set explicitly in production (no default)');
  } else {
    jwtSigner = 'local';
  }

  const jwtKmsKeyId = process.env.JWT_KMS_KEY_ID || undefined;
  if (jwtSigner === 'kms' && !jwtKmsKeyId) {
    throw new Error('JWT_KMS_KEY_ID is required when JWT_SIGNER=kms');
  }

  const jwtLocalKeypairPath =
    process.env.JWT_LOCAL_KEYPAIR_PATH || 'database/dev-jwt-keypair.pem';

  const rawSesAdapter = trimmedEnv('SES_ADAPTER');
  let sesAdapter: 'live' | 'stub';
  if (rawSesAdapter === 'live' || rawSesAdapter === 'stub') {
    sesAdapter = rawSesAdapter;
  } else if (rawSesAdapter) {
    throw new Error(`SES_ADAPTER must be 'live' or 'stub', got: ${rawSesAdapter}`);
  } else if (isProd) {
    throw new Error('SES_ADAPTER must be set explicitly in production (no default)');
  } else {
    sesAdapter = 'stub';
  }

  const sesFromIdentity = process.env.SES_FROM_IDENTITY || undefined;
  if (sesAdapter === 'live' && !sesFromIdentity) {
    throw new Error('SES_FROM_IDENTITY is required when SES_ADAPTER=live');
  }

  const rawSafeBrowsingAdapter = trimmedEnv('SAFE_BROWSING_ADAPTER');
  let safeBrowsingAdapter: 'live' | 'stub';
  if (rawSafeBrowsingAdapter === 'live' || rawSafeBrowsingAdapter === 'stub') {
    safeBrowsingAdapter = rawSafeBrowsingAdapter;
  } else if (rawSafeBrowsingAdapter) {
    throw new Error(
      `SAFE_BROWSING_ADAPTER must be 'live' or 'stub', got: ${rawSafeBrowsingAdapter}`,
    );
  } else if (isProd) {
    throw new Error('SAFE_BROWSING_ADAPTER must be set explicitly in production (no default)');
  } else {
    safeBrowsingAdapter = 'stub';
  }

  const rawCaptchaAdapter = trimmedEnv('CAPTCHA_ADAPTER');
  let captchaAdapter: 'live' | 'stub';
  if (rawCaptchaAdapter === 'live' || rawCaptchaAdapter === 'stub') {
    captchaAdapter = rawCaptchaAdapter;
  } else if (rawCaptchaAdapter) {
    throw new Error(
      `CAPTCHA_ADAPTER must be 'live' or 'stub', got: ${rawCaptchaAdapter}`,
    );
  } else if (isProd) {
    // Mandatory-explicit under prod-mode boots, like the sibling adapter
    // selectors: a silent stub default on a production host would answer
    // "you are human" to every request, leaving only the in-process rate
    // limiter against credential stuffing. Staging declares stub
    // deliberately (the compose passthrough supplies it); production
    // declares live, enforced by the FOOTBAG_ENV=production gate further
    // down after footbagEnv is derived.
    throw new Error('CAPTCHA_ADAPTER must be set explicitly in production (no default)');
  } else {
    // Default off (stub) below prod-mode: dev and test run the stub
    // ("you are human").
    captchaAdapter = 'stub';
  }
  const turnstileSiteKey = process.env.TURNSTILE_SITE_KEY ?? null;
  if (captchaAdapter === 'live' && !turnstileSiteKey) {
    throw new Error('TURNSTILE_SITE_KEY is required when CAPTCHA_ADAPTER=live');
  }

  const rawSecretsAdapter = trimmedEnv('SECRETS_ADAPTER');
  let secretsAdapter: 'live' | 'stub' | 'local';
  if (
    rawSecretsAdapter === 'live' ||
    rawSecretsAdapter === 'stub' ||
    rawSecretsAdapter === 'local'
  ) {
    secretsAdapter = rawSecretsAdapter;
  } else if (rawSecretsAdapter) {
    throw new Error(
      `SECRETS_ADAPTER must be 'live', 'stub', or 'local', got: ${rawSecretsAdapter}`,
    );
  } else if (isProd) {
    throw new Error('SECRETS_ADAPTER must be set explicitly in production (no default)');
  } else {
    secretsAdapter = 'local';
  }

  const rawFootbagEnv = trimmedEnv('FOOTBAG_ENV');
  let footbagEnv: 'staging' | 'production' | 'development' | undefined;
  if (
    rawFootbagEnv === 'staging' ||
    rawFootbagEnv === 'production' ||
    rawFootbagEnv === 'development'
  ) {
    footbagEnv = rawFootbagEnv;
  } else if (rawFootbagEnv) {
    throw new Error(
      `FOOTBAG_ENV must be 'staging', 'production', or 'development', got: ${rawFootbagEnv}`,
    );
  } else {
    footbagEnv = undefined;
  }

  if (secretsAdapter === 'live' && !footbagEnv) {
    throw new Error(
      'FOOTBAG_ENV is required when SECRETS_ADAPTER=live (used to derive the SSM parameter prefix)',
    );
  }

  // Cross-invariant: production-grade FOOTBAG_ENV values require
  // NODE_ENV=production. Without this, a staging boot that retains
  // NODE_ENV=development silently collapses the entire production-hardening
  // surface in one go (TRUST_PROXY=0, weak SESSION_SECRET accepted,
  // INTERNAL_EVENT_SECRET defaulted to a known-public literal,
  // MEDIA_STORAGE_ADAPTER defaulted to local, IMAGE_PROCESSOR_URL defaulted
  // to localhost). One assertion catches the cluster.
  if ((footbagEnv === 'staging' || footbagEnv === 'production') && !isProd) {
    throw new Error(
      `FOOTBAG_ENV=${footbagEnv} requires NODE_ENV=production (got NODE_ENV=${nodeEnv}). Mixed envs collapse production hardening (TRUST_PROXY, SESSION_SECRET strength, INTERNAL_EVENT_SECRET defaults).`,
    );
  }

  // The reverse direction: a real prod-mode boot must declare which deployment
  // environment it is. Every FOOTBAG_ENV-keyed production mandate (the live
  // CAPTCHA gate, arming/adapter coherence, the live-SDK refusals below)
  // silently skips when footbagEnv is undefined, so a hand-run production boot
  // that forgot the var would come up with stub protections and zero arming
  // checks. The Vitest carve-out keeps bare test boots bootable: the suite
  // pins NODE_ENV=production for hardening parity without simulating any
  // deployment, the same shape as the FOOTBAG_CHEAP_PASSWORD_HASH test-only
  // switch below.
  if (isProd && !footbagEnv && !process.env.VITEST) {
    throw new Error(
      "FOOTBAG_ENV must be set explicitly when NODE_ENV=production ('staging', 'production', or 'development'); the deploy sync writes it into /srv/footbag/env, and without it every FOOTBAG_ENV-keyed production mandate silently skips",
    );
  }

  // The session-signing key must be the non-exportable KMS key in production:
  // the 'local' backend signs with an on-disk PEM, which silently replaces the
  // key-never-leaves-KMS threat model with a file an attacker could read.
  if (footbagEnv === 'production' && jwtSigner !== 'kms') {
    throw new Error(
      `JWT_SIGNER must be 'kms' when FOOTBAG_ENV=production (got '${jwtSigner}'); the local PEM signer replaces the non-exportable KMS signing key`,
    );
  }

  // Arming switches: one per real-world side effect (outbound email,
  // payments). 'dark' keeps the side on its stub adapter in production,
  // staging-like, so the full flows run with no mail delivered and no money
  // moved; 'armed' requires the live adapter with every strict check. The
  // deploy derives the production adapter values from these flags; the guards
  // below make a flag/adapter mismatch a boot failure rather than a silent
  // surprise. Inert below production, where the stub mandates apply
  // regardless of the flag values.
  const rawEmailSendArmed = trimmedEnv('EMAIL_SEND_ARMED');
  let emailSendArmed: 'armed' | 'dark';
  if (rawEmailSendArmed === 'armed' || rawEmailSendArmed === 'dark') {
    emailSendArmed = rawEmailSendArmed;
  } else if (rawEmailSendArmed) {
    throw new Error(`EMAIL_SEND_ARMED must be 'armed' or 'dark', got: ${rawEmailSendArmed}`);
  } else if (isProd) {
    throw new Error('EMAIL_SEND_ARMED must be set explicitly in production (no default)');
  } else {
    emailSendArmed = 'armed';
  }

  const rawPaymentsArmed = trimmedEnv('PAYMENTS_ARMED');
  let paymentsArmed: 'armed' | 'dark';
  if (rawPaymentsArmed === 'armed' || rawPaymentsArmed === 'dark') {
    paymentsArmed = rawPaymentsArmed;
  } else if (rawPaymentsArmed) {
    throw new Error(`PAYMENTS_ARMED must be 'armed' or 'dark', got: ${rawPaymentsArmed}`);
  } else if (isProd) {
    throw new Error('PAYMENTS_ARMED must be set explicitly in production (no default)');
  } else {
    paymentsArmed = 'armed';
  }

  // SES adapter must match the deployment environment and the arming switch:
  // an armed production sends real email (live); a dark production captures
  // mail on the stub exactly like staging; development and staging use the
  // in-process stub so no real mail leaves those environments. FOOTBAG_ENV
  // (the deployment environment), not NODE_ENV, is the discriminator, because
  // dev containers pin NODE_ENV=production for hardening parity while still
  // running the stub.
  if (footbagEnv === 'production' && emailSendArmed === 'armed' && sesAdapter !== 'live') {
    throw new Error(
      `SES_ADAPTER must be 'live' when FOOTBAG_ENV=production and EMAIL_SEND_ARMED=armed (got '${sesAdapter}'); armed production sends real email`,
    );
  }
  if (footbagEnv === 'production' && emailSendArmed === 'dark' && sesAdapter !== 'stub') {
    throw new Error(
      `SES_ADAPTER must be 'stub' when FOOTBAG_ENV=production and EMAIL_SEND_ARMED=dark (got '${sesAdapter}'); dark production must not hold a live sender`,
    );
  }
  if (
    (footbagEnv === 'development' || footbagEnv === 'staging') &&
    sesAdapter !== 'stub'
  ) {
    throw new Error(
      `SES_ADAPTER must be 'stub' when FOOTBAG_ENV=${footbagEnv} (got '${sesAdapter}'); non-production must not send real email`,
    );
  }



  // Test-only password-hashing cost switch. Cheap hashing must be impossible in
  // any real process, so it is honoured only under the Vitest runner; '1'
  // anywhere else refuses boot. Keyed on process.env.VITEST, not NODE_ENV,
  // because tests deliberately set NODE_ENV=production.
  const rawCheapHash = process.env.FOOTBAG_CHEAP_PASSWORD_HASH;
  let useCheapPasswordHash: boolean;
  if (
    rawCheapHash === undefined ||
    rawCheapHash === '' ||
    rawCheapHash === '0' ||
    rawCheapHash === 'false'
  ) {
    useCheapPasswordHash = false;
  } else if (rawCheapHash === '1' || rawCheapHash === 'true') {
    if (!process.env.VITEST) {
      throw new Error(
        'FOOTBAG_CHEAP_PASSWORD_HASH is a test-only switch that weakens password hashing; it is refused outside the Vitest runner (process.env.VITEST is unset).',
      );
    }
    useCheapPasswordHash = true;
  } else {
    throw new Error(
      `FOOTBAG_CHEAP_PASSWORD_HASH must be '1', '0', 'true', or 'false', got: ${rawCheapHash}`,
    );
  }

  // Fail-fast guard for FOOTBAG_DEV_INITIAL_ADMIN_EMAILS, the permanent
  // dev/staging register-allowlist bootstrap. Any production process seeing this
  // var is mis-configured and must refuse to start; the deploy pipeline also
  // refuses to write the value into /srv/footbag/env on a production host
  // (second line of defense). Production first-admin uses the separate
  // single-shot SSM-token claim path, which is also the break-glass recovery
  // path after total admin loss.
  const rawDevInitialAdminEmails = process.env.FOOTBAG_DEV_INITIAL_ADMIN_EMAILS;
  if (
    rawDevInitialAdminEmails &&
    rawDevInitialAdminEmails.trim() &&
    footbagEnv !== 'development' &&
    footbagEnv !== 'staging'
  ) {
    throw new Error(
      `FOOTBAG_DEV_INITIAL_ADMIN_EMAILS is dev/staging-only; set FOOTBAG_ENV to development or staging, or unset the var (got FOOTBAG_ENV=${footbagEnv ?? '<unset>'}). Production-first-admin uses the SSM-token claim path.`,
    );
  }

  const ssmPrefix = footbagEnv ? `/footbag/${footbagEnv}` : undefined;

  const rawHttpReachability = trimmedEnv('HTTP_REACHABILITY_ADAPTER');
  let httpReachabilityAdapter: 'live' | 'stub' | 'disabled';
  if (
    rawHttpReachability === 'live' ||
    rawHttpReachability === 'stub' ||
    rawHttpReachability === 'disabled'
  ) {
    httpReachabilityAdapter = rawHttpReachability;
  } else if (rawHttpReachability) {
    throw new Error(
      `HTTP_REACHABILITY_ADAPTER must be 'live', 'stub', or 'disabled', got: ${rawHttpReachability}`,
    );
  } else if (isProd) {
    throw new Error(
      'HTTP_REACHABILITY_ADAPTER must be set explicitly in production (no default)',
    );
  } else {
    httpReachabilityAdapter = 'stub';
  }

  const rawAllowCuratedSidecar = trimmedEnv('ALLOW_CURATED_SIDECAR_WRITES');
  let allowCuratedSidecarWrites: boolean;
  if (rawAllowCuratedSidecar === undefined) {
    allowCuratedSidecarWrites = nodeEnv === 'development';
  } else if (rawAllowCuratedSidecar === '1' || rawAllowCuratedSidecar === 'true') {
    allowCuratedSidecarWrites = true;
  } else if (rawAllowCuratedSidecar === '0' || rawAllowCuratedSidecar === 'false') {
    allowCuratedSidecarWrites = false;
  } else {
    throw new Error(
      `ALLOW_CURATED_SIDECAR_WRITES must be '1', '0', 'true', or 'false', got: ${rawAllowCuratedSidecar}`,
    );
  }

  const rawCuratedRootDir = process.env.CURATED_ROOT_DIR;
  const curatedRootDirOverride =
    rawCuratedRootDir === undefined || rawCuratedRootDir.trim() === ''
      ? null
      : rawCuratedRootDir.trim();

  const rawGalleryMaxLinks = process.env.GALLERY_MAX_EXTERNAL_LINKS;
  let galleryMaxExternalLinks: number;
  if (rawGalleryMaxLinks === undefined || rawGalleryMaxLinks === '') {
    galleryMaxExternalLinks = 1;
  } else if (!/^\d+$/.test(rawGalleryMaxLinks)) {
    throw new Error(
      `GALLERY_MAX_EXTERNAL_LINKS must be a non-negative integer, got: ${rawGalleryMaxLinks}`,
    );
  } else {
    galleryMaxExternalLinks = parseInt(rawGalleryMaxLinks, 10);
    if (galleryMaxExternalLinks < 0 || galleryMaxExternalLinks > 100) {
      throw new Error(
        `GALLERY_MAX_EXTERNAL_LINKS must be between 0 and 100, got: ${rawGalleryMaxLinks}`,
      );
    }
  }

  const awsRegion = process.env.AWS_REGION || undefined;

  const rawImageUrl = process.env.IMAGE_PROCESSOR_URL;
  let imageProcessorUrl: string;
  if (rawImageUrl) {
    imageProcessorUrl = rawImageUrl;
  } else if (isProd) {
    throw new Error('IMAGE_PROCESSOR_URL must be set explicitly in production (no default)');
  } else {
    imageProcessorUrl = 'http://localhost:4001';
  }

  const rawMediaStorage = trimmedEnv('MEDIA_STORAGE_ADAPTER');
  let mediaStorageAdapter: 's3' | 'local';
  if (rawMediaStorage === 's3' || rawMediaStorage === 'local') {
    mediaStorageAdapter = rawMediaStorage;
  } else if (rawMediaStorage) {
    throw new Error(
      `MEDIA_STORAGE_ADAPTER must be 's3' or 'local', got: ${rawMediaStorage}`,
    );
  } else if (isProd) {
    throw new Error(
      'MEDIA_STORAGE_ADAPTER must be set explicitly in production (no default)',
    );
  } else {
    mediaStorageAdapter = 'local';
  }

  const mediaStorageS3Bucket = process.env.MEDIA_STORAGE_S3_BUCKET || undefined;
  if (mediaStorageAdapter === 's3' && !mediaStorageS3Bucket) {
    throw new Error(
      'MEDIA_STORAGE_S3_BUCKET is required when MEDIA_STORAGE_ADAPTER=s3',
    );
  }

  if (
    (jwtSigner === 'kms' ||
      sesAdapter === 'live' ||
      secretsAdapter === 'live' ||
      mediaStorageAdapter === 's3') &&
    !awsRegion
  ) {
    throw new Error(
      'AWS_REGION is required when JWT_SIGNER=kms, SES_ADAPTER=live, SECRETS_ADAPTER=live, or MEDIA_STORAGE_ADAPTER=s3',
    );
  }

  const rawPaymentAdapter = trimmedEnv('PAYMENT_ADAPTER');
  let paymentAdapter: 'live' | 'stub';
  if (rawPaymentAdapter === 'live' || rawPaymentAdapter === 'stub') {
    paymentAdapter = rawPaymentAdapter;
  } else if (rawPaymentAdapter) {
    throw new Error(
      `PAYMENT_ADAPTER must be 'live' or 'stub', got: ${rawPaymentAdapter}`,
    );
  } else if (isProd) {
    throw new Error('PAYMENT_ADAPTER must be set explicitly in production (no default)');
  } else {
    paymentAdapter = 'stub';
  }
  // Gate on the deployment environment (FOOTBAG_ENV), not NODE_ENV: staging pins
  // NODE_ENV=production for hardening parity while legitimately running the stub
  // adapter (same discriminator the SES guard above uses). The live payment SDK
  // is refused outside production exactly as live SES is: no deployed
  // non-production environment reaches real Stripe, test mode included; every
  // real-Stripe exercise runs on pre-cutover production. Within production the
  // arming switch selects the mandate.
  if (
    (footbagEnv === 'development' || footbagEnv === 'staging') &&
    paymentAdapter === 'live'
  ) {
    throw new Error(
      `PAYMENT_ADAPTER must be 'stub' when FOOTBAG_ENV=${footbagEnv} (got 'live'); no environment below production reaches the live payment SDK`,
    );
  }
  if (footbagEnv === 'production' && paymentsArmed === 'armed' && paymentAdapter !== 'live') {
    throw new Error(
      "PAYMENT_ADAPTER='stub' is forbidden in production when PAYMENTS_ARMED=armed; use PAYMENT_ADAPTER=live (requires the real Stripe key in SSM plus STRIPE_WEBHOOK_SECRET)",
    );
  }
  if (footbagEnv === 'production' && paymentsArmed === 'dark' && paymentAdapter !== 'stub') {
    throw new Error(
      "PAYMENT_ADAPTER must be 'stub' when FOOTBAG_ENV=production and PAYMENTS_ARMED=dark; dark production must not hold the live payment SDK",
    );
  }

  // The Stripe webhook signing secret reaches the host env file from its
  // Parameter Store shell via the deploy sync (both deploy halves): a real
  // parameter value is authoritative on every deploy, and while the
  // parameter still holds its bootstrap placeholder the sync leaves the
  // script-installed host value in place.
  const stripeWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET || undefined;
  if (paymentAdapter === 'live' && !stripeWebhookSecret) {
    throw new Error(
      "STRIPE_WEBHOOK_SECRET is required when PAYMENT_ADAPTER='live'",
    );
  }
  if (isProd && stripeWebhookSecret?.startsWith('whsec_stub')) {
    throw new Error(
      'STRIPE_WEBHOOK_SECRET must not be a stub secret in production (whsec_stub-prefixed values are dev/test only)',
    );
  }
  // The outgoing secret during a rotation. Stripe signs every delivery with both
  // the old and the new secret for the length of the roll window, precisely so
  // an endpoint can cut over without dropping deliveries. Accepting only one
  // secret means a rotation fails every delivery until the deploy lands, which
  // is the outage the webhook-failure alarm was built to catch. Optional, and
  // cleared once the roll window closes.
  const stripeWebhookSecretPrevious = process.env.STRIPE_WEBHOOK_SECRET_PREVIOUS || undefined;
  if (isProd && stripeWebhookSecretPrevious?.startsWith('whsec_stub')) {
    throw new Error(
      'STRIPE_WEBHOOK_SECRET_PREVIOUS must not be a stub secret in production (whsec_stub-prefixed values are dev/test only)',
    );
  }
  // The stub adapter's fallback signing secret is a committed constant, so a
  // deployed host that keeps it accepts webhooks forged by anyone with a copy
  // of this repository. Staging and dark production run the stub against the
  // public internet and must therefore carry their own generated value, with
  // no fallback; dev and test are not reachable and keep the constant.
  const stripeWebhookSecretStub = process.env.STRIPE_WEBHOOK_SECRET_STUB || undefined;
  if (
    (footbagEnv === 'staging' || footbagEnv === 'production') &&
    paymentAdapter === 'stub' &&
    !stripeWebhookSecretStub
  ) {
    throw new Error(
      `STRIPE_WEBHOOK_SECRET_STUB is required when FOOTBAG_ENV=${footbagEnv} and PAYMENT_ADAPTER='stub' (the committed stub constant must not sign a reachable endpoint)`,
    );
  }

  function parseIntEnv(name: string, fallback: number, min: number, max: number): number {
    const raw = process.env[name];
    if (raw === undefined || raw === '') return fallback;
    if (!/^\d+$/.test(raw)) {
      throw new Error(`${name} must be a positive integer, got: ${raw}`);
    }
    const n = parseInt(raw, 10);
    if (n < min || n > max) {
      throw new Error(`${name} must be between ${min} and ${max}, got: ${raw}`);
    }
    return n;
  }

  const imageMaxConcurrent = parseIntEnv('IMAGE_MAX_CONCURRENT', 2, 1, 16);
  const imagePort = parseIntEnv('IMAGE_PORT', 4000, 1, 65535);
  const imageProcessTimeoutMs = parseIntEnv('IMAGE_PROCESS_TIMEOUT_MS', 30000, 1, 600000);

  const rawVideoUrl = process.env.VIDEO_PROCESSOR_URL;
  const videoProcessorUrl = rawVideoUrl ? rawVideoUrl : imageProcessorUrl;
  const videoTranscodeTimeoutMs = parseIntEnv(
    'VIDEO_TRANSCODE_TIMEOUT_MS',
    300000,
    1,
    1_800_000,
  );

  const mediaPresignedPutTtlSeconds = parseIntEnv(
    'MEDIA_PRESIGNED_PUT_TTL_SECONDS',
    900,
    60,
    3600,
  );

  const rawPendingPrefix = process.env.MEDIA_PENDING_UPLOAD_PREFIX;
  let mediaPendingUploadPrefix: string;
  if (rawPendingPrefix === undefined || rawPendingPrefix === '') {
    mediaPendingUploadPrefix = 'pending/';
  } else if (!/^[a-z0-9_]+\/$/.test(rawPendingPrefix)) {
    throw new Error(
      `MEDIA_PENDING_UPLOAD_PREFIX must match [a-z0-9_]+/, got: ${rawPendingPrefix}`,
    );
  } else {
    mediaPendingUploadPrefix = rawPendingPrefix;
  }

  const workerInternalPort = parseIntEnv('WORKER_INTERNAL_PORT', 3100, 1, 65535);
  const workerInternalUrl =
    process.env.WORKER_INTERNAL_URL || `http://localhost:${workerInternalPort}`;
  const webInternalUrl =
    process.env.WEB_INTERNAL_URL || `http://localhost:${port}`;
  // INTERNAL_EVENT_SECRET authenticates web<->image-worker and web<->
  // transcode-worker calls. The /ipc router that trusts it is always
  // mounted, so an explicit secret is required in every mode: a known
  // fallback literal would let anyone who can reach /ipc/* on a
  // misconfigured host publish forged job events. `./run_dev.sh` and the
  // compose files supply the value for local stacks; web and image worker
  // launched from the same shell inherit the same token.
  const internalEventSecret = process.env.INTERNAL_EVENT_SECRET || undefined;
  if (!internalEventSecret) {
    throw new Error(
      'INTERNAL_EVENT_SECRET is required (worker<->web event channel; the /ipc router is always mounted)',
    );
  }
  // SES_FEEDBACK_WEBHOOK_KEY authenticates the public SNS feedback webhook
  // (/webhooks/ses-feedback). It is deliberately a separate secret from
  // INTERNAL_EVENT_SECRET: the SNS subscription URL carries the key in the
  // query string, where instance access logs capture it on every delivery,
  // so a leak there must not extend to the worker IPC endpoints.
  const explicitSesFeedbackKey = process.env.SES_FEEDBACK_WEBHOOK_KEY || undefined;
  const sesFeedbackWebhookKey =
    explicitSesFeedbackKey ?? (isProd ? undefined : 'dev-ses-feedback-key-not-for-prod');
  if (sesAdapter === 'live' && !sesFeedbackWebhookKey) {
    throw new Error(
      'SES_FEEDBACK_WEBHOOK_KEY is required when SES_ADAPTER=live (SNS feedback webhook auth)',
    );
  }
  const mediaJobLeaseSeconds = parseIntEnv('MEDIA_JOB_LEASE_SECONDS', 1200, 60, 7200);
  const mediaJobMaxRetries = parseIntEnv('MEDIA_JOB_MAX_RETRIES', 1, 1, 10);
  const videoMaxHeight = parseIntEnv('VIDEO_MAX_HEIGHT', DEFAULT_VIDEO_MAX_HEIGHT, 240, 2160);
  const videoMaxBytes = parseIntEnv(
    'VIDEO_MAX_BYTES',
    120 * 1024 * 1024,
    1024 * 1024,
    1024 * 1024 * 1024,
  );
  const ffmpegTimeoutSeconds = parseIntEnv(
    'FFMPEG_TIMEOUT_SECONDS',
    DEFAULT_FFMPEG_TIMEOUT_MS / 1000,
    30,
    7200,
  );
  // The encoder's ceiling must sit below the HTTP boundary the caller waits on.
  // Inverted, the caller abandons the request and marks the job failed while
  // ffmpeg keeps running and keeps holding the worker's video slot, so every
  // later video job is refused as "worker busy" for reasons nothing reports.
  if (ffmpegTimeoutSeconds * 1000 >= videoTranscodeTimeoutMs) {
    throw new Error(
      `FFMPEG_TIMEOUT_SECONDS (${ffmpegTimeoutSeconds}s) must be less than ` +
        `VIDEO_TRANSCODE_TIMEOUT_MS (${videoTranscodeTimeoutMs}ms): the encoder ` +
        'has to be killed before the caller gives up, or it holds the video ' +
        'worker slot after the job has already been marked failed',
    );
  }
  // The lease must outlast one whole transcode attempt (each retry re-claims
  // with a fresh lease), including the bounded waits the dispatcher inserts
  // when the media worker answers busy. An expired lease is treated as proof
  // that the process holding the job is gone, and the recurring reap reclaims
  // the row on that proof; a lease shorter than an attempt would let it
  // reclaim a job that is still legitimately running or politely waiting.
  if (mediaJobLeaseSeconds * 1000 <= videoTranscodeTimeoutMs + TRANSCODE_BUSY_WAIT_BUDGET_MS) {
    throw new Error(
      `MEDIA_JOB_LEASE_SECONDS (${mediaJobLeaseSeconds}s) must exceed ` +
        `VIDEO_TRANSCODE_TIMEOUT_MS (${videoTranscodeTimeoutMs}ms) plus the ` +
        `${TRANSCODE_BUSY_WAIT_BUDGET_MS}ms busy-wait budget: an expired ` +
        'lease is read as an abandoned job and reclaimed, so the lease has to ' +
        'outlast the longest legitimate transcode attempt including its waits',
    );
  }
  const sseHeartbeatSeconds = parseIntEnv('SSE_HEARTBEAT_SECONDS', 15, 5, 60);

  // Hosts set the exact integer hop count of the proxy chain in front of
  // the app (nginx + CloudFront = 2; the clean-cutover chain has no
  // additional front-door hop); only the exact count makes req.ip resolve to
  // the real client, which per-IP rate limiting keys on. Unset in production
  // falls back to the named ranges, which fail closed: the trust walk stops
  // at CloudFront's public edge address, so req.ip becomes the edge IP and
  // rate limiting coarsens to per-edge buckets rather than refusing to boot.
  const rawTrustProxy = trimmedEnv('TRUST_PROXY');
  let trustProxy: number | string;
  if (rawTrustProxy === undefined) {
    trustProxy = isProd ? 'loopback, linklocal, uniquelocal' : 0;
  } else if (/^\d+$/.test(rawTrustProxy)) {
    trustProxy = parseInt(rawTrustProxy, 10);
  } else if (rawTrustProxy === 'true' || rawTrustProxy === 'false') {
    // The boolean form is refused at boot: TRUST_PROXY=true makes Express
    // trust the entire X-Forwarded-For chain, so any client that reaches the
    // app with a forged header controls its own req.ip and defeats per-IP
    // rate limiting the moment origin enforcement fails open.
    throw new Error(
      `TRUST_PROXY must be an exact integer hop count or an address-range list, got: ${rawTrustProxy}. The boolean form trusts every forwarded hop and would honor a spoofed X-Forwarded-For`,
    );
  } else {
    trustProxy = rawTrustProxy;
  }

  // Test-only override for container memory-utilization readings. Refuses
  // production start with this var set; otherwise an attacker with env
  // injection in production could forge readiness (anonymous /health/ready
  // is a liveness gate).
  const rawTestMemoryPercent = process.env.FOOTBAG_TEST_MEMORY_PERCENT;
  let testMemoryPercent: number | null | undefined;
  if (rawTestMemoryPercent === undefined || rawTestMemoryPercent === '') {
    testMemoryPercent = undefined;
  } else if (rawTestMemoryPercent === 'null') {
    testMemoryPercent = null;
  } else {
    const parsed = Number(rawTestMemoryPercent);
    if (!Number.isFinite(parsed)) {
      throw new Error(
        `FOOTBAG_TEST_MEMORY_PERCENT must be a finite number, 'null', or unset, got: ${rawTestMemoryPercent}`,
      );
    }
    testMemoryPercent = parsed;
  }
  if (testMemoryPercent !== undefined && footbagEnv === 'production') {
    throw new Error(
      `FOOTBAG_TEST_MEMORY_PERCENT is dev/staging-only; refusing production start (got FOOTBAG_ENV=production). Production readiness must reflect real cgroup state, not an injected override.`,
    );
  }

  const sessionSecret = requireEnv('SESSION_SECRET');
  if (isProd) {
    if (sessionSecret.length < 32) {
      throw new Error(
        'SESSION_SECRET must be at least 32 characters in production. Generate with: openssl rand -hex 32',
      );
    }
    if (sessionSecret.toLowerCase().includes('changeme')) {
      throw new Error(
        'SESSION_SECRET appears to contain the .env.example placeholder ("changeme"). Generate a fresh value with: openssl rand -hex 32',
      );
    }
  }

  // The real CAPTCHA must be on in production: with the stub, login and
  // registration answer "you are human" for every request and only the
  // in-process rate limiter stands between an attacker and credential
  // stuffing. FOOTBAG_ENV (the deployment environment), not NODE_ENV, is
  // the discriminator, because staging runs prod-mode for hardening parity
  // yet stays on the stub by design.
  if (footbagEnv === 'production' && captchaAdapter !== 'live') {
    throw new Error(
      `CAPTCHA_ADAPTER must be 'live' when FOOTBAG_ENV=production (got '${captchaAdapter}'); set CAPTCHA_ADAPTER=live and TURNSTILE_SITE_KEY in the production host env`,
    );
  }

  const rawArchiveCookieSigner = trimmedEnv('ARCHIVE_COOKIE_SIGNER');
  let archiveCookieSigner: 'ssm' | 'local' | null;
  if (rawArchiveCookieSigner === undefined) {
    archiveCookieSigner = null;
  } else if (rawArchiveCookieSigner === 'ssm' || rawArchiveCookieSigner === 'local') {
    archiveCookieSigner = rawArchiveCookieSigner;
  } else {
    throw new Error(
      `ARCHIVE_COOKIE_SIGNER must be 'ssm' or 'local', got: ${rawArchiveCookieSigner}`,
    );
  }
  const archiveKeyPairId = process.env.ARCHIVE_KEY_PAIR_ID || undefined;
  if (archiveCookieSigner === 'ssm' && !archiveKeyPairId) {
    throw new Error('ARCHIVE_KEY_PAIR_ID is required when ARCHIVE_COOKIE_SIGNER=ssm');
  }
  if (archiveCookieSigner && !process.env.ARCHIVE_URL) {
    throw new Error(
      'ARCHIVE_URL is required when ARCHIVE_COOKIE_SIGNER is set: the signed-cookie policy scopes to the archive base URL',
    );
  }
  const archiveCookieDomain = process.env.ARCHIVE_COOKIE_DOMAIN || undefined;
  if (archiveCookieDomain && !archiveCookieDomain.startsWith('.')) {
    throw new Error(
      `ARCHIVE_COOKIE_DOMAIN must start with '.' (a parent-domain cookie scope), got: ${archiveCookieDomain}`,
    );
  }
  if (archiveCookieDomain && !archiveCookieSigner) {
    throw new Error(
      'ARCHIVE_COOKIE_DOMAIN requires ARCHIVE_COOKIE_SIGNER: a cookie domain without a signer issues nothing',
    );
  }
  const archiveSigningKeyPath =
    process.env.ARCHIVE_SIGNING_KEY_PATH || 'database/dev-archive-signing-key.pem';

  const rawArchiveLoginRedirect = trimmedEnv('ARCHIVE_LOGIN_REDIRECT');
  let archiveLoginRedirect: boolean;
  if (rawArchiveLoginRedirect === undefined) {
    archiveLoginRedirect = false;
  } else if (rawArchiveLoginRedirect === '1' || rawArchiveLoginRedirect === 'true') {
    archiveLoginRedirect = true;
  } else if (rawArchiveLoginRedirect === '0' || rawArchiveLoginRedirect === 'false') {
    archiveLoginRedirect = false;
  } else {
    throw new Error(
      `ARCHIVE_LOGIN_REDIRECT must be '1', '0', 'true', or 'false', got: ${rawArchiveLoginRedirect}`,
    );
  }

  // The production build serves the canonical host and, before the cutover, a
  // temporary preview hostname as well. Only the canonical host belongs in a
  // search index: the preview name is withdrawn once the canonical host takes
  // over, so anything indexed under it becomes a result that no longer
  // resolves. The edge does not forward the viewer's Host header to the origin,
  // so the request cannot answer which name was used; the base URL this
  // deployment is configured to speak for can. Requiring the canonical host
  // rather than excluding known temporary ones keeps an unexpected hostname out
  // of the index instead of into it.
  const publicBaseUrl = requireEnv('PUBLIC_BASE_URL');
  const searchIndexable =
    footbagEnv === 'production' && new URL(publicBaseUrl).hostname.startsWith('www.');

  return {
    port,
    nodeEnv,
    // Development defaults to debug so a local run shows the full picture
    // (including the per-cycle outbox heartbeat). Deployed hosts never reach
    // this fallback: the deploy syncs LOG_LEVEL from the SSM parameter
    // (staging runs info, production runs warn).
    logLevel: process.env.LOG_LEVEL ?? (footbagEnv === 'development' ? 'debug' : 'info'),
    dbPath: requireEnv('FOOTBAG_DB_PATH'),
    publicBaseUrl,
    searchIndexable,
    archiveUrl: process.env.ARCHIVE_URL || null,
    archiveLoginRedirect,
    archiveCookieSigner,
    archiveKeyPairId,
    archiveSigningKeyPath,
    archiveCookieDomain,
    sessionSecret,
    isTestRunner: Boolean(process.env.VITEST),
    mediaDir: process.env.FOOTBAG_MEDIA_DIR || './s3-adapter-local',
    curatedMediaDir: process.env.FOOTBAG_CURATED_MEDIA_DIR || './.curated-build',
    jwtSigner,
    jwtKmsKeyId,
    jwtLocalKeypairPath,
    awsRegion,
    sesAdapter,
    sesFromIdentity,
    emailSendArmed,
    safeBrowsingAdapter,
    captchaAdapter,
    turnstileSiteKey,
    secretsAdapter,
    footbagEnv,
    ssmPrefix,
    httpReachabilityAdapter,
    allowCuratedSidecarWrites,
    curatedRootDirOverride,
    galleryMaxExternalLinks,
    imageProcessorUrl,
    imageMaxConcurrent,
    imagePort,
    imageProcessTimeoutMs,
    videoProcessorUrl,
    videoTranscodeTimeoutMs,
    mediaStorageAdapter,
    mediaStorageS3Bucket,
    mediaPresignedPutTtlSeconds,
    mediaPendingUploadPrefix,
    workerInternalPort,
    workerInternalUrl,
    webInternalUrl,
    internalEventSecret,
    sesFeedbackWebhookKey,
    mediaJobLeaseSeconds,
    mediaJobMaxRetries,
    videoMaxHeight,
    videoMaxBytes,
    ffmpegTimeoutSeconds,
    sseHeartbeatSeconds,
    initialAdminFile: process.env.FOOTBAG_INITIAL_ADMIN_FILE || '.local/initial-admins.txt',
    trustProxy,
    useCheapPasswordHash,
    paymentAdapter,
    paymentsArmed,
    stripeWebhookSecret,
    stripeWebhookSecretPrevious,
    stripeWebhookSecretStub,
    testMemoryPercent,
  };
}

export const config: AppConfig = Object.freeze(loadConfig());
