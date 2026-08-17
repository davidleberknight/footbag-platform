/**
 * Browse-shell row-contract stability guard.
 *
 * Every browse view renders the generalized two-line `dictionary-trick-row.hbs`
 * partial (`dict-trick-row-*`). There is no per-view exception: a trick reads
 * the same way whichever view a visitor arrived through, which is the whole
 * point of a shared row. This test pins that contract so a future change cannot
 * silently give one view a rendering of its own.
 *
 * The card-density markup a browse view must never emit (`dict-card-stack`,
 * `dict-card--registry`, the per-row ADD chip) is asserted absent as well, so
 * reintroducing a second row system fails here rather than shipping.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';

import {
  setTestEnv,
  createTestDb,
  cleanupTestDb,
  importApp,
} from '../fixtures/testDb';
import { insertFreestyleTrick, insertFreestyleTrickAlias } from '../fixtures/factories';

const { dbPath } = setTestEnv('3525');

let createApp: Awaited<ReturnType<typeof importApp>>;

beforeAll(async () => {
  const db = createTestDb(dbPath);

  // Modifiers in the Movement System axes + registered for By Modifier.
  db.prepare(`
    INSERT INTO freestyle_trick_modifiers
      (slug, modifier_name, modifier_type, add_bonus, add_bonus_rotational, notes, loaded_at)
    VALUES
      ('pixie',    'pixie',    'set',  1, 1, '', ?),
      ('ducking',  'ducking',  'body', 1, 1, '', ?),
      ('spinning', 'spinning', 'body', 1, 1, '', ?)
  `).run('2026-05-27T00:00:00.000Z', '2026-05-27T00:00:00.000Z', '2026-05-27T00:00:00.000Z');

  // Base tricks (topology + family anchors) + modifier-linked compounds that
  // collectively populate every primary browse view.
  const tricks: Array<Parameters<typeof insertFreestyleTrick>[1]> = [
    { slug: 'mirage', canonical_name: 'mirage', adds: '2', base_trick: 'mirage', trick_family: 'mirage', category: 'dex', notation: 'MIRAGE', operational_notation: 'SET > OP IN [DEX] > OP TOE [DEL]', review_status: 'expert_reviewed', is_active: 1 },
    { slug: 'whirl', canonical_name: 'whirl', adds: '3', base_trick: 'whirl', trick_family: 'whirl', category: 'dex', notation: 'WHIRL', operational_notation: 'SET > LEGGY IN [DEX] > SAME CLIP [XBD] [DEL]', review_status: 'expert_reviewed', is_active: 1 },
    { slug: 'pixie-illusion', canonical_name: 'pixie illusion', adds: '3', base_trick: 'mirage', trick_family: 'mirage', category: 'compound', notation: 'PIXIE ILLUSION', operational_notation: 'SET > PIXIE > OP IN [DEX] > OP TOE [DEL]', review_status: 'expert_reviewed', is_active: 1 },
    { slug: 'ducking-whirl', canonical_name: 'ducking whirl', adds: '4', base_trick: 'whirl', trick_family: 'whirl', category: 'compound', notation: 'DUCKING WHIRL', operational_notation: 'CLIP > DUCK [BOD] > LEGGY IN [DEX] > SAME CLIP [XBD] [DEL]', review_status: 'expert_reviewed', is_active: 1 },
    { slug: 'spinning-whirl', canonical_name: 'spinning whirl', adds: '4', base_trick: 'whirl', trick_family: 'whirl', category: 'compound', notation: 'SPINNING WHIRL', operational_notation: 'CLIP > SPIN [BOD] > LEGGY IN [DEX] > SAME CLIP [XBD] [DEL]', review_status: 'expert_reviewed', is_active: 1 },
  ];
  for (const t of tricks) insertFreestyleTrick(db, t);

  db.prepare(`
    INSERT INTO freestyle_trick_modifier_links (trick_slug, modifier_slug, apply_order)
    VALUES
      ('pixie-illusion', 'pixie',    1),
      ('ducking-whirl',  'ducking',  1),
      ('spinning-whirl', 'spinning', 1)
  `).run();

  // A display-eligible folk name on a modifier-linked compound in the larger
  // family, which is the one shape every browse view lists: the family view
  // applies an inclusion threshold the two-member mirage family does not meet.
  insertFreestyleTrickAlias(db, 'ducking-whirl-folk-name', 'ducking-whirl', 'duck whirl');

  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

// Every browse view the dictionary offers, by query value and UI label. The two
// soft-retired views sit in this list on the same terms as the rest: a view no
// longer promoted in the toggle still renders rows the same way for anyone
// arriving on a bookmark or an external link.
const BROWSE_VIEWS: Array<[string, string]> = [
  ['add', 'By ADD'],
  ['family', 'By family'],
  ['dex-count', 'By dex count'],
  ['movement-system', 'Movement System'],
  ['modifier', 'By Modifier'],
  ['topology', 'Movement Neighborhoods'],
  ['category', 'By category'],
  ['component', 'By component'],
];

describe('Browse-shell row-contract stability guard — every browse view uses the two-line dict-trick-row', () => {
  for (const [view, label] of BROWSE_VIEWS) {
    it(`${label} (?view=${view}) renders the two-line dict-trick-row stack`, async () => {
      const res = await request(await createApp()).get(`/freestyle/tricks?view=${view}`);
      expect(res.status).toBe(200);
      expect(res.text, `${label} must render dict-trick-row-stack`).toContain('dict-trick-row-stack');
      expect(res.text, `${label} must render dict-trick-row articles`).toMatch(/<article class="dict-trick-row/);
    });

    it(`${label} (?view=${view}) does NOT render the legacy shared dictionary-trick-card`, async () => {
      const res = await request(await createApp()).get(`/freestyle/tricks?view=${view}`);
      expect(res.text, `${label} must NOT use dict-card-stack`).not.toContain('dict-card-stack');
      expect(res.text, `${label} must NOT use dict-card--registry`).not.toContain('dict-card--registry');
      // No per-row green ADD chip anywhere in a migrated view.
      expect(res.text, `${label} must NOT render the green ADD chip`).not.toMatch(/class="dict-card-add[ "]/);
    });
  }
});

// The control rule for a dictionary row: the trick name opens the trick's detail
// page, a separate "Detail" control resolves to that same page so the two agree,
// and the hashtag links to the trick's media gallery only when the trick has
// media, rendering as a plain token otherwise. Name, hashtag and Detail stay
// distinct controls. No trick in this fixture set carries media, so every hashtag
// here is expected in its plain-token form.
describe('Control-separation rule — name opens the page, Detail agrees with it, hashtag signals media', () => {
  for (const [view, label] of BROWSE_VIEWS) {
    it(`${label} (?view=${view}) links the trick name to that trick's detail page`, async () => {
      const res = await request(await createApp()).get(`/freestyle/tricks?view=${view}`);
      expect(res.status).toBe(200);
      // Anchored on the destination a visitor lands on, not on how the control
      // is marked up: the name of a listed trick resolves to that trick's page.
      expect(res.text, `${label} must link the name to the trick's detail page`)
        .toMatch(/<a[^>]*href="\/freestyle\/tricks\/ducking-whirl"[^>]*>ducking whirl<\/a>/);
    });

    it(`${label} (?view=${view}) sends the name and the Detail control to the same page`, async () => {
      const res = await request(await createApp()).get(`/freestyle/tricks?view=${view}`);
      // Two controls on one row that both open the trick must not disagree about
      // where they go; a row where they diverge is lying about one of them.
      const nameHrefs = [...res.text.matchAll(/<a[^>]*href="(\/freestyle\/tricks\/[^"]+)"[^>]*>ducking whirl<\/a>/g)]
        .map(m => m[1]);
      const detailHrefs = [...res.text.matchAll(/<a[^>]*href="(\/freestyle\/tricks\/[^"]+)"[^>]*>\s*Detail\s*<\/a>/g)]
        .map(m => m[1]);
      expect(nameHrefs, `${label} must render the name as a link`).toContain('/freestyle/tricks/ducking-whirl');
      expect(detailHrefs, `${label} Detail must resolve to the same page as the name`)
        .toContain('/freestyle/tricks/ducking-whirl');
    });

    it(`${label} (?view=${view}) offers a separate Detail link to the detail page`, async () => {
      const res = await request(await createApp()).get(`/freestyle/tricks?view=${view}`);
      // Anchored on the pairing a visitor relies on, the control's visible
      // label and where it resolves to. Presentation classes are deliberately
      // not pinned: how the control is styled is free to change, where it
      // goes is not.
      expect(res.text, `${label} must render a Detail control`).toMatch(/<a[^>]*href="\/freestyle\/tricks\/[^"]+"[^>]*>\s*Detail\s*<\/a>/);
    });

    it(`${label} (?view=${view}) renders the hashtag as a plain token when the trick has no media`, async () => {
      const res = await request(await createApp()).get(`/freestyle/tricks?view=${view}`);
      expect(res.text, `${label} must render a plain hashtag token`).toMatch(/<span class="hashtag" aria-label="Tag identity">/);
      expect(res.text, `${label} must not link a hashtag for a trick with no media`).not.toMatch(/hashtag--media/);
    });
  }
});

// A trick's folk names belong on every browse view. Kept as its own contract
// rather than folded into the row assertions above, because it is about what a
// row may omit rather than which partial drew it.
describe('Alias slot uniformity — every browse view surfaces a trick\'s folk names', () => {
  for (const [view, label] of BROWSE_VIEWS) {
    it(`${label} (?view=${view}) renders the "Also called" slot`, async () => {
      const res = await request(await createApp()).get(`/freestyle/tricks?view=${view}`);
      expect(res.status).toBe(200);
      expect(res.text, `${label} must list the aliased trick`).toContain('data-trick-slug="ducking-whirl"');
      expect(res.text, `${label} must render the alias slot`).toContain('Also called');
      expect(res.text, `${label} must render the alias text`).toContain('duck whirl');
    });
  }
});
