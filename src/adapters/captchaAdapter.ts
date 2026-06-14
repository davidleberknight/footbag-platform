/**
 * CaptchaAdapter: server-side verification of a Cloudflare Turnstile token.
 * `LiveCaptchaAdapter` calls the Turnstile siteverify endpoint; the stub passes
 * every token EXCEPT ones registered to fail, so a clean local checkout needs no
 * Turnstile setup and route tests can still reach the rejection path. The getter
 * returns the configured implementation based on `config.captchaAdapter`.
 *
 * The live secret is resolved via `SecretsAdapter` (SSM SecureString) at first
 * call, mirroring `safeBrowsingAdapter`; it is never threaded as an env var. The
 * live impl accepts an injected `fetchClient` so the parity test can stand in a
 * fake fetch without mocking globalThis.fetch.
 *
 * Verification fails closed: any network, timeout, HTTP, or parse error returns
 * `{ ok: false }`, so a hung or misconfigured verifier never lets a gated claim
 * lookup through.
 */
import { config } from '../config/env';
import {
  SecretNotConfiguredError,
  type SecretsAdapter,
  getSecretsAdapter,
} from './secretsAdapter';

const TURNSTILE_SITEVERIFY_ENDPOINT =
  'https://challenges.cloudflare.com/turnstile/v0/siteverify';

// Bound the outbound fetch so a slow / hung Turnstile endpoint cannot tie up an
// Express request worker. Mirrors `safeBrowsingAdapter`'s TOTAL_BUDGET_MS.
const TOTAL_BUDGET_MS = 10_000;

const TURNSTILE_SECRET_KEY = 'turnstile_secret_key';
const TODO_PLACEHOLDER_PREFIX = 'TODO-';

export interface CaptchaResult {
  ok: boolean;
}

export interface CaptchaAdapter {
  verify(token: string, remoteIp?: string): Promise<CaptchaResult>;
}

export interface StubCaptchaAdapter extends CaptchaAdapter {
  /** Registers a token that `verify` will reject. */
  addFailToken(token: string): void;
  /** Clears the fail-token set. */
  clear(): void;
}

interface TurnstileApiResponse {
  success?: boolean;
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
        `Turnstile secret SSM parameter still has the bootstrap placeholder ('${value}'). ` +
          `Operator: aws ssm put-parameter --name <full-name> --value file://path-to-secret --type SecureString --overwrite`,
      );
    }
    resolvedSecret = value;
    return resolvedSecret;
  }
  return {
    async verify(token, remoteIp) {
      if (!token) return { ok: false };
      const secret = await resolveSecret();
      const form = new URLSearchParams();
      form.set('secret', secret);
      form.set('response', token);
      if (remoteIp) form.set('remoteip', remoteIp);
      const controller = new AbortController();
      const deadline = setTimeout(() => controller.abort(), TOTAL_BUDGET_MS);
      let res: Response;
      try {
        res = await httpFetch(TURNSTILE_SITEVERIFY_ENDPOINT, {
          method: 'POST',
          headers: { 'content-type': 'application/x-www-form-urlencoded' },
          body: form.toString(),
          signal: controller.signal,
        });
      } catch {
        return { ok: false };
      } finally {
        clearTimeout(deadline);
      }
      if (!res.ok) return { ok: false };
      let json: TurnstileApiResponse;
      try {
        json = (await res.json()) as TurnstileApiResponse;
      } catch {
        return { ok: false };
      }
      return { ok: json.success === true };
    },
  };
}

export function createStubCaptchaAdapter(): StubCaptchaAdapter {
  const failTokens = new Set<string>();
  return {
    addFailToken(token) {
      failTokens.add(token);
    },
    clear() {
      failTokens.clear();
    },
    async verify(token) {
      // Dev/test default: any token passes (no Turnstile needed locally), except
      // tokens explicitly registered to fail so the rejection branch is testable.
      return { ok: !failTokens.has(token) };
    },
  };
}

let singleton: CaptchaAdapter | null = null;
let stubSingleton: StubCaptchaAdapter | null = null;

// Sentinel the stub always rejects, so the rejection UX is reachable from a
// clean local checkout and route tests can force a failure deterministically.
export const STUB_CAPTCHA_FAIL_TOKEN = 'stub-captcha-fail';

export function getCaptchaAdapter(): CaptchaAdapter {
  if (singleton) return singleton;
  if (config.captchaAdapter === 'live') {
    singleton = createLiveCaptchaAdapter({ secrets: getSecretsAdapter() });
  } else {
    stubSingleton = createStubCaptchaAdapter();
    stubSingleton.addFailToken(STUB_CAPTCHA_FAIL_TOKEN);
    singleton = stubSingleton;
  }
  return singleton;
}

export function resetCaptchaAdapterForTests(): void {
  singleton = null;
  stubSingleton = null;
}
