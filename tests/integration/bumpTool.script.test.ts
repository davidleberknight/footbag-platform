/**
 * Moving one pinned tool to a new version.
 *
 * The contract: a bump changes the version, its download address and its digest
 * together, computes the digest from two downloads that agree, and writes only
 * when asked to and only once no other copy of the old version remains in the
 * places a copy of a pin lives; a copy under the tests is listed but does not
 * block. A re-run after a half-done earlier bump is caught, not called done. The
 * Amazon Linux release carries its image with it at the digest the registry
 * lists; the Python pin needs its build date named; the pin that follows the
 * application's database engine is refused, because it moves with that package.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createScratchDir, removeScratch } from '../fixtures/scratchDir';
import { SPAWN_GUARD } from '../fixtures/spawnGuard';

const SCRIPT = join(process.cwd(), 'scripts/bump-tool.sh');
const NEW_BYTES = 'jq 1.8.2 release bytes\n';
const NEW_JQ_URL = 'https://example.test/jq-1.8.2/jq-linux-amd64';
const LIST = [
  'JQ_VERSION=1.7.1',
  'JQ_URL=https://example.test/jq-1.7.1/jq-linux-amd64',
  `JQ_SHA256=${'a'.repeat(64)}`,
  'SQLITE_VERSION=3.51.2',
].join('\n') + '\n';

let dir: string;
let list: string;
let root: string;

/** Writes a file under the scanned tree, making its directories. */
function put(rel: string, body: string): void {
  const path = join(root, rel);
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, body);
}

/** The addresses the download stand-in serves; any other one fails. */
function serve(...urls: string[]): void {
  writeFileSync(join(dir, 'served'), urls.join('\n') + '\n');
}

beforeEach(() => {
  dir = createScratchDir('bump-tool');
  list = join(dir, 'tool-versions.env');
  root = join(dir, 'repo');
  mkdirSync(join(root, 'scripts'), { recursive: true });
  writeFileSync(list, LIST);
  writeFileSync(join(dir, 'download'), NEW_BYTES);
  serve(NEW_JQ_URL);
  // Called as <cmd> <url> <out>. With a `flaky` marker each download carries
  // one more byte than the last, as an address serving a moving file would.
  writeFileSync(join(dir, 'fetch'), [
    '#!/usr/bin/env bash',
    `grep -qxF -- "$1" ${JSON.stringify(join(dir, 'served'))} || exit 22`,
    `cp ${JSON.stringify(join(dir, 'download'))} "$2"`,
    `if [[ -e ${JSON.stringify(join(dir, 'flaky'))} ]]; then echo x >> ${JSON.stringify(join(dir, 'count'))}; cat ${JSON.stringify(join(dir, 'count'))} >> "$2"; fi`,
  ].join('\n'));
  chmodSync(join(dir, 'fetch'), 0o755);
});

afterEach(() => removeScratch(dir));

function bump(args: string[], extra: NodeJS.ProcessEnv = {}) {
  const r = spawnSync('bash', [SCRIPT, ...args], {
    encoding: 'utf-8',
    env: { ...process.env, FOOTBAG_TOOL_VERSIONS: list, FOOTBAG_BUMP_FETCH: join(dir, 'fetch'), FOOTBAG_BUMP_ROOT: root, ...extra },
    ...SPAWN_GUARD,
  });
  return { status: r.status, out: (r.stdout ?? '') + (r.stderr ?? '') };
}

/** The closing report: everything from its heading to the end of the output. */
function report(out: string): string {
  const at = out.lastIndexOf('Closing report');
  return at < 0 ? '' : out.slice(at);
}

describe('bump-tool.sh', () => {
  it('shows the change and writes nothing without --apply', () => {
    // Defect caught: a bump meant as a preview rewrites the pin list.
    const r = bump(['JQ_VERSION', '1.8.2']);
    expect(r.status, r.out).toBe(0);
    expect(r.out).toMatch(/^\+JQ_VERSION=1\.8\.2$/m);
    expect(readFileSync(list, 'utf-8')).toBe(LIST);
  });

  it('moves the version, its address and the digest of the file it downloaded, together', () => {
    // Defect caught: the version moves and its digest stays, so the next install
    // refuses the new file, or worse, the old digest is carried beside a new file.
    const r = bump(['JQ_VERSION', '1.8.2', '--apply']);
    expect(r.status, r.out).toBe(0);
    const after = readFileSync(list, 'utf-8');
    expect(after).toMatch(/^JQ_VERSION=1\.8\.2$/m);
    expect(after).toMatch(/^JQ_URL=https:\/\/example\.test\/jq-1\.8\.2\/jq-linux-amd64$/m);
    expect(after).toContain(`JQ_SHA256=${createHash('sha256').update(NEW_BYTES).digest('hex')}`);
    expect(after).toMatch(/^SQLITE_VERSION=3\.51\.2$/m);
  });

  it('refuses to write while another copy of the old version remains, listing it, and writes once it has moved', () => {
    // Defect caught: the list moves and a workflow or script line still installs
    // the old version, so two machines run two versions with every check green;
    // or the list is written first, leaving a half-done bump in the tree.
    put('scripts/install.sh', 'curl -o jq https://example.test/jq-1.7.1/jq\n');
    const r = bump(['JQ_VERSION', '1.8.2', '--apply']);
    expect(r.status).toBe(1);
    expect(report(r.out)).toContain('scripts/install.sh:1:');
    expect(readFileSync(list, 'utf-8')).toBe(LIST);

    put('scripts/install.sh', 'curl -o jq https://example.test/jq-1.8.2/jq\n');
    const again = bump(['JQ_VERSION', '1.8.2', '--apply']);
    expect(again.status, again.out).toBe(0);
    expect(readFileSync(list, 'utf-8')).toMatch(/^JQ_VERSION=1\.8\.2$/m);
  });

  it('finds a copy in the application, the other pin files and ops, on a line that does not name the tool', () => {
    // Defect caught: a copy that never names the tool (terraform's
    // required_version, a constant in the application, .nvmrc) is missed, so
    // the bump is declared complete with that copy still on the old version.
    put('src/config/tools.ts', "export const PINNED = '1.7.1';\n");
    put('.nvmrc', '1.7.1\n');
    put('ops/systemd/unit.conf', 'Environment=V=1.7.1\n');
    const r = bump(['JQ_VERSION', '1.8.2', '--apply']);
    expect(r.status).toBe(1);
    const rep = report(r.out);
    expect(rep).toContain('src/config/tools.ts:1:');
    expect(rep).toContain('.nvmrc:1:');
    expect(rep).toContain('ops/systemd/unit.conf:1:');
    expect(readFileSync(list, 'utf-8')).toBe(LIST);
  });

  it('does not read a longer version, a vendored tree or the list itself as a copy', () => {
    // Defect caught: the scan blocks every bump on numbers that only contain
    // the old version (1.7.10, 21.7.1) or on other projects' files, and the
    // maintainer learns to move pins by hand around it.
    put('scripts/other.sh', 'A=1.7.10\nB=21.7.1\nC=1.7.1.4\n');
    put('scripts/.venv/lib/pkg/version.py', "VERSION = '1.7.1'\n");
    put('ops/tool-versions.env', LIST);
    const r = bump(['JQ_VERSION', '1.8.2', '--apply']);
    expect(r.status, r.out).toBe(0);
    expect(readFileSync(list, 'utf-8')).toMatch(/^JQ_VERSION=1\.8\.2$/m);
  });

  it('lists a copy under the tests as a warning without blocking the write', () => {
    // Defect caught: either a test fixture holding the old value blocks the
    // bump, or it is never shown, so a test that stands for the pin drifts.
    put('tests/unit/jq.test.ts', "const V = '1.7.1';\n");
    const r = bump(['JQ_VERSION', '1.8.2', '--apply']);
    expect(r.status, r.out).toBe(0);
    expect(report(r.out)).toMatch(/Warnings[\s\S]*tests\/unit\/jq\.test\.ts:1:/);
    expect(readFileSync(list, 'utf-8')).toMatch(/^JQ_VERSION=1\.8\.2$/m);
  });

  it('looks for a pin held with a leading v in the form tools print, without it', () => {
    // Defect caught: COMPOSE_VERSION=v5.1.0 moves while a script still checks
    // for 5.1.0, the form the plugin prints.
    writeFileSync(list, 'COMPOSE_VERSION=v5.1.0\n');
    put('scripts/check.sh', '[[ "$(docker compose version --short)" == 5.1.0 ]]\n');
    const r = bump(['COMPOSE_VERSION', 'v5.2.0', '--apply']);
    expect(r.status).toBe(1);
    expect(report(r.out)).toContain('scripts/check.sh:1:');
    put('scripts/check.sh', '[[ "$(docker compose version --short)" == 5.2.0 ]]\n');
    expect(bump(['COMPOSE_VERSION', 'v5.2.0', '--apply']).status).toBe(0);
  });

  it('refuses a digest from two downloads that differ, changing nothing', () => {
    // Defect caught: an address serving a moving or truncated file gets one
    // download's digest pinned, and every install after it refuses or, worse,
    // matches a file nobody can fetch again.
    writeFileSync(join(dir, 'flaky'), '');
    const r = bump(['JQ_VERSION', '1.8.2', '--apply']);
    expect(r.status).toBe(1);
    expect(report(r.out)).toMatch(/two downloads .* differ/);
    expect(readFileSync(list, 'utf-8')).toBe(LIST);
  });

  it('refuses the engine-bound sqlite pin, and a download it cannot fetch, changing nothing', () => {
    // Defect caught: the sqlite pin moves away from the engine the application
    // bundles; or a failed download leaves the list half rewritten.
    const sqlite = bump(['SQLITE_VERSION', '3.53.4', '--apply']);
    expect(sqlite.status).toBe(1);
    expect(sqlite.out).toMatch(/follows the engine better-sqlite3 bundles/);
    const missing = bump(['JQ_VERSION', '9.9.9', '--apply']);
    expect(missing.status).toBe(1);
    expect(missing.out).toMatch(/could not download/);
    expect(readFileSync(list, 'utf-8')).toBe(LIST);
  });
});

describe('a re-run at the version already in the list', () => {
  /** Puts the list in a throwaway repository, committed at `committed`, then moves it to `working`. */
  function committedList(committed: string, working: string): void {
    const pins = join(dir, 'pins');
    mkdirSync(pins);
    list = join(pins, 'tool-versions.env');
    writeFileSync(list, committed);
    const git = (...args: string[]) => {
      const r = spawnSync('git', ['-C', pins, '-c', 'user.name=t', '-c', 'user.email=t@example.test', '-c', 'commit.gpgsign=false', ...args], { encoding: 'utf-8', ...SPAWN_GUARD });
      expect(r.status, r.stderr).toBe(0);
    };
    git('init', '-q');
    git('add', 'tool-versions.env');
    git('commit', '-q', '-m', 'pins');
    writeFileSync(list, working);
  }

  const MOVED = LIST.replace('JQ_VERSION=1.7.1', 'JQ_VERSION=1.8.2').replace('jq-1.7.1', 'jq-1.8.2');

  it('fails, listing the copies, when an earlier bump moved the list and left copies of the committed value', () => {
    // Defect caught: a bump that stopped half done is re-run, reads "already
    // 1.8.2, nothing to do", and the copies still on 1.7.1 ship.
    committedList(LIST, MOVED);
    put('scripts/install.sh', 'curl -o jq https://example.test/jq-1.7.1/jq\n');
    const r = bump(['JQ_VERSION', '1.8.2']);
    expect(r.status, r.out).toBe(1);
    expect(report(r.out)).toContain('scripts/install.sh:1:');
  });

  it('passes, writing nothing, when no copy of the committed value remains', () => {
    // Defect caught: a finished bump re-run is refused, so the re-run that
    // proves a bump complete can never pass.
    committedList(LIST, MOVED);
    put('scripts/install.sh', 'curl -o jq https://example.test/jq-1.8.2/jq\n');
    const r = bump(['JQ_VERSION', '1.8.2']);
    expect(r.status, r.out).toBe(0);
    expect(readFileSync(list, 'utf-8')).toBe(MOVED);
  });
});

describe('the Amazon Linux release and its image', () => {
  const OLD_DIGEST = 'c04a1012acc483977f61f7f91c28624a39a621e56a59781319a75dec528be9b6';
  const NEW_DIGEST = 'd'.repeat(64);
  const AL_LIST = [
    'AMAZON_LINUX_RELEASE=2023.12.20261021',
    'DOCKER_ENGINE_HOST=25.0.16-1.amzn2023.0.5',
    `AMAZONLINUX_IMAGE=amazonlinux:2023.12.20261021.0@sha256:${OLD_DIGEST}`,
  ].join('\n') + '\n';

  /**
   * A docker stand-in answering `buildx imagetools inspect <tag> --format
   * '{{json .Manifest}}'`. The shape is the real answer for
   * amazonlinux:2023.12.20261021.0, captured 2026-11-02, cut to its first
   * platform entry; the top-level digest is the index digest that is pinned.
   */
  function registry(tags: Record<string, string | null>): NodeJS.ProcessEnv {
    const lines = ['#!/usr/bin/env bash', `echo "$*" >> ${JSON.stringify(join(dir, 'docker.log'))}`, 'case "$4" in'];
    for (const [tag, digest] of Object.entries(tags)) {
      const manifest = {
        schemaVersion: 2,
        mediaType: 'application/vnd.oci.image.index.v1+json',
        ...(digest ? { digest: `sha256:${digest}` } : {}),
        size: 2377,
        manifests: [{ mediaType: 'application/vnd.oci.image.manifest.v1+json', digest: 'sha256:b156298161e9ab6392cda59081d016866601f7213a28ec21270d3a75c72f2170', size: 1024 }],
      };
      lines.push(`  ${JSON.stringify(tag)}) printf '%s\\n' '${JSON.stringify(manifest)}' ;;`);
    }
    lines.push('  *) echo "ERROR: $4: not found" >&2; exit 1 ;;', 'esac');
    writeFileSync(join(dir, 'docker'), lines.join('\n'));
    chmodSync(join(dir, 'docker'), 0o755);
    return { FOOTBAG_BUMP_DOCKER: join(dir, 'docker') };
  }

  beforeEach(() => writeFileSync(list, AL_LIST));

  it('moves the image to the new release\'s tag at the digest the registry lists for it', () => {
    // Defect caught: the release moves and the image stays, so the advisory
    // scan and the release query answer for a release the hosts no longer run.
    const r = bump(['AMAZON_LINUX_RELEASE', '2023.13.20261101', '--apply'], registry({ 'amazonlinux:2023.13.20261101.0': NEW_DIGEST }));
    expect(r.status, r.out).toBe(0);
    const after = readFileSync(list, 'utf-8');
    expect(after).toMatch(/^AMAZON_LINUX_RELEASE=2023\.13\.20261101$/m);
    expect(after).toContain(`AMAZONLINUX_IMAGE=amazonlinux:2023.13.20261101.0@sha256:${NEW_DIGEST}`);
  });

  it('refuses, changing nothing, when the new tag\'s digest cannot be resolved', () => {
    // Defect caught: the image moves to the new tag carrying the old digest,
    // or to a tag the registry does not hold, and every pull of it fails.
    const missing = bump(['AMAZON_LINUX_RELEASE', '2023.13.20261101', '--apply'], registry({}));
    expect(missing.status).toBe(1);
    expect(report(missing.out)).toMatch(/could not resolve amazonlinux:2023\.13\.20261101\.0/);
    const noDigest = bump(['AMAZON_LINUX_RELEASE', '2023.13.20261101', '--apply'], registry({ 'amazonlinux:2023.13.20261101.0': null }));
    expect(noDigest.status).toBe(1);
    expect(readFileSync(list, 'utf-8')).toBe(AL_LIST);
  });
});

describe('the Python build and its release date', () => {
  const PY_LIST = [
    'PYTHON_VERSION=3.12.12',
    'PYTHON_URL=https://github.com/astral-sh/python-build-standalone/releases/download/20260211/cpython-3.12.12+20260211-x86_64-unknown-linux-gnu-install_only.tar.gz',
    `PYTHON_SHA256=${'b'.repeat(64)}`,
  ].join('\n') + '\n';
  const NEW_PY_URL = 'https://github.com/astral-sh/python-build-standalone/releases/download/20261101/cpython-3.12.13+20261101-x86_64-unknown-linux-gnu-install_only.tar.gz';

  beforeEach(() => {
    writeFileSync(list, PY_LIST);
    serve(NEW_PY_URL);
  });

  it('refuses a Python bump without the build date, changing nothing', () => {
    // Defect caught: the address keeps the old build's date beside the new
    // version, naming a file the publisher never released, or a date is guessed.
    const r = bump(['PYTHON_VERSION', '3.12.13', '--apply']);
    expect(r.status).toBe(2);
    expect(report(r.out)).toMatch(/--python-build/);
    expect(readFileSync(list, 'utf-8')).toBe(PY_LIST);
  });

  it('moves both the version and the release date in the address when the date is given', () => {
    // Defect caught: only the version moves in the address, so the download
    // fails or fetches another build than the one named.
    const r = bump(['PYTHON_VERSION', '3.12.13', '--python-build', '20261101', '--apply']);
    expect(r.status, r.out).toBe(0);
    expect(readFileSync(list, 'utf-8')).toContain(`PYTHON_URL=${NEW_PY_URL}`);
  });
});
