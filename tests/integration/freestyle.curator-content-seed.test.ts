/**
 * The staged curator content seeds the columns the app reads.
 *
 * Before go-live the record review notes, the modifier notes and the per-trick
 * curator facts live as staged modules under the freestyle inputs, and a
 * rebuild seeds them into the database. Every staged entry must land, a stale
 * value from a previous run must not survive, a description the content does not
 * name must be left as the dictionary load wrote it, and an entry naming
 * something the database does not hold must stop the rebuild with nothing
 * written, never be skipped.
 */
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import { spawnSync } from 'node:child_process';
import { SPAWN_GUARD } from '../fixtures/spawnGuard';
import { setTestEnv, createTestDb, cleanupTestDb } from '../fixtures/testDb';
import {
  insertFreestyleRecord,
  insertFreestyleTrick,
  insertFreestyleTrickModifier,
  insertFreestyleFamily,
  insertFreestyleFamilySublabel,
  insertFreestyleSet,
} from '../fixtures/factories';
import {
  seedCuratorContent,
  STAGED_CURATOR_CONTENT,
  CuratorContentRefusal,
  trickSlugsNamedBy,
  type CuratorContent,
} from '../../freestyle/loaders/28a_seed_curator_content';

const { dbPath } = setTestEnv('4148');
const content = STAGED_CURATOR_CONTENT;
const modifierSlugs = [...content.beginnerNotes.keys()];
const trickSlugs = [...trickSlugsNamedBy(content)];
const EXTRA_MODIFIER = 'zz_unstaged_modifier';
const EXTRA_RECORD = 'Zz Unstaged Record';
const EXTRA_TRICK = 'zz_unstaged_trick';
const EXTRA_DESCRIPTION = 'The description the dictionary load wrote.';

/** Every per-trick column the seeder resets, with the staged map that fills it. */
const TRICK_COLUMNS: Array<[column: string, map: ReadonlyMap<string, string>]> = [
  ['about_derivatives', content.aboutDerivatives],
  ['about_naming_note', content.aboutNamingNotes],
  ['reverse_pair_base', content.reversePairBases],
  ['family_override',   content.familyOverrides],
  ['trick_kind',        content.trickKinds],
  ['movement_notation_subtitle',  content.movementNotationSubtitles],
  ['execution_notation_subtitle', content.executionNotationSubtitles],
];
const EXTRA_NOTATION = 'SET > SAME TOE [DEL]';
// The trick page shows a formula's breakdown without its closing "= N ADD".
const breakdownOf = (derivation: string): string => derivation.replace(/\s*=\s*\d+\s*ADD\s*$/, '');

let db: BetterSqlite3.Database;

/** A database holding every record, modifier and trick the staged content
 *  names, plus one of each it does not. */
function build(): BetterSqlite3.Database {
  cleanupTestDb(dbPath);
  const conn = createTestDb(dbPath);
  for (const name of [...content.recordReviews.keys(), EXTRA_RECORD]) insertFreestyleRecord(conn, { trick_name: name });
  for (const slug of [...modifierSlugs, EXTRA_MODIFIER]) insertFreestyleTrickModifier(conn, { slug });
  for (const slug of trickSlugs) insertFreestyleTrick(conn, { slug });
  insertFreestyleTrick(conn, { slug: EXTRA_TRICK, description: EXTRA_DESCRIPTION, operational_notation: EXTRA_NOTATION });
  return conn;
}

function value(sql: string, ...params: unknown[]): unknown {
  return (db.prepare(sql).get(...params) as { v: unknown } | undefined)?.v;
}

beforeEach(() => {
  db?.close();
  db = build();
});

afterAll(() => {
  db?.close();
  cleanupTestDb(dbPath);
});

describe('seeding the staged curator content', () => {
  // Defect caught: a staged note silently not reaching its column, so the page
  // loses curator content once the app reads the database.
  it('writes every staged entry into its column', () => {
    const counts = seedCuratorContent(db);
    for (const [name, note] of content.recordReviews) {
      expect(value('SELECT curator_review_note AS v FROM freestyle_records WHERE trick_name = ?', name), name).toBe(note);
    }
    for (const [slug, note] of content.beginnerNotes) {
      expect(value('SELECT beginner_note AS v FROM freestyle_trick_modifiers WHERE slug = ?', slug), slug).toBe(note);
    }
    for (const [column, map] of [...TRICK_COLUMNS, ['description', content.semanticDescriptions] as const]) {
      for (const [slug, v] of map) {
        expect(value(`SELECT ${column} AS v FROM freestyle_tricks WHERE slug = ?`, slug), `${column} ${slug}`).toBe(v);
      }
    }
    for (const f of content.formulas) {
      expect(db.prepare(`
        SELECT add_derivation AS d, formula_operator AS o, expanded_notation AS e
        FROM freestyle_tricks WHERE slug = ?`).get(f.slug), f.slug)
        .toEqual({ d: breakdownOf(f.derivation), o: f.operator, e: f.expandedNotation ?? null });
    }
    let cohortMembers = 0;
    for (const [terminal, members] of content.terminalCohorts) {
      members.forEach((m, i) => {
        cohortMembers += 1;
        expect(db.prepare('SELECT terminal_cohort AS t, terminal_cohort_position AS p FROM freestyle_tricks WHERE slug = ?').get(m), m)
          .toEqual({ t: terminal, p: i + 1 });
      });
    }
    // The counts are what the rows say, not a tally of the attempts.
    expect(counts).toEqual({
      recordsUnderReview:    content.recordReviews.size,
      beginnerNotes:         content.beginnerNotes.size,
      aboutDerivatives:      content.aboutDerivatives.size,
      aboutNamingNotes:      content.aboutNamingNotes.size,
      semanticDescriptions:  content.semanticDescriptions.size,
      reversePairBases:      content.reversePairBases.size,
      familyOverrides:       content.familyOverrides.size,
      trickKinds:            content.trickKinds.size,
      terminalCohortMembers: cohortMembers,
      formulas:              content.formulas.length,
      expandedNotations:     content.formulas.filter((f) => f.expandedNotation).length,
      movementNotationSubtitles:  content.movementNotationSubtitles.size,
      executionNotationSubtitles: content.executionNotationSubtitles.size,
      families:                   content.families.length,
      familySublabels:            content.familySublabels.size,
      sets:                       content.sets.length,
    });
    // Every staged set lands as authored, its related sets as JSON in order.
    for (const s of content.sets) {
      expect(db.prepare(`
        SELECT display_name AS n, set_group AS g, sort_order AS o, formula AS f, explanation AS e,
               related_sets_json AS r, held_from_list AS h
        FROM freestyle_sets WHERE slug = ?`).get(s.slug), s.slug).toEqual({
        n: s.displayName, g: s.setGroup, o: s.sortOrder, f: s.formula, e: s.explanation,
        r: JSON.stringify(s.relatedSets), h: s.heldFromList ? 1 : 0,
      });
    }
    // Every staged family lands as authored, its lists as JSON in order, and
    // every folded label lands under its family.
    for (const f of content.families) {
      expect(db.prepare(`
        SELECT display_name AS n, parent_slug AS p, tier AS t, sort_order AS o, hook AS h,
               description AS d, importance AS i, how_to_recognize_json AS r,
               related_family_slugs_json AS s, shared_structure AS ss, trick_page_note AS tn
        FROM freestyle_families WHERE slug = ?`).get(f.slug), f.slug).toEqual({
        n: f.displayName, p: f.parentSlug, t: f.tier, o: f.sortOrder, h: f.hook,
        d: f.description, i: f.importance, r: JSON.stringify(f.howToRecognize),
        s: JSON.stringify(f.relatedFamilySlugs), ss: f.sharedStructure, tn: f.trickPageNote,
      });
    }
    for (const [label, fam] of content.familySublabels) {
      expect(value('SELECT family_slug AS v FROM freestyle_family_sublabels WHERE label = ?', label), label).toBe(fam);
    }
    // Rows the content does not name stay empty, and a description it does not
    // name keeps what the dictionary load wrote.
    expect(value('SELECT beginner_note AS v FROM freestyle_trick_modifiers WHERE slug = ?', EXTRA_MODIFIER)).toBeNull();
    expect(value('SELECT curator_review_note AS v FROM freestyle_records WHERE trick_name = ?', EXTRA_RECORD)).toBeNull();
    expect(db.prepare(`
      SELECT description, operational_notation, about_derivatives, about_naming_note,
             reverse_pair_base, family_override, trick_kind, terminal_cohort, terminal_cohort_position,
             add_derivation, formula_operator, expanded_notation,
             movement_notation_subtitle, execution_notation_subtitle
      FROM freestyle_tricks WHERE slug = ?`).get(EXTRA_TRICK)).toEqual({
      description: EXTRA_DESCRIPTION, operational_notation: EXTRA_NOTATION,
      about_derivatives: null, about_naming_note: null,
      reverse_pair_base: null, family_override: null, trick_kind: null,
      terminal_cohort: null, terminal_cohort_position: null,
      add_derivation: null, formula_operator: null, expanded_notation: null,
      movement_notation_subtitle: null, execution_notation_subtitle: null,
    });
  });

  // Defect caught: commentary appended to a formula reaching the trick page's
  // Difficulty line, which shows the seeded breakdown verbatim. Semicolons and
  // em/en dashes separate math from appended prose; a slug's hyphen is not one.
  it('seeds every breakdown as structural math only', () => {
    seedCuratorContent(db);
    const offenders = (db.prepare(
      'SELECT slug, add_derivation AS d FROM freestyle_tricks WHERE add_derivation IS NOT NULL',
    ).all() as { slug: string; d: string }[])
      .filter((r) => /[;—–]/.test(r.d))
      .map((r) => `${r.slug}: ${r.d}`);
    expect(value('SELECT COUNT(*) AS v FROM freestyle_tricks WHERE add_derivation IS NOT NULL'))
      .toBe(content.formulas.length);
    expect(offenders).toEqual([]);
  });

  // Defect caught: a family or folded label removed from the staged roster
  // living on in the database after the next refresh, so a dropped family keeps
  // its page.
  it('removes a family and a folded label no staged entry supplies any more', () => {
    seedCuratorContent(db);
    insertFreestyleFamily(db, { slug: 'zz_stale_family' });
    insertFreestyleFamilySublabel(db, 'zz_stale_label', 'zz_stale_family');
    seedCuratorContent(db);
    expect(value("SELECT COUNT(*) AS v FROM freestyle_families WHERE slug = 'zz_stale_family'")).toBe(0);
    expect(value("SELECT COUNT(*) AS v FROM freestyle_family_sublabels WHERE label = 'zz_stale_label'")).toBe(0);
    expect(value('SELECT COUNT(*) AS v FROM freestyle_families')).toBe(content.families.length);
  });

  // Defect caught: a set removed from the staged sets living on in the database
  // after the next refresh, so a dropped set keeps its page.
  it('removes a set no staged entry supplies any more', () => {
    seedCuratorContent(db);
    insertFreestyleSet(db, { slug: 'zz_stale_set' });
    seedCuratorContent(db);
    expect(value("SELECT COUNT(*) AS v FROM freestyle_sets WHERE slug = 'zz_stale_set'")).toBe(0);
    expect(value('SELECT COUNT(*) AS v FROM freestyle_sets')).toBe(content.sets.length);
  });

  // Defect caught: an entry removed from a staged module living on in the
  // database after the next refresh.
  it('clears a value no staged entry supplies any more', () => {
    db.prepare('UPDATE freestyle_trick_modifiers SET beginner_note = ? WHERE slug = ?')
      .run('stale', EXTRA_MODIFIER);
    db.prepare('UPDATE freestyle_records SET curator_review_note = ? WHERE trick_name = ?').run('stale', EXTRA_RECORD);
    db.prepare(`
      UPDATE freestyle_tricks
      SET about_derivatives = 'stale', about_naming_note = 'stale', reverse_pair_base = 'stale',
          family_override = 'stale', trick_kind = 'modifier',
          terminal_cohort = 'stale', terminal_cohort_position = 1,
          add_derivation = 'stale', formula_operator = 'stale', expanded_notation = 'stale',
          movement_notation_subtitle = 'stale', execution_notation_subtitle = 'stale'
      WHERE slug = ?`).run(EXTRA_TRICK);
    seedCuratorContent(db);
    expect(value('SELECT beginner_note AS v FROM freestyle_trick_modifiers WHERE slug = ?', EXTRA_MODIFIER)).toBeNull();
    expect(value('SELECT curator_review_note AS v FROM freestyle_records WHERE trick_name = ?', EXTRA_RECORD)).toBeNull();
    expect(db.prepare(`
      SELECT about_derivatives, about_naming_note, reverse_pair_base, family_override,
             trick_kind, terminal_cohort, terminal_cohort_position,
             add_derivation, formula_operator, expanded_notation,
             movement_notation_subtitle, execution_notation_subtitle
      FROM freestyle_tricks WHERE slug = ?`).get(EXTRA_TRICK)).toEqual({
      about_derivatives: null, about_naming_note: null, reverse_pair_base: null,
      family_override: null, trick_kind: null, terminal_cohort: null, terminal_cohort_position: null,
      add_derivation: null, formula_operator: null, expanded_notation: null,
      movement_notation_subtitle: null, execution_notation_subtitle: null,
    });
  });
});

describe('refusing content the database cannot take', () => {
  function withExtra(change: Partial<CuratorContent>): CuratorContent {
    return { ...content, ...change };
  }

  // Each case: an entry silently skipped would drop curator content from the site
  // with nothing to say so; a partial write would leave half the content seeded.
  it.each([
    ['a beginner note for a modifier the registry does not hold', withExtra({
      beginnerNotes: new Map([...content.beginnerNotes, ['no_such_modifier', 'A note.']]),
    }), /no_such_modifier/],
    ['a record name no record carries', withExtra({
      recordReviews: new Map([...content.recordReviews, ['No Such Record', 'A note.']]),
    }), /No Such Record/],
    ['a trick-keyed entry for a trick the dictionary does not hold', withExtra({
      aboutDerivatives: new Map([...content.aboutDerivatives, ['no_such_trick', 'A note.']]),
    }), /no_such_trick/],
    ['a reverse pair whose base the dictionary does not hold', withExtra({
      reversePairBases: new Map([...content.reversePairBases, [EXTRA_TRICK, 'no_such_base']]),
    }), /no_such_base/],
    ['a family override naming a family not on the public list', withExtra({
      familyOverrides: new Map([...content.familyOverrides, [EXTRA_TRICK, 'no_such_family']]),
    }), /no_such_family/],
    ['a terminal list naming a trick the dictionary does not hold', withExtra({
      terminalCohorts: new Map([...content.terminalCohorts, [EXTRA_TRICK, ['no_such_member']]]),
    }), /no_such_member/],
    ['a trick listed under two terminals', withExtra({
      terminalCohorts: new Map([...content.terminalCohorts, [EXTRA_TRICK, [[...content.terminalCohorts.values()][0]![0]!]]]),
    }), /listed under both/],
    ['a formula for a trick the dictionary does not hold', withExtra({
      formulas: [...content.formulas, { slug: 'no_such_formula_trick', derivation: 'dex(1) = 1 ADD', operator: 'dex' }],
    }), /no_such_formula_trick/],
    ['a second formula for one trick', withExtra({
      formulas: [...content.formulas, { ...content.formulas[0]!, derivation: 'dex(1) = 1 ADD' }],
    }), /more than one formula/],
    ['a notation subtitle for a trick the dictionary does not hold', withExtra({
      executionNotationSubtitles: new Map([...content.executionNotationSubtitles, ['no_such_subtitle_trick', 'A line.']]),
    }), /no_such_subtitle_trick/],
    ['a family whose parent is itself a branch', withExtra({
      families: content.families.map((f) => (f.slug === 'mirage' ? { ...f, parentSlug: 'torque' } : f)),
    }), /family "mirage"/],
    ['a family parent demoted under its branches', withExtra({
      families: content.families.map((f) => (f.slug === 'osis' ? { ...f, tier: 'minor_lineage' as const } : f)),
    }), /family "osis"/],
    ['a family listed twice', withExtra({
      families: [...content.families, content.families[0]!],
    }), /listed more than once/],
    ['a folded label naming no family', withExtra({
      familySublabels: new Map([...content.familySublabels, ['zz_label', 'no_such_family_slug']]),
    }), /no_such_family_slug/],
    // Defect caught: a staged set that would link to a page that does not exist,
    // or be listed under a group the encyclopedia never shows.
    ['a set related to a set that does not exist', withExtra({
      sets: content.sets.map((s) => (s.slug === 'pixie' ? { ...s, relatedSets: [{ slug: 'no_such_set', label: '' }] } : s)),
    }), /set "pixie"/],
    ['a set in a group the encyclopedia does not define', withExtra({
      sets: content.sets.map((s) => (s.slug === 'fairy' ? { ...s, setGroup: 'no-such-group' } : s)),
    }), /set "fairy"/],
    ['a set listed twice', withExtra({
      sets: [...content.sets, content.sets[0]!],
    }), /already a set/],
  ])('%s', (_label, bad, message) => {
    db.prepare('UPDATE freestyle_trick_modifiers SET beginner_note = ? WHERE slug = ?').run('kept', EXTRA_MODIFIER);
    db.prepare('UPDATE freestyle_tricks SET family_override = ? WHERE slug = ?').run('kept', EXTRA_TRICK);
    insertFreestyleFamily(db, { slug: 'zz_kept_family' });
    insertFreestyleSet(db, { slug: 'zz_kept_set' });
    let refusal: unknown;
    try {
      seedCuratorContent(db, bad);
    } catch (err) {
      refusal = err;
    }
    expect(refusal).toBeInstanceOf(CuratorContentRefusal);
    expect((refusal as CuratorContentRefusal).message).toMatch(message);
    // Nothing written: neither the reset nor any staged value landed.
    expect(value('SELECT beginner_note AS v FROM freestyle_trick_modifiers WHERE slug = ?', EXTRA_MODIFIER)).toBe('kept');
    expect(value('SELECT COUNT(*) AS v FROM freestyle_trick_modifiers WHERE beginner_note IS NOT NULL')).toBe(1);
    expect(value('SELECT family_override AS v FROM freestyle_tricks WHERE slug = ?', EXTRA_TRICK)).toBe('kept');
    expect(value('SELECT COUNT(*) AS v FROM freestyle_tricks WHERE family_override IS NOT NULL')).toBe(1);
    expect(value('SELECT COUNT(*) AS v FROM freestyle_families')).toBe(1);
    expect(value('SELECT COUNT(*) AS v FROM freestyle_sets')).toBe(1);
  });
});

describe('the rebuild stage', () => {
  function runStage() {
    return spawnSync('npx', ['tsx', 'freestyle/loaders/28a_seed_curator_content.ts', '--db', dbPath], {
      encoding: 'utf8', ...SPAWN_GUARD,
    });
  }

  // Defect caught: the rebuild calls the seeder in a way that never runs it, or
  // reports success on a refusal.
  it('seeds the database it is given and reports the counts', () => {
    db.close();
    const r = runStage();
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toContain(`${content.beginnerNotes.size} modifier beginner notes`);
    expect(r.stdout).toContain(`${content.familyOverrides.size} family overrides`);
    expect(r.stdout).toContain(`${content.formulas.length} formulas`);
    db = new BetterSqlite3(dbPath);
    expect(value('SELECT COUNT(*) AS v FROM freestyle_trick_modifiers WHERE beginner_note IS NOT NULL'))
      .toBe(content.beginnerNotes.size);
  });

  it('exits non-zero, naming the problem, when a staged entry names a missing row', () => {
    db.prepare('DELETE FROM freestyle_trick_modifiers WHERE slug = ?').run(modifierSlugs[0]);
    db.close();
    const r = runStage();
    expect(r.status).toBe(1);
    expect(r.stderr).toContain(modifierSlugs[0]);
    db = new BetterSqlite3(dbPath);
    expect(value('SELECT COUNT(*) AS v FROM freestyle_trick_modifiers WHERE beginner_note IS NOT NULL')).toBe(0);
  });
});
