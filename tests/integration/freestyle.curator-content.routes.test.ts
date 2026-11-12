/**
 * Seeded curator content renders where it rendered from the content modules.
 *
 * The record review notes, the modifier notes and the per-trick curator facts
 * moved from content modules into database columns, seeded from the staged
 * modules. The pages must show each staged entry exactly where they showed it
 * before: a record under review carries its note and links to no trick, a trick
 * page shows each linked modifier's beginner note, its opening lines and its
 * curator description, a reversed trick states the reverse-of relationship, a
 * terminal lists what lands on it in the curated order, a trick sits in its
 * curator's public family, and a row that is not a trick stays out of the
 * browse. The expected text is read from the staged modules, so the check
 * follows the content, not a copy of it.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { cachedGet } from '../fixtures/cachedGet';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import {
  insertFreestyleTrick,
  insertFreestyleTrickAlias,
  insertFreestyleRecord,
  insertFreestyleTrickModifier,
  insertFreestyleTrickModifierLink,
  type FreestyleTrickOverrides,
} from '../fixtures/factories';
import {
  seedCuratorContent,
  STAGED_CURATOR_CONTENT,
  trickSlugsNamedBy,
} from '../../freestyle/loaders/28a_seed_curator_content';
import { trickNameToSlug } from '../../src/services/freestyleRecordShaping';

const { dbPath } = setTestEnv('4149');
let createApp: Awaited<ReturnType<typeof importApp>>;
const page = cachedGet(() => createApp());

const content = STAGED_CURATOR_CONTENT;
const TRICK = 'zz_parity_trick';
const PLAIN_MODIFIER = 'zz_plain_modifier';
// Modifiers carrying a staged note, linked to the one trick page.
const noted = [...content.beginnerNotes.keys()].slice(0, 3);
// Each reverse pair's base gets its own ADD, so the formula's number can only
// have come from the base row.
const BASE_ADDS: Record<string, string> = {};
[...new Set(content.reversePairBases.values())].forEach((base, i) => { BASE_ADDS[base] = String(2 + i); });
// Two overridden tricks, each filed under a different structural family, and a
// control whose own family is public and carries no override.
const OVERRIDDEN: Array<{ slug: string; structural: string }> = [
  { slug: 'hatchet', structural: 'whirl' },
  { slug: 'nova',    structural: 'legover' },
];
const NOT_TRICKS = ['spyro', 'surging'];

// Formula rows. A row's own adds is the total the Difficulty line shows, so each
// sampled formula row carries an adds its formula does not end in.
const formulaOf = new Map(content.formulas.map((f) => [f.slug, f]));
const EXPANDED = content.formulas.filter((f) => f.expandedNotation).map((f) => f.slug);
const FORMULA_NOTATION = content.formulas.filter((f) => f.operationalNotation).map((f) => f.slug);
const FORMULA_SAMPLE = [...new Set(['atom_smasher', 'bedwetter', 'torque', ...EXPANDED, ...FORMULA_NOTATION])];
const ROW_ADDS = '9';
// The operators bedwetter's formula names; with no modifier links, the page
// lists these registered modifiers from the formula.
const OPERATOR_TRICK = 'bedwetter';
const OPERATOR_MODIFIERS = ['stepping', 'paradox'];
// A foundational move whose stored notation differs from the landing page's
// copy of it, so the page can only show the stored one.
const FOUNDATION = 'osis';
const FOUNDATION_NOTATION = 'CLIP > (back) SPIN [BOD] > OP CLIP [XBD] [DEL]';
// Rows the notation subtitles need: a movement notation that says something the
// name does not, and an execution notation for the execution heading.
const ROW_OVERRIDES: Record<string, FreestyleTrickOverrides> = {
  bubba: { notation: 'CLIP > SAME OUT [DEX] > OP TOE [DEL]' },
  spin: { operational_notation: 'SET > (back) SPIN [BOD] [KICK]' },
  miraging_kick: { operational_notation: 'SET > OP IN [DEX] [KICK]' },
  [FOUNDATION]: { adds: '3', operational_notation: FOUNDATION_NOTATION },
};
// Each expanded-notation row carries a shorthand execution notation for the
// expanded line to spell out.
for (const slug of EXPANDED) ROW_OVERRIDES[slug] = { operational_notation: 'TOE > (railing set) > OP TOE [DEL]' };

function escapeHbs(s: string): string {
  return s
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#x27;').replace(/`/g, '&#x60;')
    .replace(/=/g, '&#x3D;');
}

beforeAll(async () => {
  const db = createTestDb(dbPath);
  const inserted = new Set<string>();
  const addTrick = (o: FreestyleTrickOverrides & { slug: string }): void => {
    if (inserted.has(o.slug)) return;
    inserted.add(o.slug);
    insertFreestyleTrick(db, o);
  };

  for (const [base, adds] of Object.entries(BASE_ADDS)) addTrick({ slug: base, canonical_name: base.replace(/_/g, ' '), adds });
  for (const { slug, structural } of OVERRIDDEN) {
    addTrick({ slug, canonical_name: slug, trick_family: structural });
  }
  addTrick({ slug: TRICK, canonical_name: 'zz parity trick', adds: '6', trick_family: 'whirl' });
  for (const slug of FORMULA_SAMPLE) {
    addTrick({ slug, canonical_name: slug.replace(/_/g, ' '), adds: ROW_ADDS, ...ROW_OVERRIDES[slug] });
  }
  for (const [slug, o] of Object.entries(ROW_OVERRIDES)) addTrick({ slug, canonical_name: slug.replace(/_/g, ' '), ...o });
  // Every trick the staged content names exists, as the seeder requires.
  for (const slug of trickSlugsNamedBy(content)) addTrick({ slug, canonical_name: slug.replace(/_/g, ' ') });

  // Every review record names a trick that exists, so only the review note can
  // explain a missing link; Mirage is the ordinary record that must still link.
  for (const name of [...content.recordReviews.keys(), 'Mirage']) {
    addTrick({ slug: trickNameToSlug(name), canonical_name: name });
    insertFreestyleRecord(db, { trick_name: name, display_name: 'Parity Holder', confidence: 'verified' });
  }
  const modifierSlugs = new Set([...content.beginnerNotes.keys(), PLAIN_MODIFIER, ...OPERATOR_MODIFIERS]);
  for (const slug of modifierSlugs) insertFreestyleTrickModifier(db, { slug });
  [...noted, PLAIN_MODIFIER].forEach((slug, i) => insertFreestyleTrickModifierLink(db, TRICK, slug, i + 1));
  // A base carrying a displayed alias, so the check that the reversed trick is
  // never added as one has a real alias line to look at.
  insertFreestyleTrickAlias(db, 'zz_base_nickname', 'around_the_world', 'zz base nickname', { alias_type: 'common', alias_display: 1 });
  seedCuratorContent(db);
  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('records under curator review', () => {
  // Defect caught: a record under review losing its note, or linking a visitor
  // to a speculative trick, once the note comes from the database.
  it('shows each staged review note and links none of those records', async () => {
    const res = await page('/freestyle/records');
    expect(res.status).toBe(200);
    expect(content.recordReviews.size).toBeGreaterThan(0);
    for (const [name, note] of content.recordReviews) {
      expect(res.text, name).toContain(`<span class="record-review-note">${escapeHbs(note)}</span>`);
      expect(res.text, name).not.toContain(`href="/freestyle/tricks/${trickNameToSlug(name)}"`);
    }
    // Positive control: an ordinary record still links to its trick.
    expect(res.text).toContain('href="/freestyle/tricks/mirage"');
  });
});

describe('modifier notes on a trick page', () => {
  // Defect caught: the facts block losing a modifier's note once it comes from
  // the registry row.
  it('shows each linked modifier beginner note', async () => {
    const res = await page(`/freestyle/tricks/${TRICK}`);
    expect(res.status).toBe(200);
    expect(noted.length).toBeGreaterThan(0);
    for (const slug of noted) {
      expect(res.text, slug).toContain(`<span class="structural-fact-note">${escapeHbs(content.beginnerNotes.get(slug)!)}</span>`);
    }
    // A modifier with no staged text renders without a note.
    const notes = res.text.match(/class="structural-fact-note"/g) ?? [];
    expect(notes).toHaveLength(noted.length);
  });
});

describe('the opening lines of a trick page', () => {
  // Defect caught: a derivatives or naming note no longer reaching the page once
  // it is read from the trick's own row, or appearing on a trick it is not for.
  it('shows each staged derivatives and naming note on its own trick only', async () => {
    const lines: Array<[attr: string, map: ReadonlyMap<string, string>]> = [
      ['data-about-derivatives', content.aboutDerivatives],
      ['data-about-naming-note', content.aboutNamingNotes],
    ];
    for (const [attr, map] of lines) {
      expect(map.size).toBeGreaterThan(0);
      for (const [slug, note] of map) {
        const res = await page(`/freestyle/tricks/${slug}`);
        expect(res.text, `${attr} ${slug}`).toContain(`<p ${attr}>${escapeHbs(note)}</p>`);
      }
    }
    const control = await page(`/freestyle/tricks/${TRICK}`);
    expect(control.text).not.toContain('data-about-derivatives');
    expect(control.text).not.toContain('data-about-naming-note');
  });

  // Defect caught: a curator description replaced by the dictionary's own copy,
  // or left out of the search-result summary, once it is the description column.
  it('shows each staged description in About and the meta description', async () => {
    expect(content.semanticDescriptions.size).toBeGreaterThan(0);
    for (const [slug, description] of content.semanticDescriptions) {
      const res = await page(`/freestyle/tricks/${slug}`);
      expect(res.text, slug).toContain(`<p class="trick-description">${escapeHbs(description)}</p>`);
      const meta = /<meta name="description" content="([^"]*)"/.exec(res.text)?.[1] ?? '';
      expect(meta, slug).toContain(escapeHbs(description).slice(0, 40));
    }
  });
});

describe('a reversed trick states what it reverses', () => {
  // Defect caught: the reverse-of relationship lost, turned into an alias, or
  // computed from the wrong row, once it is read from reverse_pair_base.
  it('shows the formula and a link to the base, on the reversed trick only', async () => {
    expect(content.reversePairBases.size).toBeGreaterThan(0);
    for (const [slug, base] of content.reversePairBases) {
      const adds = BASE_ADDS[base]!;
      const res = await page(`/freestyle/tricks/${slug}`);
      // The formula is composed from data: the base in notation form (its slug
      // with hyphens) and the base row's own ADD.
      const token = base.replace(/_/g, '-');
      expect(res.text, slug).toContain(
        `<code class="trick-transform-expression">rev(0) + ${token}(${adds}) = ${adds} ADD</code>`,
      );
      expect(res.text, slug).toContain('class="trick-transform-explainer"');
      expect(res.text, slug).toContain(`<a href="/freestyle/tricks/${base}">${escapeHbs(base.replace(/_/g, ' '))}</a>`);
      // The base trick's own page carries no formula: the relationship has a
      // direction.
      const baseRes = await page(`/freestyle/tricks/${base}`);
      expect(baseRes.text, base).not.toContain('trick-transform-expression');
    }
  });

  it('never makes the reversed trick a name of its base', async () => {
    const res = await page('/freestyle/tricks/around_the_world');
    // Positive control: the base's own displayed alias is on its page.
    expect(res.text).toContain('zz base nickname');
    expect(res.text).not.toMatch(/Also called[^<]*orbit/i);
  });
});

describe('a terminal lists what lands on it', () => {
  // Defect caught: the "Tricks that land here" list losing a member or its
  // curated order once it is built from each member's own row.
  it('lists every staged member in the staged order', async () => {
    expect(content.terminalCohorts.size).toBeGreaterThan(0);
    for (const [terminal, members] of content.terminalCohorts) {
      const res = await page(`/freestyle/tricks/${terminal}`);
      const section = res.text.slice(res.text.indexOf('data-section="terminal-derived"'));
      const listed = [...section.matchAll(/<a href="\/freestyle\/tricks\/([a-z0-9_]+)">/g)].map(m => m[1]);
      // ordering-is-the-contract: the list order is the curator's authored order.
      expect(listed.slice(0, members.length), terminal).toEqual([...members]);
    }
    const control = await page(`/freestyle/tricks/${TRICK}`);
    expect(control.text).not.toContain('data-section="terminal-derived"');
  });
});

describe('a trick sits in its public family', () => {
  // Defect caught: the family chip falling back to the structural family once
  // the override is read from the family_override column.
  it('files an overridden trick under its override, and the control under its own family', async () => {
    for (const { slug, structural } of OVERRIDDEN) {
      const target = content.familyOverrides.get(slug)!;
      expect(target, slug).not.toBe(structural);
      const res = await page(`/freestyle/tricks/${slug}`);
      expect(res.text, slug).toMatch(new RegExp(`trick-hero-meta-chip-family[^"]*" href="/freestyle/tricks\\?family=${target}"`));
      expect(res.text, slug).not.toMatch(new RegExp(`trick-hero-meta-chip-family[^"]*" href="/freestyle/tricks\\?family=${structural}"`));
    }
    const control = await page(`/freestyle/tricks/${TRICK}`);
    expect(control.text).toMatch(/trick-hero-meta-chip-family[^"]*" href="\/freestyle\/tricks\?family=whirl"/);
  });
});

describe('a trick page shows its curator formula', () => {
  // Defect caught: the Difficulty line lost, or showing a total other than the
  // trick's own ADD, once the breakdown is read from add_derivation.
  it('shows each sampled breakdown beside the row\'s own ADD', async () => {
    for (const slug of FORMULA_SAMPLE) {
      const formula = formulaOf.get(slug)!;
      const breakdown = formula.derivation.replace(/\s*=\s*\d+\s*ADD\s*$/, '');
      const res = await page(`/freestyle/tricks/${slug}`);
      expect(res.text, slug).toContain(`<span class="trick-add-analysis-total">${ROW_ADDS} ADD</span>`);
      expect(res.text, slug).toContain(`<code class="trick-add-analysis-derivation">${escapeHbs(breakdown)}</code>`);
    }
    // A trick with no formula shows no curator breakdown.
    const control = await page(`/freestyle/tricks/${TRICK}`);
    expect(control.text).not.toContain('class="trick-add-analysis-derivation"');
  });

  // Defect caught: a trick with no modifier links losing the modifiers its
  // formula names once the operators are read from formula_operator.
  it('lists the registered modifiers its formula names when it has no links', async () => {
    const res = await page(`/freestyle/tricks/${OPERATOR_TRICK}`);
    expect(formulaOf.get(OPERATOR_TRICK)!.operator).toBe(OPERATOR_MODIFIERS.join(' + '));
    for (const modifier of OPERATOR_MODIFIERS) {
      expect(res.text, modifier).toMatch(new RegExp(`class="structural-fact"><a href="[^"]*/${modifier}"`));
    }
  });

  // Defect caught: the spelled-out execution notation dropped once it is read
  // from expanded_notation.
  it('spells out each expanded execution notation under the shorthand', async () => {
    expect(EXPANDED.length).toBeGreaterThan(0);
    for (const slug of EXPANDED) {
      const res = await page(`/freestyle/tricks/${slug}`);
      expect(res.text, slug).toContain(
        `<span class="operational-notation-expanded-label">Expanded</span> <code>${escapeHbs(formulaOf.get(slug)!.expandedNotation!)}</code>`,
      );
    }
    const control = await page(`/freestyle/tricks/${TRICK}`);
    expect(control.text).not.toContain('operational-notation-expanded');
  });

  // Defect caught: a trick the dictionary left without an execution notation
  // showing none, once the formula's notation fills the empty column instead
  // of standing in for it at render time.
  it('shows the formula\'s execution notation for a trick the dictionary left without one', async () => {
    expect(FORMULA_NOTATION.length).toBeGreaterThan(0);
    for (const slug of FORMULA_NOTATION) {
      const res = await page(`/freestyle/tricks/${slug}`);
      expect(res.text, slug).toContain('class="operational-notation-tokens"');
    }
  });
});

describe('a foundational move shows its stored notation', () => {
  // Defect caught: the landing page's copy of a foundational move's notation
  // shadowing the stored one, so an edit to the trick never shows.
  it('renders the row\'s own execution notation', async () => {
    const res = await page(`/freestyle/tricks/${FOUNDATION}`);
    const code = /<code class="operational-notation-tokens">([\s\S]*?)<\/code>/.exec(res.text)?.[1] ?? '';
    const text = code.replace(/<[^>]+>/g, '').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim();
    expect(text).toBe(FOUNDATION_NOTATION);
  });
});

describe('the notation headings carry their curator subtitle', () => {
  // Defect caught: a notation subtitle dropped, or shown under the wrong
  // heading, once it is read from the trick's own row.
  it('shows each staged subtitle under its own heading only', async () => {
    const headings: Array<[heading: string, map: ReadonlyMap<string, string>]> = [
      ['Movement notation', content.movementNotationSubtitles],
      ['Execution notation', content.executionNotationSubtitles],
    ];
    for (const [heading, map] of headings) {
      expect(map.size).toBeGreaterThan(0);
      for (const [slug, subtitle] of map) {
        const res = await page(`/freestyle/tricks/${slug}`);
        expect(res.text, slug).toMatch(new RegExp(`<h2>${heading}</h2>\\s*<p class="section-intro">${escapeHbs(subtitle).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}</p>`));
      }
    }
  });
});

describe('a row that is not a trick stays out of the browse', () => {
  // Defect caught: a modifier or a row under review listed as a trick once its
  // kind is read from the trick_kind column.
  it('omits each non-trick row and keeps an ordinary trick', async () => {
    const res = await page('/freestyle/tricks');
    for (const slug of NOT_TRICKS) {
      expect(content.trickKinds.has(slug), slug).toBe(true);
      expect(res.text, slug).not.toContain(`data-trick-slug="${slug}"`);
    }
    expect(res.text).toContain(`data-trick-slug="${TRICK}"`);
  });
});
