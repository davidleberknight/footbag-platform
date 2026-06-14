/**
 * Dev↔staging adapter parity contract.
 *
 * The JwtSigningAdapter, SesAdapter, and MediaStorageAdapter interfaces are
 * the only seam between dev and staging. Both implementations must produce
 * observable outputs with identical structure so the service layer above is
 * free of environment-specific branching. These tests exercise both sides of
 * each seam with injected fake clients standing in for real AWS.
 *
 * Live-AWS parity (kms:Sign, ses:SendEmail actually reaching AWS) is covered
 * in tests/smoke/staging-readiness.test.ts, which is gated behind
 * RUN_STAGING_SMOKE=1 and excluded from the default npm test run.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  GetPublicKeyCommand,
  SignCommand,
  type KMSClient,
} from '@aws-sdk/client-kms';
import { SendEmailCommand, type SESClient } from '@aws-sdk/client-ses';
import {
  createLocalJwtAdapter,
  createKmsJwtAdapter,
} from '../../src/adapters/jwtSigningAdapter';
import {
  createStubSesAdapter,
  createLiveSesAdapter,
} from '../../src/adapters/sesAdapter';
import {
  createStubSafeBrowsingAdapter,
  createLiveSafeBrowsingAdapter,
} from '../../src/adapters/safeBrowsingAdapter';
import {
  createStubCaptchaAdapter,
  createLiveCaptchaAdapter,
} from '../../src/adapters/captchaAdapter';
import {
  createStubPaymentAdapter,
  createLivePaymentAdapter,
} from '../../src/adapters/paymentAdapter';
import {
  createStubSecretsAdapter,
  createLiveSecretsAdapter,
  SecretNotConfiguredError,
} from '../../src/adapters/secretsAdapter';
import {
  GetParameterCommand,
  ParameterNotFound,
} from '@aws-sdk/client-ssm';
import {
  createStubHttpReachabilityAdapter,
  createLiveHttpReachabilityAdapter,
  createDisabledHttpReachabilityAdapter,
} from '../../src/adapters/httpReachabilityAdapter';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { Readable } from 'node:stream';
import {
  createLocalMediaStorageAdapter,
  createS3MediaStorageAdapter,
  type MediaStorageAdapter,
} from '../../src/adapters/mediaStorageAdapter';
import {
  createHttpImageAdapter,
  ImageProcessingError,
} from '../../src/adapters/imageProcessingAdapter';
import {
  createHttpVideoTranscodingAdapter,
  VideoTranscodingError,
} from '../../src/adapters/videoTranscodingAdapter';
import sharp from 'sharp';
import { processAvatar } from '../../src/lib/imageProcessing';
import { spawnSync } from 'node:child_process';
import {
  detectVideoFormat,
  transcodeCuratorVideo,
} from '../../src/lib/videoProcessing';

const ffmpegAvailable =
  spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' }).status === 0;

// Shared shared-secret used by the auth header on web↔image-worker IPC.
const TEST_INTERNAL_SECRET = 'test-internal-event-secret';

// Minimal MediaStorageAdapter test double for adapter-construction tests that
// don't exercise real presigning. Returns deterministic dummy URLs so the
// from-storage wire-shape test can assert what got sent to the worker.
function makeFakeMediaStorage(opts: {
  presignedGet?: (key: string, ttl: number) => Promise<string>;
  presignedPut?: (key: string, contentType: string, ttl: number) => Promise<string>;
} = {}): MediaStorageAdapter {
  return {
    put: async () => {},
    get: async () => Buffer.alloc(0),
    delete: async () => {},
    constructURL: (key) => `/media-store/${key}`,
    exists: async () => false,
    headSize: async () => null,
    generatePresignedPutUrl: opts.presignedPut ?? (async (key) =>
      `https://fake-presign.example/${key}?put=1`),
    generatePresignedGetUrl: opts.presignedGet ?? (async (key) =>
      `https://fake-presign.example/${key}?get=1`),
  };
}

function makeFakeKmsClient(): KMSClient {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'der' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  const fake = {
    send: async (cmd: unknown): Promise<unknown> => {
      if (cmd instanceof GetPublicKeyCommand) {
        return { PublicKey: new Uint8Array(publicKey) };
      }
      if (cmd instanceof SignCommand) {
        const message = Buffer.from(cmd.input.Message as Uint8Array);
        const sig = crypto.sign('sha256', message, privateKey);
        return { Signature: new Uint8Array(sig) };
      }
      throw new Error('unexpected KMS command');
    },
  };
  return fake as unknown as KMSClient;
}

function makeFakeSesClient(): { client: SESClient; captured: SendEmailCommand[] } {
  const captured: SendEmailCommand[] = [];
  const fake = {
    send: async (cmd: unknown): Promise<unknown> => {
      if (cmd instanceof SendEmailCommand) {
        captured.push(cmd);
        return { MessageId: `fake-${captured.length}` };
      }
      throw new Error('unexpected SES command');
    },
  };
  return { client: fake as unknown as SESClient, captured };
}

interface CapturedFetchCall {
  url: string;
  init: RequestInit | undefined;
}

function makeFakeSafeBrowsingFetch(
  responseBody: object,
  status = 200,
): { fetch: typeof fetch; captured: CapturedFetchCall[] } {
  const captured: CapturedFetchCall[] = [];
  const fake: typeof fetch = async (input, init) => {
    captured.push({ url: String(input), init });
    return new Response(JSON.stringify(responseBody), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  };
  return { fetch: fake, captured };
}

function b64urlDecodeJson(seg: string): Record<string, unknown> {
  const pad = seg.length % 4 === 0 ? '' : '='.repeat(4 - (seg.length % 4));
  const base64 = seg.replace(/-/g, '+').replace(/_/g, '/') + pad;
  return JSON.parse(Buffer.from(base64, 'base64').toString('utf8'));
}

describe('adapter-parity: JwtSigningAdapter (Local vs. KMS wire format)', () => {
  let tmpDir: string;
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jwt-parity-'));
  });
  afterEach(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

  function makePair() {
    const local = createLocalJwtAdapter({
      keypairPath: path.join(tmpDir, 'keypair.pem'),
      kid: 'local-parity-kid',
    });
    const kms = createKmsJwtAdapter({
      keyId: 'arn:aws:kms:us-east-1:000000000000:key/parity-test',
      kmsClient: makeFakeKmsClient(),
    });
    return { local, kms };
  }

  it('both produce three dot-separated base64url segments', async () => {
    const { local, kms } = makePair();
    const claims = { sub: 'm-1', passwordVersion: 1 };
    const tokens = [await local.signJwt(claims), await kms.signJwt(claims)];
    for (const token of tokens) {
      const parts = token.split('.');
      expect(parts).toHaveLength(3);
      for (const seg of parts) {
        expect(seg).toMatch(/^[A-Za-z0-9_-]+$/);
      }
    }
  });

  it('both emit headers with alg=RS256, typ=JWT, non-empty kid', async () => {
    const { local, kms } = makePair();
    const claims = { sub: 'm-1', passwordVersion: 1 };
    for (const token of [await local.signJwt(claims), await kms.signJwt(claims)]) {
      const header = b64urlDecodeJson(token.split('.')[0]);
      expect(header.alg).toBe('RS256');
      expect(header.typ).toBe('JWT');
      expect(typeof header.kid).toBe('string');
      expect((header.kid as string).length).toBeGreaterThan(0);
    }
  });

  it('both embed sub, passwordVersion, iat, exp in the payload', async () => {
    const { local, kms } = makePair();
    const claims = { sub: 'm-99', passwordVersion: 42 };
    for (const token of [await local.signJwt(claims), await kms.signJwt(claims)]) {
      const payload = b64urlDecodeJson(token.split('.')[1]);
      expect(payload.sub).toBe('m-99');
      expect(payload.passwordVersion).toBe(42);
      expect(typeof payload.iat).toBe('number');
      expect(typeof payload.exp).toBe('number');
      expect(payload.exp as number).toBeGreaterThan(payload.iat as number);
    }
  });

  it('both round-trip their own signatures through verifyJwt', async () => {
    const { local, kms } = makePair();
    const claims = { sub: 'm-1', passwordVersion: 1 };
    const localClaims = await local.verifyJwt(await local.signJwt(claims));
    const kmsClaims = await kms.verifyJwt(await kms.signJwt(claims));
    expect(localClaims).not.toBeNull();
    expect(kmsClaims).not.toBeNull();
    expect(localClaims!.sub).toBe('m-1');
    expect(kmsClaims!.sub).toBe('m-1');
  });

  it('both reject tokens with mismatched signatures', async () => {
    const { local, kms } = makePair();
    const claims = { sub: 'm-1', passwordVersion: 1 };
    const localTok = await local.signJwt(claims);
    const kmsTok = await kms.signJwt(claims);
    // Swapping signatures across signers must fail: different keypairs.
    const [lh, lp] = localTok.split('.');
    const [, , ks] = kmsTok.split('.');
    const crossed = `${lh}.${lp}.${ks}`;
    expect(await local.verifyJwt(crossed)).toBeNull();
  });
});

describe('adapter-parity: SesAdapter (Stub vs. Live interface)', () => {
  it('both return { messageId, deliveredAt } on successful send', async () => {
    const stub = createStubSesAdapter();
    const fakeSes = makeFakeSesClient();
    const live = createLiveSesAdapter({
      fromIdentity: 'noreply@footbag.org',
      sesClient: fakeSes.client,
    });

    const msg = { to: 'user@example.com', subject: 'Hi', bodyText: 'Body' };
    for (const result of [await stub.sendEmail(msg), await live.sendEmail(msg)]) {
      expect(typeof result.messageId).toBe('string');
      expect(result.messageId.length).toBeGreaterThan(0);
      expect(typeof result.deliveredAt).toBe('string');
      expect(Number.isNaN(new Date(result.deliveredAt).getTime())).toBe(false);
    }
  });

  it('both honor the optional per-message from override', async () => {
    const stub = createStubSesAdapter();
    const fakeSes = makeFakeSesClient();
    const live = createLiveSesAdapter({
      fromIdentity: 'default@footbag.org',
      sesClient: fakeSes.client,
    });

    const msg = {
      to: 'u@example.com',
      subject: 'Hi',
      bodyText: 'B',
      from: 'override@footbag.org',
    };
    await stub.sendEmail(msg);
    await live.sendEmail(msg);

    expect(stub.sentMessages[0].from).toBe('override@footbag.org');
    expect(fakeSes.captured[0].input.Source).toBe('override@footbag.org');
  });

  it('both apply the default sender when the message omits from', async () => {
    const stub = createStubSesAdapter();
    const fakeSes = makeFakeSesClient();
    const live = createLiveSesAdapter({
      fromIdentity: 'default@footbag.org',
      sesClient: fakeSes.client,
    });

    const msg = { to: 'u@example.com', subject: 'S', bodyText: 'B' };
    await stub.sendEmail(msg);
    await live.sendEmail(msg);

    // Stub records the original msg (with no from). Live applies the default.
    expect(stub.sentMessages[0].from).toBeUndefined();
    expect(fakeSes.captured[0].input.Source).toBe('default@footbag.org');
  });
});

describe('adapter-parity: SecretsAdapter (Stub vs. Live vs. Local interface)', () => {
  // Fake SSM client driven by an in-memory map. Stands in for the AWS SDK
  // call path without mocking the @aws-sdk package itself.
  function makeFakeSsm(seed: Record<string, string>) {
    const captured: { Name?: string; WithDecryption?: boolean }[] = [];
    return {
      captured,
      async send(cmd: GetParameterCommand) {
        captured.push({
          Name: cmd.input.Name,
          WithDecryption: cmd.input.WithDecryption,
        });
        const name = cmd.input.Name ?? '';
        const value = seed[name];
        if (value === undefined) {
          throw new ParameterNotFound({
            $metadata: {},
            message: `Parameter ${name} not found.`,
          });
        }
        return { Parameter: { Value: value } };
      },
    };
  }

  it('both return the value when the key is present', async () => {
    const stub = createStubSecretsAdapter();
    stub.setSecret('safe_browsing_api_key', 'value-stub');
    const fakeSsm = makeFakeSsm({
      '/footbag/staging/secrets/safe_browsing_api_key': 'value-live',
    });
    const live = createLiveSecretsAdapter({
      ssmClient: fakeSsm,
      ssmPrefix: '/footbag/staging',
    });

    const stubVal = await stub.get('safe_browsing_api_key');
    const liveVal = await live.get('safe_browsing_api_key');
    expect(typeof stubVal).toBe('string');
    expect(typeof liveVal).toBe('string');
    expect(stubVal).toBe('value-stub');
    expect(liveVal).toBe('value-live');
  });

  it('both return undefined when the key is missing', async () => {
    const stub = createStubSecretsAdapter();
    const fakeSsm = makeFakeSsm({});
    const live = createLiveSecretsAdapter({
      ssmClient: fakeSsm,
      ssmPrefix: '/footbag/staging',
    });

    expect(await stub.get('missing')).toBeUndefined();
    expect(await live.get('missing')).toBeUndefined();
  });

  it('getRequired throws SecretNotConfiguredError on missing key (both)', async () => {
    const stub = createStubSecretsAdapter();
    const fakeSsm = makeFakeSsm({});
    const live = createLiveSecretsAdapter({
      ssmClient: fakeSsm,
      ssmPrefix: '/footbag/staging',
    });

    await expect(stub.getRequired('missing')).rejects.toBeInstanceOf(
      SecretNotConfiguredError,
    );
    await expect(live.getRequired('missing')).rejects.toBeInstanceOf(
      SecretNotConfiguredError,
    );
  });

  it('live adapter calls SSM GetParameter with WithDecryption=true and the prefix-derived name', async () => {
    const fakeSsm = makeFakeSsm({
      '/footbag/staging/secrets/some_key': 'value-x',
    });
    const live = createLiveSecretsAdapter({
      ssmClient: fakeSsm,
      ssmPrefix: '/footbag/staging',
    });
    await live.get('some_key');
    expect(fakeSsm.captured).toHaveLength(1);
    expect(fakeSsm.captured[0].Name).toBe(
      '/footbag/staging/secrets/some_key',
    );
    expect(fakeSsm.captured[0].WithDecryption).toBe(true);
  });

  it('live adapter caches results: a second get for the same key does not re-fetch from SSM', async () => {
    const fakeSsm = makeFakeSsm({
      '/footbag/staging/secrets/cached_key': 'value-once',
    });
    const live = createLiveSecretsAdapter({
      ssmClient: fakeSsm,
      ssmPrefix: '/footbag/staging',
    });
    const first = await live.get('cached_key');
    const second = await live.get('cached_key');
    expect(first).toBe('value-once');
    expect(second).toBe('value-once');
    expect(fakeSsm.captured).toHaveLength(1);
  });

  it('live adapter caches negative lookup: missing key is fetched once, then undefined returned from cache', async () => {
    const fakeSsm = makeFakeSsm({});
    const live = createLiveSecretsAdapter({
      ssmClient: fakeSsm,
      ssmPrefix: '/footbag/staging',
    });
    expect(await live.get('missing')).toBeUndefined();
    expect(await live.get('missing')).toBeUndefined();
    expect(fakeSsm.captured).toHaveLength(1);
  });

  it('stub failNext throws on the next get and clears after one use', async () => {
    const stub = createStubSecretsAdapter();
    stub.setSecret('k', 'v');
    stub.failNext(new Error('aws unavailable'));
    await expect(stub.get('k')).rejects.toThrow('aws unavailable');
    // Second call recovers.
    const after = await stub.get('k');
    expect(after).toBe('v');
  });
});

describe('adapter-parity: CaptchaAdapter (Stub vs. Live interface)', () => {
  it('both return { ok: true } when the token verifies', async () => {
    const stub = createStubCaptchaAdapter();
    const fakeFetch = makeFakeSafeBrowsingFetch({ success: true });
    const secretsForLive = createStubSecretsAdapter();
    secretsForLive.setSecret('turnstile_secret_key', 'test-secret');
    const live = createLiveCaptchaAdapter({
      secrets: secretsForLive,
      fetchClient: fakeFetch.fetch,
    });
    for (const result of [await stub.verify('any-token'), await live.verify('any-token')]) {
      expect(result.ok).toBe(true);
    }
  });

  it('both return { ok: false } when verification is rejected', async () => {
    const stub = createStubCaptchaAdapter();
    stub.addFailToken('bad-token');
    const fakeFetch = makeFakeSafeBrowsingFetch({ success: false });
    const secretsForLive = createStubSecretsAdapter();
    secretsForLive.setSecret('turnstile_secret_key', 'test-secret');
    const live = createLiveCaptchaAdapter({
      secrets: secretsForLive,
      fetchClient: fakeFetch.fetch,
    });
    expect((await stub.verify('bad-token')).ok).toBe(false);
    expect((await live.verify('bad-token')).ok).toBe(false);
  });

  it('live adapter posts the token + secret to the Turnstile siteverify endpoint', async () => {
    const fakeFetch = makeFakeSafeBrowsingFetch({ success: true });
    const secretsForLive = createStubSecretsAdapter();
    secretsForLive.setSecret('turnstile_secret_key', 'test-secret');
    const live = createLiveCaptchaAdapter({
      secrets: secretsForLive,
      fetchClient: fakeFetch.fetch,
    });
    await live.verify('tok-123', '1.2.3.4');
    expect(fakeFetch.captured).toHaveLength(1);
    const call = fakeFetch.captured[0];
    expect(call.url).toContain('challenges.cloudflare.com/turnstile/v0/siteverify');
    expect(call.init?.method).toBe('POST');
    const body = String(call.init?.body);
    expect(body).toContain('response=tok-123');
    expect(body).toContain('secret=test-secret');
  });
});

describe('adapter-parity: SafeBrowsingAdapter (Stub vs. Live interface)', () => {
  it('both return { safe: true, threatTypes: [] } when the URL is not flagged', async () => {
    const stub = createStubSafeBrowsingAdapter();
    const fakeFetch = makeFakeSafeBrowsingFetch({}); // empty matches array
    const secretsForLive = createStubSecretsAdapter();
    secretsForLive.setSecret('safe_browsing_api_key', 'test-key');
    const live = createLiveSafeBrowsingAdapter({
      secrets: secretsForLive,
      fetchClient: fakeFetch.fetch,
    });

    for (const result of [
      await stub.lookup('https://example.com/'),
      await live.lookup('https://example.com/'),
    ]) {
      expect(result.safe).toBe(true);
      expect(result.threatTypes).toEqual([]);
    }
  });

  it('both return { safe: false, threatTypes } when a match is reported', async () => {
    const stub = createStubSafeBrowsingAdapter();
    stub.addThreat('https://malware.example/', 'MALWARE');
    const fakeFetch = makeFakeSafeBrowsingFetch({
      matches: [{ threatType: 'MALWARE', threat: { url: 'https://malware.example/' } }],
    });
    const secretsForLive = createStubSecretsAdapter();
    secretsForLive.setSecret('safe_browsing_api_key', 'test-key');
    const live = createLiveSafeBrowsingAdapter({
      secrets: secretsForLive,
      fetchClient: fakeFetch.fetch,
    });

    const stubResult = await stub.lookup('https://malware.example/');
    const liveResult = await live.lookup('https://malware.example/');

    for (const result of [stubResult, liveResult]) {
      expect(result.safe).toBe(false);
      expect(result.threatTypes.length).toBeGreaterThan(0);
      expect(result.threatTypes).toContain('MALWARE');
    }
  });

  it('live adapter posts the threatMatches:find request shape Google v4 expects', async () => {
    const fakeFetch = makeFakeSafeBrowsingFetch({});
    const secretsForLive = createStubSecretsAdapter();
    secretsForLive.setSecret('safe_browsing_api_key', 'test-key');
    const live = createLiveSafeBrowsingAdapter({
      secrets: secretsForLive,
      fetchClient: fakeFetch.fetch,
    });

    await live.lookup('https://example.com/path');

    expect(fakeFetch.captured).toHaveLength(1);
    const call = fakeFetch.captured[0];
    expect(call.url).toContain('safebrowsing.googleapis.com/v4/threatMatches:find');
    expect(call.url).toContain('key=test-key');
    expect(call.init?.method).toBe('POST');
    const body = JSON.parse(String(call.init?.body));
    expect(body).toHaveProperty('client.clientId');
    expect(body.threatInfo.threatTypes).toContain('MALWARE');
    expect(body.threatInfo.threatEntries[0].url).toBe('https://example.com/path');
  });

  it('live adapter throws on non-2xx HTTP responses (no silent safe-mark)', async () => {
    const fakeFetch = makeFakeSafeBrowsingFetch({ error: 'rate limited' }, 429);
    const secretsForLive = createStubSecretsAdapter();
    secretsForLive.setSecret('safe_browsing_api_key', 'test-key');
    const live = createLiveSafeBrowsingAdapter({
      secrets: secretsForLive,
      fetchClient: fakeFetch.fetch,
    });
    await expect(live.lookup('https://example.com/')).rejects.toThrow(/HTTP 429/);
  });

  it('stub failNext throws on the next call and clears after one use', async () => {
    const stub = createStubSafeBrowsingAdapter();
    stub.failNext(new Error('boom'));
    await expect(stub.lookup('https://example.com/')).rejects.toThrow('boom');
    // Second call recovers.
    const after = await stub.lookup('https://example.com/');
    expect(after.safe).toBe(true);
  });

  it('factory createStubSafeBrowsingAdapter starts with an empty deny list', async () => {
    // Tests that inspect a clean stub state (no addThreat calls) get the
    // empty default. Only the singleton-from-config path applies the dev
    // seed; mixing seeded + unseeded would break test determinism.
    const stub = createStubSafeBrowsingAdapter();
    const result = await stub.lookup(
      'http://malware.testing.google.test/testing/malware/',
    );
    expect(result.safe).toBe(true);
    expect(result.threatTypes).toEqual([]);
  });

  it('singleton getSafeBrowsingAdapter() pre-seeds the canonical Google malware test URL when SAFE_BROWSING_ADAPTER=stub', async () => {
    // The stub-mode singleton seeds the canonical malware test URL so a
    // dev with no API key still sees the rejection UX from a clean
    // ./run_dev.sh checkout. Tests must reset the singleton because
    // setup-env.ts also dispatches via the same getter.
    const { getSafeBrowsingAdapter, resetSafeBrowsingAdapterForTests } =
      await import('../../src/adapters/safeBrowsingAdapter');
    resetSafeBrowsingAdapterForTests();
    try {
      const adapter = getSafeBrowsingAdapter();
      const malwareResult = await adapter.lookup(
        'http://malware.testing.google.test/testing/malware/',
      );
      expect(malwareResult.safe).toBe(false);
      expect(malwareResult.threatTypes).toContain('MALWARE');
      // Other URLs still pass through the stub unchanged.
      const benignResult = await adapter.lookup('https://example.com/');
      expect(benignResult.safe).toBe(true);
    } finally {
      resetSafeBrowsingAdapterForTests();
    }
  });
});

describe('adapter-parity: HttpReachabilityAdapter (Stub vs. Live vs. Disabled)', () => {
  it('stub and live both return reachable=true for a 2xx response', async () => {
    const stub = createStubHttpReachabilityAdapter();
    const fakeFetch = (async () =>
      ({ status: 200, ok: true, headers: new Headers(), url: 'https://example.com/' }) as Response) as unknown as typeof fetch;
    const live = createLiveHttpReachabilityAdapter({
      fetchClient: fakeFetch,
      lookup: async () => ({ address: '8.8.8.8', family: 4 }),
    });

    const stubResult = await stub.check('https://example.com/');
    const liveResult = await live.check('https://example.com/');

    for (const result of [stubResult, liveResult]) {
      expect(result.reachable).toBe(true);
    }
  });

  it('stub and live both return reachable=true with status on 4xx (warn-but-allow)', async () => {
    const stub = createStubHttpReachabilityAdapter();
    stub.setReachable('https://example.com/', 404);
    const fakeFetch = (async () =>
      ({ status: 404, ok: false, headers: new Headers(), url: 'https://example.com/' }) as Response) as unknown as typeof fetch;
    const live = createLiveHttpReachabilityAdapter({
      fetchClient: fakeFetch,
      lookup: async () => ({ address: '8.8.8.8', family: 4 }),
    });

    const stubResult = await stub.check('https://example.com/');
    const liveResult = await live.check('https://example.com/');

    for (const result of [stubResult, liveResult]) {
      expect(result.reachable).toBe(true);
      expect(result.status).toBe(404);
    }
  });

  it('stub and live both return reachable=false on transport failure', async () => {
    const stub = createStubHttpReachabilityAdapter();
    stub.setUnreachable('https://example.com/', 'connection refused');
    const fakeFetch = (async () => {
      throw new Error('connection refused');
    }) as unknown as typeof fetch;
    const live = createLiveHttpReachabilityAdapter({
      fetchClient: fakeFetch,
      lookup: async () => ({ address: '8.8.8.8', family: 4 }),
    });

    const stubResult = await stub.check('https://example.com/');
    const liveResult = await live.check('https://example.com/');

    for (const result of [stubResult, liveResult]) {
      expect(result.reachable).toBe(false);
      expect(result.error).toBeDefined();
    }
  });

  it('live adapter issues HEAD with manual redirect (does not auto-follow)', async () => {
    const captured: string[] = [];
    const fakeFetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      captured.push(`${init?.method ?? 'GET'} ${url} redirect=${init?.redirect}`);
      return { status: 200, ok: true, headers: new Headers(), url } as Response;
    }) as unknown as typeof fetch;
    const live = createLiveHttpReachabilityAdapter({
      fetchClient: fakeFetch,
      lookup: async () => ({ address: '8.8.8.8', family: 4 }),
    });
    await live.check('https://example.com/');
    expect(captured[0]).toMatch(/^HEAD .* redirect=manual$/);
  });

  it('disabled adapter satisfies the same interface and returns reachable=true unconditionally', async () => {
    const disabled = createDisabledHttpReachabilityAdapter();
    const result = await disabled.check('https://anything.example/');
    expect(result.reachable).toBe(true);
  });

  it('stub failNext throws on the next call and clears after one use', async () => {
    const stub = createStubHttpReachabilityAdapter();
    stub.failNext(new Error('boom'));
    await expect(stub.check('https://example.com/')).rejects.toThrow('boom');
    const after = await stub.check('https://example.com/');
    expect(after.reachable).toBe(true);
  });
});

describe('adapter-parity: MediaStorageAdapter contract', () => {
  let tmpDir: string;
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'photo-parity-'));
  });
  afterEach(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

  it('local adapter satisfies put/exists/delete/constructURL', async () => {
    const adapter: MediaStorageAdapter = createLocalMediaStorageAdapter({
      baseDir: tmpDir,
    });
    const key = 'avatars/parity-test.bin';
    expect(await adapter.exists(key)).toBe(false);
    await adapter.put(key, Buffer.from('parity-data'));
    expect(await adapter.exists(key)).toBe(true);
    expect(adapter.constructURL(key)).toContain(key);
    await adapter.delete(key);
    expect(await adapter.exists(key)).toBe(false);
  });

  it('delete is idempotent for a missing key', async () => {
    const adapter = createLocalMediaStorageAdapter({ baseDir: tmpDir });
    await expect(adapter.delete('never/written.bin')).resolves.toBeUndefined();
  });

  it('local adapter get round-trips bytes written via put', async () => {
    const adapter = createLocalMediaStorageAdapter({ baseDir: tmpDir });
    const key = 'pending/job1/source.mp4';
    const payload = Buffer.from('fake-mp4-bytes');
    await adapter.put(key, payload);
    const fetched = await adapter.get(key);
    expect(fetched.equals(payload)).toBe(true);
  });

  it('local generatePresignedPutUrl returns a stub URL with content-type and TTL', async () => {
    const adapter = createLocalMediaStorageAdapter({ baseDir: tmpDir });
    const url = await adapter.generatePresignedPutUrl(
      'pending/job1/source.mp4',
      'video/mp4',
      900,
    );
    expect(url).toContain('/_local-presigned-put/pending/job1/source.mp4');
    expect(url).toContain('X-Amz-Algorithm=LOCAL-STUB');
    expect(url).toContain('X-Amz-Expires=900');
    expect(url).toContain('Content-Type=video%2Fmp4');
  });

  it('local headSize returns stored byte count, and null for a missing key (parity with S3 HeadObject ContentLength)', async () => {
    const adapter = createLocalMediaStorageAdapter({ baseDir: tmpDir });
    const key = 'pending/job1/source.mp4';
    expect(await adapter.headSize(key)).toBeNull();
    await adapter.put(key, Buffer.from('twelve-bytes'));
    expect(await adapter.headSize(key)).toBe(12);
  });
});

// Composite two-lane local adapter: baseDir = runtime upload lane (read+write),
// fallbackDir = curated lane (read-only). Models dev parity with the single
// prod S3 bucket while keeping curated and upload bytes in separate dirs.
describe('local adapter: composite curated fallback lane', () => {
  let baseDir: string;
  let curatedDir: string;
  beforeEach(() => {
    baseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lane-base-'));
    curatedDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lane-curated-'));
  });
  afterEach(() => {
    fs.rmSync(baseDir, { recursive: true, force: true });
    fs.rmSync(curatedDir, { recursive: true, force: true });
  });

  it('get falls back to the curated lane when the key is absent from baseDir', async () => {
    const adapter = createLocalMediaStorageAdapter({ baseDir, fallbackDir: curatedDir });
    const key = 'member_fh/detached/abc-display.jpg';
    fs.mkdirSync(path.join(curatedDir, path.dirname(key)), { recursive: true });
    fs.writeFileSync(path.join(curatedDir, key), Buffer.from('curated-bytes'));
    const fetched = await adapter.get(key);
    expect(fetched.equals(Buffer.from('curated-bytes'))).toBe(true);
  });

  it('exists is true for a key in either lane', async () => {
    const adapter = createLocalMediaStorageAdapter({ baseDir, fallbackDir: curatedDir });
    await adapter.put('avatars/m1/thumb.jpg', Buffer.from('upload'));
    fs.mkdirSync(path.join(curatedDir, 'member_fh/detached'), { recursive: true });
    fs.writeFileSync(path.join(curatedDir, 'member_fh/detached/x.jpg'), Buffer.from('c'));
    expect(await adapter.exists('avatars/m1/thumb.jpg')).toBe(true);
    expect(await adapter.exists('member_fh/detached/x.jpg')).toBe(true);
  });

  it('get of a key in neither lane rejects (parity with S3 NoSuchKey)', async () => {
    const adapter = createLocalMediaStorageAdapter({ baseDir, fallbackDir: curatedDir });
    await expect(adapter.get('nope/missing.jpg')).rejects.toThrow();
  });

  it('put writes only to baseDir, never the curated lane', async () => {
    const adapter = createLocalMediaStorageAdapter({ baseDir, fallbackDir: curatedDir });
    const key = 'avatars/m1/display.jpg';
    await adapter.put(key, Buffer.from('upload'));
    expect(fs.existsSync(path.join(baseDir, key))).toBe(true);
    expect(fs.existsSync(path.join(curatedDir, key))).toBe(false);
  });

  it('delete removes from baseDir only and leaves the curated lane intact', async () => {
    const adapter = createLocalMediaStorageAdapter({ baseDir, fallbackDir: curatedDir });
    const key = 'shared/same-name.jpg';
    await adapter.put(key, Buffer.from('upload'));
    fs.mkdirSync(path.join(curatedDir, 'shared'), { recursive: true });
    fs.writeFileSync(path.join(curatedDir, key), Buffer.from('curated'));
    await adapter.delete(key);
    expect(fs.existsSync(path.join(baseDir, key))).toBe(false);
    expect(fs.existsSync(path.join(curatedDir, key))).toBe(true);
  });
});

interface FakeS3State {
  client: S3Client;
  puts: PutObjectCommand[];
  gets: GetObjectCommand[];
  deletes: DeleteObjectCommand[];
  heads: HeadObjectCommand[];
  store: Map<string, Buffer>;
}

function makeFakeS3Client(): FakeS3State {
  const puts: PutObjectCommand[] = [];
  const gets: GetObjectCommand[] = [];
  const deletes: DeleteObjectCommand[] = [];
  const heads: HeadObjectCommand[] = [];
  const store = new Map<string, Buffer>();
  const fake = {
    send: async (cmd: unknown): Promise<unknown> => {
      if (cmd instanceof PutObjectCommand) {
        puts.push(cmd);
        const body = cmd.input.Body as Buffer | Uint8Array;
        store.set(
          `${cmd.input.Bucket}/${cmd.input.Key}`,
          Buffer.isBuffer(body) ? body : Buffer.from(body),
        );
        return {};
      }
      if (cmd instanceof GetObjectCommand) {
        gets.push(cmd);
        const lookupKey = `${cmd.input.Bucket}/${cmd.input.Key}`;
        const data = store.get(lookupKey);
        if (!data) {
          const err = new Error('NoSuchKey');
          err.name = 'NoSuchKey';
          throw err;
        }
        return { Body: Readable.from([data]) };
      }
      if (cmd instanceof DeleteObjectCommand) {
        deletes.push(cmd);
        store.delete(`${cmd.input.Bucket}/${cmd.input.Key}`);
        return {};
      }
      if (cmd instanceof HeadObjectCommand) {
        heads.push(cmd);
        const lookupKey = `${cmd.input.Bucket}/${cmd.input.Key}`;
        const stored = store.get(lookupKey);
        if (stored) return { ContentLength: stored.length };
        const err = new Error('Not Found');
        err.name = 'NotFound';
        throw err;
      }
      throw new Error('unexpected S3 command');
    },
  };
  return {
    client: fake as unknown as S3Client,
    puts,
    gets,
    deletes,
    heads,
    store,
  };
}

describe('adapter-parity: MediaStorageAdapter S3 contract', () => {
  it('s3 adapter satisfies put/exists/delete/constructURL round-trip', async () => {
    const fake = makeFakeS3Client();
    const adapter = createS3MediaStorageAdapter({
      bucket: 'parity-bucket',
      s3Client: fake.client,
    });
    const key = 'avatars/m-1/thumb.jpg';
    expect(await adapter.exists(key)).toBe(false);
    await adapter.put(key, Buffer.from('round-trip-bytes'));
    expect(await adapter.exists(key)).toBe(true);
    expect(adapter.constructURL(key)).toBe('/media-store/avatars/m-1/thumb.jpg');
    await adapter.delete(key);
    expect(await adapter.exists(key)).toBe(false);
  });

  it('s3 delete is idempotent for a missing key', async () => {
    const fake = makeFakeS3Client();
    const adapter = createS3MediaStorageAdapter({
      bucket: 'parity-bucket',
      s3Client: fake.client,
    });
    await expect(adapter.delete('never/written.bin')).resolves.toBeUndefined();
    expect(fake.deletes).toHaveLength(1);
  });

  it('s3 put sends Cache-Control: immutable + ContentType: image/jpeg', async () => {
    const fake = makeFakeS3Client();
    const adapter = createS3MediaStorageAdapter({
      bucket: 'parity-bucket',
      s3Client: fake.client,
    });
    await adapter.put('avatars/m-2/display.jpg', Buffer.from('bytes'));
    expect(fake.puts).toHaveLength(1);
    const input = fake.puts[0].input;
    expect(input.Bucket).toBe('parity-bucket');
    expect(input.Key).toBe('avatars/m-2/display.jpg');
    expect(input.ContentType).toBe('image/jpeg');
    expect(input.CacheControl).toBe('public, max-age=31536000, immutable');
  });

  it('s3 headSize returns ContentLength, and null on NotFound (parity with local)', async () => {
    const fake = makeFakeS3Client();
    const adapter = createS3MediaStorageAdapter({
      bucket: 'parity-bucket',
      s3Client: fake.client,
    });
    const key = 'pending/job1/source.mp4';
    expect(await adapter.headSize(key)).toBeNull();
    await adapter.put(key, Buffer.from('twelve-bytes'));
    expect(await adapter.headSize(key)).toBe(12);
  });

  it('s3 exists returns false on NotFound', async () => {
    const fake = makeFakeS3Client();
    const adapter = createS3MediaStorageAdapter({
      bucket: 'parity-bucket',
      s3Client: fake.client,
    });
    expect(await adapter.exists('avatars/missing.jpg')).toBe(false);
    expect(fake.heads).toHaveLength(1);
  });

  it('s3 exists rethrows non-NotFound errors', async () => {
    const accessDeniedClient = {
      send: async () => {
        const err = new Error('Access Denied');
        err.name = 'AccessDenied';
        throw err;
      },
    } as unknown as S3Client;
    const adapter = createS3MediaStorageAdapter({
      bucket: 'parity-bucket',
      s3Client: accessDeniedClient,
    });
    await expect(adapter.exists('avatars/x.jpg')).rejects.toMatchObject({
      name: 'AccessDenied',
    });
  });

  it('s3 constructURL returns /media-store/{key} (parity with local)', () => {
    const localAdapter = createLocalMediaStorageAdapter({ baseDir: '/tmp' });
    const s3Adapter = createS3MediaStorageAdapter({
      bucket: 'parity-bucket',
      s3Client: makeFakeS3Client().client,
    });
    const key = 'avatars/m-3/thumb.jpg';
    expect(localAdapter.constructURL(key)).toBe('/media-store/avatars/m-3/thumb.jpg');
    expect(s3Adapter.constructURL(key)).toBe('/media-store/avatars/m-3/thumb.jpg');
  });

  it('s3 get streams body to a Buffer matching what put stored', async () => {
    const fake = makeFakeS3Client();
    const adapter = createS3MediaStorageAdapter({
      bucket: 'parity-bucket',
      s3Client: fake.client,
    });
    const payload = Buffer.from('source-mp4-bytes');
    await adapter.put('pending/job1/source.mp4', payload);
    const fetched = await adapter.get('pending/job1/source.mp4');
    expect(fetched.equals(payload)).toBe(true);
    expect(fake.gets).toHaveLength(1);
    expect(fake.gets[0].input.Bucket).toBe('parity-bucket');
    expect(fake.gets[0].input.Key).toBe('pending/job1/source.mp4');
  });

  it('s3 generatePresignedPutUrl emits a SigV4 query string with bound ContentType and TTL', async () => {
    // Real S3Client with fake credentials; getSignedUrl signs locally without
    // calling AWS. The fake `send`-only client used elsewhere can't satisfy
    // the SDK's credential resolver, so the presign path uses a real client.
    // requestChecksumCalculation: 'WHEN_REQUIRED' matches the production
    // adapter's client construction; default 'WHEN_SUPPORTED' would inject
    // x-amz-checksum-crc32 of an empty body, which the browser cannot match.
    const realClient = new S3Client({
      region: 'us-east-1',
      credentials: { accessKeyId: 'AKIAFAKEACCESSKEY', secretAccessKey: 'fakesecret' },
      requestChecksumCalculation: 'WHEN_REQUIRED',
    });
    const adapter = createS3MediaStorageAdapter({
      bucket: 'parity-bucket',
      s3Client: realClient,
    });
    const url = await adapter.generatePresignedPutUrl(
      'pending/job1/source.mp4',
      'video/mp4',
      900,
    );
    expect(url).toMatch(/^https:\/\/parity-bucket\.s3\.us-east-1\.amazonaws\.com\/pending\/job1\/source\.mp4\?/);
    expect(url).toContain('X-Amz-Algorithm=AWS4-HMAC-SHA256');
    expect(url).toContain('X-Amz-Expires=900');
    // ContentType binding via signableHeaders: shows up in X-Amz-SignedHeaders.
    expect(url).toMatch(/X-Amz-SignedHeaders=[^&]*content-type/);
    // No SDK auto-checksum should appear: it would block browser uploads.
    expect(url).not.toContain('x-amz-checksum-crc32');
    expect(url).not.toContain('x-amz-sdk-checksum-algorithm');
  });
});

describe('adapter-parity: ImageProcessingAdapter contract', () => {
  async function makeJpeg(width = 50, height = 50): Promise<Buffer> {
    return sharp({
      create: { width, height, channels: 3, background: { r: 100, g: 150, b: 200 } },
    })
      .jpeg()
      .toBuffer();
  }

  function makeProcessingFakeFetch(): {
    fetchImpl: typeof fetch;
    calls: Array<{ url: string; method: string; contentType: string; bodyLen: number }>;
  } {
    const calls: Array<{ url: string; method: string; contentType: string; bodyLen: number }> = [];
    const fetchImpl: typeof fetch = async (input, init) => {
      const url = typeof input === 'string' ? input : input.toString();
      const method = (init?.method ?? 'GET').toUpperCase();
      const headers = (init?.headers ?? {}) as Record<string, string>;
      const contentType = headers['Content-Type'] ?? headers['content-type'] ?? '';
      const body = init?.body as Buffer | Uint8Array;
      const buf = Buffer.isBuffer(body) ? body : Buffer.from(body);
      calls.push({ url, method, contentType, bodyLen: buf.length });
      const processed = await processAvatar(buf);
      return new Response(
        JSON.stringify({
          thumb: processed.thumb.toString('base64'),
          display: processed.display.toString('base64'),
          widthPx: processed.widthPx,
          heightPx: processed.heightPx,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    };
    return { fetchImpl, calls };
  }

  it('round-trips real JPEG bytes through the HTTP boundary', async () => {
    const { fetchImpl, calls } = makeProcessingFakeFetch();
    const adapter = createHttpImageAdapter({ internalSecret: TEST_INTERNAL_SECRET, baseUrl: 'http://fake', fetchImpl });
    const jpeg = await makeJpeg(100, 80);

    const result = await adapter.processAvatar(jpeg);

    expect(result.widthPx).toBe(100);
    expect(result.heightPx).toBe(80);
    expect(Buffer.isBuffer(result.thumb)).toBe(true);
    expect(Buffer.isBuffer(result.display)).toBe(true);
    expect(result.thumb.length).toBeGreaterThan(0);
    expect(result.display.length).toBeGreaterThan(0);

    // Decode the returned thumb back through Sharp and confirm dimensions.
    const thumbMeta = await sharp(result.thumb).metadata();
    expect(thumbMeta.width).toBe(300);
    expect(thumbMeta.height).toBe(300);
    expect(thumbMeta.format).toBe('jpeg');

    const displayMeta = await sharp(result.display).metadata();
    expect(displayMeta.format).toBe('jpeg');
    expect(displayMeta.width).toBeLessThanOrEqual(800);

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('http://fake/process/avatar');
    expect(calls[0].method).toBe('POST');
    expect(calls[0].contentType).toBe('application/octet-stream');
    expect(calls[0].bodyLen).toBe(jpeg.length);
  });

  it('strips a trailing slash from baseUrl', async () => {
    const { fetchImpl, calls } = makeProcessingFakeFetch();
    const adapter = createHttpImageAdapter({ internalSecret: TEST_INTERNAL_SECRET, baseUrl: 'http://fake/', fetchImpl });
    await adapter.processAvatar(await makeJpeg());
    expect(calls[0].url).toBe('http://fake/process/avatar');
  });

  it('throws ImageProcessingError on 400 with image-type message', async () => {
    const fetchImpl: typeof fetch = async () =>
      new Response(JSON.stringify({ error: 'unrecognized image type' }), { status: 400 });
    const adapter = createHttpImageAdapter({ internalSecret: TEST_INTERNAL_SECRET, baseUrl: 'http://fake', fetchImpl });
    await expect(adapter.processAvatar(Buffer.from('not-an-image'))).rejects.toMatchObject({
      name: 'ImageProcessingError',
      status: 400,
    });
    await expect(adapter.processAvatar(Buffer.from('not-an-image'))).rejects.toThrow(
      /image type/,
    );
  });

  it('throws ImageProcessingError on 503', async () => {
    const fetchImpl: typeof fetch = async () =>
      new Response(JSON.stringify({ error: 'busy' }), { status: 503 });
    const adapter = createHttpImageAdapter({ internalSecret: TEST_INTERNAL_SECRET, baseUrl: 'http://fake', fetchImpl });
    await expect(adapter.processAvatar(await makeJpeg())).rejects.toMatchObject({
      name: 'ImageProcessingError',
      status: 503,
    });
  });

  it('throws on timeout', async () => {
    const fetchImpl: typeof fetch = (_input, init) =>
      new Promise<Response>((_resolve, reject) => {
        const signal = init?.signal as AbortSignal | undefined;
        signal?.addEventListener('abort', () => {
          const err = new Error('aborted');
          err.name = 'AbortError';
          reject(err);
        });
      });
    const adapter = createHttpImageAdapter({
      internalSecret: TEST_INTERNAL_SECRET,
      baseUrl: 'http://fake',
      fetchImpl,
      timeoutMs: 50,
    });
    const err = await adapter.processAvatar(await makeJpeg()).then(
      () => null,
      (e) => e,
    );
    expect(err).toBeInstanceOf(ImageProcessingError);
    expect((err as Error).message).toMatch(/timed out/);
  });

  it('wraps fetch transport errors as ImageProcessingError', async () => {
    const fetchImpl: typeof fetch = async () => {
      throw new Error('ECONNREFUSED');
    };
    const adapter = createHttpImageAdapter({ internalSecret: TEST_INTERNAL_SECRET, baseUrl: 'http://fake', fetchImpl });
    await expect(adapter.processAvatar(await makeJpeg())).rejects.toMatchObject({
      name: 'ImageProcessingError',
    });
    await expect(adapter.processAvatar(await makeJpeg())).rejects.toThrow(/ECONNREFUSED/);
  });
});

describe('adapter-parity: VideoTranscodingAdapter contract', () => {
  function makeTinyMp4(): Buffer {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'video-parity-'));
    const outPath = path.join(tmpDir, 'tiny.mp4');
    try {
      const r = spawnSync(
        'ffmpeg',
        [
          '-f', 'lavfi',
          '-i', 'color=c=blue:s=64x64:d=0.2:r=10',
          '-c:v', 'libx264',
          '-pix_fmt', 'yuv420p',
          '-y',
          outPath,
        ],
        { stdio: 'ignore' },
      );
      if (r.status !== 0) throw new Error('ffmpeg synth failed');
      return fs.readFileSync(outPath);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  }

  function makeTranscodingFakeFetch(): {
    fetchImpl: typeof fetch;
    calls: Array<{ url: string; method: string; contentType: string; bodyLen: number }>;
  } {
    const calls: Array<{ url: string; method: string; contentType: string; bodyLen: number }> = [];
    const fetchImpl: typeof fetch = async (input, init) => {
      const url = typeof input === 'string' ? input : input.toString();
      const method = (init?.method ?? 'GET').toUpperCase();
      const headers = (init?.headers ?? {}) as Record<string, string>;
      const contentType = headers['Content-Type'] ?? headers['content-type'] ?? '';
      const body = init?.body as Buffer | Uint8Array;
      const buf = Buffer.isBuffer(body) ? body : Buffer.from(body);
      calls.push({ url, method, contentType, bodyLen: buf.length });
      // Run the real ffmpeg pipeline inline so the bytes round-tripping
      // through the adapter are real mp4. Mirrors the Sharp parity test.
      const result = await transcodeCuratorVideo(buf);
      return new Response(
        JSON.stringify({
          bytes: result.bytes.toString('base64'),
          outputFormat: result.outputFormat,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    };
    return { fetchImpl, calls };
  }

  it.skipIf(!ffmpegAvailable)(
    'round-trips real mp4 bytes through the HTTP boundary',
    async () => {
      const { fetchImpl, calls } = makeTranscodingFakeFetch();
      const adapter = createHttpVideoTranscodingAdapter({ mediaStorage: makeFakeMediaStorage(), internalSecret: TEST_INTERNAL_SECRET, baseUrl: 'http://fake', fetchImpl });
      const mp4 = makeTinyMp4();

      const result = await adapter.transcode(mp4);

      expect(Buffer.isBuffer(result.bytes)).toBe(true);
      expect(result.bytes.length).toBeGreaterThan(0);
      expect(result.outputFormat).toBe('mp4');
      expect(detectVideoFormat(result.bytes)).toBe('mp4');

      expect(calls).toHaveLength(1);
      expect(calls[0].url).toBe('http://fake/process/video');
      expect(calls[0].method).toBe('POST');
      expect(calls[0].contentType).toBe('application/octet-stream');
      expect(calls[0].bodyLen).toBe(mp4.length);
    },
  );

  it.skipIf(!ffmpegAvailable)(
    'strips a trailing slash from baseUrl',
    async () => {
      const { fetchImpl, calls } = makeTranscodingFakeFetch();
      const adapter = createHttpVideoTranscodingAdapter({ mediaStorage: makeFakeMediaStorage(), internalSecret: TEST_INTERNAL_SECRET, baseUrl: 'http://fake/', fetchImpl });
      await adapter.transcode(makeTinyMp4());
      expect(calls[0].url).toBe('http://fake/process/video');
    },
  );

  it('throws VideoTranscodingError on 400 with rejected-video message', async () => {
    const fetchImpl: typeof fetch = async () =>
      new Response(JSON.stringify({ error: 'unrecognized video format' }), { status: 400 });
    const adapter = createHttpVideoTranscodingAdapter({ mediaStorage: makeFakeMediaStorage(), internalSecret: TEST_INTERNAL_SECRET, baseUrl: 'http://fake', fetchImpl });
    await expect(adapter.transcode(Buffer.from('not-a-video'))).rejects.toMatchObject({
      name: 'VideoTranscodingError',
      status: 400,
    });
    await expect(adapter.transcode(Buffer.from('not-a-video'))).rejects.toThrow(/rejected video/);
  });

  it('throws VideoTranscodingError on 503', async () => {
    const fetchImpl: typeof fetch = async () =>
      new Response(JSON.stringify({ error: 'busy' }), { status: 503 });
    const adapter = createHttpVideoTranscodingAdapter({ mediaStorage: makeFakeMediaStorage(), internalSecret: TEST_INTERNAL_SECRET, baseUrl: 'http://fake', fetchImpl });
    await expect(adapter.transcode(Buffer.from('payload'))).rejects.toMatchObject({
      name: 'VideoTranscodingError',
      status: 503,
    });
  });

  it('throws on timeout', async () => {
    const fetchImpl: typeof fetch = (_input, init) =>
      new Promise<Response>((_resolve, reject) => {
        const signal = init?.signal as AbortSignal | undefined;
        signal?.addEventListener('abort', () => {
          const err = new Error('aborted');
          err.name = 'AbortError';
          reject(err);
        });
      });
    const adapter = createHttpVideoTranscodingAdapter({
      mediaStorage: makeFakeMediaStorage(),
      internalSecret: TEST_INTERNAL_SECRET,
      baseUrl: 'http://fake',
      fetchImpl,
      timeoutMs: 50,
    });
    const err = await adapter.transcode(Buffer.from('payload')).then(
      () => null,
      (e) => e,
    );
    expect(err).toBeInstanceOf(VideoTranscodingError);
    expect((err as Error).message).toMatch(/timed out/);
  });

  it('wraps fetch transport errors as VideoTranscodingError', async () => {
    const fetchImpl: typeof fetch = async () => {
      throw new Error('ECONNREFUSED');
    };
    const adapter = createHttpVideoTranscodingAdapter({ mediaStorage: makeFakeMediaStorage(), internalSecret: TEST_INTERNAL_SECRET, baseUrl: 'http://fake', fetchImpl });
    await expect(adapter.transcode(Buffer.from('payload'))).rejects.toMatchObject({
      name: 'VideoTranscodingError',
    });
    await expect(adapter.transcode(Buffer.from('payload'))).rejects.toThrow(/ECONNREFUSED/);
  });

  // ── transcodeFromStorage method ────────────────────────────────────────
  // The from-storage variant presigns the S3 GET (source) + PUT (output) on
  // the web side and ships opaque URLs to the image worker. Bytes never
  // traverse the dispatching process; the image worker holds no AWS creds.
  // SEC-D02 / SEC-A17.

  it('transcodeFromStorage: presigns sourceKey/outputKey, POSTs URLs + auth header', async () => {
    const calls: Array<{ url: string; method: string; contentType: string; secret: string; body: string }> = [];
    const fetchImpl: typeof fetch = async (input, init) => {
      const url = typeof input === 'string' ? input : input.toString();
      const method = (init?.method ?? 'GET').toUpperCase();
      const headers = (init?.headers ?? {}) as Record<string, string>;
      const contentType = headers['Content-Type'] ?? headers['content-type'] ?? '';
      const secret = headers['x-internal-secret'] ?? headers['X-Internal-Secret'] ?? '';
      const body = typeof init?.body === 'string' ? init.body : '';
      calls.push({ url, method, contentType, secret, body });
      return new Response(
        JSON.stringify({
          ok: true,
          outputKey: 'system_member/detached/media_xxx-video.mp4',
          outputFormat: 'mp4',
          outputBytes: 12345,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    };
    // Capture the keys the adapter tries to presign so we can assert it
    // forwarded the caller's keys to the storage adapter (vs. some other
    // value being injected upstream).
    const presignedKeys: { gets: string[]; puts: Array<{ key: string; ct: string }> } = {
      gets: [],
      puts: [],
    };
    const mediaStorage = makeFakeMediaStorage({
      presignedGet: async (key) => {
        presignedKeys.gets.push(key);
        return `https://fake-presign.example/${key}?get=1`;
      },
      presignedPut: async (key, ct) => {
        presignedKeys.puts.push({ key, ct });
        return `https://fake-presign.example/${key}?put=1`;
      },
    });
    const adapter = createHttpVideoTranscodingAdapter({
      mediaStorage,
      internalSecret: TEST_INTERNAL_SECRET,
      baseUrl: 'http://fake',
      fetchImpl,
    });
    const result = await adapter.transcodeFromStorage(
      'pending/job-x/source.mp4',
      'system_member/detached/media_xxx-video.mp4',
    );
    expect(result.outputKey).toBe('system_member/detached/media_xxx-video.mp4');
    expect(result.outputFormat).toBe('mp4');
    expect(result.outputBytes).toBe(12345);

    // Caller's keys reached the storage adapter for presigning.
    expect(presignedKeys.gets).toEqual(['pending/job-x/source.mp4']);
    expect(presignedKeys.puts).toEqual([
      { key: 'system_member/detached/media_xxx-video.mp4', ct: 'video/mp4' },
    ]);

    // Worker received URLs + auth header, not the raw keys.
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('http://fake/process/video-from-storage');
    expect(calls[0].method).toBe('POST');
    expect(calls[0].contentType).toBe('application/json');
    expect(calls[0].secret).toBe(TEST_INTERNAL_SECRET);
    const parsed = JSON.parse(calls[0].body) as {
      sourceUrl?: string;
      putUrl?: string;
      putContentType?: string;
      sourceKey?: string;
      outputKey?: string;
    };
    expect(parsed.sourceUrl).toBe('https://fake-presign.example/pending/job-x/source.mp4?get=1');
    expect(parsed.putUrl).toBe('https://fake-presign.example/system_member/detached/media_xxx-video.mp4?put=1');
    expect(parsed.putContentType).toBe('video/mp4');
    expect(parsed.outputKey).toBe('system_member/detached/media_xxx-video.mp4');
    // Old wire shape must NOT be present (regression guard for SEC-A17).
    expect(parsed.sourceKey).toBeUndefined();
  });

  it('transcodeFromStorage + transcode: every image-worker call carries x-internal-secret', async () => {
    const seenSecrets: string[] = [];
    const fetchImpl: typeof fetch = async (_input, init) => {
      const headers = (init?.headers ?? {}) as Record<string, string>;
      seenSecrets.push(headers['x-internal-secret'] ?? '');
      return new Response(
        JSON.stringify({
          ok: true,
          outputKey: 'k',
          outputFormat: 'mp4',
          outputBytes: 0,
          bytes: '',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    };
    const adapter = createHttpVideoTranscodingAdapter({
      mediaStorage: makeFakeMediaStorage(),
      internalSecret: TEST_INTERNAL_SECRET,
      baseUrl: 'http://fake',
      fetchImpl,
    });
    await adapter.transcode(Buffer.from('payload')).catch(() => {});
    await adapter.transcodeFromStorage('a', 'b').catch(() => {});
    expect(seenSecrets).toHaveLength(2);
    for (const s of seenSecrets) {
      expect(s).toBe(TEST_INTERNAL_SECRET);
    }
  });

  it('transcodeFromStorage: throws VideoTranscodingError on 400 with rejected-job message', async () => {
    const fetchImpl: typeof fetch = async () =>
      new Response(JSON.stringify({ error: 'unrecognized video format' }), { status: 400 });
    const adapter = createHttpVideoTranscodingAdapter({ mediaStorage: makeFakeMediaStorage(), internalSecret: TEST_INTERNAL_SECRET, baseUrl: 'http://fake', fetchImpl });
    await expect(adapter.transcodeFromStorage('a', 'b')).rejects.toMatchObject({
      name: 'VideoTranscodingError',
      status: 400,
    });
    await expect(adapter.transcodeFromStorage('a', 'b')).rejects.toThrow(/rejected job/);
  });

  it('transcodeFromStorage: throws VideoTranscodingError on 413 (oversized source)', async () => {
    const fetchImpl: typeof fetch = async () =>
      new Response(JSON.stringify({ error: 'source object exceeds videoMaxBytes' }), { status: 413 });
    const adapter = createHttpVideoTranscodingAdapter({ mediaStorage: makeFakeMediaStorage(), internalSecret: TEST_INTERNAL_SECRET, baseUrl: 'http://fake', fetchImpl });
    await expect(adapter.transcodeFromStorage('a', 'b')).rejects.toMatchObject({
      name: 'VideoTranscodingError',
      status: 413,
    });
  });

  it('transcodeFromStorage: throws VideoTranscodingError on 502 (s3 get failed)', async () => {
    const fetchImpl: typeof fetch = async () =>
      new Response(JSON.stringify({ error: 's3 get failed: NoSuchKey' }), { status: 502 });
    const adapter = createHttpVideoTranscodingAdapter({ mediaStorage: makeFakeMediaStorage(), internalSecret: TEST_INTERNAL_SECRET, baseUrl: 'http://fake', fetchImpl });
    await expect(adapter.transcodeFromStorage('a', 'b')).rejects.toMatchObject({
      name: 'VideoTranscodingError',
      status: 502,
    });
  });

  it('transcodeFromStorage: wraps fetch transport errors', async () => {
    const fetchImpl: typeof fetch = async () => {
      throw new Error('ECONNREFUSED');
    };
    const adapter = createHttpVideoTranscodingAdapter({ mediaStorage: makeFakeMediaStorage(), internalSecret: TEST_INTERNAL_SECRET, baseUrl: 'http://fake', fetchImpl });
    await expect(adapter.transcodeFromStorage('a', 'b')).rejects.toThrow(/ECONNREFUSED/);
  });

  it('transcodeFromStorage: throws on timeout', async () => {
    const fetchImpl: typeof fetch = (_input, init) =>
      new Promise<Response>((_resolve, reject) => {
        const signal = init?.signal as AbortSignal | undefined;
        signal?.addEventListener('abort', () => {
          const err = new Error('aborted');
          err.name = 'AbortError';
          reject(err);
        });
      });
    const adapter = createHttpVideoTranscodingAdapter({
      mediaStorage: makeFakeMediaStorage(),
      internalSecret: TEST_INTERNAL_SECRET,
      baseUrl: 'http://fake',
      fetchImpl,
      timeoutMs: 50,
    });
    await expect(adapter.transcodeFromStorage('a', 'b')).rejects.toThrow(/timed out/);
  });
});

describe('adapter-parity: PaymentAdapter (Stub vs. Live interface)', () => {
  // Fake Stripe client driven by captured params. Stands in for the Stripe
  // SDK call path without mocking the stripe package itself.
  function makeFakeStripe(sessionOverrides: Partial<{
    id: string;
    url: string | null;
    payment_intent: string | { id: string } | null;
  }> = {}) {
    const captured: {
      sessions: import('../../src/adapters/paymentAdapter').StripeCheckoutSessionCreateParams[];
      subscriptionUpdates: { id: string; params: { cancel_at_period_end: boolean } }[];
    } = { sessions: [], subscriptionUpdates: [] };
    const client: import('../../src/adapters/paymentAdapter').StripeClientLike = {
      checkout: {
        sessions: {
          async create(params) {
            captured.sessions.push(params);
            return {
              id: sessionOverrides.id ?? 'cs_fake_123',
              url: sessionOverrides.url === undefined ? 'https://checkout.stripe.example/cs_fake_123' : sessionOverrides.url,
              payment_intent: sessionOverrides.payment_intent === undefined ? 'pi_fake_123' : sessionOverrides.payment_intent,
            };
          },
        },
      },
      subscriptions: {
        async update(id, params) {
          captured.subscriptionUpdates.push({ id, params });
          return {};
        },
      },
    };
    return { client, captured };
  }

  function makeLive(sessionOverrides: Parameters<typeof makeFakeStripe>[0] = {}) {
    const { client, captured } = makeFakeStripe(sessionOverrides);
    const secrets = createStubSecretsAdapter();
    secrets.setSecret('stripe_secret_key', 'sk_test_parity_fake');
    let factoryCalls = 0;
    const adapter = createLivePaymentAdapter({
      secrets,
      stripeFactory: (apiKey) => {
        factoryCalls += 1;
        expect(apiKey).toBe('sk_test_parity_fake');
        return client;
      },
    });
    return { adapter, captured, secrets, factoryCalls: () => factoryCalls };
  }

  const ONE_TIME_OPTS = {
    memberId: 'm-parity-1',
    paymentId: 'pay-parity-1',
    amountCents: 2500,
    currency: 'USD',
    descriptor: 'IFPA Membership (Tier 1)',
    paymentType: 'membership' as const,
    purchasedTierStatus: 'tier1' as const,
    successUrl: 'https://footbag.org/payments/success?session_id={CHECKOUT_SESSION_ID}',
    cancelUrl: 'https://footbag.org/payments/cancel?session_id={CHECKOUT_SESSION_ID}',
    metadata: { tier: 'tier1' },
  };

  it('both return { sessionId, paymentIntentId, redirectUrl } from createCheckoutSession', async () => {
    const stub = createStubPaymentAdapter();
    const { adapter: live } = makeLive();
    for (const result of [
      await stub.createCheckoutSession(ONE_TIME_OPTS),
      await live.createCheckoutSession(ONE_TIME_OPTS),
    ]) {
      expect(typeof result.sessionId).toBe('string');
      expect(result.sessionId.length).toBeGreaterThan(0);
      expect(typeof result.redirectUrl).toBe('string');
      expect(result.paymentIntentId === null || typeof result.paymentIntentId === 'string').toBe(true);
    }
  });

  it('live createCheckoutSession sends payment mode, amount, lowercased currency, and the absolute URLs', async () => {
    const { adapter, captured } = makeLive();
    await adapter.createCheckoutSession(ONE_TIME_OPTS);
    const params = captured.sessions[0];
    expect(params.mode).toBe('payment');
    expect(params.client_reference_id).toBe('pay-parity-1');
    expect(params.line_items).toHaveLength(1);
    expect(params.line_items[0].quantity).toBe(1);
    expect(params.line_items[0].price_data.unit_amount).toBe(2500);
    expect(params.line_items[0].price_data.currency).toBe('usd');
    expect(params.line_items[0].price_data.product_data.name).toBe('IFPA Membership (Tier 1)');
    expect(params.success_url).toBe(ONE_TIME_OPTS.successUrl);
    expect(params.cancel_url).toBe(ONE_TIME_OPTS.cancelUrl);
  });

  it('live createCheckoutSession stamps paymentId/memberId into session AND payment_intent metadata', async () => {
    const { adapter, captured } = makeLive();
    await adapter.createCheckoutSession(ONE_TIME_OPTS);
    const params = captured.sessions[0];
    expect(params.metadata.paymentId).toBe('pay-parity-1');
    expect(params.metadata.memberId).toBe('m-parity-1');
    expect(params.metadata.tier).toBe('tier1');
    expect(params.payment_intent_data?.metadata.paymentId).toBe('pay-parity-1');
    expect(params.payment_intent_data?.metadata.memberId).toBe('m-parity-1');
  });

  it('live createCheckoutSession tolerates a deferred PaymentIntent (null) and unwraps object form', async () => {
    const { adapter: nullIntent } = makeLive({ payment_intent: null });
    expect((await nullIntent.createCheckoutSession(ONE_TIME_OPTS)).paymentIntentId).toBeNull();

    const { adapter: objIntent } = makeLive({ payment_intent: { id: 'pi_obj_9' } });
    expect((await objIntent.createCheckoutSession(ONE_TIME_OPTS)).paymentIntentId).toBe('pi_obj_9');
  });

  it('live createCheckoutSession rejects a session without a redirect URL', async () => {
    const { adapter } = makeLive({ url: null });
    await expect(adapter.createCheckoutSession(ONE_TIME_OPTS)).rejects.toThrow(/no redirect URL/);
  });

  it('live subscription checkout sends subscription mode with yearly recurring price and metadata mirror', async () => {
    const { adapter, captured } = makeLive();
    const result = await adapter.createSubscriptionCheckoutSession({
      memberId: 'm-parity-2',
      paymentId: 'pay-parity-2',
      amountCents: 5000,
      currency: 'USD',
      comment: 'HoF Fund',
      successUrl: 'https://footbag.org/payments/success?session_id={CHECKOUT_SESSION_ID}',
      cancelUrl: 'https://footbag.org/payments/cancel?session_id={CHECKOUT_SESSION_ID}',
    });
    const params = captured.sessions[0];
    expect(params.mode).toBe('subscription');
    expect(params.line_items[0].price_data.recurring).toEqual({ interval: 'year' });
    expect(params.subscription_data?.metadata.paymentId).toBe('pay-parity-2');
    expect(params.metadata.comment).toBe('HoF Fund');
    expect(result.paymentIntentId).toBeNull();
  });

  it('live cancelSubscriptionAtPeriodEnd updates the subscription with cancel_at_period_end=true', async () => {
    const { adapter, captured } = makeLive();
    await adapter.cancelSubscriptionAtPeriodEnd('sub_live_42');
    expect(captured.subscriptionUpdates).toEqual([
      { id: 'sub_live_42', params: { cancel_at_period_end: true } },
    ]);
  });

  it('live adapter resolves the API key once and reuses the client', async () => {
    const live = makeLive();
    await live.adapter.createCheckoutSession(ONE_TIME_OPTS);
    await live.adapter.createCheckoutSession(ONE_TIME_OPTS);
    expect(live.factoryCalls()).toBe(1);
  });

  it('live adapter refuses a missing API key with the operator put-parameter hint', async () => {
    const secrets = createStubSecretsAdapter();
    const adapter = createLivePaymentAdapter({
      secrets,
      stripeFactory: () => {
        throw new Error('factory must not be reached without a key');
      },
    });
    await expect(adapter.createCheckoutSession(ONE_TIME_OPTS)).rejects.toThrow(
      /Stripe API key not configured.*put-parameter/s,
    );
  });

  it('live adapter refuses the TODO bootstrap placeholder key', async () => {
    const secrets = createStubSecretsAdapter();
    secrets.setSecret('stripe_secret_key', 'TODO-set-via-cli-after-apply');
    const adapter = createLivePaymentAdapter({
      secrets,
      stripeFactory: () => {
        throw new Error('factory must not be reached with the placeholder');
      },
    });
    await expect(adapter.createCheckoutSession(ONE_TIME_OPTS)).rejects.toThrow(
      /bootstrap placeholder/,
    );
  });

  it('live constructWebhookEvent refuses to run without STRIPE_WEBHOOK_SECRET configured', () => {
    // This test file boots without STRIPE_WEBHOOK_SECRET, so the config
    // value is deterministically unset here; the live adapter must treat
    // that as a configuration invariant violation, never verify against an
    // empty secret. (The signature verify/map path itself is shared with
    // the stub adapter and covered by the webhook signature tests.)
    const { adapter } = makeLive();
    expect(() => adapter.constructWebhookEvent('{}', 't=1,v1=deadbeef')).toThrow(
      /STRIPE_WEBHOOK_SECRET is not configured/,
    );
  });
});
