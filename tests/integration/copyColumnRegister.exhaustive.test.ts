/**
 * The register of what a production copy keeps decides every table and every
 * column of the schema, and decides them consistently with the schema.
 *
 * A non-production database is a copy of production with the credentials and
 * payment-provider identifiers taken out. The copy follows the register, so a
 * table or column the register does not name is a decision nobody made: either
 * it is silently left out of every copy, or, worse, a credential column added
 * later is copied because nobody looked. The schema is read from a database
 * built from `database/schema.sql`, so a new column fails here until it is
 * classified.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setTestEnv, createTestDb, cleanupTestDb } from '../fixtures/testDb';
import {
  COPY_COLUMN_REGISTER,
  isCopied,
  type CopiedTable,
} from '../../src/lib/copyColumnRegister';

const { dbPath } = setTestEnv('4479');

interface SchemaColumn {
  table: string;
  column: string;
  notNull: boolean;
  hasDefault: boolean;
}

let schemaTables: string[] = [];
let schemaColumns: SchemaColumn[] = [];
let foreignKeys: Array<{ table: string; column: string; references: string }> = [];

beforeAll(() => {
  const db = createTestDb(dbPath);
  schemaTables = (db.prepare(`
    SELECT name FROM sqlite_master
     WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
     ORDER BY name
  `).all() as Array<{ name: string }>).map((r) => r.name);
  schemaColumns = (db.prepare(`
    SELECT m.name AS tbl, p.name AS col, p."notnull" AS nn, p.dflt_value AS dflt
      FROM sqlite_master m, pragma_table_info(m.name) p
     WHERE m.type = 'table' AND m.name NOT LIKE 'sqlite_%'
     ORDER BY tbl, col
  `).all() as Array<{ tbl: string; col: string; nn: number; dflt: string | null }>).map((r) => ({
    table: r.tbl,
    column: r.col,
    notNull: r.nn === 1,
    hasDefault: r.dflt !== null,
  }));
  foreignKeys = (db.prepare(`
    SELECT m.name AS tbl, p."from" AS col, p."table" AS ref
      FROM sqlite_master m, pragma_foreign_key_list(m.name) p
     WHERE m.type = 'table'
     ORDER BY tbl, col
  `).all() as Array<{ tbl: string; col: string; ref: string }>).map((r) => ({
    table: r.tbl,
    column: r.col,
    references: r.ref,
  }));
  db.close();
});

afterAll(() => cleanupTestDb(dbPath));

/** Every column a copied table's entry names, with the action it names it under. */
function classified(entry: CopiedTable): Array<{ column: string; action: string }> {
  return [
    ...entry.keep.map((column) => ({ column, action: 'keep' })),
    ...Object.keys(entry.drop ?? {}).map((column) => ({ column, action: 'drop' })),
    ...Object.keys(entry.rewrite ?? {}).map((column) => ({ column, action: 'rewrite' })),
    ...Object.keys(entry.mask ?? {}).map((column) => ({ column, action: 'mask' })),
  ];
}

function actionOf(table: string, column: string): string | undefined {
  const entry = COPY_COLUMN_REGISTER[table];
  if (!entry) return undefined;
  if (!isCopied(entry)) return 'notCopied';
  return classified(entry).find((c) => c.column === column)?.action;
}

describe('production copy register: every table and column decided', () => {
  // Defect caught: a table added to the schema is copied by nothing, or a
  // table removed from it leaves the copy naming a table that is not there.
  it('names every schema table, and no table the schema lacks', () => {
    expect(schemaTables.length, 'the schema yielded no tables').toBeGreaterThan(50);
    const registered = Object.keys(COPY_COLUMN_REGISTER);
    expect(schemaTables.filter((t) => !registered.includes(t)), 'tables with no decision').toEqual([]);
    expect(registered.filter((t) => !schemaTables.includes(t)), 'decisions for absent tables').toEqual([]);
  });

  // Defect caught: a column added to a copied table, a password or token hash
  // among them, reaches the copy with nobody having decided what it is.
  it('names every column of every copied table exactly once, and no column the schema lacks', () => {
    const unclassified: string[] = [];
    const stale: string[] = [];
    const twice: string[] = [];
    for (const [table, entry] of Object.entries(COPY_COLUMN_REGISTER)) {
      if (!isCopied(entry)) continue;
      const named = classified(entry).map((c) => c.column);
      const actual = schemaColumns.filter((c) => c.table === table).map((c) => c.column);
      for (const column of actual) if (!named.includes(column)) unclassified.push(`${table}.${column}`);
      for (const column of named) if (!actual.includes(column)) stale.push(`${table}.${column}`);
      for (const column of new Set(named)) {
        if (named.filter((n) => n === column).length > 1) twice.push(`${table}.${column}`);
      }
    }
    expect(unclassified, 'columns with no decision').toEqual([]);
    expect(stale, 'decisions for absent columns').toEqual([]);
    expect(twice, 'columns decided more than once').toEqual([]);
  });

  // Defect caught: personal data is masked in some copies and not others,
  // when the design keeps it everywhere so a rehearsal meets real data.
  it('masks no column', () => {
    const masked = Object.entries(COPY_COLUMN_REGISTER).flatMap(([table, entry]) =>
      isCopied(entry) ? Object.keys(entry.mask ?? {}).map((c) => `${table}.${c}`) : []);
    expect(masked).toEqual([]);
  });
});

describe('production copy register: consistent with the schema it describes', () => {
  // Defect caught: a credential or provider identifier column is classified
  // keep, so a copy carries a working password hash, token or link to money.
  it('keeps no column shaped like a credential or a provider identifier', () => {
    const shaped = /^stripe_|password_hash$|token_hash$|checkout_session_id$|^last_stripe_event_id$/;
    const candidates = schemaColumns.filter((c) => shaped.test(c.column));
    expect(candidates.length, 'the name pattern matched no column').toBeGreaterThan(10);
    const kept = candidates
      .filter((c) => actionOf(c.table, c.column) === 'keep')
      .map((c) => `${c.table}.${c.column}`);
    expect(kept).toEqual([]);
  });

  // Defect caught: a copied row keeps a reference into a table the copy
  // leaves out, so the copy fails its own foreign-key check.
  it('keeps no reference into a table that is not copied', () => {
    const uncopied = Object.entries(COPY_COLUMN_REGISTER)
      .filter(([, entry]) => !isCopied(entry))
      .map(([table]) => table);
    const dangling = foreignKeys
      .filter((fk) => uncopied.includes(fk.references))
      .filter((fk) => actionOf(fk.table, fk.column) === 'keep')
      .map((fk) => `${fk.table}.${fk.column} -> ${fk.references}`);
    expect(dangling).toEqual([]);
  });

  // Defect caught: a column marked for clearing refuses NULL, so the copy
  // aborts part way, or a script works around it by keeping the value. A
  // default does not help: the copy writes the NULL explicitly.
  it('clears only columns that accept NULL; a required column is rewritten instead', () => {
    const cleared = schemaColumns
      .filter((c) => c.notNull)
      .filter((c) => actionOf(c.table, c.column) === 'drop')
      .map((c) => `${c.table}.${c.column}`);
    expect(cleared).toEqual([]);
  });
});

describe('production copy register: the removals the design names', () => {
  // Defect caught: a table silently drops out of every copy (the migration
  // ledger, say, so a rehearsed migration meets the wrong schema level), or a
  // table the design excludes is copied whole.
  it('leaves out exactly the tables the design excludes', () => {
    const uncopied = Object.entries(COPY_COLUMN_REGISTER)
      .filter(([, entry]) => !isCopied(entry))
      .map(([table]) => table)
      .sort();
    expect(uncopied).toEqual(['account_tokens', 'ballots', 'stripe_events', 'vote_eligibility_snapshot']);
  });

  // Defect caught: the password hash or an unsent mail's recipient and body is
  // cleared outright, which the credential and mail constraints refuse, so the
  // copy aborts or is patched to keep the value.
  it('rewrites the password hash and the outbox recipient and body', () => {
    const wanted = ['members.password_hash', 'outbox_emails.recipient_email', 'outbox_emails.body_text'];
    const wrong = wanted.filter((ref) => {
      const [table, column] = ref.split('.');
      return actionOf(table, column) !== 'rewrite';
    });
    expect(wrong).toEqual([]);
  });
});
