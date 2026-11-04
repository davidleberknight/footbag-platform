/**
 * Samples of dnf output, kept as text files beside this module, for the tests of
 * the host-side code that parses them.
 *
 * Each file opens with `# ` header lines: where the sample came from and, for a
 * `dnf check-update` listing, `# expected-rows: <n>`, the number of update rows a
 * person counted in it. The header is not dnf output and is stripped here, so a
 * stand-in dnf prints exactly the lines the host printed.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface DnfSample {
  /** The output as dnf printed it, header removed. */
  body: string;
  /** The update rows the header says the listing holds, when it says. */
  expectedRows?: number;
}

export function readDnfSample(name: string): DnfSample {
  const lines = readFileSync(join(__dirname, name), 'utf-8').split('\n');
  let i = 0;
  let expectedRows: number | undefined;
  for (; i < lines.length && lines[i].startsWith('# '); i++) {
    const m = /^# expected-rows: (\d+)$/.exec(lines[i]);
    if (m) expectedRows = Number(m[1]);
  }
  return { body: lines.slice(i).join('\n'), expectedRows };
}
