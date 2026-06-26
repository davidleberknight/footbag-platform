/**
 * GET /freestyle/tricks/:slug — Terminal-derived "Tricks that land here" cohort.
 *
 * A terminal-stall atom that is not a public family (toe_stall, clipper_stall)
 * renders a curated, cross-family list of recognizable tricks that finish on its
 * surface. A cohort member renders the reciprocal "lands in" backlink. A terminal
 * that IS a public family (inside_stall) renders NO terminal cohort, because the
 * Family ladder already owns what lands there.
 *
 * Behaviors pinned:
 *   1. toe_stall renders the cohort (Barrage in, the swapped-out Eggbeater out).
 *   2. clipper_stall renders its cohort.
 *   3. inside_stall renders NO terminal cohort (family ladder owns the guay lineage).
 *   4. A cohort member (whirl) renders the reciprocal "Lands in" backlink.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';

import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import { insertFreestyleTrick } from '../fixtures/factories';

const { dbPath } = setTestEnv('3534');

let createApp: Awaited<ReturnType<typeof importApp>>;

const t = (slug: string, adds = '3') =>
  ({ slug, canonical_name: slug.replace(/_/g, ' '), adds, is_active: 1 as const });

// The terminal-derived section's rendered HTML slice, by its data-section marker.
function sectionSlice(html: string, marker: string): string {
  const start = html.indexOf(`data-section="${marker}"`);
  if (start < 0) return '';
  return html.slice(start, html.indexOf('</section>', start));
}

beforeAll(async () => {
  const db = createTestDb(dbPath);

  const rows = [
    // Terminal atoms
    t('toe_stall', '1'), t('clipper_stall', '1'), t('inside_stall', '1'),
    // toe_stall cohort
    t('mirage', '2'), t('illusion', '2'), t('legover', '2'), t('pickup', '2'),
    t('around_the_world', '2'), t('orbit', '2'), t('rake', '2'),
    t('double_leg_over', '3'), t('paradox_mirage', '3'), t('barrage', '3'),
    // the trick swapped OUT of the toe cohort — must not appear in it
    t('eggbeater', '3'),
    // clipper_stall cohort
    t('whirl', '3'), t('swirl', '3'), t('butterfly', '3'), t('osis', '3'),
    t('drifter', '3'), t('rev_whirl', '3'), t('rev_swirl', '3'),
    t('blender', '4'), t('dyno', '4'), t('atomic_butterfly', '4'),
  ];
  for (const r of rows) insertFreestyleTrick(db, r);

  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('GET /freestyle/tricks/:slug — terminal-derived cohort', () => {
  it('toe_stall renders the cohort (Barrage in, Eggbeater out)', async () => {
    const res = await request(createApp()).get('/freestyle/tricks/toe_stall');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Tricks that land here');
    const sec = sectionSlice(res.text, 'terminal-derived');
    for (const slug of ['mirage', 'legover', 'around_the_world', 'rake', 'double_leg_over', 'barrage']) {
      expect(sec, `expected ${slug} in toe cohort`).toContain(`/freestyle/tricks/${slug}"`);
    }
    // Eggbeater was swapped out for Barrage; it must not appear in the cohort.
    expect(sec).not.toContain('/freestyle/tricks/eggbeater"');
  });

  it('clipper_stall renders its cohort', async () => {
    const res = await request(createApp()).get('/freestyle/tricks/clipper_stall');
    expect(res.status).toBe(200);
    const sec = sectionSlice(res.text, 'terminal-derived');
    for (const slug of ['whirl', 'swirl', 'butterfly', 'osis', 'drifter', 'atomic_butterfly']) {
      expect(sec, `expected ${slug} in clipper cohort`).toContain(`/freestyle/tricks/${slug}"`);
    }
  });

  it('inside_stall renders NO terminal cohort (family ladder owns it)', async () => {
    const res = await request(createApp()).get('/freestyle/tricks/inside_stall');
    expect(res.status).toBe(200);
    expect(res.text).not.toContain('data-section="terminal-derived"');
    expect(res.text).not.toContain('Tricks that land here');
  });

  it('a cohort member (whirl) renders the reciprocal "lands in" backlink', async () => {
    const res = await request(createApp()).get('/freestyle/tricks/whirl');
    expect(res.status).toBe(200);
    const sec = sectionSlice(res.text, 'terminal-backlink');
    expect(sec).toContain('Lands in:');
    expect(sec).toContain('/freestyle/tricks/clipper_stall"');
  });
});
