/**
 * The real-data gates the staging leg requires, read from the one list that
 * declares them: REQUIRED_GATES in scripts/realdata-staging.sh.
 *
 * Tests compare the gates a run actually printed against this list rather than
 * against a count of their own, so adding a gate to the checks and to the list is
 * the whole change, and a check that stops printing its line still fails.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

const STAGING_SCRIPT = path.resolve(__dirname, '..', '..', 'scripts', 'realdata-staging.sh');

export function requiredRealdataGates(): string[] {
  const match = /^REQUIRED_GATES=\(([^)]*)\)$/m.exec(fs.readFileSync(STAGING_SCRIPT, 'utf8'));
  if (!match) throw new Error(`no REQUIRED_GATES=(...) line in ${STAGING_SCRIPT}`);
  return match[1].trim().split(/\s+/);
}

/** The gate ids in a set of `GATE: <id> <verdict>: ...` lines, in order. */
export function gateIds(lines: string[]): string[] {
  return lines.flatMap((l) => /^GATE: (\S+) /.exec(l)?.[1] ?? []);
}
