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
import { cachedGet } from '../fixtures/cachedGet';

import {
  setTestEnv,
  createTestDb,
  cleanupTestDb,
  importApp,
} from '../fixtures/testDb';
import {
  insertFreestyleTrick,
  insertFreestyleTrickAlias,
  insertFreestyleTrickModifier,
  insertFreestyleTrickModifierLink,
} from '../fixtures/factories';

const { dbPath } = setTestEnv('3525');

let createApp: Awaited<ReturnType<typeof importApp>>;
const page = cachedGet(() => createApp());

beforeAll(async () => {
  const db = createTestDb(dbPath);

  // A launch set for By set and two body modifiers for By modifier.
  insertFreestyleTrickModifier(db, { slug: 'pixie', modifier_type: 'set', notes: '' });
  insertFreestyleTrickModifier(db, { slug: 'ducking', modifier_type: 'body', notes: '' });
  insertFreestyleTrickModifier(db, { slug: 'spinning', modifier_type: 'body', notes: '' });

  // Base tricks (family anchors) + modifier-linked compounds that collectively
  // populate every browse view.
  const tricks: Array<Parameters<typeof insertFreestyleTrick>[1]> = [
    { slug: 'mirage', canonical_name: 'mirage', adds: '2', base_trick: 'mirage', trick_family: 'mirage', category: 'dex', notation: 'MIRAGE', operational_notation: 'SET > OP IN [DEX] > OP TOE [DEL]', review_status: 'expert_reviewed', is_active: 1 },
    { slug: 'whirl', canonical_name: 'whirl', adds: '3', base_trick: 'whirl', trick_family: 'whirl', category: 'dex', notation: 'WHIRL', operational_notation: 'SET > LEGGY IN [DEX] > SAME CLIP [XBD] [DEL]', review_status: 'expert_reviewed', is_active: 1 },
    { slug: 'pixie-illusion', canonical_name: 'pixie illusion', adds: '3', base_trick: 'mirage', trick_family: 'mirage', category: 'compound', notation: 'PIXIE ILLUSION', operational_notation: 'SET > PIXIE > OP IN [DEX] > OP TOE [DEL]', review_status: 'expert_reviewed', is_active: 1 },
    { slug: 'ducking-whirl', canonical_name: 'ducking whirl', adds: '4', base_trick: 'whirl', trick_family: 'whirl', category: 'compound', notation: 'DUCKING WHIRL', operational_notation: 'CLIP > DUCK [BOD] > LEGGY IN [DEX] > SAME CLIP [XBD] [DEL]', review_status: 'expert_reviewed', is_active: 1 },
    { slug: 'spinning-whirl', canonical_name: 'spinning whirl', adds: '4', base_trick: 'whirl', trick_family: 'whirl', category: 'compound', notation: 'SPINNING WHIRL', operational_notation: 'CLIP > SPIN [BOD] > LEGGY IN [DEX] > SAME CLIP [XBD] [DEL]', review_status: 'expert_reviewed', is_active: 1 },
  ];
  for (const t of tricks) insertFreestyleTrick(db, t);

  insertFreestyleTrickModifierLink(db, 'pixie-illusion', 'pixie');
  insertFreestyleTrickModifierLink(db, 'ducking-whirl', 'ducking');
  // A launch-set link as well, so the trick every control assertion names is
  // also listed in the By set view.
  insertFreestyleTrickModifierLink(db, 'ducking-whirl', 'pixie', 2);
  insertFreestyleTrickModifierLink(db, 'spinning-whirl', 'spinning');

  // A display-eligible folk name on a modifier-linked compound in the larger
  // family, which is the one shape every browse view lists: the family view
  // applies an inclusion threshold the two-member mirage family does not meet.
  insertFreestyleTrickAlias(db, 'ducking-whirl-folk-name', 'ducking-whirl', 'duck whirl');

  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

// Every browse view the dictionary offers, by query value and UI label.
const BROWSE_VIEWS: Array<[string, string]> = [
  ['add', 'By ADD'],
  ['family', 'By family'],
  ['set', 'By set'],
  ['modifier', 'By Modifier'],
];

describe('Browse-shell row-contract stability guard — every browse view uses the two-line dict-trick-row', () => {
  for (const [view, label] of BROWSE_VIEWS) {
    it(`${label} (?view=${view}) renders the two-line dict-trick-row stack`, async () => {
      const res = await page(`/freestyle/tricks?view=${view}`);
      expect(res.status).toBe(200);
      expect(res.text, `${label} must render dict-trick-row-stack`).toContain('dict-trick-row-stack');
      expect(res.text, `${label} must render dict-trick-row articles`).toMatch(/<article class="dict-trick-row/);
    });

    // The rows are a list, so a screen reader announces how many tricks it holds:
    // every stack is a list, and every row is one of its items.
    it(`${label} (?view=${view}) renders the stack as a list with one item per row`, async () => {
      const res = await page(`/freestyle/tricks?view=${view}`);
      expect(res.text, `${label} stack must be a list`).toMatch(/<ul class="dict-trick-row-stack" role="list">/);
      expect(res.text, `${label} stack must not be a div`).not.toMatch(/<div class="dict-trick-row-stack"/);
      const rows = (res.text.match(/<article class="dict-trick-row[ "]/g) ?? []).length;
      const items = (res.text.match(/<li><article class="dict-trick-row[ "]/g) ?? []).length;
      expect(rows, `${label} must render rows`).toBeGreaterThan(0);
      expect(items, `${label} every row must sit in a list item`).toBe(rows);
    });

    // A screen reader takes a row's names from its visible text. An aria-label
    // on a plain span is ignored or read inconsistently, and one on the hashtag
    // link replaces the hashtag a sighted reader sees with a phrase every row
    // repeats, so a listener hears "Media for this trick" three hundred times.
    it(`${label} (?view=${view}) names every row element by its visible text, with no aria-label`, async () => {
      const res = await page(`/freestyle/tricks?view=${view}`);
      const rows = res.text.match(/<article class="dict-trick-row[\s\S]*?<\/article>/g) ?? [];
      expect(rows.length, `${label} must render at least one row`).toBeGreaterThan(0);
      const labelled = rows.filter((row) => row.includes('aria-label='));
      expect(labelled, `${label} rows carrying an aria-label:\n${labelled.join('\n')}`).toEqual([]);
    });

    it(`${label} (?view=${view}) does NOT render the legacy shared dictionary-trick-card`, async () => {
      const res = await page(`/freestyle/tricks?view=${view}`);
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
      const res = await page(`/freestyle/tricks?view=${view}`);
      expect(res.status).toBe(200);
      // Anchored on the destination a visitor lands on, not on how the control
      // is marked up: the name of a listed trick resolves to that trick's page.
      expect(res.text, `${label} must link the name to the trick's detail page`)
        .toMatch(/<a[^>]*href="\/freestyle\/tricks\/ducking-whirl"[^>]*>ducking whirl<\/a>/);
    });

    it(`${label} (?view=${view}) sends the name and the Detail control to the same page`, async () => {
      const res = await page(`/freestyle/tricks?view=${view}`);
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
      const res = await page(`/freestyle/tricks?view=${view}`);
      // Anchored on the pairing a visitor relies on, the control's visible
      // label and where it resolves to. Presentation classes are deliberately
      // not pinned: how the control is styled is free to change, where it
      // goes is not.
      expect(res.text, `${label} must render a Detail control`).toMatch(/<a[^>]*href="\/freestyle\/tricks\/[^"]+"[^>]*>\s*Detail\s*<\/a>/);
    });

    it(`${label} (?view=${view}) renders the hashtag as a plain token when the trick has no media`, async () => {
      const res = await page(`/freestyle/tricks?view=${view}`);
      expect(res.text, `${label} must render a plain hashtag token`).toMatch(/<span class="hashtag">#/);
      expect(res.text, `${label} must not link a hashtag for a trick with no media`).not.toMatch(/hashtag--media/);
    });
  }
});

// A trick's folk names belong on every browse view. Kept as its own contract
// rather than folded into the row assertions above, because it is about what a
// row may omit rather than which partial drew it.
describe('Alias slot uniformity — every browse view surfaces a trick\'s folk names', () => {
  for (const [view, label] of BROWSE_VIEWS) {
    it(`${label} (?view=${view}) renders the nickname slot`, async () => {
      const res = await page(`/freestyle/tricks?view=${view}`);
      expect(res.status).toBe(200);
      expect(res.text, `${label} must list the aliased trick`).toContain('data-trick-slug="ducking-whirl"');
      expect(res.text, `${label} must render the alias slot`).toContain('class="dict-trick-row-nicknames"');
      expect(res.text, `${label} must render the alias text`).toContain('duck whirl');
    });
  }
});
