import { describe, it, expect } from 'vitest';
import {
  createLiveHttpReachabilityAdapter,
  createStubHttpReachabilityAdapter,
  createDisabledHttpReachabilityAdapter,
} from '../../src/adapters/httpReachabilityAdapter';

function makeFakeFetch(
  responses: Map<string, { status: number; headers?: Record<string, string> }>,
  log: string[] = [],
): typeof fetch {
  return (async (input: string | URL | Request, _init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    log.push(url);
    const r = responses.get(url);
    if (!r) {
      throw new Error(`fake fetch: no response configured for ${url}`);
    }
    const headers = new Headers(r.headers ?? {});
    return {
      status: r.status,
      ok: r.status >= 200 && r.status < 300,
      headers,
      url,
    } as unknown as Response;
  }) as unknown as typeof fetch;
}

const lookupPublic = async (_host: string) => ({ address: '8.8.8.8', family: 4 });

describe('LiveHttpReachabilityAdapter', () => {
  it('returns reachable on 2xx', async () => {
    const fetchClient = makeFakeFetch(
      new Map([['https://example.com/', { status: 200 }]]),
    );
    const adapter = createLiveHttpReachabilityAdapter({
      fetchClient,
      lookup: lookupPublic,
    });
    const result = await adapter.check('https://example.com/');
    expect(result.reachable).toBe(true);
    expect(result.status).toBe(200);
  });

  it('follows redirects with per-hop SSRF re-check', async () => {
    const log: string[] = [];
    const fetchClient = makeFakeFetch(
      new Map<string, { status: number; headers?: Record<string, string> }>([
        ['https://a.example/', { status: 302, headers: { location: 'https://b.example/' } }],
        ['https://b.example/', { status: 302, headers: { location: 'https://c.example/' } }],
        ['https://c.example/', { status: 200 }],
      ]),
      log,
    );
    const adapter = createLiveHttpReachabilityAdapter({
      fetchClient,
      lookup: lookupPublic,
    });
    const result = await adapter.check('https://a.example/');
    expect(result.reachable).toBe(true);
    expect(result.finalUrl).toBe('https://c.example/');
    expect(log).toEqual([
      'https://a.example/',
      'https://b.example/',
      'https://c.example/',
    ]);
  });

  it('rejects redirect to a private IP', async () => {
    const fetchClient = makeFakeFetch(
      new Map([
        ['https://attacker.example/', {
          status: 302,
          headers: { location: 'https://internal.example/' },
        }],
      ]),
    );
    let call = 0;
    const lookup = async (host: string) => {
      call += 1;
      if (host === 'attacker.example') return { address: '8.8.8.8', family: 4 };
      if (host === 'internal.example') return { address: '169.254.169.254', family: 4 };
      throw new Error(`unexpected host ${host}`);
    };
    const adapter = createLiveHttpReachabilityAdapter({ fetchClient, lookup });
    const result = await adapter.check('https://attacker.example/');
    expect(result.reachable).toBe(false);
    expect(result.error).toMatch(/blocked IP/);
    expect(call).toBeGreaterThanOrEqual(2);
  });

  it('rejects after exceeding 5 redirects', async () => {
    const responses = new Map<string, { status: number; headers?: Record<string, string> }>();
    for (let i = 0; i < 7; i++) {
      responses.set(`https://h${i}.example/`, {
        status: 302,
        headers: { location: `https://h${i + 1}.example/` },
      });
    }
    const fetchClient = makeFakeFetch(responses);
    const adapter = createLiveHttpReachabilityAdapter({
      fetchClient,
      lookup: lookupPublic,
    });
    const result = await adapter.check('https://h0.example/');
    expect(result.reachable).toBe(false);
    expect(result.error).toMatch(/too many redirects/);
  });

  it('warns but allows on 4xx', async () => {
    const fetchClient = makeFakeFetch(
      new Map([['https://example.com/', { status: 404 }]]),
    );
    const adapter = createLiveHttpReachabilityAdapter({
      fetchClient,
      lookup: lookupPublic,
    });
    const result = await adapter.check('https://example.com/');
    expect(result.reachable).toBe(true);
    expect(result.status).toBe(404);
  });

  it('warns but allows on 5xx', async () => {
    const fetchClient = makeFakeFetch(
      new Map([['https://example.com/', { status: 503 }]]),
    );
    const adapter = createLiveHttpReachabilityAdapter({
      fetchClient,
      lookup: lookupPublic,
    });
    const result = await adapter.check('https://example.com/');
    expect(result.reachable).toBe(true);
    expect(result.status).toBe(503);
  });

  it('returns unreachable on fetch error', async () => {
    const fetchClient = (async () => {
      throw new Error('ECONNREFUSED');
    }) as unknown as typeof fetch;
    const adapter = createLiveHttpReachabilityAdapter({
      fetchClient,
      lookup: lookupPublic,
    });
    const result = await adapter.check('https://example.com/');
    expect(result.reachable).toBe(false);
    expect(result.error).toMatch(/ECONNREFUSED/);
  });

  it('caches results within the TTL', async () => {
    const log: string[] = [];
    const fetchClient = makeFakeFetch(
      new Map([['https://example.com/', { status: 200 }]]),
      log,
    );
    const adapter = createLiveHttpReachabilityAdapter({
      fetchClient,
      lookup: lookupPublic,
    });
    await adapter.check('https://example.com/');
    await adapter.check('https://example.com/');
    expect(log.length).toBe(1);
  });

  it('re-fetches after TTL expiry', async () => {
    const log: string[] = [];
    const fetchClient = makeFakeFetch(
      new Map([['https://example.com/', { status: 200 }]]),
      log,
    );
    let now = 1_000_000;
    const adapter = createLiveHttpReachabilityAdapter({
      fetchClient,
      lookup: lookupPublic,
      now: () => now,
    });
    await adapter.check('https://example.com/');
    now += 24 * 60 * 60 * 1000 + 1;
    await adapter.check('https://example.com/');
    expect(log.length).toBe(2);
  });

  it('returns unreachable on missing Location header in 3xx', async () => {
    const fetchClient = makeFakeFetch(
      new Map([['https://example.com/', { status: 302 }]]),
    );
    const adapter = createLiveHttpReachabilityAdapter({
      fetchClient,
      lookup: lookupPublic,
    });
    const result = await adapter.check('https://example.com/');
    expect(result.reachable).toBe(false);
    expect(result.error).toMatch(/no Location header/);
  });

  it('returns unreachable on invalid URL', async () => {
    const adapter = createLiveHttpReachabilityAdapter({});
    const result = await adapter.check('not-a-valid-url');
    expect(result.reachable).toBe(false);
    expect(result.error).toMatch(/invalid URL/);
  });
});

describe('StubHttpReachabilityAdapter', () => {
  it('defaults to reachable with 200', async () => {
    const adapter = createStubHttpReachabilityAdapter();
    const result = await adapter.check('https://example.com/');
    expect(result.reachable).toBe(true);
    expect(result.status).toBe(200);
  });

  it('honors setReachable status override', async () => {
    const adapter = createStubHttpReachabilityAdapter();
    adapter.setReachable('https://example.com/', 404);
    const result = await adapter.check('https://example.com/');
    expect(result.reachable).toBe(true);
    expect(result.status).toBe(404);
  });

  it('honors setUnreachable', async () => {
    const adapter = createStubHttpReachabilityAdapter();
    adapter.setUnreachable('https://example.com/', 'connection refused');
    const result = await adapter.check('https://example.com/');
    expect(result.reachable).toBe(false);
    expect(result.error).toBe('connection refused');
  });

  it('failNext throws once then clears', async () => {
    const adapter = createStubHttpReachabilityAdapter();
    adapter.failNext(new Error('boom'));
    await expect(adapter.check('https://example.com/')).rejects.toThrow('boom');
    const result = await adapter.check('https://example.com/');
    expect(result.reachable).toBe(true);
  });

  it('clear resets all state', async () => {
    const adapter = createStubHttpReachabilityAdapter();
    adapter.setUnreachable('https://example.com/', 'oops');
    adapter.clear();
    const result = await adapter.check('https://example.com/');
    expect(result.reachable).toBe(true);
  });
});

describe('DisabledHttpReachabilityAdapter', () => {
  it('returns reachable=true unconditionally', async () => {
    const adapter = createDisabledHttpReachabilityAdapter();
    const result = await adapter.check('https://anything.example/');
    expect(result.reachable).toBe(true);
  });

  it('does not perform any fetch', async () => {
    const adapter = createDisabledHttpReachabilityAdapter();
    await adapter.check('https://anything.example/');
  });
});
