/**
 * David Leberknight dev persona: media and onboarding journey crawl.
 *
 * Scope is the real media and onboarding journey, not admin. David is built by
 * driving the real application use-cases (register, verify, claim his
 * Hall-of-Fame legacy record by id, confirm his Wellington club membership and
 * co-lead it, upload his avatar and the Funky Footbags gallery) against a loaded
 * dev/staging database and the real image worker. That stack does not exist in
 * the fresh-schema integration database, so this suite never runs in `npm test`
 * or CI: it drives an already-running dev app over HTTP.
 *
 * Admin is deliberately out of scope here. His admin role, when present, is
 * conferred only by the operator's dev register-allowlist (the maintainer's own
 * admin list), not by the build itself, so it is operator-contingent and is not
 * asserted in this journey suite.
 *
 * Invoke it explicitly with RUN_PERSONA_CRAWL=1 (set by
 * `./run_all_tests.sh --with-persona-crawl`) after `./run_dev.sh` has the app and
 * image worker up. When invoked against an unreachable stack the suite fails
 * loudly rather than skipping silently, so an explicit "run all" cannot quietly
 * no-op. Point it at a non-default origin with PERSONA_CRAWL_BASE_URL.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';

const INVOKED = process.env.RUN_PERSONA_CRAWL === '1';
const BASE = process.env.PERSONA_CRAWL_BASE_URL ?? 'http://localhost:3000';
const DL = 'david_leberknight';

function sessionCookie(setCookie: string[] | undefined): string {
  const entry = (setCookie ?? []).find((c) => c.startsWith('footbag_session='));
  if (!entry) throw new Error('no footbag_session cookie issued by build-switch');
  return entry.split(';')[0];
}

// Build David (or just re-mint his cookie if he already exists) and return the
// session cookie. The first call drives the full journey; later calls are cheap.
async function buildSwitchCookie(): Promise<string> {
  const res = await request(BASE).get(`/dev/build-switch?as=${DL}`).redirects(0);
  expect(res.status, 'build-switch redirects to /').toBe(302);
  expect(res.headers.location).toBe('/');
  return sessionCookie(res.headers['set-cookie'] as unknown as string[]);
}

describe.skipIf(!INVOKED)('David persona media and onboarding journey', () => {
  beforeAll(async () => {
    // Fail loudly (not skip) when invoked against an unreachable stack: the
    // operator asked to run this, so a missing app or image worker is an error.
    try {
      await request(BASE).get('/').timeout(5000);
    } catch (err) {
      throw new Error(
        `persona crawl invoked (RUN_PERSONA_CRAWL=1) but ${BASE} is unreachable; ` +
          `start the dev stack with ./run_dev.sh first. Underlying: ${(err as Error).message}`,
      );
    }
  });

  it('builds David through the real journey and lands him signed in', async () => {
    const cookie = await buildSwitchCookie();
    // The issued session is a real, middleware-verified session: the logged-in
    // member can reach their own owner-only profile edit page.
    const edit = await request(BASE).get(`/members/${DL}/edit`).set('Cookie', cookie).redirects(0);
    expect(edit.status, 'signed-in owner reaches their edit page').toBe(200);
  });

  it('completed onboarding: profile shows the claimed HOF identity and the Wellington club', async () => {
    const cookie = await buildSwitchCookie();
    const res = await request(BASE).get(`/members/${DL}`).set('Cookie', cookie);
    expect(res.status).toBe(200);
    // The legacy claim + club affiliation surface on his profile.
    expect(res.text).toContain('Wellington');
  });

  it('media journey: his Funky Footbags gallery lists with his uploaded media', async () => {
    const cookie = await buildSwitchCookie();
    const res = await request(BASE).get('/media/member-galleries').set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.text).toContain('Funky Footbags');
  });

  it('media journey: his avatar renders on his profile', async () => {
    const cookie = await buildSwitchCookie();
    const res = await request(BASE).get(`/members/${DL}`).set('Cookie', cookie);
    expect(res.status).toBe(200);
    // The uploaded avatar produces an avatar image element rather than the
    // initials fallback.
    expect(res.text).toMatch(/<img[^>]+class="[^"]*avatar/i);
  });
});
