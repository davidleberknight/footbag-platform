/**
 * The bare apex redirects to the canonical www host at the edge.
 *
 * The front door is www and the apex only redirects, but the origin can never
 * make that decision: the distribution withholds the viewer's Host header from
 * it and nginx pins the upstream Host to one canonical value, so by the time a
 * request reaches the application the name the visitor typed is gone. The
 * decision therefore lives in a CloudFront viewer-request function, which is
 * ordinary JavaScript running at the edge and is exercised here directly.
 *
 * Two properties carry the risk. The redirect must match the apex exactly
 * rather than redirecting anything that is not www, because the distribution
 * also answers on its own generated CloudFront name and on the preview
 * subdomain, and both are how the platform is reached before the apex and www
 * move; a blanket rule would send them to a name that does not yet resolve to
 * the platform. And the redirect must carry the visitor's path and query
 * through unchanged, including a repeated parameter and an already-encoded
 * value, or a deep link into the site arrives somewhere else.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

type CloudFrontValue = { value: string; multiValue?: { value: string }[] };

type CloudFrontRequest = {
  method: string;
  uri: string;
  querystring: Record<string, CloudFrontValue>;
  headers: Record<string, CloudFrontValue>;
};

type CloudFrontResponse = {
  statusCode: number;
  statusDescription?: string;
  headers: Record<string, CloudFrontValue>;
};

const FUNCTION_PATH = resolve(
  __dirname,
  '../../terraform/production/cloudfront-functions/apex-redirect.js',
);

// The deployed artifact is the file itself: CloudFront takes the source and runs
// `handler`, so the source is evaluated here rather than reimplemented, and a
// change to the file that breaks the contract fails this suite.
const handler = new Function(`${readFileSync(FUNCTION_PATH, 'utf8')}\nreturn handler;`)() as (
  event: { request: CloudFrontRequest },
) => CloudFrontRequest | CloudFrontResponse;

function viewerRequest(
  host: string | null,
  uri = '/',
  querystring: Record<string, CloudFrontValue> = {},
): { request: CloudFrontRequest } {
  return {
    request: {
      method: 'GET',
      uri,
      querystring,
      headers: host === null ? {} : { host: { value: host } },
    },
  };
}

function isRedirect(result: CloudFrontRequest | CloudFrontResponse): result is CloudFrontResponse {
  return 'statusCode' in result;
}

function locationOf(result: CloudFrontRequest | CloudFrontResponse): string {
  if (!isRedirect(result)) throw new Error('expected a redirect response, got a passthrough request');
  return result.headers.location.value;
}

describe('apex redirect: which hosts are redirected', () => {
  it('redirects the bare apex with a permanent status', () => {
    const result = handler(viewerRequest('footbag.org'));
    expect(isRedirect(result)).toBe(true);
    const response = result as CloudFrontResponse;
    expect(response.statusCode).toBe(301);
    expect(response.statusDescription).toBe('Moved Permanently');
    expect(response.headers.location.value).toBe('https://www.footbag.org/');
  });

  it('redirects the apex whatever casing the viewer sent, because CloudFront lowercases header names and not values', () => {
    expect(locationOf(handler(viewerRequest('FootBag.ORG', '/events')))).toBe(
      'https://www.footbag.org/events',
    );
  });

  it('passes the canonical www host straight through', () => {
    const event = viewerRequest('www.footbag.org', '/members');
    expect(handler(event)).toBe(event.request);
  });

  it('passes the preview subdomain through, so the pre-cutover exercise it exists for still works', () => {
    const event = viewerRequest('preview.footbag.org', '/members');
    expect(handler(event)).toBe(event.request);
  });

  it("passes the distribution's own generated name through, so the platform stays reachable before the custom domain is enabled", () => {
    const event = viewerRequest('d111111abcdef8.cloudfront.net', '/');
    expect(handler(event)).toBe(event.request);
  });

  it('does not redirect a host that merely ends with the apex', () => {
    const event = viewerRequest('notfootbag.org', '/');
    expect(handler(event)).toBe(event.request);
  });

  it('passes a request carrying no host header through rather than redirecting it', () => {
    const event = viewerRequest(null, '/');
    expect(handler(event)).toBe(event.request);
  });
});

describe('apex redirect: what the redirect carries', () => {
  it('preserves a deep path', () => {
    expect(locationOf(handler(viewerRequest('footbag.org', '/freestyle/tricks/paradox')))).toBe(
      'https://www.footbag.org/freestyle/tricks/paradox',
    );
  });

  it('omits the question mark entirely when there is no query string', () => {
    expect(locationOf(handler(viewerRequest('footbag.org', '/events')))).toBe(
      'https://www.footbag.org/events',
    );
  });

  it('preserves a single query parameter', () => {
    const result = handler(viewerRequest('footbag.org', '/events', { year: { value: '2026' } }));
    expect(locationOf(result)).toBe('https://www.footbag.org/events?year=2026');
  });

  it('preserves several query parameters joined with ampersands', () => {
    const result = handler(
      viewerRequest('footbag.org', '/freestyle/tricks', {
        view: { value: 'family' },
        sort: { value: 'name' },
      }),
    );
    expect(locationOf(result)).toBe('https://www.footbag.org/freestyle/tricks?view=family&sort=name');
  });

  it('keeps the trailing equals sign of a parameter the viewer sent with no value', () => {
    const result = handler(viewerRequest('footbag.org', '/search', { q: { value: '' } }));
    expect(locationOf(result)).toBe('https://www.footbag.org/search?q=');
  });

  it('emits every occurrence of a repeated parameter, not just the first', () => {
    const result = handler(
      viewerRequest('footbag.org', '/media', {
        tag: {
          value: 'shred',
          multiValue: [{ value: 'shred' }, { value: 'worlds' }],
        },
      }),
    );
    expect(locationOf(result)).toBe('https://www.footbag.org/media?tag=shred&tag=worlds');
  });

  it('does not encode a value a second time', () => {
    const result = handler(
      viewerRequest('footbag.org', '/search', { q: { value: 'mirage%20set' } }),
    );
    expect(locationOf(result)).toBe('https://www.footbag.org/search?q=mirage%20set');
  });

  it('leaves an encoded path segment exactly as the viewer sent it', () => {
    expect(locationOf(handler(viewerRequest('footbag.org', '/clubs/Sant%20Cugat')))).toBe(
      'https://www.footbag.org/clubs/Sant%20Cugat',
    );
  });
});
