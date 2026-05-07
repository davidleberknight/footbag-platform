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
  imageProcessorUrl: string;
  imageMaxConcurrent: number;
  imagePort: number;
  imageProcessTimeoutMs: number;
  // Video transcode HTTP boundary. Defaults to imageProcessorUrl: today the
  // same `image` worker container hosts both Sharp and ffmpeg. Separate config
  // keys leave a future split (own video container, own DNS name) as a
  // one-line operator change.
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
  // Path to the operator-supplied initial-admin email list. Each member
  // who registers with an email listed here gets `is_admin=1` set on their
  // newly-inserted row plus a `grant_admin_bootstrap` audit row.
  // Default: `.local/initial-admins.txt` (gitignored). Production reads of
  // this file are refused at the helper level regardless of this value.
  initialAdminFile: string;
  // Value for Express's `trust proxy` setting. Number, boolean, or
  // comma-separated subnet/IP list — anything Express's setting accepts.
  // Default: 2 in production (CloudFront + nginx), 0 elsewhere.
  trustProxy: number | boolean | string;
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
  const internalEventSecret = process.env.INTERNAL_EVENT_SECRET || undefined;
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
  };
}

export const config: AppConfig = Object.freeze(loadConfig());
