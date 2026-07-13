/**
 * The trick-index landing "By family" card and the By-family browse describe the
 * family populations with precise, non-colliding labels and stay consistent.
 *
 * The landing card previews the full curated Family-Parent roster (DB-independent),
 * labelled "core families". The browse states its rendered roster as "N family
 * groupings organize tricks by structural anchor: C core families and M smaller
 * lineages ...", with the three numbers derived from the same rendered arrays so the
 * browse is internally consistent (N == C + M). Both surfaces name the Family-Parent
 * tier with the same "core families" wording, which is the cross-surface consistency
 * that must not drift; the landing's curated count and the browse's rendered count
 * coincide only when the data populates every family, so they are not asserted equal
 * on a partial fixture.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';

import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import { insertFreestyleTrick } from '../fixtures/factories';

const { dbPath } = setTestEnv('3529');

let createApp: Awaited<ReturnType<typeof importApp>>;

beforeAll(async () => {
  const db = createTestDb(dbPath);
  // Two Family-Parent families with members (whirl, mirage) and one Minor-Lineage
  // family with members (eclipse): the browse renders two core families, one smaller
  // lineage, three family groupings.
  const rows: Array<Parameters<typeof insertFreestyleTrick>[1]> = [
    { slug: 'whirl',           canonical_name: 'whirl',           adds: '3', base_trick: 'whirl',   trick_family: 'whirl',   category: 'dex',      review_status: 'expert_reviewed', is_active: 1 },
    { slug: 'spinning_whirl',  canonical_name: 'spinning whirl',  adds: '4', base_trick: 'whirl',   trick_family: 'whirl',   category: 'compound', review_status: 'expert_reviewed', is_active: 1 },
    { slug: 'mirage',          canonical_name: 'mirage',          adds: '2', base_trick: 'mirage',  trick_family: 'mirage',  category: 'dex',      review_status: 'expert_reviewed', is_active: 1 },
    { slug: 'spinning_mirage', canonical_name: 'spinning mirage', adds: '3', base_trick: 'mirage',  trick_family: 'mirage',  category: 'compound', review_status: 'expert_reviewed', is_active: 1 },
    { slug: 'eclipse',         canonical_name: 'eclipse',         adds: '3', base_trick: 'eclipse', trick_family: 'eclipse', category: 'dex',      review_status: 'expert_reviewed', is_active: 1 },
    { slug: 'spinning_eclipse',canonical_name: 'spinning eclipse',adds: '4', base_trick: 'eclipse', trick_family: 'eclipse', category: 'compound', review_status: 'expert_reviewed', is_active: 1 },
  ];
  for (const r of rows) insertFreestyleTrick(db, r);
  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

const landingCoreCount = (html: string) =>
  html.match(/dict-landing-card-count-num">(\d+)<\/span>\s*core families/)?.[1];
const browseGroupings = (html: string) => html.match(/(\d+) family groupings? organize tricks by structural anchor/)?.[1];
const browseCore      = (html: string) => html.match(/structural anchor: (\d+) core famil/)?.[1];
const browseSmaller   = (html: string) => html.match(/core famil(?:y|ies) and (\d+) smaller lineages?/)?.[1];

describe('GET /freestyle/tricks — precise, consistent family-count labels', () => {
  it('the landing card names the Family-Parent tier as "core families" and previews the full curated roster', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks');
    expect(res.status).toBe(200);
    // The landing previews the curated roster, so its count is DB-independent (17
    // core families) even though the fixture populates only two.
    expect(landingCoreCount(res.text)).toBe('17');
  });

  it('the browse explanation states the rendered roster as core families plus smaller lineages', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks?view=family');
    expect(res.status).toBe(200);
    expect(res.text).toContain('3 family groupings organize tricks by structural anchor: 2 core families and 1 smaller lineage that may later roll into broader family hierarchies.');
  });

  it('the browse roster count equals core families plus smaller lineages', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks?view=family');
    const groupings = Number(browseGroupings(res.text));
    const core = Number(browseCore(res.text));
    const smaller = Number(browseSmaller(res.text));
    expect(groupings).toBe(core + smaller);
  });

  it('both surfaces name the Family-Parent tier with the same "core families" wording', async () => {
    const landing = await request(await createApp()).get('/freestyle/tricks');
    const browse = await request(await createApp()).get('/freestyle/tricks?view=family');
    expect(landing.text).toContain('core families');
    expect(browse.text).toContain('core families');
  });
});
