/**
 * Moving one pinned tool to a new version.
 *
 * The contract: a bump changes the version, its download address and its digest
 * together, computes the digest from the file actually downloaded, writes only
 * when asked to, and refuses to call itself done while another copy of the old
 * version remains on a line that names the tool. The pin that follows the
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
const LIST = [
  'JQ_VERSION=1.7.1',
  'JQ_URL=https://example.test/jq-1.7.1/jq-linux-amd64',
  `JQ_SHA256=${'a'.repeat(64)}`,
  'SQLITE_VERSION=3.51.2',
].join('\n') + '\n';

let dir: string;
let list: string;
let root: string;

beforeEach(() => {
  dir = createScratchDir('bump-tool');
  list = join(dir, 'tool-versions.env');
  root = join(dir, 'repo');
  mkdirSync(join(root, 'scripts'), { recursive: true });
  writeFileSync(list, LIST);
  writeFileSync(join(dir, 'download'), NEW_BYTES);
  // Called as <cmd> <url> <out>; a download the stand-in does not serve fails.
  writeFileSync(join(dir, 'fetch'), [
    '#!/usr/bin/env bash',
    `[[ "$1" == "https://example.test/jq-1.8.2/jq-linux-amd64" ]] || exit 22`,
    `cp ${JSON.stringify(join(dir, 'download'))} "$2"`,
  ].join('\n'));
  chmodSync(join(dir, 'fetch'), 0o755);
});

afterEach(() => removeScratch(dir));

function bump(args: string[]) {
  const r = spawnSync('bash', [SCRIPT, ...args], {
    encoding: 'utf-8',
    env: { ...process.env, FOOTBAG_TOOL_VERSIONS: list, FOOTBAG_BUMP_FETCH: join(dir, 'fetch'), FOOTBAG_BUMP_ROOT: root },
    ...SPAWN_GUARD,
  });
  return { status: r.status, out: (r.stdout ?? '') + (r.stderr ?? '') };
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
    expect(r.out).toMatch(/no other copy of 1\.7\.1 remains/);
  });

  it('refuses to call the bump done while another copy of the old version remains', () => {
    // Defect caught: the list moves and a workflow or script line still installs
    // the old version, so two machines run two versions with every check green.
    writeFileSync(join(root, 'scripts', 'install.sh'), 'curl -o jq https://example.test/jq-1.7.1/jq\n');
    const r = bump(['JQ_VERSION', '1.8.2', '--apply']);
    expect(r.status).toBe(1);
    expect(r.out).toMatch(/half done/);
    expect(r.out).toContain('install.sh');
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
