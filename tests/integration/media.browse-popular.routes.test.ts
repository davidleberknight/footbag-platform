/**
 * The /media/browse landing (no query) leads with the search form, then the
 * Popular tags chip cloud. That list is composed, not ranked alone: real
 * community tags lead by usage and curator-published tags fill the rest. Nothing
 * pads it, so the block is only ever as long as recorded usage makes it and no
 * chip on it is a tag the platform holds no media for. The old hardcoded
 * "Try one" fallback chips are gone.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';

import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import { insertMember, insertFreeformTag, insertMediaItem, attachMediaTag } from '../fixtures/factories';

const { dbPath } = setTestEnv('3075');

let createApp: Awaited<ReturnType<typeof importApp>>;

beforeAll(async () => {
  const db = createTestDb(dbPath);
  // Single curator/system account: its catalog tags are public and popular. The
  // tag is freeform, so the Popular Tags block is the only place it can appear
  // and an assertion about that block cannot be satisfied elsewhere.
  const curator = insertMember(db, {
    id: 'member-curator', slug: 'footbag_hacky', is_system: 1,
    login_email: 'curator@example.com', real_name: 'Footbag Hacky', display_name: 'Footbag Hacky',
  });
  const tag = insertFreeformTag(db, { tag_normalized: '#passback_records', tag_display: '#passback_records' });
  for (let i = 0; i < 3; i += 1) {
    attachMediaTag(db, insertMediaItem(db, { uploader_member_id: curator, caption: `curated-${i}` }), tag);
  }
  db.close();

  createApp = await importApp();
  // Populate tag_stats so the discovery surface has data, mirroring the seed/reset flow.
  const mod = await import('../../src/services/hashtagDiscoveryService');
  mod.hashtagDiscoveryService.rebuildTagStats();
});

afterAll(() => cleanupTestDb(dbPath));

describe('GET /media/browse landing — search leads, popular tags follow', () => {
  it('renders the real curated tag in the Popular tags section', async () => {
    const res = await request(createApp()).get('/media/browse');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Popular tags');
    expect(res.text).toContain('#passback_records');
  });

  it('leaves the unfilled slots empty rather than padding them with tags that match nothing', async () => {
    const res = await request(createApp()).get('/media/browse');
    // The one real public tag is the whole block. Nothing else is offered,
    // because nothing else in this database has media behind it.
    expect(res.text).toContain('#passback_records');
    expect(res.text).not.toContain('#club_wellington');
    expect(res.text).not.toContain('#event_2026_worlds_japan');
    expect(res.text).not.toContain('#chinlone');
  });

  it('drops the hardcoded fallback chips and the separate club/event sections', async () => {
    const res = await request(createApp()).get('/media/browse');
    expect(res.text).not.toContain('/media/browse?tag=demo_net');
    expect(res.text).not.toContain('Try one:');
    expect(res.text).not.toContain('browse-standard-section');
  });

  it('leads with the search form, ahead of the popular tags', async () => {
    const res = await request(createApp()).get('/media/browse');
    expect(res.text.indexOf('browse-search-form')).toBeGreaterThan(-1);
    expect(res.text.indexOf('browse-popular-heading')).toBeGreaterThan(-1);
    expect(res.text.indexOf('browse-search-form')).toBeLessThan(res.text.indexOf('browse-popular-heading'));
  });
});
