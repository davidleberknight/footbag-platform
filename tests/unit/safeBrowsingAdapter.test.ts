import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  createLiveSafeBrowsingAdapter,
  createStubSafeBrowsingAdapter,
} from '../../src/adapters/safeBrowsingAdapter';
import type { SecretsAdapter } from '../../src/adapters/secretsAdapter';

function makeSecrets(apiKey: string): SecretsAdapter {
  return {
    async get(_key: string) {
      return apiKey;
    },
    async getRequired(_key: string) {
      return apiKey;
    },
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('LiveSafeBrowsingAdapter', () => {
  it('returns safe when the API reports no matches', async () => {
    const fetchClient = (async () => ({
      ok: true,
      status: 200,
      async json() { return {}; },
    })) as unknown as typeof fetch;
    const adapter = createLiveSafeBrowsingAdapter({
      secrets: makeSecrets('real-key'),
      fetchClient,
    });
    const result = await adapter.lookup('https://example.com/');
    expect(result.safe).toBe(true);
    expect(result.threatTypes).toEqual([]);
  });

  it('returns unsafe with threatTypes when the API reports a match', async () => {
    const fetchClient = (async () => ({
      ok: true,
      status: 200,
      async json() {
        return { matches: [{ threatType: 'MALWARE' }, { threatType: 'SOCIAL_ENGINEERING' }] };
      },
    })) as unknown as typeof fetch;
    const adapter = createLiveSafeBrowsingAdapter({
      secrets: makeSecrets('real-key'),
      fetchClient,
    });
    const result = await adapter.lookup('https://bad.example/');
    expect(result.safe).toBe(false);
    expect(result.threatTypes).toEqual(['MALWARE', 'SOCIAL_ENGINEERING']);
  });

  it('throws a clear error on non-2xx HTTP response', async () => {
    const fetchClient = (async () => ({
      ok: false,
      status: 502,
      async json() { return {}; },
    })) as unknown as typeof fetch;
    const adapter = createLiveSafeBrowsingAdapter({
      secrets: makeSecrets('real-key'),
      fetchClient,
    });
    await expect(adapter.lookup('https://example.com/')).rejects.toThrow(
      /Safe Browsing API returned HTTP 502/,
    );
  });

  it('aborts an unresponsive fetch after the 10-second budget', async () => {
    vi.useFakeTimers();
    // Fake fetch that resolves only when the AbortController fires. Mirrors
    // a hung upstream API: the request would otherwise block indefinitely.
    // The adapter awaits this promise inside its own try/catch, so the
    // rejection IS handled; the explicit no-op catch suppresses Node's
    // PromiseRejectionHandledWarning that can fire under fake-timer races
    // before the adapter's await microtask resumes.
    const fetchClient = ((_input: string, init?: RequestInit) => {
      const p = new Promise((_resolve, reject) => {
        const signal = init?.signal;
        if (!signal) {
          reject(new Error('fake fetch: no AbortSignal passed'));
          return;
        }
        signal.addEventListener('abort', () => {
          const abortErr = new Error('aborted');
          abortErr.name = 'AbortError';
          reject(abortErr);
        });
      });
      p.catch(() => { /* handled by the adapter's await; suppress warning */ });
      return p;
    }) as unknown as typeof fetch;

    const adapter = createLiveSafeBrowsingAdapter({
      secrets: makeSecrets('real-key'),
      fetchClient,
    });

    const pending = adapter.lookup('https://example.com/');
    // Attach the rejection-assertion handler BEFORE the deadline fires, so
    // the lookup() promise never sits in an unhandled-rejection state.
    const assertion = expect(pending).rejects.toThrow(
      /Safe Browsing API timed out after 10000ms/,
    );
    // Trip the deadline. The setTimeout callback aborts the controller,
    // which rejects the in-flight fetch, which the adapter's catch converts
    // to a typed timeout error.
    await vi.advanceTimersByTimeAsync(10_001);
    await assertion;
  });

  it('passes the AbortSignal through to the fetch client', async () => {
    let receivedSignal: AbortSignal | undefined;
    const fetchClient = (async (_input: string, init?: RequestInit) => {
      receivedSignal = init?.signal ?? undefined;
      return {
        ok: true,
        status: 200,
        async json() { return {}; },
      };
    }) as unknown as typeof fetch;

    const adapter = createLiveSafeBrowsingAdapter({
      secrets: makeSecrets('real-key'),
      fetchClient,
    });
    await adapter.lookup('https://example.com/');
    expect(receivedSignal).toBeDefined();
    expect(receivedSignal!.aborted).toBe(false);
  });
});

describe('StubSafeBrowsingAdapter', () => {
  it('defaults to safe', async () => {
    const adapter = createStubSafeBrowsingAdapter();
    const result = await adapter.lookup('https://example.com/');
    expect(result.safe).toBe(true);
  });

  it('addThreat marks a URL unsafe', async () => {
    const adapter = createStubSafeBrowsingAdapter();
    adapter.addThreat('https://bad.example/', 'MALWARE');
    const result = await adapter.lookup('https://bad.example/');
    expect(result.safe).toBe(false);
    expect(result.threatTypes).toEqual(['MALWARE']);
  });

  it('failNext throws once then clears', async () => {
    const adapter = createStubSafeBrowsingAdapter();
    adapter.failNext(new Error('boom'));
    await expect(adapter.lookup('https://example.com/')).rejects.toThrow('boom');
    const result = await adapter.lookup('https://example.com/');
    expect(result.safe).toBe(true);
  });
});
