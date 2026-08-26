/**
 * The two long-standing CloudFront edge functions do what their cache behaviours
 * assume, and stop where they are supposed to stop.
 *
 * Both are URI rewriters attached on viewer-request, both are fourteen lines, and
 * neither had a test. Their failure modes are quiet rather than loud: a stripper
 * that trims the wrong prefix sends the origin a key that does not exist and the
 * viewer gets a 404 from S3 rather than an error anyone traces back here, and a
 * directory rewriter that fires on the wrong shape turns a working object request
 * into a miss. The contracts are small enough to pin exactly, which is the point.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

type CloudFrontValue = { value: string };

type CloudFrontRequest = {
  method: string;
  uri: string;
  querystring: Record<string, CloudFrontValue>;
  headers: Record<string, CloudFrontValue>;
};

const FUNCTIONS_DIR = resolve(__dirname, '../../terraform/production/cloudfront-functions');

// The deployed artifact is the file itself, so the source is evaluated rather than
// reimplemented: a change to the file that breaks the contract fails this suite.
function loadHandler(fileName: string): (event: { request: CloudFrontRequest }) => CloudFrontRequest {
  const source = readFileSync(resolve(FUNCTIONS_DIR, fileName), 'utf8');
  return new Function(`${source}\nreturn handler;`)() as (event: {
    request: CloudFrontRequest;
  }) => CloudFrontRequest;
}

function viewerRequest(uri: string, querystring: Record<string, CloudFrontValue> = {}) {
  return {
    request: {
      method: 'GET',
      uri,
      querystring,
      headers: { host: { value: 'www.footbag.org' } },
    },
  };
}

describe('media-store prefix stripper', () => {
  const handler = loadHandler('strip-media-store-prefix.js');

  it('strips the URL-only prefix so the origin sees the real object key', () => {
    expect(handler(viewerRequest('/media-store/avatars/abc.jpg')).uri).toBe('/avatars/abc.jpg');
  });

  it('strips exactly the prefix and no more, so a key beginning with the same letters survives', () => {
    expect(handler(viewerRequest('/media-store/media-store-notes.txt')).uri).toBe(
      '/media-store-notes.txt',
    );
  });

  it('leaves the member-facing media section alone, which routes to a different origin', () => {
    expect(handler(viewerRequest('/media/galleries/42')).uri).toBe('/media/galleries/42');
  });

  it('does not strip a prefix that appears later in the path rather than at the start', () => {
    expect(handler(viewerRequest('/galleries/media-store/abc.jpg')).uri).toBe(
      '/galleries/media-store/abc.jpg',
    );
  });

  it('leaves the query string untouched, so the cache-busting parameter survives', () => {
    const event = viewerRequest('/media-store/avatars/abc.jpg', { v: { value: 'a-uuid' } });
    expect(handler(event).querystring).toEqual({ v: { value: 'a-uuid' } });
  });

  it('returns the request for the origin to fetch, never a generated response', () => {
    const event = viewerRequest('/media-store/avatars/abc.jpg');
    expect(handler(event)).toBe(event.request);
  });
});

describe('archive directory rewriter', () => {
  const handler = loadHandler('archive-edge.js');

  it('names the index document for a directory URL, which object storage cannot resolve alone', () => {
    expect(handler(viewerRequest('/1998/worlds/')).uri).toBe('/1998/worlds/index.html');
  });

  it('rewrites the bare root the same way', () => {
    expect(handler(viewerRequest('/')).uri).toBe('/index.html');
  });

  it('leaves a request that already names an object alone', () => {
    expect(handler(viewerRequest('/1998/worlds/index.html')).uri).toBe('/1998/worlds/index.html');
  });

  it('leaves a file request with no trailing slash alone', () => {
    expect(handler(viewerRequest('/images/photo.jpg')).uri).toBe('/images/photo.jpg');
  });

  it('returns the request, since the signed-cookie check has already run at the edge', () => {
    const event = viewerRequest('/1998/worlds/');
    expect(handler(event)).toBe(event.request);
  });
});
