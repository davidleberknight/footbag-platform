/**
 * Where the stub payment adapter keeps the records the simulated provider holds.
 *
 * Real Stripe is one ledger that every process of the platform reads: the web
 * process creates checkouts and receives webhooks, the worker runs the nightly
 * comparison and closes abandoned checkouts, and the testkit seeds and inspects.
 * A stub that kept those records in each process's memory would show the worker
 * an empty provider, so every checkout a tester made would be reported missing
 * at the provider, and a restart would erase the provider's history. The
 * directory store keeps one file per record beside the database, which the web
 * and worker containers already share; each write lands whole through a rename,
 * so a reader in another process never sees half a record.
 *
 * The memory store serves the test runner, where each test file owns its stub
 * and nothing crosses a process. Both stores keep insertion order and keep a
 * record's place when it is overwritten, as a Map does.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

export interface StubLedgerTable<T> {
  get(id: string): T | undefined;
  has(id: string): boolean;
  set(id: string, value: T): void;
  delete(id: string): void;
  /** Every id, in the order each was first written. */
  ids(): string[];
  values(): T[];
  clear(): void;
}

export interface StubLedgerStore {
  table<T>(kind: string): StubLedgerTable<T>;
}

export function createMemoryLedgerStore(): StubLedgerStore {
  const tables = new Map<string, Map<string, unknown>>();
  return {
    table<T>(kind: string): StubLedgerTable<T> {
      let rows = tables.get(kind) as Map<string, T> | undefined;
      if (!rows) {
        rows = new Map<string, T>();
        tables.set(kind, rows as Map<string, unknown>);
      }
      const map = rows;
      return {
        get: (id) => map.get(id),
        has: (id) => map.has(id),
        set: (id, value) => { map.set(id, value); },
        delete: (id) => { map.delete(id); },
        ids: () => [...map.keys()],
        values: () => [...map.values()],
        clear: () => { map.clear(); },
      };
    },
  };
}

interface StoredRecord<T> {
  seq: number;
  value: T;
}

// A provider id is a short token of letters, digits and underscores; anything
// else would let a crafted id name a file outside the store.
const SAFE_ID = /^[A-Za-z0-9_-]{1,200}$/;
const SAFE_KIND = /^[a-z_]{1,40}$/;

let writeCounter = 0;
let lastSeq = 0;

// A record's place: the write time in microseconds, so records written by
// different processes sort by when they were written, and never at or below
// this process's previous place, so two writes in one millisecond keep their order.
function nextSeq(): number {
  lastSeq = Math.max(Date.now() * 1000, lastSeq + 1);
  return lastSeq;
}

export function createDirectoryLedgerStore(dir: string): StubLedgerStore {
  return {
    table<T>(kind: string): StubLedgerTable<T> {
      if (!SAFE_KIND.test(kind)) throw new Error(`Stub ledger: invalid table name ${kind}`);
      const tableDir = path.join(dir, kind);
      fs.mkdirSync(tableDir, { recursive: true });

      const fileFor = (id: string): string => {
        if (!SAFE_ID.test(id)) throw new Error(`Stub ledger: invalid record id ${id}`);
        return path.join(tableDir, `${id}.json`);
      };
      const read = (file: string): StoredRecord<T> | undefined => {
        try {
          return JSON.parse(fs.readFileSync(file, 'utf8')) as StoredRecord<T>;
        } catch (err) {
          if ((err as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
          throw err;
        }
      };
      const records = (): Array<[string, StoredRecord<T>]> => {
        const out: Array<[string, StoredRecord<T>]> = [];
        for (const name of fs.readdirSync(tableDir)) {
          if (!name.endsWith('.json')) continue;
          const rec = read(path.join(tableDir, name));
          if (rec) out.push([name.slice(0, -'.json'.length), rec]);
        }
        return out.sort((a, b) => a[1].seq - b[1].seq || (a[0] < b[0] ? -1 : 1));
      };

      return {
        get: (id) => read(fileFor(id))?.value,
        has: (id) => fs.existsSync(fileFor(id)),
        set: (id, value) => {
          const file = fileFor(id);
          const seq = read(file)?.seq ?? nextSeq();
          const tmp = `${file}.${process.pid}.${writeCounter++}.tmp`;
          fs.writeFileSync(tmp, JSON.stringify({ seq, value } satisfies StoredRecord<T>));
          fs.renameSync(tmp, file);
        },
        delete: (id) => { fs.rmSync(fileFor(id), { force: true }); },
        ids: () => records().map(([id]) => id),
        values: () => records().map(([, rec]) => rec.value),
        clear: () => {
          for (const name of fs.readdirSync(tableDir)) fs.rmSync(path.join(tableDir, name), { force: true });
        },
      };
    },
  };
}

/** A read-only Map view over one table, for callers that read the stub's
 *  sessions as a map. */
export function tableAsReadonlyMap<T>(table: StubLedgerTable<T>): ReadonlyMap<string, T> {
  const entries = (): Array<[string, T]> =>
    table.ids().flatMap((id) => {
      const v = table.get(id);
      return v === undefined ? [] : [[id, v] as [string, T]];
    });
  return {
    get: (id: string) => table.get(id),
    has: (id: string) => table.has(id),
    get size() { return table.ids().length; },
    forEach(cb: (value: T, key: string, map: ReadonlyMap<string, T>) => void, thisArg?: unknown) {
      for (const [k, v] of entries()) cb.call(thisArg, v, k, this);
    },
    entries: () => entries()[Symbol.iterator](),
    keys: () => entries().map(([k]) => k)[Symbol.iterator](),
    values: () => entries().map(([, v]) => v)[Symbol.iterator](),
    [Symbol.iterator]: () => entries()[Symbol.iterator](),
  } as ReadonlyMap<string, T>;
}
