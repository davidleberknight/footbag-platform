/**
 * SafeBrowsingAdapter: interface + implementations + singleton getter.
 * `LiveSafeBrowsingAdapter` calls the Google Safe Browsing v4 threatMatches
 * endpoint; `StubSafeBrowsingAdapter` consults an in-memory deny list for
 * dev/test. Services and validators call the interface; the getter returns
 * the configured implementation based on `config.safeBrowsingAdapter`.
 *
 * The live API key is resolved via `SecretsAdapter` (SSM SecureString) at
 * first call, not threaded as an env var. The placeholder value
 * `TODO-set-via-cli-after-apply` is treated as "not configured" so an
 * operator who has applied Terraform but not yet `aws ssm put-parameter`'d
 * the real key sees a clear error, not a 400 from Google.
 *
 * The live impl accepts an injected `fetchClient` so the parity test can
 * stand in a fake fetch implementation without mocking globalThis.fetch.
 */
import { config } from '../config/env';
import {
  SecretNotConfiguredError,
  type SecretsAdapter,
  getSecretsAdapter,
} from './secretsAdapter';

const SAFE_BROWSING_ENDPOINT =
  'https://safebrowsing.googleapis.com/v4/threatMatches:find';

const CLIENT_ID = 'footbag-platform';
const CLIENT_VERSION = '1.0.0';

const THREAT_TYPES = [
  'MALWARE',
  'SOCIAL_ENGINEERING',
  'UNWANTED_SOFTWARE',
  'POTENTIALLY_HARMFUL_APPLICATION',
] as const;

export interface SafeBrowsingResult {
  safe: boolean;
  /** Empty when safe; populated with the matched threat categories otherwise. */
  threatTypes: readonly string[];
}

export interface SafeBrowsingAdapter {
  lookup(url: string): Promise<SafeBrowsingResult>;
}

export interface StubSafeBrowsingAdapter extends SafeBrowsingAdapter {
  /** Adds a URL (exact match) to the deny list. */
  addThreat(url: string, threatType?: string): void;
  /** Removes all entries from the deny list and any pending error. */
  clear(): void;
  /** Forces the next `lookup` call to throw. Cleared after one use. */
  failNext(error: Error): void;
}

interface SafeBrowsingApiMatch {
  threatType: string;
  threat?: { url?: string };
}

interface SafeBrowsingApiResponse {
  matches?: SafeBrowsingApiMatch[];
}

const SAFE_BROWSING_SECRET_KEY = 'safe_browsing_api_key';
const TODO_PLACEHOLDER_PREFIX = 'TODO-';

export function createLiveSafeBrowsingAdapter(opts: {
  secrets: SecretsAdapter;
  secretKey?: string;
  fetchClient?: typeof fetch;
}): SafeBrowsingAdapter {
  const httpFetch = opts.fetchClient ?? fetch;
  const secretKey = opts.secretKey ?? SAFE_BROWSING_SECRET_KEY;
  let resolvedKey: string | null = null;
  async function resolveKey(): Promise<string> {
    if (resolvedKey !== null) return resolvedKey;
    let value: string;
    try {
      value = await opts.secrets.getRequired(secretKey);
    } catch (err) {
      if (err instanceof SecretNotConfiguredError) {
        throw new Error(
          `Safe Browsing API key not configured. ` +
            `SSM parameter ".../secrets/${secretKey}" is missing. ` +
            `Operator: aws ssm put-parameter --name <full-name> --value file://path-to-key --type SecureString --overwrite`,
        );
      }
      throw err;
    }
    if (value.startsWith(TODO_PLACEHOLDER_PREFIX)) {
      throw new Error(
        `Safe Browsing API key SSM parameter still has the bootstrap placeholder ('${value}'). ` +
          `Operator: aws ssm put-parameter --name <full-name> --value file://path-to-key --type SecureString --overwrite`,
      );
    }
    resolvedKey = value;
    return resolvedKey;
  }
  return {
    async lookup(url) {
      const apiKey = await resolveKey();
      const body = {
        client: { clientId: CLIENT_ID, clientVersion: CLIENT_VERSION },
        threatInfo: {
          threatTypes: THREAT_TYPES,
          platformTypes: ['ANY_PLATFORM'],
          threatEntryTypes: ['URL'],
          threatEntries: [{ url }],
        },
      };
      const res = await httpFetch(
        `${SAFE_BROWSING_ENDPOINT}?key=${encodeURIComponent(apiKey)}`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        },
      );
      if (!res.ok) {
        throw new Error(
          `Safe Browsing API returned HTTP ${res.status}`,
        );
      }
      const json = (await res.json()) as SafeBrowsingApiResponse;
      const matches = json.matches ?? [];
      if (matches.length === 0) {
        return { safe: true, threatTypes: [] };
      }
      return {
        safe: false,
        threatTypes: matches.map(m => m.threatType),
      };
    },
  };
}

export function createStubSafeBrowsingAdapter(): StubSafeBrowsingAdapter {
  const threats = new Map<string, string>();
  let pendingError: Error | null = null;
  return {
    addThreat(url, threatType = 'MALWARE') {
      threats.set(url, threatType);
    },
    clear() {
      threats.clear();
      pendingError = null;
    },
    failNext(error: Error) {
      pendingError = error;
    },
    async lookup(url) {
      if (pendingError) {
        const err = pendingError;
        pendingError = null;
        throw err;
      }
      const threatType = threats.get(url);
      if (threatType === undefined) {
        return { safe: true, threatTypes: [] };
      }
      return { safe: false, threatTypes: [threatType] };
    },
  };
}

let singleton: SafeBrowsingAdapter | null = null;
let stubSingleton: StubSafeBrowsingAdapter | null = null;

// Google publishes a stable test URL that always returns a MALWARE match
// in the live API. Dev seeds it into the stub deny list so the rejection UX
// ("This URL is not allowed.") is reachable from a clean local checkout
// with no operator setup. The factory `createStubSafeBrowsingAdapter()`
// stays empty so tests inspecting an empty stub state remain deterministic;
// only the singleton-from-config path applies the seed.
const CANONICAL_MALWARE_TEST_URL =
  'http://malware.testing.google.test/testing/malware/';

export function getSafeBrowsingAdapter(): SafeBrowsingAdapter {
  if (singleton) return singleton;
  if (config.safeBrowsingAdapter === 'live') {
    singleton = createLiveSafeBrowsingAdapter({
      secrets: getSecretsAdapter(),
    });
  } else {
    stubSingleton = createStubSafeBrowsingAdapter();
    stubSingleton.addThreat(CANONICAL_MALWARE_TEST_URL, 'MALWARE');
    singleton = stubSingleton;
  }
  return singleton;
}

/** Exposes the in-memory stub for test inspection. Null unless SAFE_BROWSING_ADAPTER=stub. */
export function getStubSafeBrowsingAdapterForTests(): StubSafeBrowsingAdapter | null {
  return stubSingleton;
}

export function resetSafeBrowsingAdapterForTests(): void {
  singleton = null;
  stubSingleton = null;
}
