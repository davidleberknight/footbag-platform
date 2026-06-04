/**
 * SecretsAdapter: interface + implementations + singleton getter for the
 * adapters layer. Node consumers (web + worker + tests) read SSM-stored
 * third-party secrets through this contract: Stripe API keys, Stripe webhook
 * secret, Safe Browsing API key, admin bootstrap tokens, and future
 * operator-supplied SecureString values.
 *
 * Three implementations:
 *   - createLiveSecretsAdapter: SSM GetParameter with WithDecryption=true.
 *     Lazy fetch + in-memory cache for the life of the process. AWS-auth or
 *     KMS-decrypt failures throw; missing parameter (ParameterNotFound) returns
 *     undefined so callers distinguish "not configured yet" from "AWS broken".
 *   - createStubSecretsAdapter: in-memory map for tests. setSecret/clear/failNext.
 *   - createLocalSecretsAdapter: reads JSON file at repo root for dev parity.
 *     File-missing is not an error; all keys return undefined.
 *
 * Caller pattern: services and adapters call `secrets.get(key)` or
 * `secrets.getRequired(key)` lazily on first need. The adapter caches per-key
 * so repeated calls in the same process are free after the first.
 *
 * The live impl accepts an injected SSM client so the parity test can stand
 * in a fake SSMClient without mocking the @aws-sdk package itself.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  SSMClient,
  GetParameterCommand,
  DeleteParameterCommand,
  ParameterNotFound,
} from '@aws-sdk/client-ssm';
import { config } from '../config/env';

export interface SecretsAdapter {
  /** Returns the secret value, or undefined if the parameter does not exist. */
  get(key: string): Promise<string | undefined>;
  /** Returns the secret value; throws if the parameter does not exist. */
  getRequired(key: string): Promise<string>;
  /** Reads an ABSOLUTE parameter name (no prefix/secrets/ derivation),
   * UNCACHED. Single-shot flows (the production admin-bootstrap token) need
   * the live value every call so a deleted parameter closes immediately. */
  getAbsolute(name: string): Promise<string | undefined>;
  /** Deletes an ABSOLUTE parameter. Single-shot token consumption. */
  deleteAbsolute(name: string): Promise<void>;
}

export interface StubSecretsAdapter extends SecretsAdapter {
  setSecret(key: string, value: string): void;
  clear(): void;
  failNext(error: Error): void;
}

export class SecretNotConfiguredError extends Error {
  constructor(key: string) {
    super(
      `Secret '${key}' is not configured. ` +
        `Operator: terraform apply (creates the SSM SecureString shell), then ` +
        `aws ssm put-parameter --value file:///path/to/key-tempfile --type SecureString --overwrite`,
    );
    this.name = 'SecretNotConfiguredError';
  }
}

interface SsmClientLike {
  send(cmd: GetParameterCommand | DeleteParameterCommand): Promise<{ Parameter?: { Value?: string } }>;
}

export function createLiveSecretsAdapter(opts: {
  ssmClient?: SsmClientLike;
  ssmPrefix: string;
}): SecretsAdapter {
  const client: SsmClientLike =
    opts.ssmClient ?? new SSMClient({ region: config.awsRegion });
  const cache = new Map<string, string | undefined>();
  async function fetchOnce(key: string): Promise<string | undefined> {
    if (cache.has(key)) return cache.get(key);
    const name = `${opts.ssmPrefix}/secrets/${key}`;
    try {
      const out = await client.send(
        new GetParameterCommand({ Name: name, WithDecryption: true }),
      );
      const value = out.Parameter?.Value;
      cache.set(key, value);
      return value;
    } catch (err) {
      if (err instanceof ParameterNotFound) {
        cache.set(key, undefined);
        return undefined;
      }
      throw err;
    }
  }
  return {
    get(key) {
      return fetchOnce(key);
    },
    async getRequired(key) {
      const value = await fetchOnce(key);
      if (value === undefined) throw new SecretNotConfiguredError(key);
      return value;
    },
    async getAbsolute(name) {
      try {
        const out = await client.send(
          new GetParameterCommand({ Name: name, WithDecryption: true }),
        );
        return out.Parameter?.Value;
      } catch (err) {
        if (err instanceof ParameterNotFound) return undefined;
        throw err;
      }
    },
    async deleteAbsolute(name) {
      try {
        await client.send(new DeleteParameterCommand({ Name: name }));
      } catch (err) {
        if (err instanceof ParameterNotFound) return;
        throw err;
      }
    },
  };
}

export function createStubSecretsAdapter(): StubSecretsAdapter {
  const map = new Map<string, string>();
  let pendingError: Error | null = null;
  function consumeError(): void {
    if (pendingError) {
      const err = pendingError;
      pendingError = null;
      throw err;
    }
  }
  return {
    setSecret(key, value) {
      map.set(key, value);
    },
    clear() {
      map.clear();
      pendingError = null;
    },
    failNext(error) {
      pendingError = error;
    },
    async get(key) {
      consumeError();
      return map.get(key);
    },
    async getRequired(key) {
      consumeError();
      const value = map.get(key);
      if (value === undefined) throw new SecretNotConfiguredError(key);
      return value;
    },
    async getAbsolute(name) {
      consumeError();
      return map.get(name);
    },
    async deleteAbsolute(name) {
      consumeError();
      map.delete(name);
    },
  };
}

export function createLocalSecretsAdapter(opts: {
  filePath?: string;
}): SecretsAdapter {
  const filePath =
    opts.filePath ?? path.join(process.cwd(), '.local', 'secrets.json');
  let cache: Record<string, string> | null = null;
  function load(): Record<string, string> {
    if (cache) return cache;
    if (!fs.existsSync(filePath)) {
      cache = {};
      return cache;
    }
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') {
      throw new Error(
        `Local secrets file at ${filePath} must be a JSON object of string→string`,
      );
    }
    cache = parsed as Record<string, string>;
    return cache;
  }
  return {
    async get(key) {
      const data = load();
      const value = data[key];
      return typeof value === 'string' ? value : undefined;
    },
    async getRequired(key) {
      const data = load();
      const value = data[key];
      if (typeof value !== 'string') throw new SecretNotConfiguredError(key);
      return value;
    },
    async getAbsolute(name) {
      const data = load();
      const value = data[name];
      return typeof value === 'string' ? value : undefined;
    },
    async deleteAbsolute(name) {
      const data = load();
      delete data[name];
    },
  };
}

let singleton: SecretsAdapter | null = null;
let stubSingleton: StubSecretsAdapter | null = null;

export function getSecretsAdapter(): SecretsAdapter {
  if (singleton) return singleton;
  if (config.secretsAdapter === 'live') {
    if (!config.ssmPrefix) {
      throw new Error(
        'SecretsAdapter live mode requires config.ssmPrefix to be set; check FOOTBAG_ENV',
      );
    }
    singleton = createLiveSecretsAdapter({ ssmPrefix: config.ssmPrefix });
  } else if (config.secretsAdapter === 'stub') {
    stubSingleton = createStubSecretsAdapter();
    singleton = stubSingleton;
  } else {
    singleton = createLocalSecretsAdapter({});
  }
  return singleton;
}

/** Exposes the in-memory stub for test inspection. Null unless SECRETS_ADAPTER=stub. */
export function getStubSecretsAdapterForTests(): StubSecretsAdapter | null {
  return stubSingleton;
}

export function resetSecretsAdapterForTests(): void {
  singleton = null;
  stubSingleton = null;
}
