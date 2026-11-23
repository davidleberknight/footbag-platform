/**
 * GET /freestyle/tricks/:slug — a trick page names only the few tricks a
 * curator related to it, never its family, and every relationship link on it
 * resolves.
 *
 * Seeded here: the whirl base; a compound built on it with many same-base
 * peers and many tricks built on the compound itself; a trick in another
 * family sharing the compound's operators; and the reverse whirl, stored as
 * reversing whirl. The compound's page lists none of those relations as
 * relatives, since no curator related them, and links the family view
 * instead; the whirl and reverse whirl pages list each other.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { cachedGet } from '../fixtures/cachedGet';

import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import { seedStagedFamilies } from '../fixtures/stagedFamilies';
import {
  insertFreestyleTrick,
  insertFreestyleTrickModifier,
  insertFreestyleTrickModifierLink,
} from '../fixtures/factories';

const { dbPath } = setTestEnv('3624');
let createApp: Awaited<ReturnType<typeof importApp>>;
const page = cachedGet(() => createApp());

const CURRENT   = 'relatives_current';
const NEIGHBOUR = 'relatives_neighbour';
const PEERS       = Array.from({ length: 3 }, (_, i) => `relatives_peer_${i}`);
const DERIVATIVES = Array.from({ length: 3 }, (_, i) => `relatives_built_${i}`);

beforeAll(async () => {
  const db = createTestDb(dbPath);
  seedStagedFamilies(db);
  const trick = (slug: string, family: string, base: string, adds: string, extra: Record<string, unknown> = {}) =>
    insertFreestyleTrick(db, {
      slug, canonical_name: slug.replace(/_/g, ' '), trick_family: family,
      base_trick: base, category: 'compound', adds, is_active: 1, ...extra,
    });
  trick('whirl', 'whirl', 'whirl', '3', { category: 'dex' });
  trick('rev_whirl', 'rev_whirl', 'rev_whirl', '3', { category: 'dex', reverse_pair_base: 'whirl' });
  // Three members, like the real lineage, so the family view gives reverse
  // whirl a page of its own for its family link to land on.
  trick('pixie_rev_whirl', 'rev_whirl', 'rev_whirl', '4');
  trick('fairy_rev_whirl', 'rev_whirl', 'rev_whirl', '4');
  trick(CURRENT, 'whirl', 'whirl', '4');
  for (const p of PEERS) trick(p, 'whirl', 'whirl', '5');
  for (const d of DERIVATIVES) trick(d, 'whirl', CURRENT, '5');
  trick(NEIGHBOUR, 'osis', 'osis', '5');
  insertFreestyleTrickModifier(db, { slug: 'spinning', modifier_name: 'Spinning', modifier_type: 'body' });
  insertFreestyleTrickModifier(db, { slug: 'ducking', modifier_name: 'Ducking', modifier_type: 'body' });
  for (const slug of [CURRENT, NEIGHBOUR, ...PEERS]) {
    insertFreestyleTrickModifierLink(db, slug, 'spinning');
    insertFreestyleTrickModifierLink(db, slug, 'ducking');
  }
  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

// One section of the page, from its data-section marker to its close.
const sectionOf = (html: string, key: string): string => {
  const start = html.indexOf(`data-section="${key}"`);
  return start < 0 ? '' : html.slice(start, html.indexOf('</section>', start));
};
// Every trick-page link a block renders.
const trickLinks = (block: string): string[] =>
  [...block.matchAll(/href="\/freestyle\/tricks\/([a-z0-9_]+)"/g)].map(m => m[1]!);

describe('a trick page names only what a curator related, never its family', () => {
  // Defect caught: the page reproduces the family's membership or computes
  // relatives from a shared base, shared operators or the tricks built on it,
  // so the trick is buried under a list nobody chose.
  it('lists no same-base peer, no shared-operator trick and no trick built on it', async () => {
    const res = await page(`/freestyle/tricks/${CURRENT}`);
    expect(res.status).toBe(200);
    const linked = new Set(trickLinks(sectionOf(res.text, 'related-tricks')));
    for (const s of [...PEERS, ...DERIVATIVES, NEIGHBOUR]) expect(linked.has(s), s).toBe(false);
    expect(res.text).not.toContain('data-section="progression"');
  });

  // Defect caught: with the family list gone, the reader has no way to the
  // family's membership.
  it('links the family view in place of the family list', async () => {
    const res = await page(`/freestyle/tricks/${CURRENT}`);
    expect(sectionOf(res.text, 'related-tricks')).toMatch(/<a class="btn btn-outline" href="[^"]+" data-family-browse>/);
  });

  // Defect caught: a reverse pair a curator stored does not link the two
  // tricks, which are each other's nearest relative.
  it('lists the stored reverse pair on both pages', async () => {
    expect(trickLinks(sectionOf((await page('/freestyle/tricks/whirl')).text, 'closest-relatives'))).toEqual(['rev_whirl']);
    expect(trickLinks(sectionOf((await page('/freestyle/tricks/rev_whirl')).text, 'closest-relatives'))).toEqual(['whirl']);
  });
});

describe('every relationship link on a trick page resolves', () => {
  // Defect caught: a relationship list links an alias, a modifier, a set or a
  // missing row, so the reader lands on a redirect or a not-found page.
  it.each([CURRENT, 'whirl', 'rev_whirl'])('%s: every relative and family link answers 200', async (slug) => {
    const html = (await page(`/freestyle/tricks/${slug}`)).text;
    const hrefs = [...sectionOf(html, 'related-tricks').matchAll(/href="([^"]+)"/g)]
      .map(m => m[1]!.replace(/&#x3D;/g, '=').replace(/&amp;/g, '&').split('#')[0]!)
      .filter(h => h.startsWith('/freestyle/'));
    expect(hrefs.length, `${slug} renders no relationship links`).toBeGreaterThan(0);
    for (const href of new Set(hrefs)) {
      expect((await page(href)).status, href).toBe(200);
    }
  });
});
