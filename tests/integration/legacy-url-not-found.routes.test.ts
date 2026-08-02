/**
 * Legacy URL handling on the platform.
 *
 * The platform is not backward compatible with the old site's URL space and
 * forwards nothing. Every legacy URL is served the standard not-found page,
 * which tells a visitor arriving from an old link that the link is no longer
 * routable and points them at the new site.
 *
 * The old member-profile shape is the case that proves it. It is the URL that
 * appears in mail sent before cutover, and it falls to the catch-all for its
 * prefix. If that catch-all gates on authentication before deciding, an unknown
 * URL answers with the sign-in form, which tells a visitor the page exists and
 * they merely need to log in: the one visitor the not-found wording was written
 * for is the one who never sees it.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from '../fixtures/supertestWithOrigin';

import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import { insertMember, createTestSessionJwt } from '../fixtures/factories';

const { dbPath } = setTestEnv('3184');

// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let createApp: Awaited<ReturnType<typeof importApp>>;

const MEMBER_ID = 'member-legacy-url-notfound';
const COOKIE    = `__Host-footbag_session=${createTestSessionJwt({ memberId: MEMBER_ID })}`;

beforeAll(async () => {
  const db = createTestDb(dbPath);
  insertMember(db, {
    id:           MEMBER_ID,
    slug:         'legacy_url_viewer',
    display_name: 'Legacy URL Viewer',
  });
  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('legacy member-profile URLs', () => {
  it('serves the not-found page to a signed-out visitor, never a sign-in form', async () => {
    const res = await request(createApp()).get('/members/profile/80697');
    expect(res.status).toBe(404);
    expect(res.headers.location).toBeUndefined();
    expect(res.text).toContain('no longer routable');
  });

  it('does not forward a legacy id that matches a live member', async () => {
    const res = await request(createApp()).get('/members/profile/1');
    expect(res.status).toBe(404);
    expect(res.headers.location).toBeUndefined();
  });

  it('answers any unrecognized two-segment members URL the same way', async () => {
    const res = await request(createApp()).get('/members/legacy_url_viewer/nosuchsection');
    expect(res.status).toBe(404);
    expect(res.headers.location).toBeUndefined();
  });

  it('leaves an ordinary member profile URL to the slug route', async () => {
    const res = await request(createApp())
      .get('/members/legacy_url_viewer')
      .set('Cookie', COOKIE);
    expect(res.status).toBe(200);
  });
});
