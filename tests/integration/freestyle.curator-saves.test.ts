/**
 * A freestyle curator's save survives a rebuild.
 *
 * Before go-live every database is rebuilt from committed files, so a save that
 * reaches only the database is lost at the next rebuild while looking done. On a
 * developer machine a trick edit therefore writes a committed save file first, and
 * the final freestyle loader applies those files after every other input.
 *
 * The rebuild here is the real one: a fresh database, the dictionary loaders in the
 * order the freestyle rebuild runs them, then the save loader. A smaller stand-in
 * would not show that a save beats the base inputs it overrides.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { SPAWN_GUARD } from '../fixtures/spawnGuard';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import { insertMember } from '../fixtures/factories';

const { dbPath } = setTestEnv('4142');
const savesDir = process.env.CURATOR_SAVES_DIR!;
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'footbag-test-saves-scratch-'));
const rebuildPath = path.join(scratch, 'rebuild.db');
const reportPath = path.join(scratch, 'overrides.csv');

const ADMIN_ID = 'aaaaaaaa-0000-0000-0000-000000saves1';
const SAVED_TEXT = 'Saved by a curator through the trick editor.';

const REBUILD: readonly (readonly [string, string[]])[] = [
  ['16_preflight_trick_ownership.py', []],
  ['17_load_trick_dictionary.py', ['--stage', 'tricks']],
  ['19_load_red_additions.py', []],
  ['17_load_trick_dictionary.py', ['--stage', 'aliases']],
  ['20_link_footbag_org_sources.py', []],
  ['21_load_footbag_org_pending_tricks.py', []],
  ['21a_load_alias_additions.py', []],
  ['21b_apply_alias_overrides.py', []],
  ['21c_retire_stale_tricks.py', []],
];

function loader(name: string, args: string[]) {
  return spawnSync('python3', [`freestyle/loaders/${name}`, ...args], { encoding: 'utf8', ...SPAWN_GUARD });
}

function rebuild(db: string): void {
  for (const [name, args] of REBUILD) {
    const r = loader(name, ['--db', db, ...args]);
    if (r.status !== 0) throw new Error(`${name} failed: ${r.stderr}`);
  }
}

function applySaves(db: string, dir = savesDir) {
  return loader('29_apply_curator_saves.py', ['--db', db, '--saves-dir', dir, '--report', reportPath]);
}

interface TrickRow {
  slug: string; canonical_name: string; adds: string | null; notation: string | null;
  operational_notation: string | null; trick_family: string | null; base_trick: string | null;
  category: string | null; is_active: number; sort_order: number; review_status: string;
  description: string | null; short_description: string | null; execution_summary: string | null;
  learning_notes: string | null; prerequisite_notes: string | null; pronunciation: string | null;
  operational_notation_source: string | null;
}

function readTrick(db: string, slug: string): TrickRow {
  const conn = new BetterSqlite3(db, { readonly: true });
  try {
    return conn.prepare('SELECT * FROM freestyle_tricks WHERE slug = ?').get(slug) as TrickRow;
  } finally {
    conn.close();
  }
}

function auditCount(slug: string): number {
  const conn = new BetterSqlite3(dbPath, { readonly: true });
  try {
    return (conn.prepare(
      "SELECT COUNT(*) AS n FROM audit_entries WHERE action_type = 'freestyle.trick.updated' AND entity_id = ?",
    ).get(slug) as { n: number }).n;
  } finally {
    conn.close();
  }
}

/** What the edit form submits for this row, with these fields changed. */
function formFor(row: TrickRow, changes: Record<string, string>) {
  return {
    canonicalName: row.canonical_name, adds: row.adds ?? '', movementNotation: row.notation ?? '',
    executionNotation: row.operational_notation ?? '', family: row.trick_family ?? '',
    baseTrick: row.base_trick ?? '', category: row.category ?? '', reviewStatus: row.review_status,
    isActive: row.is_active === 1, sortOrder: String(row.sort_order), description: row.description ?? '',
    shortDescription: row.short_description ?? '', executionSummary: row.execution_summary ?? '',
    learningNotes: row.learning_notes ?? '', prerequisiteNotes: row.prerequisite_notes ?? '',
    pronunciation: row.pronunciation ?? '', operationalNotationSource: row.operational_notation_source ?? '',
    ...changes,
  };
}

function rowCount(db: string, table: string, where: string, params: unknown[]): number {
  const conn = new BetterSqlite3(db, { readonly: true });
  try {
    return (conn.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE ${where}`).get(...params) as { n: number }).n;
  } finally {
    conn.close();
  }
}

function saveFile(slug: string): string {
  return path.join(savesDir, 'tricks', `${slug}.json`);
}

function writeSave(dir: string, slug: string, body: unknown): void {
  fs.mkdirSync(path.join(dir, 'tricks'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'tricks', `${slug}.json`), JSON.stringify(body));
}

// The tricks these cases edit, chosen from the real dictionary so the rebuild has
// a real base value to override. Each case owns its own trick, so no case depends
// on another's save.
let editedSlug = '';
let failFileSlug = '';
let failDbSlug = '';
let noopSlug = '';
let databaseOnlySlug = '';
let baseDescription = '';
let updatedAlias: { alias_slug: string; trick_slug: string };
let removedAlias: { alias_slug: string; trick_slug: string };
let baseSourceLink: { trick_slug: string; source_id: string };
let baseModifierLink: { trick_slug: string; modifier_slug: string; apply_order: number };

let service: typeof import('../../src/services/freestyleCurationService').freestyleCurationService;
let adapterModule: typeof import('../../src/adapters/curatedAuthoringAdapter');
let errors: typeof import('../../src/services/serviceErrors');

beforeAll(async () => {
  const seed = createTestDb(dbPath);
  insertMember(seed, {
    id: ADMIN_ID, slug: 'saves_admin', display_name: 'Saves Admin',
    login_email: 'saves-admin@example.com', is_admin: 1,
  });
  seed.close();
  rebuild(dbPath);

  const picker = new BetterSqlite3(dbPath, { readonly: true });
  const slugs = picker.prepare(
    `SELECT slug, description FROM freestyle_tricks
      WHERE is_active = 1 AND category = 'compound' AND description IS NOT NULL
        AND short_description IS NULL
        AND slug NOT IN (SELECT trick_slug FROM freestyle_trick_aliases WHERE alias_slug = slug)
      ORDER BY slug LIMIT 5`,
  ).all() as { slug: string; description: string }[];
  picker.close();
  if (slugs.length < 5) throw new Error('the dictionary offers too few tricks to edit');
  [editedSlug, failFileSlug, failDbSlug, noopSlug, databaseOnlySlug] = slugs.map((s) => s.slug) as
    [string, string, string, string, string];
  baseDescription = slugs[0]!.description;

  await importApp();
  ({ freestyleCurationService: service } = await import('../../src/services/freestyleCurationService'));
  adapterModule = await import('../../src/adapters/curatedAuthoringAdapter');
  errors = await import('../../src/services/serviceErrors');

  const row = readTrick(dbPath, editedSlug);
  service.updateTrickScalars(editedSlug, formFor(row, { shortDescription: SAVED_TEXT }), ADMIN_ID);
  const saved = readTrick(dbPath, editedSlug);
  service.updateTrickScalars(editedSlug, formFor(saved, { description: '' }), ADMIN_ID);

  // One save of every record kind, each against base rows a rebuild would bring
  // back, so the rebuild below proves the save beat the base input.
  const rows = new BetterSqlite3(dbPath, { readonly: true });
  const baseAliases = rows.prepare(
    "SELECT alias_slug, trick_slug FROM freestyle_trick_aliases WHERE alias_origin_producer = 'base-dictionary' ORDER BY alias_slug LIMIT 2",
  ).all() as { alias_slug: string; trick_slug: string }[];
  baseSourceLink = rows.prepare(
    'SELECT trick_slug, source_id FROM freestyle_trick_source_links ORDER BY trick_slug LIMIT 1',
  ).get() as typeof baseSourceLink;
  baseModifierLink = rows.prepare(
    `SELECT trick_slug, modifier_slug, apply_order FROM freestyle_trick_modifier_links
      ORDER BY trick_slug LIMIT 1`,
  ).get() as typeof baseModifierLink;
  rows.close();
  [updatedAlias, removedAlias] = baseAliases as [typeof updatedAlias, typeof removedAlias];

  service.createSource({
    id: 'saved-source', sourceType: 'curated', sourceLabel: 'Saved source',
    retrievedAt: '2026-11-03T00:00:00.000Z', sourceUrl: '', notes: '',
  }, ADMIN_ID);
  service.addAlias(editedSlug, { aliasText: 'saved alias', aliasType: 'common', sourceId: 'saved-source' }, ADMIN_ID);
  service.updateAlias(updatedAlias.trick_slug, updatedAlias.alias_slug, {
    aliasType: 'common', aliasDisplay: 'on', provenanceNote: 'Saved provenance.',
  }, ADMIN_ID);
  service.removeAlias(removedAlias.trick_slug, removedAlias.alias_slug, ADMIN_ID);
  service.attachSource(editedSlug, { sourceId: 'saved-source', externalUrl: 'https://example.com/saved', assertedAdds: '3' }, ADMIN_ID);
  service.detachSource(baseSourceLink.trick_slug, baseSourceLink.source_id, ADMIN_ID);
  service.attachModifier(editedSlug, { modifierSlug: baseModifierLink.modifier_slug, applyOrder: '9' }, ADMIN_ID);
  service.detachModifier(
    baseModifierLink.trick_slug, baseModifierLink.modifier_slug, baseModifierLink.apply_order, ADMIN_ID,
  );
}, 180_000);

afterEach(() => adapterModule.resetCuratedAuthoringAdapterForTests());

afterAll(() => {
  cleanupTestDb(dbPath);
  fs.rmSync(scratch, { recursive: true, force: true });
});

describe('a trick edit on a developer machine', () => {
  it('writes a save file naming the trick and only the fields the curator changed', () => {
    // Defect: a save that records untouched fields freezes every value it read, so
    // a later correction to the base inputs never reaches that trick.
    const file = JSON.parse(fs.readFileSync(saveFile(editedSlug), 'utf8'));
    expect(file.slug).toBe(editedSlug);
    expect(Object.keys(file.fields).sort()).toEqual(['description', 'short_description']);
    expect(file.fields.short_description).toBe(SAVED_TEXT);
    // Defect: a clear written as a missing key is indistinguishable from "not
    // edited", so the base value comes back at the next rebuild.
    expect(file.fields.description).toBeNull();
  });

  it('saves to the database and audits once per save', () => {
    const row = readTrick(dbPath, editedSlug);
    expect(row.short_description).toBe(SAVED_TEXT);
    expect(row.description).toBeNull();
    expect(auditCount(editedSlug)).toBe(2);
  });

  it('writes no file for a save that changes nothing', () => {
    // Defect: an unchanged save pins every field a curator merely looked at.
    service.updateTrickScalars(noopSlug, formFor(readTrick(dbPath, noopSlug), {}), ADMIN_ID);
    expect(fs.existsSync(saveFile(noopSlug))).toBe(false);
  });

  it('refuses the save and writes nothing to the database when the file cannot be written', () => {
    // Defect: the save reports success, reaches only the database, and the next
    // rebuild silently loses it.
    const before = readTrick(dbPath, failFileSlug);
    const audits = auditCount(failFileSlug);
    adapterModule.setCuratedAuthoringAdapterForTests({
      saveTrickFields() { throw new Error('disk full'); },
      saveItem() { throw new Error('disk full'); },
    });
    expect(() => service.updateTrickScalars(
      failFileSlug, formFor(before, { shortDescription: SAVED_TEXT }), ADMIN_ID,
    )).toThrow(errors.ServiceUnavailableError);
    expect(readTrick(dbPath, failFileSlug)).toEqual(before);
    expect(auditCount(failFileSlug)).toBe(audits);
    // The same refusal on a record save: no row and no file.
    expect(() => service.addAlias(
      failFileSlug, { aliasText: 'refused alias', aliasType: 'common' }, ADMIN_ID,
    )).toThrow(errors.ServiceUnavailableError);
    expect(rowCount(dbPath, 'freestyle_trick_aliases', 'alias_slug = ?', ['refused_alias'])).toBe(0);
  });

  it('puts an alias file back when the database refuses the alias', () => {
    // Defect: the file outlives the refused save, and a rebuild adds an alias the
    // curator was told did not save.
    const conn = new BetterSqlite3(dbPath);
    conn.exec(`CREATE TRIGGER refuse_alias BEFORE INSERT ON freestyle_trick_aliases
               WHEN NEW.alias_slug = 'refused_by_database' BEGIN SELECT RAISE(ABORT, 'refused'); END`);
    conn.close();
    try {
      expect(() => service.addAlias(
        failDbSlug, { aliasText: 'refused by database', aliasType: 'common' }, ADMIN_ID,
      )).toThrow(/refused/);
    } finally {
      const drop = new BetterSqlite3(dbPath);
      drop.exec('DROP TRIGGER refuse_alias');
      drop.close();
    }
    expect(fs.existsSync(path.join(savesDir, 'aliases', 'refused_by_database.json'))).toBe(false);
  });

  it('puts the file back when the database refuses the save', () => {
    // Defect: the save reports failure, yet its file stays and the next rebuild
    // applies a change the curator was told did not happen.
    const before = readTrick(dbPath, failDbSlug);
    const conn = new BetterSqlite3(dbPath);
    conn.exec(`CREATE TRIGGER refuse_saves BEFORE UPDATE ON freestyle_tricks
               WHEN NEW.slug = '${failDbSlug}' BEGIN SELECT RAISE(ABORT, 'refused'); END`);
    conn.close();
    try {
      expect(() => service.updateTrickScalars(
        failDbSlug, formFor(before, { shortDescription: SAVED_TEXT }), ADMIN_ID,
      )).toThrow(/refused/);
    } finally {
      const drop = new BetterSqlite3(dbPath);
      drop.exec('DROP TRIGGER refuse_saves');
      drop.close();
    }
    expect(fs.existsSync(saveFile(failDbSlug))).toBe(false);
    expect(readTrick(dbPath, failDbSlug).short_description).toBeNull();
  });

  it('keeps fields saved earlier when a later save changes another', () => {
    // Defect: each save replaces the file, so a trick edited twice loses its first
    // edit at the next rebuild.
    const dir = path.join(scratch, 'merge');
    const adapter = adapterModule.createFileCuratedAuthoringAdapter({ rootDir: dir });
    adapter.saveTrickFields('merged_trick', { description: 'first' });
    adapter.saveTrickFields('merged_trick', { pronunciation: 'second' });
    const file = JSON.parse(fs.readFileSync(path.join(dir, 'tricks', 'merged_trick.json'), 'utf8'));
    expect(file.fields).toEqual({ description: 'first', pronunciation: 'second' });
  });
});

describe('the database-only backend', () => {
  it('saves to the database and writes no file', () => {
    // Defect: a deployed host writes to a disk the next deploy replaces, or a
    // screen behaves differently on a host than the adapter promises.
    adapterModule.setCuratedAuthoringAdapterForTests(adapterModule.createDatabaseOnlyCuratedAuthoringAdapter());
    const before = readTrick(dbPath, databaseOnlySlug);
    service.updateTrickScalars(databaseOnlySlug, formFor(before, { shortDescription: SAVED_TEXT }), ADMIN_ID);
    expect(readTrick(dbPath, databaseOnlySlug).short_description).toBe(SAVED_TEXT);
    expect(fs.existsSync(saveFile(databaseOnlySlug))).toBe(false);
  });
});

describe('a rebuild', () => {
  beforeAll(() => {
    createTestDb(rebuildPath).close();
    rebuild(rebuildPath);
  }, 120_000);

  it('a fresh database holds the base values until the saves are applied', () => {
    // The control: without it, the cases below could pass on a base input that
    // already held the saved value, or a removed row the rebuild never made.
    const base = readTrick(rebuildPath, editedSlug);
    expect(base.description).toBe(baseDescription);
    expect(base.short_description).toBeNull();
    expect(rowCount(rebuildPath, 'freestyle_trick_aliases', 'alias_slug = ?', [removedAlias.alias_slug])).toBe(1);
    expect(rowCount(rebuildPath, 'freestyle_trick_source_links', 'trick_slug = ? AND source_id = ?',
      [baseSourceLink.trick_slug, baseSourceLink.source_id])).toBe(1);
    expect(rowCount(rebuildPath, 'freestyle_trick_modifier_links', 'trick_slug = ? AND modifier_slug = ? AND apply_order = ?',
      [baseModifierLink.trick_slug, baseModifierLink.modifier_slug, baseModifierLink.apply_order])).toBe(1);
  });

  it('reloads a saved value and a cleared field, and reports what it overrode', () => {
    // Defect: a curator's edit is lost, or a clear comes back, at the next rebuild.
    const r = applySaves(rebuildPath);
    expect(r.status, r.stderr).toBe(0);
    const row = readTrick(rebuildPath, editedSlug);
    expect(row.short_description).toBe(SAVED_TEXT);
    expect(row.description).toBeNull();
    // Defect: a reader takes the older value in a CSV for the authority, with
    // nothing to say a save overrides it.
    const report = fs.readFileSync(reportPath, 'utf8');
    expect(report).toContain(`${editedSlug},description,`);
    expect(report).toContain(baseDescription.split(',')[0]);
    expect(r.stdout).toContain(`${editedSlug}.description`);
  });

  it('brings back every saved source, alias and link, and keeps removed ones gone', () => {
    // Defect: a curator's work on any of these is lost at the next rebuild, or a
    // removed base alias or link comes back from the input that produced it.
    const source = rowCount(rebuildPath, 'freestyle_trick_sources', 'id = ?', ['saved-source']);
    expect(source).toBe(1);
    expect(rowCount(rebuildPath, 'freestyle_trick_aliases', 'alias_slug = ? AND trick_slug = ? AND source_id = ?',
      ['saved_alias', editedSlug, 'saved-source'])).toBe(1);
    expect(rowCount(rebuildPath, 'freestyle_trick_aliases',
      "alias_slug = ? AND alias_type = 'common' AND alias_display = 1 AND provenance_note = 'Saved provenance.'",
      [updatedAlias.alias_slug])).toBe(1);
    expect(rowCount(rebuildPath, 'freestyle_trick_aliases', 'alias_slug = ?', [removedAlias.alias_slug])).toBe(0);
    expect(rowCount(rebuildPath, 'freestyle_trick_source_links',
      "trick_slug = ? AND source_id = 'saved-source' AND external_url = 'https://example.com/saved' AND asserted_adds = 3",
      [editedSlug])).toBe(1);
    expect(rowCount(rebuildPath, 'freestyle_trick_source_links', 'trick_slug = ? AND source_id = ?',
      [baseSourceLink.trick_slug, baseSourceLink.source_id])).toBe(0);
    expect(rowCount(rebuildPath, 'freestyle_trick_modifier_links', 'trick_slug = ? AND modifier_slug = ? AND apply_order = 9',
      [editedSlug, baseModifierLink.modifier_slug])).toBe(1);
    expect(rowCount(rebuildPath, 'freestyle_trick_modifier_links', 'trick_slug = ? AND modifier_slug = ? AND apply_order = ?',
      [baseModifierLink.trick_slug, baseModifierLink.modifier_slug, baseModifierLink.apply_order])).toBe(0);
  });

  it('is unchanged by applying the saves a second time', () => {
    const once = readTrick(rebuildPath, editedSlug);
    expect(applySaves(rebuildPath).status).toBe(0);
    expect(readTrick(rebuildPath, editedSlug)).toEqual(once);
  });
});

describe('the save loader refuses a file it cannot apply', () => {
  function refused(body: unknown, slug: string) {
    const dir = fs.mkdtempSync(path.join(scratch, 'bad-'));
    writeSave(dir, slug, body);
    return applySaves(rebuildPath, dir);
  }

  // Each of these would otherwise lose a curator's work silently or stop the
  // rebuild with an error that names nothing.
  it.each([
    ['a field a save may not carry', 'bad_field', { slug: 'bad_field', fields: { loaded_at: 'x' } }, /loaded_at/],
    ['a file naming a different trick', 'bad_name', { slug: 'other', fields: { pronunciation: 'x' } }, /bad_name\.json/],
    ['a trick the inputs no longer produce', 'no_such_trick', { slug: 'no_such_trick', fields: { pronunciation: 'x' } }, /no_such_trick/],
  ])('%s', (_label, slug, body, message) => {
    const r = refused(body, slug);
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(message);
  });

  it('applies nothing when any one file fails', () => {
    // Defect: a half-applied save set leaves a rebuild reading as some saves
    // landed and others did not, with the failure easy to miss.
    const dir = fs.mkdtempSync(path.join(scratch, 'partial-'));
    writeSave(dir, editedSlug, { slug: editedSlug, fields: { pronunciation: 'partial' } });
    writeSave(dir, 'zz_no_such_trick', { slug: 'zz_no_such_trick', fields: { pronunciation: 'x' } });
    expect(applySaves(rebuildPath, dir).status).toBe(1);
    expect(readTrick(rebuildPath, editedSlug).pronunciation).not.toBe('partial');
  });
});

describe('the field list', () => {
  it('is the same in the adapter and the loader', () => {
    // Defect: the editor saves a field the loader refuses, and every rebuild after
    // that save stops.
    const python = fs.readFileSync('scripts/_freestyle_db_freshness.py', 'utf8');
    const block = python.match(/TRICK_SAVE_FIELDS = frozenset\(\{([\s\S]*?)\}\)/)![1]!;
    const loaderFields = [...block.matchAll(/"([a-z_]+)"/g)].map((m) => m[1]!).sort();
    expect(loaderFields).toEqual([...adapterModule.TRICK_SAVE_FIELDS].sort());
  });
});
