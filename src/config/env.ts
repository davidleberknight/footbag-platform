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
  jwtSigner: 'kms' | 'local';
  jwtKmsKeyId: string | undefined;
  jwtLocalKeypairPath: string;
  awsRegion: string | undefined;
  sesAdapter: 'live' | 'stub';
  sesSandboxMode: boolean;
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
  // Value for Express's `trust proxy` setting. Number, boolean, or
  // comma-separated subnet/IP list — anything Express's setting accepts.
  // Default: 2 in production (CloudFront + nginx), 0 elsewhere.
  trustProxy: number | boolean | string;
  // CUTOVER-REMOVE: dev-only legacy-claim email bypass.
  // Current: when true, admin members complete a legacy account claim via the
  //   unified link-history wizard's manual-id input without the mailbox-control
  //   email roundtrip. Strictly additive, disabled by default. Boot-time guard
  //   refuses non-development start. Exists because dev fixture sets may lack
  //   legacy_email matches for the operator's admin account.
  // Target: remove after production cutover confirms the email roundtrip is
  //   reliable; production admins recover via manualLegacyClaimRecovery.
  devAdminSkipClaimEmail: boolean;
  // CUTOVER-REMOVE: dev-only Tier 2 backfill for admin members.
  // Current: when true, the boot orchestrator ensures every is_admin=1 member
  //   has a current Tier 2 ledger row, inserting a dev_admin_invariant_repair
  //   grant when the ledger lags. Repairs the admin-as-Tier-2 invariant on
  //   dev workstations without the legacy dump or full seed flow. Boot-time
  //   guard refuses non-development start. Default off, opt-in only.
  // Target: remove once the dev seed flow reliably provisions Tier 2 for
  //   admin accounts.
  devAdminGrantTier2: boolean;
  // CUTOVER-REMOVE: dev-only autologin member id.
  // Current: when set, auth middleware skips the cookie path entirely so a
  //   stale cookie cannot silently authenticate as a different member than
  //   the configured autologin. Empty-string and unset both surface as
  //   undefined. Boot-time guard refuses non-development start.
  // Target: remove after production cutover makes dev autologin unnecessary.
  devAutologinMemberId: string | undefined;
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

  // CUTOVER-REMOVE: fail-fast guard for the dev autologin bypass.
  // Current: a process with FOOTBAG_DEV_AUTOLOGIN_MEMBER_ID set outside
  //   development is mis-configured and must not start. Per-request gate in
  //   auth middleware is a second layer, not a substitute.
  // Target: remove with the autologin feature at production cutover.
  if (process.env.FOOTBAG_DEV_AUTOLOGIN_MEMBER_ID && footbagEnv !== 'development') {
    throw new Error(
      `FOOTBAG_DEV_AUTOLOGIN_MEMBER_ID is dev-only; set FOOTBAG_ENV=development or unset the var (got FOOTBAG_ENV=${footbagEnv ?? '<unset>'})`,
    );
  }

  const devAutologinMemberId =
    process.env.FOOTBAG_DEV_AUTOLOGIN_MEMBER_ID || undefined;

  // CUTOVER-REMOVE: fail-fast guard for the autologin password_version check.
  // Current: companion var to FOOTBAG_DEV_AUTOLOGIN_MEMBER_ID; refuses
  //   non-development boot so a misconfigured staging or prod process cannot
  //   rely on the per-request gate alone.
  // Target: remove with the autologin feature at production cutover.
  if (
    process.env.FOOTBAG_DEV_AUTOLOGIN_PASSWORD_VERSION &&
    footbagEnv !== 'development'
  ) {
    throw new Error(
      `FOOTBAG_DEV_AUTOLOGIN_PASSWORD_VERSION is dev-only; set FOOTBAG_ENV=development or unset the var (got FOOTBAG_ENV=${footbagEnv ?? '<unset>'})`,
    );
  }

  // CUTOVER-REMOVE: fail-fast guard for FOOTBAG_DEV_ADMIN_SKIP_CLAIM_EMAIL.
  // Current: dev-only, same posture as the autologin guards above.
  // Target: remove when the skip-claim-email bypass is decommissioned.
  const rawDevAdminSkip = process.env.FOOTBAG_DEV_ADMIN_SKIP_CLAIM_EMAIL;
  let devAdminSkipClaimEmail: boolean;
  if (rawDevAdminSkip === undefined || rawDevAdminSkip === '') {
    devAdminSkipClaimEmail = false;
  } else if (rawDevAdminSkip === '1' || rawDevAdminSkip === 'true') {
    devAdminSkipClaimEmail = true;
  } else if (rawDevAdminSkip === '0' || rawDevAdminSkip === 'false') {
    devAdminSkipClaimEmail = false;
  } else {
    throw new Error(
      `FOOTBAG_DEV_ADMIN_SKIP_CLAIM_EMAIL must be '1', '0', 'true', or 'false', got: ${rawDevAdminSkip}`,
    );
  }
  if (devAdminSkipClaimEmail && footbagEnv !== 'development') {
    throw new Error(
      `FOOTBAG_DEV_ADMIN_SKIP_CLAIM_EMAIL is dev-only; set FOOTBAG_ENV=development or unset the var (got FOOTBAG_ENV=${footbagEnv ?? '<unset>'})`,
    );
  }

  // CUTOVER-REMOVE: fail-fast guard for FOOTBAG_DEV_ADMIN_GRANT_TIER2.
  // Current: dev-only, same posture as the autologin guards above.
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

  const rawSesSandbox = process.env.SES_SANDBOX_MODE;
  let sesSandboxMode: boolean;
  if (rawSesSandbox === undefined || rawSesSandbox === '') {
    sesSandboxMode = false;
  } else if (rawSesSandbox === '1' || rawSesSandbox === 'true') {
    sesSandboxMode = true;
  } else if (rawSesSandbox === '0' || rawSesSandbox === 'false') {
    sesSandboxMode = false;
  } else {
    throw new Error(`SES_SANDBOX_MODE must be '1', '0', 'true', or 'false', got: ${rawSesSandbox}`);
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
  const mediaJobLeaseSeconds = parseIntEnv('MEDIA_JOB_LEASE_SECONDS', 1200, 60, 7200);
  const mediaJobMaxRetries = parseIntEnv('MEDIA_JOB_MAX_RETRIES', 1, 1, 10);
  const sseHeartbeatSeconds = parseIntEnv('SSE_HEARTBEAT_SECONDS', 15, 5, 60);

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
    mediaDir: process.env.FOOTBAG_MEDIA_DIR || './data/media',
    jwtSigner,
    jwtKmsKeyId,
    jwtLocalKeypairPath,
    awsRegion,
    sesAdapter,
    sesSandboxMode,
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
    mediaJobLeaseSeconds,
    mediaJobMaxRetries,
    sseHeartbeatSeconds,
    initialAdminFile: process.env.FOOTBAG_INITIAL_ADMIN_FILE || '.local/initial-admins.txt',
    trustProxy,
    devAdminSkipClaimEmail,
    devAdminGrantTier2,
    devAutologinMemberId,
  };
}

export const config: AppConfig = Object.freeze(loadConfig());
