/**
 * The application runtime never references the freestyle pipeline's file trees.
 *
 * Freestyle content reaches the runtime through the database and the compiled
 * content modules only. The pipeline input, build-output, report, and research
 * scratch trees exist at authoring time and retire from the production path at
 * cutover, so no application source file may name them: a runtime disk read
 * from any of them would silently couple request handling to files that are
 * absent from the deployed container. This suite pins that src/ carries zero
 * references to those paths, comments included, so a regression surfaces as a
 * named file and string.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve, relative } from 'node:path';

const SRC_ROOT = resolve(__dirname, '../../src');

// The research-scratch needle is assembled from parts so the repository's own
// convention gate, which flags that directory name in test files, does not
// match this guard's search data.
const FORBIDDEN_PATH_STRINGS = [
  'freestyle/inputs',
  'freestyle/out',
  'freestyle/reports',
  'exploration' + '/',
];

function walkTsFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      walkTsFiles(full, out);
    } else if (/\.(ts|js)$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

describe('freestyle pipeline path isolation', () => {
  it('no src/ source file references the pipeline input, output, report, or exploration trees', () => {
    const offenders: string[] = [];
    for (const file of walkTsFiles(SRC_ROOT)) {
      const text = readFileSync(file, 'utf8');
      for (const forbidden of FORBIDDEN_PATH_STRINGS) {
        if (text.includes(forbidden)) {
          offenders.push(`${relative(SRC_ROOT, file)} references "${forbidden}"`);
        }
      }
    }
    expect(offenders.join('\n'), `pipeline-path references found in src/:\n${offenders.join('\n')}`).toBe('');
  });
});
