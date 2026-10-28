/**
 * CaptchaAdapter: server-side verification of a Cloudflare Turnstile token.
 * `LiveCaptchaAdapter` calls the Turnstile siteverify endpoint; the stub passes
 * every non-empty token EXCEPT ones registered to fail or to be unavailable, so
 * a clean local checkout needs no Turnstile setup and route tests can still
 * reach the rejection and outage paths. The getter returns the configured
 * implementation based on `config.captchaAdapter`.
 *
 * The live secret is resolved via `SecretsAdapter` (SSM SecureString) and
 * preloaded at boot through `initCaptchaAdapter`, so a missing or placeholder
 * secret refuses the start rather than surfacing at the first sign-in; it is
 * never threaded as an env var. The live impl accepts an injected
 * `fetchClient` so the parity test can stand in a fake fetch without mocking
 * globalThis.fetch.
 *
 * `verify` never throws. It answers one of three outcomes: `passed`;
 * `rejected`, when the token itself is bad and the visitor should solve the
 * challenge again; or `unavailable`, when the verifier could not give an answer
 * (the secret unreadable, Cloudflare erroring or unreachable, a reply that
 * cannot be read). Unavailable fails closed: the caller refuses the form with
 * a retry-later answer and lets nothing through, and the adapter logs
 * `captcha.unavailable` at warn so the outage alarms.
 */
import { randomUUID } from 'crypto';
import { config } from '../config/env';
import { logger } from '../config/logger';
import {
  SecretNotConfiguredError,
  type SecretsAdapter,
  getSecretsAdapter,
} from './secretsAdapter';

const TURNSTILE_SITEVERIFY_ENDPOINT =
  'https://challenges.cloudflare.com/turnstile/v0/siteverify';

// Bound the outbound fetch, retries included, so a slow / hung Turnstile
// endpoint cannot tie up an Express request worker. Mirrors
// `safeBrowsingAdapter`'s TOTAL_BUDGET_MS.
const TOTAL_BUDGET_MS = 10_000;
// Cloudflare's guidance: retry a transient failure, at most three attempts in
// all, carrying one idempotency key so a retried check of a token that did
// reach Cloudflare is not refused as a duplicate.
const MAX_ATTEMPTS = 3;

const TURNSTILE_SECRET_KEY = 'turnstile_secret_key';
const TODO_PLACEHOLDER_PREFIX = 'TODO-';

// Siteverify error codes that mean the token is bad: the visitor solves the
// challenge again.
const REJECTED_ERROR_CODES = new Set([
  'invalid-input-response',
  'timeout-or-duplicate',
  'missing-input-response',
]);
// The one error code Cloudflare says to retry.
const RETRYABLE_ERROR_CODES = new Set(['internal-error']);

export type CaptchaResult =
  | { outcome: 'passed' }
  | { outcome: 'rejected' }
  | { outcome: 'unavailable'; cause: string };

export interface CaptchaAdapter {
  verify(token: string, remoteIp?: string): Promise<CaptchaResult>;
  /** Resolves the secret ahead of the first request; throws when it is unusable. */
  preloadSecret?(): Promise<void>;
}

export interface StubCaptchaAdapter extends CaptchaAdapter {
  /** Registers a token that `verify` will reject. */
  addFailToken(token: string): void;
  /** Registers a token that `verify` answers as unavailable. */
  addUnavailableToken(token: string): void;
  /** Clears the registered tokens. */
  clear(): void;
}

interface TurnstileApiResponse {
  success?: boolean;
  'error-codes'?: string[];
}

function unavailable(cause: string, errorCodes: string[] = []): CaptchaResult {
  logger.warn('captcha.unavailable', { cause, errorCodes });
  return { outcome: 'unavailable', cause };
}

export function createLiveCaptchaAdapter(opts: {
  secrets: SecretsAdapter;
  secretKey?: string;
  fetchClient?: typeof fetch;
}): CaptchaAdapter {
  const httpFetch = opts.fetchClient ?? fetch;
  const secretKey = opts.secretKey ?? TURNSTILE_SECRET_KEY;
  let resolvedSecret: string | null = null;
  async function resolveSecret(): Promise<string> {
    if (resolvedSecret !== null) return resolvedSecret;
    let value: string;
    try {
      value = await opts.secrets.getRequired(secretKey);
    } catch (err) {
      if (err instanceof SecretNotConfiguredError) {
        throw new Error(
          `Turnstile secret not configured. SSM parameter ".../secrets/${secretKey}" is missing. ` +
            `Operator: aws ssm put-parameter --name <full-name> --value file://path-to-secret --type SecureString --overwrite`,
        );
      }
      throw err;
    }
    if (value.startsWith(TODO_PLACEHOLDER_PREFIX)) {
      throw new Error(
        `Turnstile secret SSM parameter still has the bootstrap placeholder. ` +
          `Operator: aws ssm put-parameter --name <full-name> --value file://path-to-secret --type SecureString --overwrite`,
      );
    }
    resolvedSecret = value;
    return resolvedSecret;
  }
  return {
    async preloadSecret() {
      await resolveSecret();
    },
    async verify(token, remoteIp) {
      // Siteverify answers missing-input-response for an empty token; refuse it
      // without the round trip.
      if (!token) return { outcome: 'rejected' };
      let secret: string;
      try {
        secret = await resolveSecret();
      } catch {
        return unavailable('secret');
      }
      const form = new URLSearchParams();
      form.set('secret', secret);
      form.set('response', token);
      if (remoteIp) form.set('remoteip', remoteIp);
      form.set('idempotency_key', randomUUID());
      const controller = new AbortController();
      const deadline = setTimeout(() => controller.abort(), TOTAL_BUDGET_MS);
      try {
        let last: { cause: string; errorCodes: string[] } = { cause: 'network', errorCodes: [] };
        for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
          let res: Response;
          try {
            res = await httpFetch(TURNSTILE_SITEVERIFY_ENDPOINT, {
              method: 'POST',
              headers: { 'content-type': 'application/x-www-form-urlencoded' },
              body: form.toString(),
              signal: controller.signal,
            });
          } catch {
            if (controller.signal.aborted) return unavailable('timeout');
            last = { cause: 'network', errorCodes: [] };
            continue;
          }
          if (res.status >= 500) {
            last = { cause: `http_${res.status}`, errorCodes: [] };
            continue;
          }
          if (!res.ok) return unavailable(`http_${res.status}`);
          let json: TurnstileApiResponse;
          try {
            json = (await res.json()) as TurnstileApiResponse;
          } catch {
            if (controller.signal.aborted) return unavailable('timeout');
            return unavailable('bad_json');
          }
          if (json.success === true) return { outcome: 'passed' };
          const errorCodes = Array.isArray(json['error-codes']) ? json['error-codes'] : [];
          if (errorCodes.some((c) => RETRYABLE_ERROR_CODES.has(c))) {
            last = { cause: 'internal_error', errorCodes };
            continue;
          }
          if (errorCodes.length > 0 && errorCodes.every((c) => REJECTED_ERROR_CODES.has(c))) {
            return { outcome: 'rejected' };
          }
          // A secret Cloudflare refuses, a malformed request, or a reply with no
          // recognisable answer: the token was never judged.
          return unavailable('verifier_refused', errorCodes);
        }
        return unavailable(last.cause, last.errorCodes);
      } finally {
        clearTimeout(deadline);
      }
    },
  };
}

export function createStubCaptchaAdapter(): StubCaptchaAdapter {
  const failTokens = new Set<string>();
  const unavailableTokens = new Set<string>();
  return {
    addFailToken(token) {
      failTokens.add(token);
    },
    addUnavailableToken(token) {
      unavailableTokens.add(token);
    },
    clear() {
      failTokens.clear();
      unavailableTokens.clear();
    },
    async verify(token) {
      // Dev/test default: any non-empty token passes (no Turnstile needed
      // locally). An empty token is refused as live refuses it, and registered
      // tokens drive the rejection and outage branches.
      if (!token || failTokens.has(token)) return { outcome: 'rejected' };
      if (unavailableTokens.has(token)) return unavailable('stub');
      return { outcome: 'passed' };
    },
  };
}

let singleton: CaptchaAdapter | null = null;

// Sentinels the stub always rejects, or always answers as unavailable, so the
// rejection and outage paths are reachable from a clean local checkout and on
// staging, and route tests can force either deterministically.
export const STUB_CAPTCHA_FAIL_TOKEN = 'stub-captcha-fail';
export const STUB_CAPTCHA_UNAVAILABLE_TOKEN = 'stub-captcha-unavailable';
// The fixed answer the stub card in the captcha field submits, standing in for
// the token the live widget would post.
export const STUB_CAPTCHA_PASS_TOKEN = 'stub-captcha-pass';

export function getCaptchaAdapter(): CaptchaAdapter {
  if (singleton) return singleton;
  if (config.captchaAdapter === 'live') {
    singleton = createLiveCaptchaAdapter({ secrets: getSecretsAdapter() });
  } else {
    const stub = createStubCaptchaAdapter();
    stub.addFailToken(STUB_CAPTCHA_FAIL_TOKEN);
    stub.addUnavailableToken(STUB_CAPTCHA_UNAVAILABLE_TOKEN);
    singleton = stub;
  }
  return singleton;
}

/**
 * Boot-time preload. The live adapter would otherwise read its secret at the
 * first sign-in, so a container whose secret is missing or still the bootstrap
 * placeholder would report healthy while refusing every sign-in form; the
 * preload reads it before the server accepts requests, and the caller refuses
 * to start on failure. No-op for the stub.
 */
export async function initCaptchaAdapter(): Promise<void> {
  await getCaptchaAdapter().preloadSecret?.();
}

export function resetCaptchaAdapterForTests(): void {
  singleton = null;
}

/**
 * Inject a custom CaptchaAdapter for the duration of a test; the test's
 * afterEach should call resetCaptchaAdapterForTests to clear it.
 */
export function setCaptchaAdapterForTests(adapter: CaptchaAdapter): void {
  singleton = adapter;
}
