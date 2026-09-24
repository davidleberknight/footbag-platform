/**
 * scripts/internal/host-env-write-remote.sh — the compare-and-swap that stops a
 * host env write discarding somebody else's.
 *
 * Every write through this body is the back half of a read-modify-write: the
 * caller read the whole file, edited its copy, and is installing the whole thing
 * back. It used to be unconditional, with no re-read and no comparison, so a
 * change made on the host in between was replaced with nothing errored and
 * nothing said.
 *
 * The second writer that makes that reachable is not a second person. The
 * deploy's own root half rewrites /srv/footbag/env around thirty times, seeding
 * values and syncing about twenty of them from the parameter store. One
 * operator can do it alone: fetch, let a deploy run, install.
 *
 * A backup copy is deliberately not the answer, because it would leave a second
 * staler copy of the whole secret set at rest. So the only safe response to a
 * file that has moved on is to refuse, and these cases pin that: refused, and
 * the live file untouched, and nothing left behind.
 *
 * The body runs as root on a real host. Here it runs as the test's own account
 * with a stand-in for `chown`, which is super-user-only and would otherwise make
 * this red on the runner for a reason that has nothing to do with the contract.
 * Everything else is real: a real file, a real digest, a real rename.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync, execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, chmodSync, readdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { SPAWN_GUARD } from '../fixtures/spawnGuard';

const REMOTE_HALF = join(process.cwd(), 'scripts/internal/host-env-write-remote.sh');
const LIB = join(process.cwd(), 'scripts/lib/host-env-remote.sh');

const LIVE = 'SESSION_SECRET=abc\nSTRIPE_MODE=test\n';
const EDITED = 'SESSION_SECRET=abc\nSTRIPE_MODE=live\n';

let workDir: string;
let binDir: string;
let envPath: string;

function sha256Of(text: string): string {
  return execFileSync('sha256sum', { input: text, encoding: 'utf-8' }).trim().split(/\s+/)[0];
}

beforeEach(() => {
  workDir = mkdtempSync(join(tmpdir(), 'footbag-test-hostenvwrite-'));
  binDir = join(workDir, 'bin');
  execFileSync('mkdir', ['-p', binDir]);
  // chown is super-user-only. The stand-in accepts and does nothing, so the
  // mode assertion below still passes honestly rather than being stubbed past:
  // chmod is real, and the file ends up owned by this test's own account.
  writeFileSync(join(binDir, 'chown'), '#!/usr/bin/env bash\nexit 0\n', 'utf-8');
  chmodSync(join(binDir, 'chown'), 0o755);

  envPath = join(workDir, 'env');
  writeFileSync(envPath, LIVE, 'utf-8');
  chmodSync(envPath, 0o600);
});

afterEach(() => {
  rmSync(workDir, { recursive: true, force: true });
});

function runRemote(vars: Record<string, string>) {
  const res = spawnSync('bash', [REMOTE_HALF], {
    cwd: workDir,
    encoding: 'utf-8',
    input: '',
    env: {
      ...process.env,
      PATH: `${binDir}:${process.env.PATH}`,
      HOST_ENV_PATH: envPath,
      ...vars,
    },
    ...SPAWN_GUARD,
  });
  return { status: res.status, stdout: res.stdout ?? '', stderr: res.stderr ?? '' };
}

/** Any temp the body created and failed to clean up would sit beside the file. */
function strayTemps(): string[] {
  return readdirSync(workDir).filter((n) => n.startsWith('.env.write.'));
}

describe('host-env-write-remote.sh — the digest matches', () => {
  it('installs the edited file and leaves it root-only', () => {
    const r = runRemote({
      EXPECT_SHA256: sha256Of(LIVE),
      NEW_ENV_B64: Buffer.from(EDITED, 'utf-8').toString('base64'),
    });
    expect(r.status, r.stderr).toBe(0);
    expect(readFileSync(envPath, 'utf-8')).toBe(EDITED);
    expect(statSync(envPath).mode & 0o777).toBe(0o600);
    expect(strayTemps()).toEqual([]);
  });
});

describe('host-env-write-remote.sh — the host has moved on', () => {
  it('refuses, and leaves the live file exactly as it found it', () => {
    // The digest is taken from the content the caller read; the host is then
    // changed, as a deploy would change it. This is the whole point of the
    // check, so the assertion that matters is the second one: the file still
    // holds what the other writer put there.
    const readAt = sha256Of(LIVE);
    const deployWrote = 'SESSION_SECRET=abc\nSTRIPE_MODE=test\nDB_HOST=rotated\n';
    writeFileSync(envPath, deployWrote, 'utf-8');

    const r = runRemote({
      EXPECT_SHA256: readAt,
      NEW_ENV_B64: Buffer.from(EDITED, 'utf-8').toString('base64'),
    });
    expect(r.status).toBe(1);
    expect(readFileSync(envPath, 'utf-8')).toBe(deployWrote);
    expect(strayTemps()).toEqual([]);
  });

  it('says what changed and what to do, rather than only that it failed', () => {
    // An operator meeting this message is mid-task and holding an edit they do
    // not want to lose. Naming the likely cause and the recovery is the
    // difference between a refusal and a dead end.
    const readAt = sha256Of(LIVE);
    writeFileSync(envPath, 'SESSION_SECRET=abc\nSTRIPE_MODE=test\nEXTRA=1\n', 'utf-8');
    const r = runRemote({
      EXPECT_SHA256: readAt,
      NEW_ENV_B64: Buffer.from(EDITED, 'utf-8').toString('base64'),
    });
    expect(r.stderr).toMatch(/has changed since it was read/);
    expect(r.stderr).toMatch(/Nothing written/);
    expect(r.stderr).toMatch(new RegExp(`expected ${readAt}`));
    expect(r.stderr).toMatch(/deploy between the read and the write/);
    expect(r.stderr).toMatch(/Re-read the host/);
  });

  it('refuses when the file has gone entirely rather than recreating it', () => {
    // A recreate would restore a file the caller last saw some time ago, over
    // whatever removed it, which is a bigger decision than this step is allowed
    // to make on its own.
    rmSync(envPath);
    const r = runRemote({
      EXPECT_SHA256: sha256Of(LIVE),
      NEW_ENV_B64: Buffer.from(EDITED, 'utf-8').toString('base64'),
    });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/no longer exists/);
  });
});

describe('host-env-write-remote.sh — the refusals that already existed still hold', () => {
  it('refuses without a digest at all, rather than defaulting to overwrite', () => {
    // The variable is required, not defaulted. A caller that forgot it is
    // exactly a caller in the state this check exists to catch.
    const r = runRemote({
      NEW_ENV_B64: Buffer.from(EDITED, 'utf-8').toString('base64'),
    });
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/EXPECT_SHA256/);
    expect(readFileSync(envPath, 'utf-8')).toBe(LIVE);
  });

  it('still refuses empty content, which would take the host config away', () => {
    // A newline, not an empty string. base64 accepts it and decodes it to
    // nothing, which is what reaches this check; an empty string would trip the
    // required-variable guard above and never get here, and a lone space is
    // rejected as invalid input before the decode finishes.
    const r = runRemote({
      EXPECT_SHA256: sha256Of(LIVE),
      NEW_ENV_B64: '\n',
    });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/empty/);
    expect(readFileSync(envPath, 'utf-8')).toBe(LIVE);
    expect(strayTemps()).toEqual([]);
  });
});

describe('host_env_install — the caller side of the same contract', () => {
  it('refuses before reaching the wire when the digest is missing', () => {
    // Checked ahead of the ssh options and the remote half, so a caller that
    // forgot the digest is told that, rather than being told about an alias.
    const res = spawnSync(
      'bash',
      ['-c', `source ${JSON.stringify(LIB)}; host_env_install alias ${JSON.stringify(envPath)} /srv/footbag/env ""`],
      { cwd: workDir, encoding: 'utf-8', input: '', ...SPAWN_GUARD },
    );
    expect(res.status).not.toBe(0);
    expect(res.stderr ?? '').toMatch(/needs the digest the file carried when it was read/);
    expect(res.stderr ?? '').toMatch(/HOST_ENV_FETCHED_SHA256/);
  });
});
