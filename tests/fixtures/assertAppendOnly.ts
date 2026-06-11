/**
 * Shared assertion: a ledger row is append-only at the database layer.
 *
 * The platform's immutable ledgers (audit, tier grants, Active-Player grants and
 * vouches, system config, payment transitions, erasure log, vote/ballot tables)
 * carry BEFORE UPDATE / BEFORE DELETE triggers that RAISE(ABORT). Asserting the
 * trigger actually fires — rather than trusting that services merely never call
 * UPDATE/DELETE — is the difference between testing a convention and testing an
 * enforced invariant. Centralizing the assertion keeps every ledger's
 * immutability check one line at the call site.
 */
import type BetterSqlite3 from 'better-sqlite3';
import { expect } from 'vitest';

export function assertAppendOnly(
  db: BetterSqlite3.Database,
  table: string,
  id: string,
  idColumn = 'id',
): void {
  // A no-op SET still issues an UPDATE statement, so the BEFORE UPDATE trigger
  // fires on the matched row and aborts.
  expect(
    () => db.prepare(`UPDATE ${table} SET created_at = created_at WHERE ${idColumn} = ?`).run(id),
    `${table}: UPDATE must be rejected by the immutability trigger`,
  ).toThrow();
  expect(
    () => db.prepare(`DELETE FROM ${table} WHERE ${idColumn} = ?`).run(id),
    `${table}: DELETE must be rejected by the immutability trigger`,
  ).toThrow();
}
