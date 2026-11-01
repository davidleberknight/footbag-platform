/**
 * Installing the pinned jq, age and sqlite3 in a continuous-integration job.
 *
 * The contract: a tool is installed only from a download that matches the SHA-256
 * its pin carries, so the push gate runs the version the hosts and workstations
 * run rather than the runner image's; and nothing is left behind.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createScratchDir, removeScratch } from '../fixtures/scratchDir';
import { SPAWN_GUARD } from '../fixtures/spawnGuard';

const SCRIPT = join(process.cwd(), 'scripts/ci/install-pinned-tools.sh');
const JQ_BYTES = '#!/usr/bin/env bash\necho jq-1.7.1\n';

let dir: string;

beforeEach(() => {
  dir = createScratchDir('install-pinned');
  writeFileSync(join(dir, 'jq-download'), JQ_BYTES);
  writeFileSync(join(dir, 'fetch'), `#!/usr/bin/env bash\ncat ${JSON.stringify(join(dir, 'jq-download'))}\n`);
  chmodSync(join(dir, 'fetch'), 0o755);
  mkdirSync(join(dir, 'tmp'));
});

afterEach(() => removeScratch(dir));

function run(sha: string): { status: number; stderr: string } {
  const list = join(dir, 'tool-versions.env');
  writeFileSync(list, `JQ_VERSION=1.7.1\nJQ_URL=https://example.invalid/jq\nJQ_SHA256=${sha}\n`);
  const res = spawnSync('bash', [SCRIPT, '--bin-dir', join(dir, 'bin'), 'jq'], {
    env: {
      ...process.env,
      TMPDIR: join(dir, 'tmp'),
      FOOTBAG_TOOL_VERSIONS: list,
      FOOTBAG_INSTALL_PINNED_FETCH: join(dir, 'fetch'),
    },
    encoding: 'utf8',
    ...SPAWN_GUARD,
  });
  return { status: res.status ?? -1, stderr: res.stderr ?? '' };
}

describe('installing the pinned tools in CI', () => {
  it('installs a download that matches its pinned SHA-256, leaving nothing behind', () => {
    const r = run(createHash('sha256').update(JQ_BYTES).digest('hex'));

    expect(r.status, r.stderr).toBe(0);
    const v = spawnSync(join(dir, 'bin', 'jq'), ['--version'], { encoding: 'utf8', ...SPAWN_GUARD });
    expect(v.stdout.trim()).toBe('jq-1.7.1');
    expect(readdirSync(join(dir, 'tmp'))).toEqual([]);
  });

  // Defect caught: a download that was not the pinned file was installed, so
  // CI would run, and prove, a tool nobody checked.
  it('refuses a download whose SHA-256 does not match the pin', () => {
    const r = run('d'.repeat(64));

    expect(r.status).toBe(1);
    expect(r.stderr).toContain('does not match JQ_SHA256');
    expect(existsSync(join(dir, 'bin', 'jq'))).toBe(false);
    expect(readdirSync(join(dir, 'tmp'))).toEqual([]);
  });
});
