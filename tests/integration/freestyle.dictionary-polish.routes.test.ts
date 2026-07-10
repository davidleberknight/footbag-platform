/**
 * Dictionary polish and terminology-correctness contract:
 *   - the ADD view defaults to alphabetical ordering within each ADD tier,
 *     with the By-family bands reachable via an explicit toggle;
 *   - the trick-search box shows a short, non-truncating placeholder while
 *     keeping the full description in the accessible label;
 *   - Torque's public scoring / component label is the canonical set
 *     (quantum + osis), never the historical "miraging" nickname. The
 *     nickname survives only as a framed historical note.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';

import {
  setTestEnv,
  createTestDb,
  cleanupTestDb,
  importApp,
} from '../fixtures/testDb';
import { insertFreestyleTrick } from '../fixtures/factories';

const { dbPath } = setTestEnv('3184');

let createApp: Awaited<ReturnType<typeof importApp>>;

beforeAll(async () => {
  const db = createTestDb(dbPath);

  // Torque + its osis base so the ADD-view card renders the resolved formula.
  insertFreestyleTrick(db, { slug: 'osis',   canonical_name: 'osis',   adds: '3', base_trick: 'osis',   trick_family: 'osis',   category: 'compound' });
  insertFreestyleTrick(db, { slug: 'torque', canonical_name: 'torque', adds: '4', base_trick: 'osis',   trick_family: 'osis',   category: 'compound' });

  // Two same-tier tricks whose alphabetical order is unambiguous.
  insertFreestyleTrick(db, { slug: 'alpha-aaa', canonical_name: 'Alpha Aaa', adds: '2', base_trick: 'alpha-aaa', trick_family: 'mirage', category: 'dex' });
  insertFreestyleTrick(db, { slug: 'zulu-zzz',  canonical_name: 'Zulu Zzz',  adds: '2', base_trick: 'zulu-zzz',  trick_family: 'whirl',  category: 'dex' });

  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('ADD view defaults to alphabetical ordering', () => {
  it('opens alphabetical, with By family reachable via an explicit toggle', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks');
    expect(res.status).toBe(200);
    const html = res.text;
    // Alphabetical is the active default; By family is the opt-in link.
    expect(html).toContain('trick-view-toggle-active">Alphabetical');
    expect(html).toContain('sort=family">By family');
    // Within the shared ADD tier, names render A-Z.
    expect(html.indexOf('Alpha Aaa')).toBeLessThan(html.indexOf('Zulu Zzz'));
  });

  it('still serves the By family bands when explicitly requested', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks?sort=family');
    expect(res.status).toBe(200);
    expect(res.text).toContain('trick-view-toggle-active">By family');
    expect(res.text).toContain('add-lineage-header');
  });
});

describe('Trick-search placeholder is short and non-truncating', () => {
  it('shows a short placeholder and keeps the full accessible label on both surfaces', async () => {
    for (const path of ['/freestyle/tricks', '/freestyle/search']) {
      const res = await request(await createApp()).get(path);
      expect(res.status).toBe(200);
      expect(res.text).toContain('placeholder="Name or alias"');
      expect(res.text).toContain('aria-label="Search tricks by name or alias"');
      // The long placeholder that truncated in a narrow box must be gone.
      expect(res.text).not.toContain('placeholder="Search tricks by name or alias..."');
    }
  });
});

describe('Torque teaches the canonical set as its scoring label, not the nickname', () => {
  it('ADD-view card shows quantum(+1) + osis(3), never miraging as the scored component', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks');
    expect(res.status).toBe(200);
    expect(res.text).toContain('quantum(+1) + osis(3)');
    expect(res.text).not.toContain('miraging(+1) + osis(3)');
  });

  it('ADD-analysis page reads Torque as quantum osis in its scoring surfaces', async () => {
    const res = await request(await createApp()).get('/freestyle/add-analysis');
    expect(res.status).toBe(200);
    const html = res.text;
    // Component + breakdown + branch reading all use the canonical set.
    // (Handlebars escapes '=' to &#x3D;, so match the pre-'=' substring.)
    expect(html).toContain('quantum(+1) + osis(3)');
    expect(html).toContain('quantum Osis');
    // The nickname is never the scored component.
    expect(html).not.toContain('miraging(+1) + osis(3)');
    expect(html).not.toContain('miraging Osis');
  });

  it('glossary compression table reads Torque as Quantum Osis', async () => {
    const res = await request(await createApp()).get('/freestyle/glossary');
    expect(res.status).toBe(200);
    expect(res.text).toContain('<td>Quantum Osis</td>');
    expect(res.text).not.toContain('<td>Miraging Osis</td>');
  });
});
