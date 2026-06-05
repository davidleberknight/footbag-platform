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

export interface AppConfig {
  port: number;
  nodeEnv: string;
  logLevel: string;
  dbPath: string;
  publicBaseUrl: string;
  sessionSecret: string;
  mediaDir: string;
  curatedMediaDir: string;
  jwtSigner: 'kms' | 'local';
  jwtKmsKeyId: string | undefined;
  jwtLocalKeypairPath: string;
  awsRegion: string | undefined;
  sesAdapter: 'live' | 'stub';
  sesFromIdentity: string | undefined;
  safeBrowsingAdapter: 'live' | 'stub';
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
  // Shared secret for the worker<->web internal-event channel. Required when
  // workerInternalUrl or webInternalUrl is set to a non-loopback host.
  internalEventSecret: string | undefined;
  sesFeedbackWebhookKey: string | undefined;
  // Lease duration for a worker's claim on a media_jobs row. Worker boot-time
  // recovery considers any 'processing' row whose lease has expired to be
  // orphaned by a crash and resets it to pending_transcode for re-dispatch.
  mediaJobLeaseSeconds: number;
  // Maximum total attempts before a media job transitions to terminal 'failed'.
  // v1: every failure is terminal (max=1). Reserved for a future slice that
  // wants in-process retry on transient S3/ffmpeg blips.
  mediaJobMaxRetries: number;
  // SSE heartbeat cadence (seconds). The status-page stream from web to admin
  // browser sends a heartbeat event at this interval to keep nginx and
  // CloudFront from idle-killing the connection during long transcodes.
  sseHeartbeatSeconds: number;
  // CUTOVER-REMOVE: operator-supplied initial-admin email list.
  // Current: each registering member whose email appears here gets is_admin=1
  //   plus a grant_admin_dev_register_allowlist audit row. Default is
  //   .local/initial-admins.txt (gitignored); production reads refused at
  //   the helper level regardless of this value.
  // Target: remove after the production first-admin bootstrap is complete.
  initialAdminFile: string;
  // Value for Express's `trust proxy` setting. Hosts set the exact
  // X-Forwarded-For hop count of the proxy chain in front of the app
  // (nginx + CloudFront = 2; plus the legacy front-door proxy while it
  // carries the apex = 3) so req.ip resolves to the real client. Unset in
  // production falls back to the named IP ranges, which fail closed: the
  // trust walk stops at CloudFront's public edge address, so req.ip becomes
  // the edge IP and per-IP rate limiting coarsens to per-edge buckets.
  // Outside production: 0 unless overridden.
  trustProxy: number | boolean | string;
  // CUTOVER-REMOVE: dev-only Tier 2 backfill for admin members.
  // Current: when true, the boot orchestrator ensures every is_admin=1 member
  //   has a current Tier 2 ledger row, inserting a dev_admin_invariant_repair
  //   grant when the ledger lags. Repairs the admin-as-Tier-2 invariant on
  //   dev workstations without the legacy dump or full seed flow. Boot-time
  //   guard refuses non-development start. Default off, opt-in only.
  // Target: remove once the dev seed flow reliably provisions Tier 2 for
  //   admin accounts.
  devAdminGrantTier2: boolean;
  // Test-only password-hashing cost switch. When true, hashPassword() uses a
  // cheap argon2 profile so the suite does not run memory-hard hashing across
  // ~20 parallel forks (which oversubscribes RAM/threads and times out
  // unrelated boot hooks). env.ts refuses to enable it outside the Vitest
  // runner, so it is unreachable in development/staging/production.
  useCheapPasswordHash: boolean;
  // PaymentAdapter selector. 'live' wraps the Stripe SDK (currently a
  // placeholder; the live factory throws until the Stripe-SDK slice ships);
  // 'stub' is a programmable in-memory simulation that exercises the same
  // Stripe-shaped webhook plumbing end-to-end. Required to be explicit in
  // production; production rejects 'stub'.
  paymentAdapter: 'live' | 'stub';
  // Stripe webhook signing secret. Required when paymentAdapter='live' (the
  // live verifier validates inbound Stripe-Signature headers against it).
  // Undefined in stub mode, where the verifier uses the adapter-co-located
  // STUB_WEBHOOK_SECRET instead. Production refuses a stub-prefixed value.
  stripeWebhookSecret: string | undefined;
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
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function loadConfig(): AppConfig {
  const rawPort = requireEnv('PORT');
  const port = parseInt(rawPort, 10);
  if (isNaN(port) || port < 1 || port > 65535) {
    throw new Error(`PORT must be a valid integer between 1 and 65535, got: ${rawPort}`);
  }

  const nodeEnv = requireEnv('NODE_ENV');
  const isProd = nodeEnv === 'production';

  const rawJwtSigner = process.env.JWT_SIGNER;
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

  const rawSesAdapter = process.env.SES_ADAPTER;
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

  const rawSafeBrowsingAdapter = process.env.SAFE_BROWSING_ADAPTER;
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

  const rawSecretsAdapter = process.env.SECRETS_ADAPTER;
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

  const rawFootbagEnv = process.env.FOOTBAG_ENV;
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

  // SES adapter must match the deployment environment: production sends real
  // email (live); development and staging use the in-process stub so no real
  // mail leaves those environments. FOOTBAG_ENV (the deployment environment),
  // not NODE_ENV, is the discriminator, because dev containers pin
  // NODE_ENV=production for hardening parity while still running the stub.
  if (footbagEnv === 'production' && sesAdapter !== 'live') {
    throw new Error(
      `SES_ADAPTER must be 'live' when FOOTBAG_ENV=production (got '${sesAdapter}'); production sends real email`,
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


  // CUTOVER-REMOVE: fail-fast guard for FOOTBAG_DEV_ADMIN_GRANT_TIER2.
  // Current: dev-only fail-fast, same posture as the skip-claim-email guard.
  // Target: remove when the dev Tier 2 auto-grant is decommissioned.
  const rawDevAdminTier2 = process.env.FOOTBAG_DEV_ADMIN_GRANT_TIER2;
  let devAdminGrantTier2: boolean;
  if (rawDevAdminTier2 === undefined || rawDevAdminTier2 === '') {
    devAdminGrantTier2 = false;
  } else if (rawDevAdminTier2 === '1' || rawDevAdminTier2 === 'true') {
    devAdminGrantTier2 = true;
  } else if (rawDevAdminTier2 === '0' || rawDevAdminTier2 === 'false') {
    devAdminGrantTier2 = false;
  } else {
    throw new Error(
      `FOOTBAG_DEV_ADMIN_GRANT_TIER2 must be '1', '0', 'true', or 'false', got: ${rawDevAdminTier2}`,
    );
  }
  if (devAdminGrantTier2 && footbagEnv !== 'development') {
    throw new Error(
      `FOOTBAG_DEV_ADMIN_GRANT_TIER2 is dev-only; set FOOTBAG_ENV=development or unset the var (got FOOTBAG_ENV=${footbagEnv ?? '<unset>'})`,
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

  // CUTOVER-REMOVE: fail-fast guard for FOOTBAG_DEV_INITIAL_ADMIN_EMAILS.
  // Current: dev/staging-only admin-allowlist shortcut. Any production process
  //   seeing this var is mis-configured and must refuse to start. The deploy
  //   pipeline also refuses to write the value into /srv/footbag/env on a
  //   production host (second line of defense). Production first-admin uses
  //   the separate single-shot SSM-token claim path.
  // Target: remove after the production first-admin bootstrap is complete.
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

  const rawHttpReachability = process.env.HTTP_REACHABILITY_ADAPTER;
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

  const rawAllowCuratedSidecar = process.env.ALLOW_CURATED_SIDECAR_WRITES;
  let allowCuratedSidecarWrites: boolean;
  if (rawAllowCuratedSidecar === undefined || rawAllowCuratedSidecar === '') {
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

  const rawMediaStorage = process.env.MEDIA_STORAGE_ADAPTER;
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
      mediaStorageAdapter === 's3') &&
    !awsRegion
  ) {
    throw new Error(
      'AWS_REGION is required when JWT_SIGNER=kms, SES_ADAPTER=live, or MEDIA_STORAGE_ADAPTER=s3',
    );
  }

  const rawPaymentAdapter = process.env.PAYMENT_ADAPTER;
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
  // adapter (same discriminator the SES guard above uses). Only true production
  // forbids the stub.
  if (paymentAdapter === 'stub' && footbagEnv === 'production') {
    throw new Error(
      "PAYMENT_ADAPTER='stub' is forbidden in production; use PAYMENT_ADAPTER=live (currently fails fast until the Stripe-SDK slice ships)",
    );
  }

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
  // transcode-worker calls. Dev convenience: default to a known
  // non-production value when unset under non-production NODE_ENV. Web
  // and image worker run in the same shell under `./run_dev.sh` so
  // they read the same env via dotenv and end up with the same token.
  // Production reaches the existing fail-fast below via
  // MEDIA_STORAGE_ADAPTER=s3, so no separate prod gate is needed here.
  const explicitInternalSecret = process.env.INTERNAL_EVENT_SECRET || undefined;
  const internalEventSecret =
    explicitInternalSecret ?? (isProd ? undefined : 'dev-internal-event-secret-not-for-prod');
  if (mediaStorageAdapter === 's3' && !internalEventSecret) {
    throw new Error(
      'INTERNAL_EVENT_SECRET is required when MEDIA_STORAGE_ADAPTER=s3 (worker<->web event channel)',
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
  const sseHeartbeatSeconds = parseIntEnv('SSE_HEARTBEAT_SECONDS', 15, 5, 60);

  // Hosts set the exact integer hop count of the proxy chain in front of
  // the app (nginx + CloudFront = 2; plus the legacy front-door proxy while
  // it carries the apex = 3); only the exact count makes req.ip resolve to
  // the real client, which per-IP rate limiting keys on. Unset in production
  // falls back to the named ranges, which fail closed: the trust walk stops
  // at CloudFront's public edge address, so req.ip becomes the edge IP and
  // rate limiting coarsens to per-edge buckets rather than refusing to boot.
  const rawTrustProxy = process.env.TRUST_PROXY;
  let trustProxy: number | boolean | string;
  if (rawTrustProxy === undefined || rawTrustProxy === '') {
    trustProxy = isProd ? 'loopback, linklocal, uniquelocal' : 0;
  } else if (/^\d+$/.test(rawTrustProxy)) {
    trustProxy = parseInt(rawTrustProxy, 10);
  } else if (rawTrustProxy === 'true' || rawTrustProxy === 'false') {
    trustProxy = rawTrustProxy === 'true';
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

  return {
    port,
    nodeEnv,
    logLevel: process.env.LOG_LEVEL ?? 'info',
    dbPath: requireEnv('FOOTBAG_DB_PATH'),
    publicBaseUrl: requireEnv('PUBLIC_BASE_URL'),
    sessionSecret,
    mediaDir: process.env.FOOTBAG_MEDIA_DIR || './s3-adapter-local',
    curatedMediaDir: process.env.FOOTBAG_CURATED_MEDIA_DIR || './.curated-build',
    jwtSigner,
    jwtKmsKeyId,
    jwtLocalKeypairPath,
    awsRegion,
    sesAdapter,
    sesFromIdentity,
    safeBrowsingAdapter,
    secretsAdapter,
    footbagEnv,
    ssmPrefix,
    httpReachabilityAdapter,
    allowCuratedSidecarWrites,
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
    sseHeartbeatSeconds,
    initialAdminFile: process.env.FOOTBAG_INITIAL_ADMIN_FILE || '.local/initial-admins.txt',
    trustProxy,
    devAdminGrantTier2,
    useCheapPasswordHash,
    paymentAdapter,
    stripeWebhookSecret,
    testMemoryPercent,
  };
}

export const config: AppConfig = Object.freeze(loadConfig());
