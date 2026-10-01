/**
 * Make one step of a multi-step operation fail, against the real database.
 *
 * The defects this exists for live after an earlier step has already happened:
 * a provider call succeeded and the write recording it fails, or a row is
 * claimed and the side effect that should accompany it fails. A happy-path test
 * never reaches that state, so the question "what is left behind" goes
 * unasked. These helpers reach it without mocking the database: they install a
 * real SQLite trigger (or rename a real table) through a second connection, and
 * the code under test meets the failure exactly as it would meet a full disk or
 * a constraint it did not expect.
 *
 * - `armWriteFault` lets the first `after` matching statements through, then
 *   aborts every later one with `message` until disarmed. Counting is per row
 *   that fires the trigger (and satisfies `when`, if given); an aborted
 *   statement is rolled back with its own counter update, so once tripped the
 *   fault stays tripped.
 * - `armReadFault` renames a table away so the next statement reading it fails
 *   with "no such table". It is for read-then-consume flows that have no write
 *   to fault before the step that matters.
 *
 * Always disarm in a `finally`: a fault left armed leaks into every later case
 * in the file. Each arming uses names of its own, so two faults can be armed at
 * once. A case whose fault drives a `logger.error()` opts in with
 * `expectLoggedError(pattern)` as usual.
 */
import BetterSqlite3 from 'better-sqlite3';

export type FaultOp = 'INSERT' | 'UPDATE' | 'DELETE';

export interface WriteFaultSpec {
  table: string;
  op: FaultOp;
  /** Matching statements allowed through before the fault trips. */
  after?: number;
  /** A trigger WHEN condition over NEW/OLD, so the fault hits one specific
   *  write (for example `NEW.status = 'sent'`) and lets the table's other
   *  writes through, including the ones a failure path makes afterwards. */
  when?: string;
  message?: string;
}

export interface ArmedFault {
  disarm(): void;
}

const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;
let seq = 0;

function assertIdent(name: string): void {
  if (!IDENT.test(name)) throw new Error(`faultInjection: not a plain table name: ${name}`);
}

function withDb(dbPath: string, fn: (db: BetterSqlite3.Database) => void): void {
  const db = new BetterSqlite3(dbPath);
  try {
    fn(db);
  } finally {
    db.close();
  }
}

export function armWriteFault(dbPath: string, spec: WriteFaultSpec): ArmedFault {
  assertIdent(spec.table);
  const after = spec.after ?? 0;
  if (!Number.isInteger(after) || after < 0) {
    throw new Error(`faultInjection: after must be a non-negative integer, got ${after}`);
  }
  const message = (spec.message ?? `injected ${spec.op} fault on ${spec.table}`).replace(/'/g, "''");
  seq += 1;
  const suffix = `${process.pid}_${seq}`;
  const counter = `fault_injection_counter_${suffix}`;
  const trigger = `fault_injection_trigger_${suffix}`;

  withDb(dbPath, (db) => {
    db.exec(`
      CREATE TABLE ${counter} (n INTEGER NOT NULL);
      INSERT INTO ${counter} (n) VALUES (0);
      CREATE TRIGGER ${trigger} BEFORE ${spec.op} ON ${spec.table}
      ${spec.when ? `WHEN ${spec.when}` : ''}
      BEGIN
        UPDATE ${counter} SET n = n + 1;
        SELECT RAISE(ABORT, '${message}') WHERE (SELECT n FROM ${counter}) > ${after};
      END;
    `);
  });

  let armed = true;
  return {
    disarm() {
      if (!armed) return;
      armed = false;
      withDb(dbPath, (db) => {
        db.exec(`DROP TRIGGER IF EXISTS ${trigger}; DROP TABLE IF EXISTS ${counter};`);
      });
    },
  };
}

export function armReadFault(dbPath: string, table: string): ArmedFault {
  assertIdent(table);
  seq += 1;
  const parked = `fault_injection_parked_${process.pid}_${seq}`;
  withDb(dbPath, (db) => {
    db.exec(`ALTER TABLE ${table} RENAME TO ${parked};`);
  });
  let armed = true;
  return {
    disarm() {
      if (!armed) return;
      armed = false;
      withDb(dbPath, (db) => {
        db.exec(`ALTER TABLE ${parked} RENAME TO ${table};`);
      });
    },
  };
}
