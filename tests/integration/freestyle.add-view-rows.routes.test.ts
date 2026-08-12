/**
 * /freestyle/tricks?view=add — the row contract.
 *
 * Every trick row obeys the same two-column structure:
 *   Identity (.dict-trick-row-identity): name · difficulty value · hashtag ·
 *     Detail · Media · aliases
 *   Notation (.dict-trick-row-notation): the movement notation, unlabelled
 *
 * Hard rules pinned:
 *   - Every row uses the .dict-trick-row wrapper (uniform structure).
 *   - The difficulty value is carried on the row itself, as a number rather
 *     than as a derivation, because only this view groups by it.
 *   - The row states what a trick is, never how far along our own authoring
 *     of it has got: no status badge, no pending-decomposition note, no
 *     not-yet-authored marker.
 *   - Movement notation appears only inside the notation column.
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
    // drifter: its "miraging clipper" reading is held for curator review, so it
    // renders no ≡ interpretation, only op notation.
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

describe('ADD view — uniform row contract', () => {
  it('200 + section headers still group by ADD', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks?view=add');
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/class="content-section trick-add-group/);
    expect(res.text).toMatch(/id="add-\d+"/);
  });

  it('every example trick uses the same .dict-trick-row wrapper', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks?view=add');
    for (const slug of EXAMPLE_SLUGS) {
      const w = cardWindow(res.text, slug);
      expect(w, `${slug} missing .dict-trick-row`).toMatch(/class="dict-trick-row/);
      expect(w, `${slug} missing the identity column`).toMatch(/class="dict-trick-row-identity"/);
      expect(w, `${slug} missing the notation column`).toMatch(/class="dict-trick-row-notation"/);
    }
  });

  it('NO green ADD chip (.dict-card-add) appears anywhere in the ADD view', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks?view=add');
    expect(res.text).not.toMatch(/class="dict-card-add[ "]/);
  });

  it('every row carries its difficulty value as a number, not a derivation', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks?view=add');
    for (const slug of EXAMPLE_SLUGS) {
      const w = cardWindow(res.text, slug);
      expect(w, `${slug} missing its difficulty value`).toMatch(/aria-label="Difficulty value">\(\d+\)</);
    }
  });

  it('no row states how far along our own authoring has got', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks?view=add');
    for (const slug of EXAMPLE_SLUGS) {
      const w = cardWindow(res.text, slug);
      expect(w, `${slug} must not carry a status badge`).not.toMatch(/dict-trick-row-status/);
      expect(w, `${slug} must not carry a pending-decomposition note`).not.toMatch(/dict-trick-row-pending/);
      expect(w, `${slug} must not carry a not-yet-authored marker`).not.toMatch(/dict-badge-incomplete/);
    }
  });

  it('the operator-by-operator breakdown does not reach a browse row', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks?view=add');
    // ducking-guay and ducking-mirage both have a derivable breakdown from the
    // ducking modifier-link. It belongs on the trick detail page, in words; a
    // reader scanning the dictionary wants the value, not the arithmetic.
    expect(res.text).not.toMatch(/ducking\(\+1\) \+ guay\(2\)/);
    expect(res.text).not.toMatch(/ducking\(\+1\) \+ mirage\(2\)/);
  });

  it('ducking-guay and ducking-mirage render with identical row structure', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks?view=add');
    const guay = cardWindow(res.text, 'ducking-guay');
    const mirage = cardWindow(res.text, 'ducking-mirage');
    for (const marker of ['class="dict-trick-row', 'class="dict-trick-row-identity"', 'class="dict-trick-row-notation"']) {
      expect(guay).toContain(marker);
      expect(mirage).toContain(marker);
    }
  });

  it('movement notation appears only inside the notation column, never loose', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks?view=add');
    const re = /\[(DEX|BOD|PDX|XBD|DEL|UNS|XDEX)\]/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(res.text)) !== null) {
      const before = res.text.substring(Math.max(0, m.index - 260), m.index);
      expect(before, `bracket token at ${m.index} sits outside a notation value`)
        .toMatch(/dict-trick-row-notation-value|dict-trick-row-notation-value|op-token/);
    }
  });
});
