/**
 * Glossary §composition expansion — Vocabulary Relationships
 * subsection. Replaces the prior #compression-vs-alternate-derivation +
 * standalone #symbolic-compression-flow blocks with a 4-way relationship-
 * types treatment (pure alias / structural compression / equivalent
 * derivation / ontology relationship).
 *
 * Both legacy anchors preserved for inbound deep-links.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';

import {
  setTestEnv,
  createTestDb,
  cleanupTestDb,
  importApp,
} from '../fixtures/testDb';

const { dbPath } = setTestEnv('3175');

let createApp: Awaited<ReturnType<typeof importApp>>;

beforeAll(async () => {
  const db = createTestDb(dbPath);
  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('Glossary Vocabulary Relationships subsection', () => {
  it('renders the new h3 with id="vocabulary-relationships"', async () => {
    const res = await request(await createApp()).get('/freestyle/glossary');
    expect(res.status).toBe(200);
    expect(res.text).toContain('id="vocabulary-relationships"');
    expect(res.text).toMatch(/Vocabulary relationships.*four ways trick names can relate/i);
  });

  it('preserves legacy anchor #compression-vs-alternate-derivation for inbound deep-links', async () => {
    const res = await request(await createApp()).get('/freestyle/glossary');
    expect(res.text).toContain('id="compression-vs-alternate-derivation"');
  });

  it('preserves legacy anchor #symbolic-compression-flow on the Structural compression h4', async () => {
    const res = await request(await createApp()).get('/freestyle/glossary');
    expect(res.text).toContain('id="symbolic-compression-flow"');
  });

  it('section 1 (Pure aliases) cites the toe-prefix examples', async () => {
    const res = await request(await createApp()).get('/freestyle/glossary');
    expect(res.text).toMatch(/Pure aliases/i);
    expect(res.text).toMatch(/toe blur[\s\S]*quantum mirage/i);
    expect(res.text).toMatch(/toe blizzard[\s\S]*quantum illusion/i);
    // The rule attribution no longer carries an internal ruling citation
    // (the "curator pt2 ruling" governance phrasing was stripped).
    expect(res.text).not.toMatch(/curator\s+pt2\s+ruling/i);
  });

  it('section 2 (Structural compression) cites smear / ripwalk / atom smasher / eggbeater / mobius examples', async () => {
    const res = await request(await createApp()).get('/freestyle/glossary');
    expect(res.text).toMatch(/Structural compression/i);
    expect(res.text).toMatch(/smear[\s\S]*pixie mirage/i);
    expect(res.text).toMatch(/ripwalk[\s\S]*stepping butterfly/i);
    expect(res.text).toMatch(/atom smasher[\s\S]*atomic mirage/i);
    expect(res.text).toMatch(/eggbeater[\s\S]*atomic legover/i);
    // 4-step mobius ladder including the deepest reading
    expect(res.text).toMatch(/mobius[\s\S]*gyro torque[\s\S]*spinning same-side torque[\s\S]*spinning miraging same-side osis/i);
  });

  it('section 2 carries the vocabulary-evolution framing sentence (WHY compressed names emerged)', async () => {
    const res = await request(await createApp()).get('/freestyle/glossary');
    expect(res.text).toMatch(/commonly\s+repeated\s+compositions\s+acquired\s+compressed\s+names/i);
  });

  it('section 3 (Equivalent derivations) preserves flurry + witchdoctor worked examples + ADD breakdowns', async () => {
    const res = await request(await createApp()).get('/freestyle/glossary');
    expect(res.text).toMatch(/Equivalent derivations/i);
    // flurry: two paths
    expect(res.text).toMatch(/flurry/i);
    expect(res.text).toMatch(/barraging legover/i);
    expect(res.text).toMatch(/paradox \+ paradox legover/i);
    expect(res.text).toMatch(/barraging\(\+2\)[\s\S]*legover\(2\)[\s\S]*4 ADD/i);
    // witchdoctor: composite-base + historical
    expect(res.text).toMatch(/witchdoctor/i);
    // Slice 5: atom-smasher is now hyperlinked, so its closing </a> sits
    // between the trick name and "+ symposium".
    expect(res.text).toMatch(/atom-smasher<\/a>\s*\+ symposium/i);
    expect(res.text).toMatch(/atomic symposium mirage/i);
    // Both detail-page links preserved
    expect(res.text).toContain('/freestyle/tricks/flurry');
    expect(res.text).toContain('/freestyle/tricks/witchdoctor');
  });

  it('section 3 carries the historical-readings note (toe-prefix, atomic symposium mirage, barrage-family)', async () => {
    const res = await request(await createApp()).get('/freestyle/glossary');
    expect(res.text).toMatch(/historical reading/i);
    expect(res.text).toMatch(/retired[\s\S]*?toe[\s\S]*?prefixed naming/i);
    expect(res.text).toMatch(/barrage-family/i);
  });

  it('section 4 (Ontology relationships) cites butterfly / legover / whirl families and eclipse-hop-over', async () => {
    const res = await request(await createApp()).get('/freestyle/glossary');
    expect(res.text).toMatch(/Ontology relationships/i);
    expect(res.text).toMatch(/butterfly family/i);
    expect(res.text).toMatch(/legover family/i);
    expect(res.text).toMatch(/whirl family/i);
    expect(res.text).toMatch(/eclipse[\s\S]*hop-over/i);
    expect(res.text).toMatch(/transformational/i);
  });

  it('sharpened distinctions table renders all 4 rows with the revised "Same structure?" cell', async () => {
    const res = await request(await createApp()).get('/freestyle/glossary');
    expect(res.text).toContain('class="glossary-equivalence-distinctions"');
    expect(res.text).toMatch(/<th>Relationship<\/th>[\s\S]*<th>Same trick\?<\/th>[\s\S]*<th>Same structure\?<\/th>[\s\S]*<th>What it asserts<\/th>/);
    // The revised cell for equivalent derivation
    expect(res.text).toMatch(/different structural reading\/path[\s\S]*movement converges[\s\S]*derivation differs/i);
    // 4 relationship rows present
    expect(res.text).toMatch(/<td>Pure alias<\/td>/);
    expect(res.text).toMatch(/<td>Structural compression<\/td>/);
    expect(res.text).toMatch(/<td>Equivalent derivation<\/td>/);
    expect(res.text).toMatch(/<td>Ontology relationship<\/td>/);
  });

  it('closing paragraph frames the four lenses (vocabulary / composition / derivation / family)', async () => {
    const res = await request(await createApp()).get('/freestyle/glossary');
    expect(res.text).toMatch(/notation\s+system\s+isn[\s\S]*just\s+labeling\s+tricks/i);
    expect(res.text).toMatch(/vocabulary,\s+composition,\s+derivation,\s+or\s+family/i);
  });

  it('the old "Compression ladders vs alternate derivations" h3 wording is removed (replaced by Vocabulary relationships)', async () => {
    const res = await request(await createApp()).get('/freestyle/glossary');
    expect(res.text).not.toMatch(/Compression ladders vs alternate derivations/i);
  });
});
