/**
 * Trick-detail naming-and-interpretation overlay tests.
 *
 * Pins the prototype contract for the curator-locked
 * freestyleTrickInterpretations module:
 *   - section renders on the seed slug (eggbeater)
 *   - canonical reading "atomic legover" appears
 *   - historical reading "illusion + legover" appears
 *   - structural-note framing about the historical reading not implying
 *     a productive modifier family appears
 *   - no illusioning modifier surface is created (no /freestyle/modifiers/
 *     anchor or modifier reference produced from this section)
 *   - eggbeater's alias rows are unchanged (rendering is read-only)
 *   - other tricks (no interpretation entry) do not render the section
 *   - ADD value and family link are unchanged by the overlay
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
import { insertFreestyleTrick, insertFreestyleTrickAlias } from '../fixtures/factories';

const { dbPath } = setTestEnv('3331');

let createApp: Awaited<ReturnType<typeof importApp>>;
let testDbHandle: ReturnType<typeof createTestDb>;

beforeAll(async () => {
  testDbHandle = createTestDb(dbPath);

  // Seed eggbeater with its canonical structural fields. Family = legover
  // (canonical reading: "atomic legover"); base = legover.
  insertFreestyleTrick(testDbHandle, {
    slug: 'eggbeater', canonical_name: 'eggbeater', adds: '4',
    base_trick: 'legover', trick_family: 'legover', category: 'compound',
    description: 'Atomic legover.',
    review_status: 'curated', is_active: 1,
  });
  // Pre-existing alias (the only one in production for this trick). The
  // test asserts the row count is unchanged after rendering.
  insertFreestyleTrickAlias(testDbHandle, 'egg-beater', 'eggbeater', 'egg beater');

  // A non-eggbeater control trick — should NOT render the
  // interpretation section (no curator entry).
  insertFreestyleTrick(testDbHandle, {
    slug: 'legover', canonical_name: 'legover', adds: '1',
    base_trick: 'legover', trick_family: 'legover', category: 'dex',
    description: 'A canonical legover base trick.',
    review_status: 'curated', is_active: 1,
  });

  // Interpretation note: one move, competing analyses (canonical + historical).
  insertFreestyleTrick(testDbHandle, {
    slug: 'torque', canonical_name: 'torque', adds: '4',
    base_trick: 'osis', trick_family: 'osis', category: 'compound',
    description: 'A mirage into an osis.',
    review_status: 'curated', is_active: 1,
  });

  // Terminology note: one label, different moves (no historical-reading line).
  insertFreestyleTrick(testDbHandle, {
    slug: 'clipper', canonical_name: 'clipper', adds: '1',
    base_trick: 'clipper', trick_family: 'clipper', category: 'body',
    description: 'A cross-body inside-foot stall.',
    review_status: 'curated', is_active: 1,
  });

  testDbHandle.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('Naming & interpretation overlay — eggbeater (seed entry)', () => {
  it('renders the interpretation section on /freestyle/tricks/eggbeater', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/eggbeater');
    expect(res.status).toBe(200);
    expect(res.text).toContain('class="content-section trick-interpretation"');
    expect(res.text).toContain('Naming &amp; interpretation');
  });

  it('surfaces the canonical reading "atomic legover"', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/eggbeater');
    expect(res.text).toMatch(/Canonical reading[\s\S]*?atomic legover/);
  });

  it('surfaces the historical reading "illusion + legover"', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/eggbeater');
    expect(res.text).toMatch(/Historical reading[\s\S]*?illusion \+ legover/);
  });

  it('renders the structural-note framing about the historical reading not implying a productive modifier family', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/eggbeater');
    expect(res.text).toContain('Both readings describe the same trick.');
    // Handlebars HTML-escapes the curator-authored straight quotes, so
    // match the rendered &quot; form.
    expect(res.text).toMatch(/historical &quot;illusion \+ legover&quot; reading is preserved as community/);
    expect(res.text).toMatch(/does not automatically imply that &quot;illusioning&quot; is a productive modifier system/);
  });

  it('does NOT create an illusioning modifier link or modifier reference from this section', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/eggbeater');
    // The section must not produce a modifier-page anchor for "illusioning".
    expect(res.text).not.toMatch(/href="\/freestyle\/modifiers\/illusioning"/);
    expect(res.text).not.toMatch(/href="[^"]*illusioning[^"]*"/);
    // And no trick-slug link for an illusioning-prefixed slug.
    expect(res.text).not.toMatch(/href="\/freestyle\/tricks\/illusioning[^"]*"/);
  });

  it('does NOT mutate eggbeater aliases (rendering is read-only)', async () => {
    // Render the page, then snapshot the alias table state directly
    // (re-open the existing test DB without re-applying the schema).
    await request(await createApp()).get('/freestyle/tricks/eggbeater');
    const checkDb = new BetterSqlite3(dbPath, { readonly: true });
    const rows = checkDb.prepare(
      `SELECT alias_slug, alias_text, trick_slug FROM freestyle_trick_aliases
       WHERE trick_slug = ?`,
    ).all('eggbeater') as Array<{ alias_slug: string; alias_text: string; trick_slug: string }>;
    checkDb.close();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      alias_slug: 'egg-beater',
      alias_text: 'egg beater',
      trick_slug: 'eggbeater',
    });
  });
});

describe('Naming & interpretation overlay — interpretation note (torque)', () => {
  it('surfaces only the historical variant (canonical reading lives in the equivalent-readings chain)', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/torque');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Naming &amp; interpretation');
    expect(res.text).toMatch(/Historical reading[\s\S]*?stepping opposite osis/);
    expect(res.text).toContain('interpretive/source terminology, not a different trick');
    // The canonical "miraging osis" reading is NOT repeated in this section.
    expect(res.text).not.toMatch(/Canonical reading[\s\S]*?stepping opposite osis/);
    const interpStart = res.text.indexOf('trick-interpretation');
    const interpEnd = res.text.indexOf('</section>', interpStart);
    expect(res.text.slice(interpStart, interpEnd)).not.toContain('miraging osis');
  });
});

describe('Naming & interpretation overlay — terminology note (clipper)', () => {
  it('renders the section and states the footbag.org clipper kick is a different move', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/clipper');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Naming &amp; interpretation');
    expect(res.text).toMatch(/Canonical reading[\s\S]*?cross-body inside-foot stall/);
    expect(res.text).toMatch(/different move shares this name[\s\S]*?clipper kick/);
  });

  it('does NOT render a "Historical reading" label (a different move is not a reading of this trick)', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/clipper');
    expect(res.text).not.toContain('Historical reading');
  });
});

describe('Naming & interpretation overlay — opt-in scope', () => {
  it('does NOT render the section on /freestyle/tricks/legover (no curator entry)', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/legover');
    expect(res.status).toBe(200);
    expect(res.text).not.toContain('class="content-section trick-interpretation"');
    expect(res.text).not.toContain('Naming &amp; interpretation');
  });
});

describe('Naming & interpretation overlay — non-interference', () => {
  it('eggbeater page still shows the canonical legover family link (overlay does not displace family)', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/eggbeater');
    // Family link to the canonical base remains.
    expect(res.text).toMatch(/href="\/freestyle\/tricks\/legover"/);
  });

  it('eggbeater page still shows ADD value 4 (overlay does not change ADD math)', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/eggbeater');
    // ADD value 4 appears somewhere on the page (hero stat, decomposition
    // row, or About block). The exact selector varies by template state;
    // assert the numeric value is present at least once.
    expect(res.text).toMatch(/\b4\b/);
  });
});
