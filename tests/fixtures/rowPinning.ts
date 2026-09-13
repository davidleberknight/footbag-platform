/**
 * Identify the row an action wrote, instead of guessing at it by ordering.
 *
 * A test that does something and then reads a row back has to say WHICH row it
 * means. Ordering by a timestamp and taking the first result is the obvious
 * answer and it is wrong, because the platform's timestamps are millisecond
 * stamps and two rows written inside one millisecond tie. What happens on a tie
 * decides the test:
 *
 *   - With no tiebreaker, SQLite settles it however it likes.
 *   - With the row's own id as the tiebreaker the order is at least stable, but
 *     it is still arbitrary with respect to time, because most ids here are a
 *     prefix plus a random UUID. Stable is not the same as newest, and a query
 *     that looks carefully pinned can still hand back a row from four actions
 *     ago.
 *
 * Ties open only when the writes bunch, which happens when the machine is busy,
 * which is why this class of defect passes on its own and fails in the full
 * suite. The failure then reads as a wrong value rather than a wrong row, and
 * sends the reader looking for a bug in the code under test.
 *
 * The fix is to stop using order as a proxy for identity. Snapshot the ids that
 * already match before the action, and afterwards take the ones that were not
 * there before. That is exact rather than usually right, it does not care how
 * ids are generated, and it makes the assertion stronger than it was: the test
 * now also pins how many rows the action wrote, which a newest-row query cannot
 * express at all.
 *
 * Where a row carries a key the test itself controls, such as an idempotency
 * key it can reconstruct, selecting on that key directly is better still and
 * needs none of this.
 *
 * Table and column names are interpolated into the SQL here. That is safe in
 * this file and nowhere else: every argument is a literal written by a test
 * author, never a value that came from data.
 */
import { expect } from 'vitest';
import type BetterSqlite3 from 'better-sqlite3';

export type RowPin = {
  /** Table to read from. */
  table: string;
  /** A WHERE clause without the keyword, narrowing to the rows the test cares about. */
  where: string;
  /** Positional bindings for the clause. */
  params: unknown[];
  /** Primary-key column, for the rare table that does not call it `id`. */
  idColumn: string;
};

/**
 * Describe the rows a test is watching. The same description is used for the
 * snapshot and for the read that follows it, so the two cannot drift apart.
 */
export function rowPin(
  table: string,
  where: string,
  params: unknown[] = [],
  idColumn = 'id',
): RowPin {
  return { table, where, params, idColumn };
}

/** The ids matching the pin right now. Call this BEFORE the action under test. */
export function snapshotIds(db: BetterSqlite3.Database, pin: RowPin): Set<string> {
  return new Set(allMatching<Record<string, string>>(db, pin).map((r) => r[pin.idColumn]));
}

/**
 * The rows matching the pin that were not present in the snapshot. Call AFTER
 * the action.
 */
export function rowsAddedSince<T>(
  db: BetterSqlite3.Database,
  pin: RowPin,
  before: Set<string>,
): T[] {
  return allMatching<T>(db, pin).filter(
    (r) => !before.has((r as Record<string, string>)[pin.idColumn]),
  );
}

/**
 * Every column of every matching row. Whole rows rather than a caller-supplied
 * column list: a list is a SQL fragment sitting next to a TypeScript type that
 * nothing checks it against, so the two drift silently, and reading a few extra
 * columns in a test costs nothing.
 */
function allMatching<T>(db: BetterSqlite3.Database, pin: RowPin): T[] {
  return db
    .prepare(`SELECT * FROM ${pin.table} WHERE ${pin.where}`)
    .all(...pin.params) as T[];
}

/**
 * The single row matching the pin, for the common case where the test controls a
 * key that is unique by construction: a member it just created, a per-case email
 * address, a caption it generated. The row is identified outright, so no
 * snapshot is needed and no ordering is involved.
 *
 * Prefer this to ordering by a timestamp even where only one row can match
 * today. The two read the same at the call site and behave differently the day
 * a second row appears: this one fails and names the count, while the ordering
 * quietly starts choosing between them.
 */
export function theOnlyRow<T>(db: BetterSqlite3.Database, pin: RowPin): T {
  const rows = db
    .prepare(`SELECT * FROM ${pin.table} WHERE ${pin.where}`)
    .all(...pin.params) as T[];
  expect(
    rows.length,
    `expected exactly one ${pin.table} row matching "${pin.where}", got ${rows.length}`,
  ).toBe(1);
  return rows[0];
}

/**
 * The single row the action added. Fails naming the count when the action wrote
 * none or several, because either is a real finding about the code under test
 * and neither should surface later as a confusing value mismatch.
 */
export function oneRowAddedSince<T>(
  db: BetterSqlite3.Database,
  pin: RowPin,
  before: Set<string>,
): T {
  const added = rowsAddedSince<T>(db, pin, before);
  expect(
    added.length,
    `expected the action to add exactly one ${pin.table} row matching "${pin.where}", got ${added.length}`,
  ).toBe(1);
  return added[0];
}
