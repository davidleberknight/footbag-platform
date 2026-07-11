/**
 * "Compressed from" trick-detail pedagogy line (2026-05-25 glossary
 * follow-on). Strict allowlist of famous structural compressions only:
 * smear, ripwalk, atom_smasher, eggbeater, mobius. Reinforces the
 * glossary §composition "Structural compression" concept on flagship
 * detail pages without expanding ontology surfaces.
 *
 * Contract:
 *   - Allowlisted slug + symbolic-equivalence chain present → renders
 *     "Compressed from: <reading>" (4 slugs) or "Compressed reading:
 *     <reading>" (mobius).
 *   - Non-allowlisted slug → renders nothing (no surface).
 *   - Allowlisted slug but no chain data → renders nothing.
 *   - Browse cards remain unaffected (this is detail-page only).
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

const { dbPath } = setTestEnv('3176');

let createApp: Awaited<ReturnType<typeof importApp>>;

beforeAll(async () => {
  const db = createTestDb(dbPath);

  // 5 allowlisted famous-compression slugs.
  insertFreestyleTrick(db, {
    slug: 'smear', canonical_name: 'smear', adds: '3',
    base_trick: 'mirage', trick_family: 'mirage', category: 'compound',
    review_status: 'expert_reviewed', is_active: 1,
  });
  insertFreestyleTrick(db, {
    slug: 'ripwalk', canonical_name: 'ripwalk', adds: '4',
    base_trick: 'butterfly', trick_family: 'butterfly', category: 'compound',
    review_status: 'expert_reviewed', is_active: 1,
  });
  insertFreestyleTrick(db, {
    slug: 'atom_smasher', canonical_name: 'atom smasher', adds: '3',
    base_trick: 'mirage', trick_family: 'mirage', category: 'compound',
    review_status: 'expert_reviewed', is_active: 1,
  });
  insertFreestyleTrick(db, {
    slug: 'eggbeater', canonical_name: 'eggbeater', adds: '3',
    base_trick: 'legover', trick_family: 'legover', category: 'compound',
    review_status: 'expert_reviewed', is_active: 1,
  });
  insertFreestyleTrick(db, {
    slug: 'mobius', canonical_name: 'mobius', adds: '5',
    base_trick: 'torque', trick_family: 'torque', category: 'compound',
    review_status: 'expert_reviewed', is_active: 1,
  });

  // Control: a non-allowlisted compound that DOES have a symbolic-
  // equivalence chain (vortex ≡ gyro drifter). The "Compressed from" line
  // MUST NOT render for this slug because it's not in the famous-compression
  // allowlist. (Drifter's own "miraging clipper" reading is held for curator
  // review, so drifter no longer carries a chain and cannot serve as this
  // control.)
  insertFreestyleTrick(db, {
    slug: 'vortex', canonical_name: 'vortex', adds: '4',
    base_trick: 'drifter', trick_family: 'drifter',
    category: 'compound', review_status: 'expert_reviewed', is_active: 1,
  });

  // Control: an allowlisted slug shape but the slug is not actually
  // allowlisted (a plain compound). The "Compressed from" line MUST
  // NOT render.
  insertFreestyleTrick(db, {
    slug: 'pixie_legover', canonical_name: 'pixie legover', adds: '3',
    base_trick: 'legover', trick_family: 'legover', category: 'compound',
    review_status: 'expert_reviewed', is_active: 1,
  });

  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('"Compressed from" surface — allowlisted famous compressions', () => {
  it('smear detail page renders "Compressed from: pixie mirage"', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/smear');
    expect(res.status).toBe(200);
    expect(res.text).toContain('class="trick-compressed-from"');
    expect(res.text).toMatch(/<span class="trick-compressed-from-label">Compressed from:<\/span>/);
    expect(res.text).toMatch(/<em class="trick-compressed-from-reading">pixie mirage<\/em>/);
  });

  it('ripwalk detail page renders "Compressed from: stepping butterfly"', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/ripwalk');
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/<span class="trick-compressed-from-label">Compressed from:<\/span>/);
    expect(res.text).toMatch(/<em class="trick-compressed-from-reading">stepping butterfly<\/em>/);
  });

  it('atom_smasher detail page renders "Compressed from: atomic mirage"', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/atom_smasher');
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/<span class="trick-compressed-from-label">Compressed from:<\/span>/);
    expect(res.text).toMatch(/<em class="trick-compressed-from-reading">atomic mirage<\/em>/);
  });

  it('eggbeater detail page renders "Compressed from: atomic legover"', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/eggbeater');
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/<span class="trick-compressed-from-label">Compressed from:<\/span>/);
    expect(res.text).toMatch(/<em class="trick-compressed-from-reading">atomic legover<\/em>/);
  });

  it('mobius detail page renders "Compressed reading: gyro torque" (different label per curator spec)', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/mobius');
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/<span class="trick-compressed-from-label">Compressed reading:<\/span>/);
    expect(res.text).toMatch(/<em class="trick-compressed-from-reading">gyro torque<\/em>/);
  });

  it('the surface renders as a single one-line <p> (visually subordinate, not a section)', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/smear');
    // Single <p> element, no <section>/<h2>/<dl> machinery
    expect(res.text).toMatch(/<p class="trick-compressed-from">[\s\S]{0,200}<\/p>/);
    // Must NOT introduce a section heading or larger block
    expect(res.text).not.toContain('Structural compression</h2>');
  });
});

describe('"Compressed from" surface — suppression rules', () => {
  it('non-allowlisted slug WITH symbolic-equivalence chain does NOT render the line (vortex ≡ gyro drifter)', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/vortex');
    expect(res.status).toBe(200);
    // vortex has a chain entry (gyro drifter) but is NOT in the
    // FAMOUS_COMPRESSION_SLUGS allowlist; the line MUST NOT render.
    expect(res.text).not.toContain('class="trick-compressed-from"');
    expect(res.text).not.toMatch(/<em class="trick-compressed-from-reading">gyro drifter<\/em>/);
  });

  it('plain non-allowlisted compound does NOT render the line (pixie_legover control)', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/pixie_legover');
    expect(res.status).toBe(200);
    expect(res.text).not.toContain('class="trick-compressed-from"');
  });
});

describe('"Compressed from" surface — does not affect browse cards', () => {
  it('browse card for smear does NOT carry the "Compressed from" line (detail-page only)', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks?view=add');
    expect(res.status).toBe(200);
    // Locate the smear card
    const idx = res.text.indexOf('data-trick-slug="smear"');
    if (idx > -1) {
      const articleOpen = res.text.lastIndexOf('<article', idx);
      const articleClose = res.text.indexOf('</article>', idx);
      const card = res.text.slice(articleOpen, articleClose + '</article>'.length);
      expect(card).not.toContain('trick-compressed-from');
    }
  });
});
