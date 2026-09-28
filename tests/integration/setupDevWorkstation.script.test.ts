/**
 * scripts/setup-dev-workstation.sh — installing a developer workstation's tools.
 *
 * The script installs operating-system packages and downloads binaries, so the
 * installing path is never exercised for real here. Every case runs it inside a
 * throwaway repository, with the package manager, the downloader and every tool
 * it checks replaced by stand-ins on a PATH the case builds. What is pinned is the
 * decision surface:
 *
 *   - a pinned download that disagrees with the version the push gate reads is
 *     refused before anything happens;
 *   - --check reports and changes nothing;
 *   - without a terminal to confirm on, nothing is installed;
 *   - a download whose checksum does not match is refused before it is unpacked;
 *   - a machine that already has everything is told so, with no prompt at all,
 *     which is what makes running it again safe.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, chmodSync, copyFileSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { SPAWN_GUARD } from '../fixtures/spawnGuard';
import { requireToolInCI } from '../fixtures/toolAvailability';

const REPO = process.cwd();
// The signature cases run the real gpg against the committed key.
const HAS_GPG = requireToolInCI('gpg', '--version');
const AWS_CLI_SHA256 = 'de4a8f35c5d19e120e6b5403bbebbf356459ae17af78941ae74e37a78f44aef3';

/**
 * A venv interpreter that behaves like a working one: it reports the pinned
 * version, pip answers, and a dry-run install finds nothing to install.
 */
const HEALTHY_VENV_PYTHON = [
  '#!/bin/bash',
  'if [ "$1" = "-c" ]; then echo 3.12.12; exit 0; fi',
  'if [ "$1" = "-m" ] && [ "$2" = "pip" ]; then exit 0; fi',
  'exit 0',
  '',
].join('\n');

let root: string;
let repo: string;
let stubs: string;
let home: string;
let aptLog: string;

function file(path: string, body: string, mode = 0o644) {
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, body);
  chmodSync(path, mode);
}

function stub(name: string, body: string) {
  file(join(stubs, name), `#!/bin/bash\n${body}\n`, 0o755);
}

/**
 * The lockfile and npm's record of what it installed, agreeing unless a case
 * says otherwise.
 */
function writeNpmState(installedVersion = '1.2.3') {
  const lock = (version: string) =>
    JSON.stringify({
      lockfileVersion: 3,
      packages: {
        '': { name: 'fixture' },
        'node_modules/left-pad': { version },
        'node_modules/@esbuild/darwin-arm64': { version: '0.1.0', optional: true },
      },
    });
  file(join(repo, 'package-lock.json'), lock('1.2.3'));
  file(join(repo, 'node_modules', '.package-lock.json'), lock(installedVersion));
}

/** Every tool at its pinned version, so the machine needs nothing. */
function stubCompleteMachine() {
  stub('python3.12', 'echo 3.12.12');
  // The version answer is the stand-in; everything else is the real node, which
  // the dependency check runs.
  stub('node', `[ "$1" = -v ] && { echo v22.22.1; exit 0; }\nexec ${process.execPath} "$@"`);
  stub('gitleaks', 'echo 8.24.3');
  stub('terraform', 'echo "Terraform v1.14.7"');
  stub('docker', 'exit 0');
  stub('dpkg-query', 'printf "install ok installed"');
  // jq is the real one: the script reads the browser manifest with it.
  for (const tool of ['sqlite3', 'ffmpeg', 'ffprobe', 'age']) stub(tool, 'exit 0');
  file(join(home, '.cache', 'ms-playwright', 'chromium-1234', 'INSTALLATION_COMPLETE'), '');
  writeNpmState();
  file(
    join(repo, 'node_modules', 'playwright-core', 'browsers.json'),
    JSON.stringify({ browsers: [{ name: 'chromium', revision: '1234' }, { name: 'firefox', revision: '9' }] }),
  );
  // Working environments: the pinned interpreter, pip present, requirements met.
  for (const bin of [
    join(repo, 'legacy_data', '.venv', 'bin', 'python'),
    join(repo, 'legacy_data', '.venv', 'bin', 'python3'),
    join(repo, 'scripts', '.venv', 'bin', 'python3'),
  ]) {
    file(bin, HEALTHY_VENV_PYTHON, 0o755);
  }
  spawnSync('git', ['config', 'core.hooksPath', '.githooks'], { cwd: repo, ...SPAWN_GUARD });
}

function run(args: string[], env: Record<string, string> = {}) {
  const res = spawnSync('bash', [join(repo, 'scripts', 'setup-dev-workstation.sh'), ...args], {
    encoding: 'utf-8',
    input: '',
    env: {
      ...process.env,
      PATH: `${stubs}:${process.env.PATH ?? ''}`,
      HOME: home,
      NVM_DIR: join(home, '.nvm'),
      SETUP_DEV_BIN_DIR: join(home, 'bin'),
      SETUP_DEV_PYTHON_ROOT: join(home, 'python'),
      SETUP_DEV_APT: join(root, 'apt'),
      SETUP_DEV_DPKG_QUERY: join(stubs, 'dpkg-query'),
      SETUP_DEV_FETCH: join(root, 'fetch'),
      SETUP_DEV_DIST_PACKAGES: join(root, 'dist-packages'),
      SETUP_DEV_SYSTEM_PYTHON3: join(root, 'system-python3'),
      SETUP_DEV_ALTERNATIVES: join(root, 'alternatives'),
      ...env,
    },
    ...SPAWN_GUARD,
  });
  return { status: res.status, stdout: res.stdout ?? '', stderr: res.stderr ?? '' };
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'footbag-test-setupdev-'));
  repo = join(root, 'repo');
  stubs = join(root, 'stubs');
  home = join(root, 'home');
  aptLog = join(root, 'apt.log');
  mkdirSync(stubs, { recursive: true });
  mkdirSync(home, { recursive: true });
  // apt records what it was asked for; the downloader hands back the wrong bytes.
  file(join(root, 'apt'), `#!/bin/bash\necho "$@" >> ${aptLog}\n`, 0o755);
  file(join(root, 'fetch'), '#!/bin/bash\necho not-the-pinned-file > "$1"\n', 0o755);
  // A system python3 that loads apt's module once the alternative has been set.
  // The alternatives stand-in lists what alt-registered holds, and records every
  // other call.
  mkdirSync(join(root, 'dist-packages'), { recursive: true });
  file(join(root, 'system-python3'), `#!/bin/bash\n[ -e ${join(root, 'alt-set')} ]\n`, 0o755);
  file(
    join(root, 'alternatives'),
    [
      '#!/bin/bash',
      `if [ "$1" = --list ]; then cat ${join(root, 'alt-registered')} 2>/dev/null; exit 0; fi`,
      `echo "$@" >> ${join(root, 'alternatives.log')}`,
      `[ "$1" = --set ] && touch ${join(root, 'alt-set')}`,
      'exit 0',
      '',
    ].join('\n'),
    0o755,
  );
  for (const rel of [
    'scripts/setup-dev-workstation.sh',
    'scripts/keys/aws-cli-v2.pub',
    '.github/workflows/ci.yml',
    '.nvmrc',
  ]) {
    mkdirSync(join(repo, rel, '..'), { recursive: true });
    copyFileSync(join(REPO, rel), join(repo, rel));
  }
  // The shared libraries it sources, which source others of their own.
  spawnSync('cp', ['-r', join(REPO, 'scripts', 'lib'), join(repo, 'scripts', 'lib')], SPAWN_GUARD);
  file(join(repo, '.python-version'), '3.12.12\n');
  file(join(repo, 'legacy_data', 'run_pipeline.sh'), 'exit 0\n');
  file(join(repo, 'scripts', 'install-git-hooks.sh'), 'exit 0\n');
  spawnSync('git', ['init', '-q', repo], SPAWN_GUARD);
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('setup-dev-workstation.sh — the pins must agree', () => {
  it('refuses when .python-version names a version it does not install', () => {
    file(join(repo, '.python-version'), '3.11.9\n');
    const r = run(['--check']);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('.python-version says 3.11.9; this script installs 3.12.12.');
    expect(r.stderr).toContain('Nothing changed.');
  });

  it('refuses an unknown argument rather than ignoring it', () => {
    const r = run(['--nope']);
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("unknown argument '--nope'");
  });
});

describe('setup-dev-workstation.sh — what it will not do unasked', () => {
  it('reports the plan under --check and installs nothing', () => {
    stubCompleteMachine();
    stub('python3.12', 'echo 3.12.3');
    const r = run(['--check']);
    expect(r.status).toBe(1);
    expect(r.stdout).toContain('python: install CPython 3.12.12');
    expect(existsSync(join(home, 'python'))).toBe(false);
    expect(existsSync(aptLog)).toBe(false);
  });

  it('installs nothing without a terminal to confirm on', () => {
    stubCompleteMachine();
    stub('dpkg-query', 'exit 1');
    const r = run([]);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('Not confirmed; nothing has been changed.');
    expect(existsSync(aptLog)).toBe(false);
  });

  it('refuses a download whose checksum does not match, before unpacking it', () => {
    stubCompleteMachine();
    stub('python3.12', 'echo 3.12.3');
    const r = run(['--yes']);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('does not match its pinned checksum. Nothing from it was installed.');
    expect(existsSync(join(home, 'python', '3.12.12', 'python'))).toBe(false);
    expect(existsSync(join(home, 'bin', 'python3.12'))).toBe(false);
  });

  it('still installs when apt update reports an error, and says so', () => {
    stubCompleteMachine();
    stub('dpkg-query', '[ "$3" = age ] && exit 1; printf "install ok installed"');
    file(
      join(root, 'apt'),
      `#!/bin/bash\necho "$@" >> ${aptLog}\n[ "$1" = update ] && exit 100\nexit 0\n`,
      0o755,
    );
    const r = run(['--yes']);
    expect(r.stderr).toContain('apt update reported errors (above); installing from the package lists apt has.');
    expect(readFileSync(aptLog, 'utf-8')).toContain('install -y age');
  });

  it('asks apt only for the packages that are missing', () => {
    stubCompleteMachine();
    stub('dpkg-query', '[ "$3" = age ] && exit 1; printf "install ok installed"');
    stub('python3.12', 'echo 3.12.3');
    run(['--yes']);
    const calls = readFileSync(aptLog, 'utf-8');
    expect(calls).toContain('install -y age');
    expect(calls).not.toContain('ffmpeg');
  });
});

describe('setup-dev-workstation.sh — the system python3 apt depends on', () => {
  function aptBuiltFor310() {
    writeFileSync(join(root, 'dist-packages', 'apt_pkg.cpython-310-x86_64-linux-gnu.so'), '');
    // Ubuntu's own interpreter, beside the system python3 as it is in /usr/bin.
    file(join(root, 'python3.10'), '#!/bin/bash\nexit 0\n', 0o755);
  }

  it('leaves the system python3 alone when apt can load its module', () => {
    stubCompleteMachine();
    aptBuiltFor310();
    writeFileSync(join(root, 'alt-set'), '');
    const r = run(['--check']);
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).not.toContain('system python3');
  });

  it('plans pointing python3 back at the interpreter apt was built for', () => {
    stubCompleteMachine();
    aptBuiltFor310();
    const r = run(['--check']);
    expect(r.status).toBe(1);
    expect(r.stdout).toContain("system python3: point it back at Ubuntu's own python3.10");
  });

  it('sets the alternative to that interpreter and proves apt can load its module', () => {
    stubCompleteMachine();
    aptBuiltFor310();
    writeFileSync(join(root, 'alt-registered'), `${join(root, 'python3.10')}\n`);
    const r = run(['--yes']);
    expect(r.status, r.stderr).toBe(0);
    const calls = readFileSync(join(root, 'alternatives.log'), 'utf-8');
    expect(calls).toContain(`--set python3 ${join(root, 'python3.10')}`);
    expect(calls).not.toContain('--install');
  });

  it('registers that interpreter first when python3 was repointed outside the alternatives system', () => {
    // --set only chooses among registered alternatives, so on its own it fails
    // on exactly the machine that needs the repair.
    stubCompleteMachine();
    aptBuiltFor310();
    const r = run(['--yes']);
    expect(r.status, r.stderr).toBe(0);
    const calls = readFileSync(join(root, 'alternatives.log'), 'utf-8').trim().split('\n');
    expect(calls).toEqual([
      `--install ${join(root, 'system-python3')} python3 ${join(root, 'python3.10')} 1`,
      `--set python3 ${join(root, 'python3.10')}`,
    ]);
  });

  it('refuses, changing nothing, when the interpreter apt was built for is not installed', () => {
    stubCompleteMachine();
    aptBuiltFor310();
    rmSync(join(root, 'python3.10'));
    const r = run(['--yes']);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("apt's module is built for");
    expect(r.stderr).toContain('which is not installed');
    expect(existsSync(join(root, 'alternatives.log'))).toBe(false);
  });

  it('does nothing on a machine whose apt has no Python module', () => {
    stubCompleteMachine();
    const r = run(['--check']);
    expect(r.status, r.stderr).toBe(0);
    expect(existsSync(join(root, 'alternatives.log'))).toBe(false);
  });
});

describe('setup-dev-workstation.sh — Python environments judged by whether they work', () => {
  it('plans a repair for a seeder environment whose interpreter is another Python', () => {
    // The failure that taught this: a venv built from a bare python3 follows that
    // link, so repointing the system python3 turns it into a different
    // interpreter over the old one's packages while every file still exists.
    stubCompleteMachine();
    file(
      join(repo, 'scripts', '.venv', 'bin', 'python3'),
      // Everything else answers as a working environment would, so the version
      // alone decides this case.
      '#!/bin/bash\nif [ "$1" = "-c" ]; then echo 3.10.12; exit 0; fi\nexit 0\n',
      0o755,
    );
    const r = run(['--check']);
    expect(r.status).toBe(1);
    expect(r.stdout).toContain('python env: build or repair the seeder environment');
  });

  it('plans a repair for a legacy environment whose pip is gone', () => {
    stubCompleteMachine();
    const broken = '#!/bin/bash\nif [ "$1" = "-c" ]; then echo 3.12.12; exit 0; fi\nexit 1\n';
    file(join(repo, 'legacy_data', '.venv', 'bin', 'python'), broken, 0o755);
    file(join(repo, 'legacy_data', '.venv', 'bin', 'python3'), broken, 0o755);
    const r = run(['--check']);
    expect(r.status).toBe(1);
    expect(r.stdout).toContain('python env: build or repair the legacy pipeline environment');
  });

  it('plans a repair when an environment does not yet satisfy its pinned requirements', () => {
    stubCompleteMachine();
    file(
      join(repo, 'scripts', '.venv', 'bin', 'python3'),
      '#!/bin/bash\nif [ "$1" = "-c" ]; then echo 3.12.12; exit 0; fi\n' +
        'case "$*" in *--dry-run*) echo "Would install numpy-2.4.3" ;; esac\nexit 0\n',
      0o755,
    );
    const r = run(['--check']);
    expect(r.status).toBe(1);
    expect(r.stdout).toContain('python env: build or repair the seeder environment');
  });
});

describe('setup-dev-workstation.sh — the operator AWS CLI', () => {
  it('leaves the AWS CLI alone unless --operator is given', () => {
    stubCompleteMachine();
    stub('aws', 'echo "aws-cli/2.10.0 Python/3.11"');
    const r = run(['--check']);
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).not.toContain('aws: install');
  });

  it('plans the pinned AWS CLI under --operator when the installed one differs', () => {
    stubCompleteMachine();
    stub('aws', 'echo "aws-cli/2.10.0 Python/3.11"');
    const r = run(['--check', '--operator']);
    expect(r.status).toBe(1);
    expect(r.stdout).toContain('aws: install AWS CLI 2.34.8');
  });

  it('accepts the pinned AWS CLI under --operator', () => {
    stubCompleteMachine();
    stub('aws', 'echo "aws-cli/2.34.8 Python/3.13.11 Linux/6 exe/x86_64"');
    const r = run(['--check', '--operator']);
    expect(r.status, r.stderr).toBe(0);
  });

  it('refuses an installer whose checksum does not match, before checking its signature', () => {
    stubCompleteMachine();
    stub('aws', 'exit 1');
    const r = run(['--yes', '--operator']);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('awscli-exe-linux-x86_64-2.34.8.zip does not match its pinned checksum');
  });

  describe.skipIf(!HAS_GPG)('past the checksum, the signature', () => {
    /** The download passes its checksum, so the key and signature decide. */
    function checksumPasses() {
      stubCompleteMachine();
      stub('aws', 'exit 1');
      stub('sha256sum', `echo "${AWS_CLI_SHA256}  $1"`);
    }

    it('refuses a key file that is not AWS\'s, by name, rather than ending silently', () => {
      checksumPasses();
      file(join(repo, 'scripts', 'keys', 'aws-cli-v2.pub'), 'not a key\n');
      const r = run(['--yes', '--operator']);
      expect(r.status).toBe(1);
      expect(r.stderr).toContain("scripts/keys/aws-cli-v2.pub is not AWS's published signing key (fingerprint none)");
      expect(existsSync(join(home, '.local', 'aws-cli'))).toBe(false);
    });

    it('refuses an installer whose signature does not verify against the pinned key', () => {
      checksumPasses();
      const r = run(['--yes', '--operator']);
      expect(r.status).toBe(1);
      expect(r.stderr).toContain("the AWS CLI installer's signature does not verify against AWS's key");
      expect(existsSync(join(home, '.local', 'aws-cli'))).toBe(false);
    });
  });
});

describe('setup-dev-workstation.sh — npm dependencies and the browser, judged by outcome', () => {
  it('plans npm ci when an installed package is not at the version the lockfile pins', () => {
    // node_modules exists, which is all the old check asked.
    stubCompleteMachine();
    writeNpmState('1.2.2');
    const r = run(['--check']);
    expect(r.status).toBe(1);
    expect(r.stdout).toContain('npm: install dependencies from the lockfile (npm ci)');
  });

  it('plans npm ci when npm has no record of an install', () => {
    stubCompleteMachine();
    rmSync(join(repo, 'node_modules', '.package-lock.json'));
    const r = run(['--check']);
    expect(r.status).toBe(1);
    expect(r.stdout).toContain('npm: install dependencies from the lockfile (npm ci)');
  });

  it('does not require an optional package built for another platform', () => {
    // The fixture lockfile names one that npm never installs here.
    stubCompleteMachine();
    const r = run(['--check']);
    expect(r.status, r.stderr).toBe(0);
  });

  it('plans the browser when its folder exists but the download never completed', () => {
    stubCompleteMachine();
    rmSync(join(home, '.cache', 'ms-playwright', 'chromium-1234', 'INSTALLATION_COMPLETE'));
    const r = run(['--check']);
    expect(r.status).toBe(1);
    expect(r.stdout).toContain('playwright: install Chromium with its system libraries');
  });

  it('looks for the browser where PLAYWRIGHT_BROWSERS_PATH puts it', () => {
    stubCompleteMachine();
    const elsewhere = join(root, 'browsers');
    const moved = run(['--check'], { PLAYWRIGHT_BROWSERS_PATH: elsewhere });
    expect(moved.status).toBe(1);
    expect(moved.stdout).toContain('playwright: install Chromium');
    file(join(elsewhere, 'chromium-1234', 'INSTALLATION_COMPLETE'), '');
    const found = run(['--check'], { PLAYWRIGHT_BROWSERS_PATH: elsewhere });
    expect(found.status, found.stderr).toBe(0);
  });
});

describe('setup-dev-workstation.sh — the verdict is the outcome, not the steps run', () => {
  it('fails, naming what is missing, when an install step ran and did not deliver', () => {
    // npm ci "succeeds" and changes nothing, so the dependencies are still wrong.
    stubCompleteMachine();
    writeNpmState('1.2.2');
    stub('npm', 'exit 0');
    const r = run(['--yes']);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("still missing: npm dependencies at the lockfile's versions");
    expect(r.stderr).toContain('Setup incomplete: the items above are still missing.');
  });

  it('plans activating the git hooks when they are not active', () => {
    stubCompleteMachine();
    spawnSync('git', ['config', '--unset', 'core.hooksPath'], { cwd: repo, ...SPAWN_GUARD });
    const r = run(['--check']);
    expect(r.status).toBe(1);
    expect(r.stdout).toContain("git: activate the repository's hooks");
  });
});

describe('setup-dev-workstation.sh — a machine that has everything', () => {
  it('says there is nothing to do, without asking for a confirmation', () => {
    stubCompleteMachine();
    const r = run(['--check']);
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toContain('Nothing to do: every tool is installed at its pinned version.');
  });

  it('finds the cached browser by the revision the pinned Playwright names', () => {
    stubCompleteMachine();
    rmSync(join(home, '.cache', 'ms-playwright', 'chromium-1234'), { recursive: true });
    mkdirSync(join(home, '.cache', 'ms-playwright', 'chromium-1200'), { recursive: true });
    const r = run(['--check']);
    expect(r.status).toBe(1);
    expect(r.stdout).toContain('playwright: install Chromium with its system libraries');
  });
});
