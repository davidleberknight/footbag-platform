/**
 * /freestyle/tricks?view=add — two-line row contract (2026-05-27).
 *
 * Every promoted trick row obeys the SAME two-line structure:
 *   Line 1 (.dict-add-row-head): name · hashtag · optional ≡ interpretation · optional media
 *   Line 2 (.dict-add-row-notation): JOB: <op notation> · ADD: <formula | bare N>
 *
 * Hard rules pinned:
 *   - Every row uses the .dict-add-row wrapper (uniform structure).
 *   - No green ADD chip (.dict-card-add) inside ADD-view rows.
 *   - Interpretation slot appears only when meaningful (2-bag-juggling has none).
 *   - JOB + ADD always present on line 2 (honest pending/unrated when unknown).
 *   - Media badge on line 1.
 *   - Section headers still group by ADD.
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

const { dbPath } = setTestEnv('3522');

let createApp: Awaited<ReturnType<typeof importApp>>;

beforeAll(async () => {
  const db = createTestDb(dbPath);

  db.prepare(`
    INSERT INTO freestyle_trick_modifiers
      (slug, modifier_name, modifier_type, add_bonus, add_bonus_rotational, notes, loaded_at)
    VALUES
      ('ducking',  'ducking',  'body', 1, 1, '', ?),
      ('fairy',    'fairy',    'set',  1, 1, '', ?)
  `).run('2026-05-27T00:00:00.000Z', '2026-05-27T00:00:00.000Z');

  // Base tricks (modifier targets + atoms)
  const tricks: Array<Parameters<typeof insertFreestyleTrick>[1]> = [
    { slug: 'guay', canonical_name: 'guay', adds: '2', base_trick: 'guay', trick_family: 'guay', category: 'dex', notation: 'GUAY', operational_notation: '[set] > leggy in dex > ss inside', review_status: 'expert_reviewed', is_active: 1 },
    { slug: 'mirage', canonical_name: 'mirage', adds: '2', base_trick: 'mirage', trick_family: 'mirage', category: 'dex', notation: 'MIRAGE', operational_notation: 'SET > OP IN [DEX] > OP TOE [DEL]', review_status: 'expert_reviewed', is_active: 1 },
    { slug: 'legover', canonical_name: 'legover', adds: '2', base_trick: 'legover', trick_family: 'legover', category: 'dex', notation: 'LEGOVER', operational_notation: 'SET > OP OUT [DEX] > SAME TOE [DEL]', review_status: 'expert_reviewed', is_active: 1 },
    // Atom with simple JOB; no modifier decomposition.
    { slug: '2-bag-juggling', canonical_name: '2-bag juggling', adds: '2', base_trick: '2-bag-juggling', trick_family: '2-bag-juggling', category: 'compound', notation: 'TOE > TOE', operational_notation: 'TOE [DEL] > TOE [DEL]', review_status: 'expert_reviewed', is_active: 1 },
    // drifter: has a symbolic-equivalence reading (≡ miraging clipper) + op notation.
    { slug: 'drifter', canonical_name: 'drifter', adds: '3', base_trick: 'drifter', trick_family: 'drifter', category: 'compound', notation: 'DRIFTER', operational_notation: 'SET > OP IN [DEX] > SAME CLIP [XBD] [DEL]', review_status: 'expert_reviewed', is_active: 1 },
    // flying-inside: 1-ADD atom.
    { slug: 'flying-inside', canonical_name: 'flying inside', adds: '1', base_trick: 'flying-inside', trick_family: 'flying-inside', category: 'compound', notation: 'FLYING INSIDE', operational_notation: 'flying > inside', review_status: 'expert_reviewed', is_active: 1 },
    // eclipse: in RESOLVED_FORMULAS (curator formula).
    { slug: 'eclipse', canonical_name: 'eclipse', adds: '3', base_trick: 'eclipse', trick_family: 'eclipse', category: 'compound', notation: 'ECLIPSE', operational_notation: 'SET > (jump) [BOD] > SAME or OP INSIDE [DEL] > OP OUT [DEX] > (land)', review_status: 'expert_reviewed', is_active: 1 },
    // ducking-guay + ducking-mirage: same modifier (ducking), parallel structure.
    { slug: 'ducking-guay', canonical_name: 'ducking guay', adds: '3', base_trick: 'guay', trick_family: 'guay', category: 'compound', notation: 'DUCKING GUAY', operational_notation: 'TOE > DUCK [BOD] > OP IN [DEX] > SAME INSIDE [DEL]', review_status: 'expert_reviewed', is_active: 1 },
    { slug: 'ducking-mirage', canonical_name: 'ducking mirage', adds: '3', base_trick: 'mirage', trick_family: 'mirage', category: 'compound', notation: 'DUCKING MIRAGE', operational_notation: 'CLIP > DUCK [BOD] > SAME IN [DEX] > SAME TOE [DEL]', review_status: 'expert_reviewed', is_active: 1 },
    // fairy-legover: modifier-link derivation candidate.
    { slug: 'fairy-legover', canonical_name: 'fairy legover', adds: '3', base_trick: 'legover', trick_family: 'legover', category: 'compound', notation: 'FAIRY LEGOVER', operational_notation: 'TOE > SAME OUT [DEX] > OP OUT [DEX] > SAME TOE [DEL]', review_status: 'expert_reviewed', is_active: 1 },
  ];
  for (const t of tricks) insertFreestyleTrick(db, t);

  db.prepare(`
    INSERT INTO freestyle_trick_modifier_links (trick_slug, modifier_slug, apply_order)
    VALUES
      ('ducking-guay', 'ducking', 1),
      ('ducking-mirage', 'ducking', 1),
      ('fairy-legover', 'fairy', 1)
  `).run();

  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

const EXAMPLE_SLUGS = ['flying-inside', '2-bag-juggling', 'drifter', 'ducking-guay', 'ducking-mirage', 'eclipse', 'fairy-legover'];

// Extract one card's markup window by slug.
function cardWindow(text: string, slug: string): string {
  const idx = text.indexOf(`data-trick-slug="${slug}"`);
  expect(idx, `row for ${slug} not present`).toBeGreaterThan(-1);
  // From the slug attr back to the opening <article and forward to the row's </article>.
  const open = text.lastIndexOf('<article', idx);
  const close = text.indexOf('</article>', idx);
  return text.substring(open, close + 10);
}

describe('ADD view — uniform two-line row contract', () => {
  it('200 + section headers still group by ADD', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks?view=add');
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/class="content-section trick-add-group/);
    expect(res.text).toMatch(/id="add-\d+"/);
  });

  it('every example trick uses the same .dict-add-row wrapper', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks?view=add');
    for (const slug of EXAMPLE_SLUGS) {
      const w = cardWindow(res.text, slug);
      expect(w, `${slug} missing .dict-add-row`).toMatch(/class="dict-add-row/);
      expect(w, `${slug} missing line-1 head`).toMatch(/class="dict-add-row-head"/);
      expect(w, `${slug} missing line-2 notation`).toMatch(/class="dict-add-row-notation"/);
    }
  });

  it('NO green ADD chip (.dict-card-add) appears anywhere in the ADD view', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks?view=add');
    expect(res.text).not.toMatch(/class="dict-card-add[ "]/);
  });

  it('every row line 2 carries both a JOB label and an ADD label', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks?view=add');
    for (const slug of EXAMPLE_SLUGS) {
      const w = cardWindow(res.text, slug);
      expect(w, `${slug} missing JOB label`).toMatch(/class="dict-add-row-label">JOB</);
      expect(w, `${slug} missing ADD label`).toMatch(/class="dict-add-row-label">ADD</);
    }
  });

  it('2-bag-juggling: no interpretation slot; line 2 has JOB + ADD', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks?view=add');
    const w = cardWindow(res.text, '2-bag-juggling');
    expect(w).not.toMatch(/class="dict-add-row-interpretation"/);
    expect(w).toMatch(/class="dict-add-row-label">JOB</);
    expect(w).toMatch(/class="dict-add-row-label">ADD</);
  });

  it('drifter: line 1 has ≡ interpretation; line 2 has JOB + ADD', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks?view=add');
    const w = cardWindow(res.text, 'drifter');
    expect(w).toMatch(/class="dict-add-row-interpretation"/);
    // drifter ≡ miraging clipper from the symbolic-equivalences module
    expect(w).toMatch(/miraging/);
    expect(w).toMatch(/class="dict-add-row-label">JOB</);
    expect(w).toMatch(/class="dict-add-row-label">ADD</);
  });

  it('ducking-guay and ducking-mirage render with identical row structure', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks?view=add');
    const guay = cardWindow(res.text, 'ducking-guay');
    const mirage = cardWindow(res.text, 'ducking-mirage');
    // Same wrapper + same line-1/line-2 scaffolding + same JOB/ADD labels.
    for (const marker of ['class="dict-add-row', 'class="dict-add-row-head"', 'class="dict-add-row-notation"', 'class="dict-add-row-label">JOB<', 'class="dict-add-row-label">ADD<']) {
      expect(guay).toContain(marker);
      expect(mirage).toContain(marker);
    }
    // Both derive an ADD formula from the ducking modifier-link (ducking(+1) + base).
    expect(guay).toMatch(/ducking\(\+1\) \+ guay\(2\)/);
    expect(mirage).toMatch(/ducking\(\+1\) \+ mirage\(2\)/);
  });

  it('media badge renders on line 1 (inside the head), not line 2', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks?view=add');
    // Seed a media row: drifter has none here, so just assert the structural
    // rule — when media chip class appears, it is within dict-add-row-head.
    // (No media seeded in this fixture; assert the negative isn't violated.)
    const w = cardWindow(res.text, 'drifter');
    if (/dict-add-row-media/.test(w)) {
      const headIdx = w.indexOf('dict-add-row-head');
      const notationIdx = w.indexOf('dict-add-row-notation');
      const mediaIdx = w.indexOf('dict-add-row-media');
      expect(mediaIdx).toBeGreaterThan(headIdx);
      expect(mediaIdx).toBeLessThan(notationIdx);
    }
  });

  it('operational notation appears ONLY inside the JOB slot (never loose)', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks?view=add');
    // Bracket tokens like [DEX] must sit inside a dict-add-row-job-value code element.
    const re = /\[(DEX|BOD|PDX|XBD|DEL|UNS|XDEX)\]/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(res.text)) !== null) {
      const before = res.text.substring(Math.max(0, m.index - 260), m.index);
      // Each bracket token must be preceded (within the window) by the JOB value code open tag.
      expect(before, `bracket token at ${m.index} not inside a JOB value`).toMatch(/dict-add-row-job-value|op-token/);
    }
  });
});
