/**
 * Parity guard for the glossary family-card tier overrides.
 *
 * A small map (CARD_ONLY_FAMILY_LINEAGE) sets the tier, and where applicable a
 * lineage parent, for card-only lineages that are not in the public roster
 * (rev_whirl, blur, phoenix). The map is looked up by card slug, so a key whose
 * slug style drifts (the hyphenated "rev-whirl" vs the underscored card slug
 * "rev_whirl") silently misses and the card falls through to the Family Parent
 * default, rendering a non-family lineage as a top-level family root.
 *
 * The contract this pins:
 *   - rev_whirl must NOT render as a Family Parent.
 *   - rev_whirl must NOT render as a branch of Whirl (direction reversal is a
 *     distinct lineage, not a branch of the forward family).
 *   - rev_whirl renders as an independent Minor Lineage.
 *   - blur and phoenix are terminal-identity branches of their bases and render
 *     as Minor Lineage branches.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';

import {
  setTestEnv,
  createTestDb,
  cleanupTestDb,
  importApp,
} from '../fixtures/testDb';

const { dbPath } = setTestEnv('3570');

let createApp: Awaited<ReturnType<typeof importApp>>;

beforeAll(async () => {
  const db = createTestDb(dbPath);
  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

async function glossary(): Promise<string> {
  const res = await request(await createApp()).get('/freestyle/glossary');
  expect(res.status).toBe(200);
  return res.text;
}

function familyCard(html: string, slug: string): string {
  const m = html.match(new RegExp(`id="term-${slug}"[\\s\\S]*?</article>`));
  expect(m, `${slug} family card`).not.toBeNull();
  return m![0];
}

describe('Glossary — family-card tier parity (card-only lineage overrides apply)', () => {
  it('renders Rev Whirl as an independent Minor Lineage, not a Family Parent and not a Whirl branch', async () => {
    const card = familyCard(await glossary(), 'rev_whirl');
    // demoted to minor lineage (the slug-mismatch bug rendered it a family parent root)
    expect(card).toContain('glossary-family-card-tier-chip--minor-lineage');
    expect(card).not.toContain('tier-chip--family-parent');
    // direction reversal is a distinct lineage: NOT a branch of whirl (or of anything)
    expect(card).not.toContain('Branch lineage');
    // it stands as its own (root-position) independent lineage
    expect(card).toContain('Root lineage');
  });

  it('demotes every card-only override from Family Parent, guarding against slug drift', async () => {
    const html = await glossary();
    for (const slug of ['rev_whirl', 'blur', 'phoenix']) {
      const card = familyCard(html, slug);
      expect(card, `${slug} tier`).toContain('glossary-family-card-tier-chip--minor-lineage');
      expect(card, `${slug} not a parent`).not.toContain('tier-chip--family-parent');
    }
    // blur (blurry mirage) and phoenix are terminal-identity branches; rev_whirl is not a branch
    expect(familyCard(html, 'blur'), 'blur is a branch').toContain('Branch lineage');
    expect(familyCard(html, 'phoenix'), 'phoenix is a branch').toContain('Branch lineage');
    expect(familyCard(html, 'rev_whirl'), 'rev_whirl is not a branch').not.toContain('Branch lineage');
  });
});
