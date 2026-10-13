// The pipeline's copy of the claim step's name fold agrees with the claim step.
//
// The duplicate-account merge and the record-to-account linking run in Python
// before any member claims anything, and they decide "same name" with a port of
// the application's fold. If the two drifted, the pipeline would link a record
// the claim step then refuses, or leave unlinked one it accepts. So every name
// below is folded by the application's own functions and by the Python port in
// one run, and the two answers must be identical.
import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { foldNameWords, nameMatchParts } from '../../src/services/nameUtils';
import { SPAWN_GUARD } from '../fixtures/spawnGuard';

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const LEGACY = path.join(REPO_ROOT, 'legacy_data');

// The pipeline's own interpreter when its virtual environment exists, else the
// one on the path, as the other suites that run the pipeline's Python do. The
// port needs only the standard library.
function resolvePython(): string {
  for (const candidate of [process.env.VENV_DIR, '.venv', 'footbag_venv', 'venv']) {
    if (!candidate) continue;
    const bin = path.resolve(LEGACY, candidate, 'bin', 'python');
    if (existsSync(bin)) return bin;
  }
  return 'python3';
}

// Each name exercises one branch of the fold: accents and special letters,
// quoted nicknames in straight and curly quotes, apostrophes and full stops,
// hyphens and dashes, suffixes, initials, a name that is mostly initials, extra
// whitespace, compatibility forms, and the empty cases.
const NAMES: readonly string[] = [
  'José "Pepe" Ó\'Brien-Sørensen Jr.',
  'Łukasz Straße Æble Œuvre Đorđe Þór III',
  'J. Robert Smith',
  'J Smith',
  'Chris “Gator” Routh',
  "Chris 'Gator' Routh",
  'Brenda Marie Solonoski',
  'Lisa McDaniel Jones',
  'Kevin Finnbarr Staveley-O’carroll',
  'Anna–Maria   van der Berg',
  'Samuel Rodriguez III',
  'Sr',
  'ＪＯＨＮ　ＤＯＥ',
  'Zoë Saldaña-Pérez II',
  'Mary-Kate O`Neil, Jr',
  'A B',
  '',
];

function pythonFold(names: readonly string[]): Array<{ words: string[]; first: string; later: string[] }> {
  const program = [
    'import json, sys',
    `sys.path.insert(0, ${JSON.stringify(LEGACY)})`,
    'from pipeline.identity import name_match as nm',
    'out = []',
    'for n in json.load(sys.stdin):',
    '    p = nm.name_match_parts(n)',
    '    out.append({"words": nm.fold_name_words(n), "first": p.first, "later": list(p.later)})',
    'print(json.dumps(out))',
  ].join('\n');
  const r = spawnSync(resolvePython(), ['-I', '-c', program], {
    input: JSON.stringify(names),
    encoding: 'utf8',
    env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' },
    ...SPAWN_GUARD,
  });
  if (r.status !== 0) throw new Error(`python port failed: ${r.stderr || r.error?.message}`);
  return JSON.parse(r.stdout);
}

describe('pipeline name fold parity with the claim step', () => {
  it('folds and splits every name exactly as the application does', () => {
    const py = pythonFold(NAMES);
    expect(py).toHaveLength(NAMES.length);
    NAMES.forEach((name, i) => {
      const ts = nameMatchParts(name);
      expect(py[i], `name ${JSON.stringify(name)}`).toEqual({
        words: foldNameWords(name),
        first: ts.first,
        later: ts.later,
      });
    });
  });
});
