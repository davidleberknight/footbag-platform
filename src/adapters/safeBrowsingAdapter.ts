/**
 * SafeBrowsingAdapter: interface + implementations + singleton getter.
 * `LiveSafeBrowsingAdapter` calls the Google Safe Browsing v4 threatMatches
 * endpoint; `StubSafeBrowsingAdapter` consults an in-memory deny list for
 * dev/test. Services and validators call the interface; the getter returns
 * the configured implementation based on `config.safeBrowsingAdapter`.
 *
 * Per DD §3.17: a positive match rejects the URL with a generic
 * "URL is not allowed" message; the matched threat category is logged for
 * operator review.
 *
 * Per DD §5.3 + tests rule "Dev↔staging adapter parity": the live impl
 * accepts an injected `fetchClient` so the parity test can stand in a fake
 * fetch implementation without mocking globalThis.fetch.
 */
import { config } from '../config/env';

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

export function createLiveSafeBrowsingAdapter(opts: {
  apiKey: string;
  fetchClient?: typeof fetch;
}): SafeBrowsingAdapter {
  const httpFetch = opts.fetchClient ?? fetch;
  const apiKey = opts.apiKey;
  return {
    async lookup(url) {
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

export function getSafeBrowsingAdapter(): SafeBrowsingAdapter {
  if (singleton) return singleton;
  if (config.safeBrowsingAdapter === 'live') {
    if (!config.safeBrowsingApiKey) {
      throw new Error(
        'SAFE_BROWSING_API_KEY is required when SAFE_BROWSING_ADAPTER=live',
      );
    }
    singleton = createLiveSafeBrowsingAdapter({
      apiKey: config.safeBrowsingApiKey,
    });
  } else {
    stubSingleton = createStubSafeBrowsingAdapter();
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
