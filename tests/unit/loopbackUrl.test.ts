/**
 * The loopback check the real-claim crawl applies to its own base URL before it
 * makes a single request.
 *
 * Contract: only a stack on this machine is accepted. The crawl writes an account
 * and a claim through the build route, so a deployed address, or a name dressed up
 * to look like a loopback one, is refused.
 */
import { describe, it, expect } from 'vitest';
import { isLoopbackBaseUrl } from '../fixtures/loopbackUrl';

describe('isLoopbackBaseUrl', () => {
  // Defect caught: the crawl refuses the local stack it is meant to walk.
  it('accepts the three loopback hosts, with or without a port and path', () => {
    for (const url of ['http://localhost:3000', 'http://127.0.0.1:3000/', 'http://[::1]:3000', 'https://localhost/x']) {
      expect(isLoopbackBaseUrl(url), url).toBe(true);
    }
  });

  // Defect caught: an exported address sends the crawl's claim writes to a
  // deployed site, directly or through a name that only looks local.
  it('refuses a deployed host, a lookalike name, credentials, another scheme, and garbage', () => {
    for (const url of [
      'https://d111111abcdef8.cloudfront.net',
      'http://localhost.example.test:3000',
      'http://127.0.0.1.example.test/',
      'http://user:pw@localhost:3000',
      'ftp://localhost/',
      'localhost:3000',
      '',
    ]) {
      expect(isLoopbackBaseUrl(url), url).toBe(false);
    }
  });
});
