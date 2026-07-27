/**
 * CloudFrontSigningAdapter: interface + implementations + singleton getter for
 * the adapters layer. Mints the three CloudFront signed-cookie values
 * (CloudFront-Policy, CloudFront-Signature, CloudFront-Key-Pair-Id) that the
 * archive distribution's trusted key group validates natively at the edge.
 *
 * Signing is SYNCHRONOUS by contract: `issueSessionCookie` runs inside
 * login, refresh, and password-change response paths whose call sites are
 * synchronous, so the private key must already be in memory when a request
 * arrives. The 'local' backend (dev and test) loads or creates a PEM file
 * on first use; the 'ssm' backend (deployed environments) reads the
 * SecureString once at boot via `initCloudFrontSigningAdapter()`, and a
 * failed preload refuses server start rather than serving members whose
 * logins silently grant no archive access.
 *
 * The signature is RSA-SHA1 over the policy JSON. SHA-1 here is CloudFront's
 * own signed-cookie protocol, not a choosable digest, and is why the signing
 * key must stay exportable (KMS cannot produce RSA-SHA1 signatures).
 */
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { config } from '../config/env';
import { getSecretsAdapter } from './secretsAdapter';

export interface ArchiveCookieValues {
  policy: string;
  signature: string;
  keyPairId: string;
}

export interface CloudFrontSigningAdapter {
  readonly keyPairId: string;
  /**
   * Sign a CloudFront custom policy granting GET access to `resource` (a
   * wildcard URL such as `https://archive.example.org/*`) until
   * `expiresEpochSeconds`. The wildcard resource is what makes the edge
   * directory-index rewrite safe: CloudFront validates the signature against
   * the ORIGINAL request URL, before any function rewrites it.
   */
  signArchiveCookies(
    resource: string,
    expiresEpochSeconds: number,
  ): ArchiveCookieValues;
}

/**
 * CloudFront's cookie-safe base64 variant: standard base64 with the three
 * characters CloudFront reserves swapped ('+' -> '-', '=' -> '_', '/' -> '~').
 * This is the encoding the edge expects; standard base64url does NOT work.
 */
function cloudFrontSafeB64(buf: Buffer): string {
  return buf
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/=/g, '_')
    .replace(/\//g, '~');
}

function buildCustomPolicy(resource: string, expiresEpochSeconds: number): string {
  // No whitespace: the signature covers these exact bytes.
  return JSON.stringify({
    Statement: [
      {
        Resource: resource,
        Condition: { DateLessThan: { 'AWS:EpochTime': expiresEpochSeconds } },
      },
    ],
  });
}

export function createCloudFrontSigningAdapter(opts: {
  privateKeyPem: string;
  keyPairId: string;
}): CloudFrontSigningAdapter {
  // Fail fast on a malformed key at construction, not at first login.
  const privateKey = crypto.createPrivateKey(opts.privateKeyPem);
  return {
    keyPairId: opts.keyPairId,
    signArchiveCookies(resource, expiresEpochSeconds) {
      const policy = buildCustomPolicy(resource, expiresEpochSeconds);
      const signature = crypto.sign('sha1', Buffer.from(policy), privateKey);
      return {
        policy: cloudFrontSafeB64(Buffer.from(policy)),
        signature: cloudFrontSafeB64(signature),
        keyPairId: opts.keyPairId,
      };
    },
  };
}

function loadOrCreateLocalSigningKey(keyPath: string): string {
  const abs = path.isAbsolute(keyPath)
    ? keyPath
    : path.join(process.cwd(), keyPath);
  if (fs.existsSync(abs)) {
    return fs.readFileSync(abs, 'utf8');
  }
  const { privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, privateKey, { mode: 0o600 });
  return privateKey;
}

let singleton: CloudFrontSigningAdapter | null = null;

/**
 * Boot-time preload for the 'ssm' backend. Must complete before the server
 * accepts requests (server.ts awaits it ahead of listen); a missing or
 * malformed key is a fail-fast boot error. No-op when the signer is
 * unconfigured, 'local', or already initialized.
 */
export async function initCloudFrontSigningAdapter(): Promise<void> {
  if (singleton || config.archiveCookieSigner !== 'ssm') return;
  const privateKeyPem = await getSecretsAdapter().getRequired(
    'archive_signing_private_key',
  );
  singleton = createCloudFrontSigningAdapter({
    privateKeyPem,
    // The 'ssm' branch of env.ts requires ARCHIVE_KEY_PAIR_ID explicitly.
    keyPairId: config.archiveKeyPairId!,
  });
}

/**
 * Returns null when archive cookie signing is not configured (the deployment
 * has no signer, so `issueSessionCookie` sets only the session cookie).
 * Throws when the 'ssm' backend is configured but the boot preload has not
 * run: signing is synchronous and cannot fetch the key on demand.
 */
export function getCloudFrontSigningAdapter(): CloudFrontSigningAdapter | null {
  if (config.archiveCookieSigner === null) return null;
  if (singleton) return singleton;
  if (config.archiveCookieSigner === 'local') {
    singleton = createCloudFrontSigningAdapter({
      privateKeyPem: loadOrCreateLocalSigningKey(config.archiveSigningKeyPath),
      keyPairId: config.archiveKeyPairId ?? 'local-archive-key-pair',
    });
    return singleton;
  }
  throw new Error(
    'CloudFront signing adapter not preloaded: ARCHIVE_COOKIE_SIGNER=ssm requires initCloudFrontSigningAdapter() to complete at boot before any cookie issuance',
  );
}

export function resetCloudFrontSigningAdapterForTests(): void {
  singleton = null;
}

export function setCloudFrontSigningAdapterForTests(
  adapter: CloudFrontSigningAdapter,
): void {
  singleton = adapter;
}
