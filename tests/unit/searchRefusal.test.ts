/**
 * A refused member search carried from a page's service to its response: the
 * page metadata names the wait only when one of the page's searches was
 * refused, and the response then goes out at 429 with that wait as
 * Retry-After, any other page at the status its controller chose.
 */
import { describe, it, expect } from 'vitest';
import type { Response } from 'express';
import { searchRefusalMeta, statusForPage } from '../../src/lib/searchRefusal';

function fakeResponse(): { res: Response; headers: Record<string, string> } {
  const headers: Record<string, string> = {};
  const res = { setHeader: (name: string, value: string) => { headers[name] = value; } } as unknown as Response;
  return { res, headers };
}

describe('searchRefusalMeta', () => {
  // Defect caught: a page with no refused search sent as refused, or a refused
  // one among several searches missed.
  it('names the refused search\'s wait, and nothing when no search was refused', () => {
    expect(searchRefusalMeta(null, undefined, { rateLimited: false, retryAfterSeconds: null })).toEqual({});
    expect(searchRefusalMeta(
      { rateLimited: false, retryAfterSeconds: null },
      { rateLimited: true, retryAfterSeconds: 42 },
    )).toEqual({ rateLimitRetryAfterSeconds: 42 });
  });
});

describe('statusForPage', () => {
  // Defect caught: a refused search answered as a success, or every page
  // turned into a refusal.
  it('sends a page carrying a refused search at 429 with its wait, and any other at the chosen status', () => {
    const plain = fakeResponse();
    expect(statusForPage(plain.res, { page: {} }, 422)).toBe(422);
    expect(plain.headers).toEqual({});

    const refused = fakeResponse();
    expect(statusForPage(refused.res, { page: { rateLimitRetryAfterSeconds: 17 } }, 200)).toBe(429);
    expect(refused.headers).toEqual({ 'Retry-After': '17' });
  });
});
