/**
 * Integration tests for the net landing page.
 *
 * Covers:
 *   GET /net — footbag net portal landing page
 *
 * Verifies:
 *   - 200 response
 *   - Hero mascot image carries a version token
 *   - Demo video (self-hosted webm/mp4) renders in intro section
 *   - Format videos load behind a click-to-play YouTube facade
 *   - Explore cards link to the events, rules and equipment pages, with or without results
 *   - The retired team and event listing addresses answer not-found
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import BetterSqlite3 from 'better-sqlite3';

import {
  setTestEnv,
  createTestDb,
  cleanupTestDb,
  importApp,
} from '../fixtures/testDb';
import { insertMember, insertCuratorVideo } from '../fixtures/factories';

const { dbPath } = setTestEnv('3098');

// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let createApp: Awaited<ReturnType<typeof importApp>>;

beforeAll(async () => {
  createTestDb(dbPath).close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

// ---------------------------------------------------------------------------

describe('GET /net', () => {
  // Defect caught: a visitor on the net home has no way on to net events, the
  // rules or the equipment page, or is sent to an address that no longer exists.
  // The database here holds no results, so the cards must not depend on any.
  it('links the events, rules and equipment pages from an empty database', async () => {
    const res = await request(createApp()).get('/net');
    expect(res.status).toBe(200);
    expect(res.text).toContain('href="/events"');
    expect(res.text).toContain('href="/rules/net/footbag-net"');
    expect(res.text).toContain('href="/equipment#net"');
    expect(res.text).not.toContain('href="/net/');
  });

  // Defect caught: a retired page comes back, or a retired address redirects, when
  // an old link should reach the standard not-found page.
  it('answers not-found at the retired team and event listing addresses', async () => {
    const app = createApp();
    for (const path of ['/net/teams', '/net/teams/any-team-id', '/net/events']) {
      const res = await request(app).get(path);
      expect(res.status, path).toBe(404);
    }
  });
});

// ---------------------------------------------------------------------------
// Portal landing sections: hero mascot, demo video, format videos
// ---------------------------------------------------------------------------

describe('GET /net — portal landing sections', () => {
  it('renders the net mascot image', async () => {
    const app = createApp();
    const res = await request(app).get('/net');
    expect(res.text).toMatch(/src="\/img\/net-mascot\.svg\?v=[0-9a-f]{10}"/);
  });

  it('omits the demo-video figure when no curator-tagged FH media is seeded', async () => {
    const app = createApp();
    const res = await request(app).get('/net');
    expect(res.text).not.toContain('class="demo-video"');
  });

  it('renders the curator-owned demo video when an FH-owned #demo_net item is seeded', async () => {
    const seedDb = new BetterSqlite3(dbPath);
    try {
      const fhId = insertMember(seedDb, { is_system: 1, slug: 'fh-net' });
      insertCuratorVideo(seedDb, {
        uploaderMemberId: fhId,
        sourceFilename: 'demo-net.mp4',
        slotTag: '#demo_net',
        caption: 'Demonstration of footbag net',
      });
    } finally {
      seedDb.close();
    }

    const app = createApp();
    const res = await request(app).get('/net');
    // The net clip is landscape, so it keeps the landscape frame.
    expect(res.text).toContain('class="demo-video"');
    expect(res.text).not.toContain('demo-video--portrait');
    expect(res.text).toMatch(/\/media-store\/[^"]+-video\.mp4\?v(?:=|&#x3D;)[^"]+/);
    expect(res.text).toMatch(/\/media-store\/[^"]+-poster-display\.jpg/);
    expect(res.text).toContain('Demonstration of footbag net');
    expect(res.text).toContain('autoplay');
    expect(res.text).toContain('playsinline');
    expect(res.text).not.toContain('type="video/webm"');
  });

  // The clip starts on its own and loops forever, so the visitor needs a way to
  // stop it; the native controls are that mechanism.
  it('gives the looping demo clip controls', async () => {
    const res = await request(createApp()).get('/net');
    expect(res.text).toMatch(/<video[^>]*\bautoplay\b[^>]*\bcontrols\b/);
  });

  it('lazy-loads YouTube videos in competition-format cards via the video-facade partial', async () => {
    const app = createApp();
    const res = await request(app).get('/net');

    // No eager YouTube iframe is rendered on initial load. The facade
    // partial (src/views/partials/video-facade.hbs) renders a static
    // thumbnail anchor; video-facade.js swaps in the iframe on click.
    // Without JS, the anchor href takes the user to youtube.com.
    expect(res.text).not.toMatch(/<iframe[^>]+src=["']https:\/\/www\.youtube(-nocookie)?\.com\/embed\//);

    // Per format card (Singles, Doubles): platform watch href,
    // embed-url data attribute, and platform thumbnail.
    for (const videoId of ['Rep-1rQbX-o', 'lcDP3JGvkP0']) {
      expect(res.text).toContain(`href="https://www.youtube.com/watch?v&#x3D;${videoId}"`);
      expect(res.text).toContain(`data-embed-url="https://www.youtube-nocookie.com/embed/${videoId}?rel&#x3D;0"`);
      expect(res.text).toContain(`https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`);
    }

    // Partial markup + no-JS fallback open YouTube in a new tab safely.
    expect(res.text).toContain('class="video-facade"');
    expect(res.text).toContain('data-platform="youtube"');
    expect(res.text).toContain('target="_blank"');
    expect(res.text).toContain('rel="noopener noreferrer"');
  });

  it('gives each video facade one accessible name: the play link is labelled and the poster is decorative', async () => {
    const app = createApp();
    const res = await request(app).get('/net');
    // The play link carries the accessible name.
    expect(res.text).toMatch(/aria-label="Play video: [^"]+"/);
    // The poster image is decorative (empty alt), so the name is not announced
    // twice for one control. No facade thumbnail carries a non-empty alt.
    expect(res.text).toContain('class="video-facade-thumb"');
    expect(res.text).not.toMatch(/class="video-facade-thumb"[^>]*\salt="[^"]+"/);
    expect(res.text).not.toMatch(/alt="[^"]*"[^>]*class="video-facade-thumb"/);
  });
});
