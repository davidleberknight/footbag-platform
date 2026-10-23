/**
 * The rendered-style check measures one page per view, found by walking the
 * site by links. A walk that kept the wrong URL for a view, followed a
 * redirect off the site, fetched every member profile, or stopped without
 * saying so would leave views unmeasured or the check running for hours. The
 * walk is driven here over a fake site, so each of those is shown directly.
 */
import { describe, it, expect } from 'vitest';
import type { APIRequestContext } from '@playwright/test';
import { walkViews } from '../e2e/helpers/pageWalk';
import { URLS_PER_SHAPE } from '../fixtures/pageLists';
import { VIEW_HEADER } from '../e2e/helpers/renderedStyleCapture';

interface FakePage { status?: number; view?: string; location?: string; html?: string; type?: string }

/** A site of fixed pages; records every URL asked for and the cookie it carried. */
function fakeSite(pages: Record<string, FakePage>) {
  const asked: Array<{ url: string; cookie?: string }> = [];
  const request = {
    async get(url: string, opts: { headers?: Record<string, string> }) {
      asked.push({ url, cookie: opts.headers?.cookie });
      const p = pages[url] ?? { status: 404 };
      const headers: Record<string, string> = { 'content-type': p.type ?? 'text/html; charset=utf-8' };
      if (p.view) headers[VIEW_HEADER] = p.view;
      if (p.location) headers.location = p.location;
      return { status: () => p.status ?? 200, headers: () => headers, text: async () => p.html ?? '' };
    },
  };
  return { request: request as unknown as APIRequestContext, asked };
}

const links = (...hrefs: string[]) => hrefs.map((h) => `<a href="${h}">x</a>`).join('');

describe('walkViews', () => {
  it('keeps the first URL that rendered each view, and follows links to find the rest', async () => {
    // A later URL replacing the first would measure a page the seeds never meant, and change between runs.
    const { request } = fakeSite({
      '/': { view: 'home/index', html: links('/clubs', '/events') },
      '/clubs': { view: 'clubs/index', html: links('/') },
      '/events': { view: 'clubs/index' },
    });
    const walked = await walkViews(request, ['/'], null);
    expect([...walked.views]).toEqual([['home/index', '/'], ['clubs/index', '/clubs']]);
    expect(walked.capped).toBe(false);
  });

  it('follows a redirect on the site, never one off it, and sends the viewer\'s cookie on every request', async () => {
    // Following an off-site redirect would walk someone else's site; a dropped cookie would walk signed out.
    const { request, asked } = fakeSite({
      '/members': { status: 302, location: '/members/me' },
      '/members/me': { view: 'members/profile' },
      '/out': { status: 302, location: 'https://example.com/elsewhere' },
    });
    const walked = await walkViews(request, ['/members', '/out'], 'session=abc');
    expect(walked.views.get('members/profile')).toBe('/members/me');
    expect(asked.map((a) => a.url)).toEqual(['/members', '/out', '/members/me']);
    expect(asked.every((a) => a.cookie === 'session=abc')).toBe(true);
  });

  it('skips the URLs the walk must never fetch, and reads no links from a page that is not HTML', async () => {
    // Fetching /logout ends the viewer's session mid-walk; a JSON body read as HTML invents links.
    const { request, asked } = fakeSite({
      '/': { view: 'home/index', html: links('/logout', '/media-store/a.jpg', '/data') },
      '/data': { type: 'application/json', html: links('/from-json') },
    });
    await walkViews(request, ['/'], null);
    expect(asked.map((a) => a.url)).toEqual(['/', '/data']);
  });

  it(`fetches at most ${URLS_PER_SHAPE} URLs of one shape`, async () => {
    // Fetching every member profile to find the one view they share would make the walk take hours.
    const profiles = Array.from({ length: URLS_PER_SHAPE + 2 }, (_, k) => `/members/m_${k}`);
    const { request, asked } = fakeSite({ '/': { view: 'home/index', html: links(...profiles) } });
    await walkViews(request, ['/'], null);
    expect(asked.filter((a) => a.url.startsWith('/members/'))).toHaveLength(URLS_PER_SHAPE);
  });

  it('stops at its page budget and says it stopped with pages still queued', async () => {
    // A walk cut short silently would report the views it never reached as missing for no stated reason.
    const { request, asked } = fakeSite({
      '/': { view: 'home/index', html: links('/a', '/b', '/c') },
    });
    const walked = await walkViews(request, ['/'], null, 2);
    expect(asked).toHaveLength(2);
    expect(walked).toMatchObject({ fetched: 2, capped: true });
  });
});
