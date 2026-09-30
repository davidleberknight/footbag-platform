/**
 * scripts/pin-npm-package.sh, the only way an npm version pin changes.
 *
 * Contract: a pin moves only to an exact, published version, never down unless
 * asked, only when package.json and the lockfile start in step, and only when the
 * lockfile moves no package but the named one unless the caller accepts the rest.
 * Every refusal leaves both files byte-identical. A result the version-pin gate
 * refuses is restored. A pin already in place is a harmless re-run.
 *
 * Each case runs a copy of the script in a throwaway tree holding a fixture
 * package.json and lockfile, a stub npm behind the script's seam, and a stub
 * version-pin gate. The stub npm resolves the lock by writing each declared
 * version into that package's lock entry, so no registry is reached.
 */
import { describe, it, expect, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, copyFileSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { SPAWN_GUARD } from '../fixtures/spawnGuard';
import { createScratchDir, removeScratch } from '../fixtures/scratchDir';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SCRIPT = join(REPO_ROOT, 'scripts', 'pin-npm-package.sh');
const scratch = createScratchDir('pin-npm');
afterAll(() => removeScratch(scratch));
let seq = 0;

/**
 * The stub npm. `view` answers for the versions in STUB_PUBLISHED; a lock-only
 * install writes every declared version into its lock entry (and moves
 * STUB_COLLATERAL's entry too, when set); `ci` exits STUB_CI_EXIT; `ls` reports
 * the lock's versions; `audit` reports none. Every call is logged.
 */
const STUB_NPM = [
  '#!/usr/bin/env bash',
  'echo "npm $*" >> "$STUB_LOG"',
  'dir="."',
  'if [[ "$1" == "--prefix" ]]; then dir="$2"; shift 2; fi',
  'case "$1" in',
  '  view)',
  '    v="${2##*@}"',
  '    [[ " ${STUB_PUBLISHED:-} " == *" $v "* ]] && echo "$v"',
  '    exit 0 ;;',
  '  install)',
  '    jq --indent 2 --slurpfile p "$dir/package.json" --arg c "${STUB_COLLATERAL:-}" \'',
  '      (($p[0].dependencies // {}) + ($p[0].devDependencies // {}) + ($p[0].overrides // {})) as $want',
  '      # The collateral package moves only when a declared version actually changes.',
  '      | ([.packages | to_entries[] | (.key | sub("^.*node_modules/"; "")) as $n',
  '          | select((($want[$n] // null) | type) == "string" and $want[$n] != .value.version)] | length > 0) as $changing',
  '      | .packages |= with_entries(',
  '          (.key | sub("^.*node_modules/"; "")) as $n',
  '          | if (($want[$n] // null) | type) == "string" then .value.version = $want[$n]',
  '            elif ($changing and $c != "" and $n == $c) then .value.version = "9.9.9" else . end)\' \\',
  '      "$dir/package-lock.json" > "$dir/package-lock.json.tmp"',
  '    # Like npm, an install that resolves to the same lock leaves the file untouched.',
  '    if [[ "$(jq -S . "$dir/package-lock.json")" == "$(jq -S . "$dir/package-lock.json.tmp")" ]]; then',
  '      rm "$dir/package-lock.json.tmp"',
  '    else',
  '      mv "$dir/package-lock.json.tmp" "$dir/package-lock.json"',
  '    fi',
  '    exit 0 ;;',
  '  ci) exit "${STUB_CI_EXIT:-0}" ;;',
  '  ls)',
  '    jq --arg n "$2" \'{dependencies: (.packages | with_entries(select(.key | endswith("node_modules/" + $n))) | to_entries | map({key: $n, value: {version: .value.version}}) | from_entries)}\' "$dir/package-lock.json"',
  '    exit 0 ;;',
  '  audit) echo \'{"metadata":{"vulnerabilities":{"total":0,"high":0,"critical":0}}}\'; exit 0 ;;',
  'esac',
  'exit 0',
  '',
].join('\n');

const PACKAGE = {
  name: 'fixture',
  version: '1.0.0',
  dependencies: { express: '5.1.0' },
  devDependencies: { eslint: '10.4.1' },
  overrides: { 'brace-expansion': '5.0.9', qs: '6.16.0', minimist: { '.': '1.2.8' } },
};
const entry = (version: string) => ({ version, resolved: `https://registry.npmjs.org/x/-/x-${version}.tgz`, integrity: `sha512-${version}` });
const LOCK = {
  name: 'fixture',
  lockfileVersion: 3,
  packages: {
    '': { name: 'fixture', version: '1.0.0' },
    'node_modules/express': entry('5.1.0'),
    'node_modules/eslint': entry('10.4.1'),
    'node_modules/brace-expansion': entry('5.0.9'),
    'node_modules/qs': entry('6.16.0'),
    'node_modules/minimatch': entry('10.2.5'),
    'node_modules/debug': entry('4.4.0'),
  },
};

interface Opts {
  published?: string;
  collateral?: string;
  ciExit?: number;
  gateExit?: number;
  nvmrc?: string;
  lock?: object;
  pkg?: object;
}

function run(args: string[], o: Opts = {}) {
  const tree = join(scratch, `tree-${++seq}`);
  mkdirSync(join(tree, 'scripts', 'ci'), { recursive: true });
  mkdirSync(join(tree, 'bin'), { recursive: true });
  copyFileSync(SCRIPT, join(tree, 'scripts', 'pin-npm-package.sh'));
  writeFileSync(join(tree, 'scripts', 'ci', 'check_version_pins.sh'), `#!/usr/bin/env bash\nexit ${o.gateExit ?? 0}\n`);
  writeFileSync(join(tree, 'bin', 'npm'), STUB_NPM, { mode: 0o755 });
  const node = spawnSync('node', ['-v'], { encoding: 'utf8', ...SPAWN_GUARD }).stdout.trim().replace(/^v/, '');
  writeFileSync(join(tree, '.nvmrc'), `${o.nvmrc ?? node}\n`);
  const pkgText = `${JSON.stringify(o.pkg ?? PACKAGE, null, 2)}\n`;
  const lockText = `${JSON.stringify(o.lock ?? LOCK, null, 2)}\n`;
  writeFileSync(join(tree, 'package.json'), pkgText);
  writeFileSync(join(tree, 'package-lock.json'), lockText);
  const log = join(tree, 'npm.log');
  const res = spawnSync('bash', [join(tree, 'scripts', 'pin-npm-package.sh'), ...args], {
    encoding: 'utf8',
    env: {
      ...process.env,
      FOOTBAG_NPM_BIN: join(tree, 'bin', 'npm'),
      STUB_LOG: log,
      STUB_PUBLISHED: o.published ?? '5.0.12 6.16.0 10.4.1 10.5.0 5.1.0 5.2.0 4.4.0 4.3.0',
      STUB_COLLATERAL: o.collateral ?? '',
      STUB_CI_EXIT: String(o.ciExit ?? 0),
    },
    ...SPAWN_GUARD,
  });
  const pkgAfter = readFileSync(join(tree, 'package.json'), 'utf8');
  const lockAfter = readFileSync(join(tree, 'package-lock.json'), 'utf8');
  return {
    status: res.status,
    out: `${res.stdout ?? ''}${res.stderr ?? ''}`,
    unchanged: pkgAfter === pkgText && lockAfter === lockText,
    pkg: JSON.parse(pkgAfter),
    lock: JSON.parse(lockAfter),
    calls: existsSync(log) ? readFileSync(log, 'utf8') : '',
  };
}

describe('pin-npm-package.sh: what it refuses, leaving both files untouched', () => {
  // Defect caught: a mistyped or missing argument is ignored and the run goes on.
  it('refuses an unknown argument and a missing version as usage errors', () => {
    expect(run(['--nope', 'qs', '6.16.0']).status).toBe(2);
    expect(run(['qs']).status).toBe(2);
    expect(run(['--override', '--remove-override', 'qs']).status).toBe(2);
  });

  // Each row: a request the design forbids, and the reason the refusal gives.
  it.each<[string, string[], Opts, string]>([
    ['a range', ['brace-expansion', '^5.0.12'], {}, 'not an exact version'],
    ['a version the registry does not publish', ['brace-expansion', '5.0.13'], {}, 'does not publish'],
    ['a downgrade without --allow-downgrade', ['eslint', '10.3.0'], { published: '10.3.0' }, 'lower than the pinned'],
    ['a transitive package without --override', ['debug', '4.3.0'], {}, 'pass --override'],
    ['--override on a direct dependency', ['--override', 'express', '5.2.0'], {}, 'is a direct dependency'],
    ['an override in nested form', ['minimist', '1.2.8'], { published: '1.2.8' }, 'not a plain version string'],
    ['a Node other than the pinned one', ['brace-expansion', '5.0.12'], { nvmrc: '0.0.1' }, 'resolves under the Node'],
    ['an override for a package the lock does not hold', ['--override', 'left-pad', '1.3.0'], { published: '1.3.0' }, 'not in the lockfile'],
    ['a change that moves another package in the lock', ['brace-expansion', '5.0.12'], { collateral: 'debug' }, 'other than brace-expansion'],
    ['a new lock that does not install', ['brace-expansion', '5.0.12'], { ciExit: 1 }, 'npm ci from the new lock failed'],
    ['a package.json and lock already out of step', ['brace-expansion', '5.0.12'],
      { lock: { ...LOCK, packages: { ...LOCK.packages, 'node_modules/qs': entry('6.15.0') } } }, 'out of step'],
  ])('refuses %s', (_label, args, opts, reason) => {
    const r = run(args, opts);
    expect(r.status, r.out).toBe(1);
    expect(r.out).toContain(reason);
    expect(r.unchanged, 'a refusal changed package.json or the lockfile').toBe(true);
  });

  // Defect caught: a result the version-pin gate refuses is left in the repository.
  it('restores both files when the version-pin gate refuses the result', () => {
    const r = run(['brace-expansion', '5.0.12'], { gateExit: 1 });
    expect(r.status).toBe(1);
    expect(r.out).toContain('Restored package.json and package-lock.json');
    expect(r.unchanged).toBe(true);
  });
});

describe('pin-npm-package.sh: what it changes', () => {
  // Defect caught: an override bump leaves the lock on the old version, moves
  // other entries, or skips bringing node_modules in line.
  it('moves an override and exactly its lock entry, then installs', () => {
    const r = run(['brace-expansion', '5.0.12']);
    expect(r.status, r.out).toBe(0);
    expect(r.pkg.overrides['brace-expansion']).toBe('5.0.12');
    expect(r.lock.packages['node_modules/brace-expansion'].version).toBe('5.0.12');
    expect(r.lock.packages['node_modules/debug'].version).toBe('4.4.0');
    expect(r.calls).toMatch(/^npm ci --no-audit --no-fund$/m);
    expect(r.out).toContain('TEST SEAM: FOOTBAG_NPM_BIN');
  });

  // Defect caught: a moved package the caller reviewed and accepted is refused.
  it('accepts other entries moving when told to, having listed them', () => {
    const r = run(['--accept-collateral', 'brace-expansion', '5.0.12'], { collateral: 'debug' });
    expect(r.status, r.out).toBe(0);
    expect(r.out).toContain('node_modules/debug');
  });

  // Defect caught: an override that pins nothing cannot be removed, or its removal
  // leaves an empty overrides block behind.
  it('removes an override', () => {
    const r = run(['--remove-override', 'qs']);
    expect(r.status, r.out).toBe(0);
    expect(r.pkg.overrides.qs).toBeUndefined();
    expect(r.out).toContain('Removed the qs override');
    expect(r.pkg.overrides['brace-expansion']).toBe('5.0.9');
  });

  // Defect caught: a re-run of a pin already in place rewrites the files or fails.
  it('treats a pin already in place as done, changing neither file', () => {
    const r = run(['qs', '6.16.0']);
    expect(r.status, r.out).toBe(0);
    expect(r.out).toContain('already pinned');
    expect(r.unchanged).toBe(true);
  });
});
