/**
 * Builds a copy of the production database from a snapshot.
 *
 * Once production is live, every non-production database is a copy of it: one
 * tested operator script makes the copy on the production host from a
 * snapshot, building a fresh database at production's migration level table by
 * table, removing every credential and payment-provider identifier and keeping
 * everything else, member personal data included (design decision "Migrations
 * and Non-production Databases with a Live Production Database", DD §1.18).
 * This service is that build; the operator script runs it through
 * `runProductionCopy`.
 *
 * Owns:
 * - following the column register (`src/lib/copyColumnRegister.ts`) table by
 *   table and column by column: keep, drop (written as null), rewrite (the
 *   expression the database module holds for it), or not copied at all;
 * - refusing a snapshot whose tables or columns the register does not name
 *   exactly, before anything is written, so a column nobody decided on can
 *   never reach a copy;
 * - resetting the in-database cutover marker and appending the copy marker,
 *   which the development test routes read to serve synthetic personas only;
 * - proving the result before it is handed over: integrity and foreign keys
 *   clean, every dropped column empty, every residue check at zero, and no
 *   provider identifier left in a JSON column.
 *
 * Does not own: taking the snapshot, placing or moving the finished file, or
 * adding the synthetic personas, which the receiving environment seeds.
 *
 * Required patterns:
 * - The connection the database module holds is the fresh file being built;
 *   the snapshot is attached beside it read-only in practice and is never
 *   written. A target file that already holds any schema object is refused, so
 *   the build can never run over a live database.
 * - The schema is the snapshot's own, object by object in creation order, so
 *   the copy sits at whatever migration level production is at. Tables are
 *   created and loaded first and indexes, views and triggers afterwards, so
 *   append-only triggers never meet the load.
 * - The load commits once. Any refusal throws, and the caller deletes the file.
 *
 * Persistence: writes only the fresh copy. Side effects: none; no audit row,
 * because the database it would be written to is the copy itself.
 */
import { randomUUID } from 'node:crypto';
import {
  COPY_COLUMN_REGISTER,
  isCopied,
  type CopiedTable,
} from '../lib/copyColumnRegister';
import { carriesProviderIds } from '../lib/productionCopy';
import {
  PRODUCTION_COPY_RESIDUE_CHECKS,
  PRODUCTION_COPY_REWRITES,
  PRODUCTION_COPY_ROW_FILTERS,
  productionCopy,
} from '../db/db';

export interface ProductionCopyReport {
  copiedAt: string;
  tables: Array<{ table: string; rows: number }>;
  notCopied: string[];
}

/** A snapshot or a result the copy will not accept, with every reason it found. */
export class ProductionCopyRefusal extends Error {
  constructor(readonly reasons: string[]) {
    super(`production copy refused: ${reasons.join('; ')}`);
    this.name = 'ProductionCopyRefusal';
  }
}

function columnPlan(table: string, entry: CopiedTable): Array<{ name: string; expression: string }> {
  const rewrites = PRODUCTION_COPY_REWRITES[table] ?? {};
  return [
    ...entry.keep.map((name) => ({ name, expression: `"${name}"` })),
    ...Object.keys(entry.drop ?? {}).map((name) => ({ name, expression: 'NULL' })),
    ...Object.keys(entry.rewrite ?? {}).map((name) => ({ name, expression: rewrites[name] })),
  ];
}

/** The register and the database module's rewrite expressions name the same columns. */
function rewriteMismatches(): string[] {
  const problems: string[] = [];
  for (const [table, entry] of Object.entries(COPY_COLUMN_REGISTER)) {
    if (!isCopied(entry)) continue;
    for (const column of Object.keys(entry.rewrite ?? {})) {
      if (!PRODUCTION_COPY_REWRITES[table]?.[column]) problems.push(`no rewrite expression for ${table}.${column}`);
    }
    if (Object.keys(entry.mask ?? {}).length > 0) problems.push(`${table} masks a column, and the copy has no mask`);
  }
  for (const [table, columns] of Object.entries(PRODUCTION_COPY_REWRITES)) {
    const entry = COPY_COLUMN_REGISTER[table];
    for (const column of Object.keys(columns)) {
      if (!entry || !isCopied(entry) || !(column in (entry.rewrite ?? {}))) {
        problems.push(`a rewrite expression for ${table}.${column}, which the register does not mark rewrite`);
      }
    }
  }
  return problems;
}

/** Every difference between the snapshot's tables and columns and the register. */
function registerMismatches(snapshotTables: string[]): string[] {
  const problems: string[] = [];
  const registered = Object.keys(COPY_COLUMN_REGISTER);
  for (const table of snapshotTables) {
    if (!registered.includes(table)) problems.push(`table ${table} is not in the register`);
  }
  for (const table of registered) {
    if (!snapshotTables.includes(table)) problems.push(`the register names table ${table}, which the snapshot lacks`);
  }
  for (const table of snapshotTables) {
    const entry = COPY_COLUMN_REGISTER[table];
    if (!entry || !isCopied(entry)) continue;
    const named = columnPlan(table, entry).map((c) => c.name);
    const actual = productionCopy.listSnapshotColumns(table);
    for (const column of actual) {
      if (!named.includes(column)) problems.push(`column ${table}.${column} is not in the register`);
    }
    for (const column of named) {
      if (!actual.includes(column)) problems.push(`the register names ${table}.${column}, which the snapshot lacks`);
    }
  }
  return problems;
}

function residueProblems(): string[] {
  const problems: string[] = [];
  for (const [table, entry] of Object.entries(COPY_COLUMN_REGISTER)) {
    if (!isCopied(entry)) {
      if (productionCopy.countRows(table, null) > 0) problems.push(`table ${table} holds rows`);
      continue;
    }
    for (const column of Object.keys(entry.drop ?? {})) {
      if (productionCopy.countNonNull(table, column) > 0) problems.push(`dropped column ${table}.${column} holds values`);
    }
  }
  for (const check of PRODUCTION_COPY_RESIDUE_CHECKS) {
    const n = productionCopy.countRows(check.table, check.offending);
    if (n > 0) problems.push(`${n} row(s) with ${check.label}`);
  }
  for (const [table, columns] of Object.entries(PRODUCTION_COPY_REWRITES)) {
    for (const [column, expression] of Object.entries(columns)) {
      if (!expression.startsWith('copy_strip_provider_ids(')) continue;
      for (const { value } of productionCopy.iterateColumn(table, column)) {
        if (carriesProviderIds(value)) {
          problems.push(`${table}.${column} still carries a provider identifier`);
          break;
        }
      }
    }
  }
  return problems;
}

export const productionCopyService = {
  /**
   * Build the copy into the connection's own, empty file from the snapshot at
   * `snapshotPath`. Throws ProductionCopyRefusal, with every reason, when the
   * target is not empty, the snapshot and the register disagree, or the result
   * fails any check; the caller then deletes the file.
   */
  buildFromSnapshot(snapshotPath: string, now: Date = new Date()): ProductionCopyReport {
    if (productionCopy.countOwnSchemaObjects() > 0) {
      throw new ProductionCopyRefusal(['the file the copy is built into already holds a schema']);
    }
    const planProblems = rewriteMismatches();
    if (planProblems.length > 0) throw new ProductionCopyRefusal(planProblems);

    productionCopy.attachSnapshot(snapshotPath);
    try {
      const objects = productionCopy.listSnapshotObjects();
      const tables = objects.filter((o) => o.type === 'table').map((o) => o.name);
      const mismatches = registerMismatches(tables);
      if (mismatches.length > 0) throw new ProductionCopyRefusal(mismatches);

      const copiedAt = now.toISOString();
      const report: ProductionCopyReport = { copiedAt, tables: [], notCopied: [] };
      productionCopy.registerFunctions();
      productionCopy.setForeignKeys(false);
      productionCopy.inOneTransaction(() => {
        for (const object of objects) if (object.type === 'table') productionCopy.createObject(object.sql);
        for (const table of tables) {
          const entry = COPY_COLUMN_REGISTER[table];
          if (!isCopied(entry)) {
            report.notCopied.push(table);
            continue;
          }
          const rows = productionCopy.copyTable(table, columnPlan(table, entry), PRODUCTION_COPY_ROW_FILTERS[table] ?? null);
          report.tables.push({ table, rows });
        }
        for (const object of objects) if (object.type !== 'table') productionCopy.createObject(object.sql);
        productionCopy.appendCopyMarker(
          `config_production_copy_${randomUUID()}`,
          copiedAt,
          JSON.stringify({ copied_at: copiedAt }),
          'This database is a copy of production, with credentials and payment-provider identifiers removed',
        );
      });
      productionCopy.setForeignKeys(true);

      const problems: string[] = [];
      const integrity = productionCopy.integrityCheck();
      if (integrity.length !== 1 || integrity[0] !== 'ok') problems.push(`integrity check: ${integrity.join(', ')}`);
      const fkViolations = productionCopy.foreignKeyViolations();
      if (fkViolations > 0) problems.push(`${fkViolations} foreign-key violation(s)`);
      problems.push(...residueProblems());
      if (problems.length > 0) throw new ProductionCopyRefusal(problems);
      return report;
    } finally {
      productionCopy.detachSnapshot();
    }
  },

  /** Fold the copy into one self-contained file once it has passed every check. */
  settle(): void {
    productionCopy.settleToSingleFile();
  },
};
