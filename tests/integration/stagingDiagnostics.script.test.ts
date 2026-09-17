/**
 * scripts/staging_diagnostics.sh — the diagnostic toolkit an operator uploads
 * to the staging host and runs there.
 *
 * The contract it has to keep is which installation it reads. The deploy
 * promotes a release into the live install and composes the running stack from
 * there, while the directory a release is uploaded to lives in the connecting
 * account's own home and is therefore a different path for every operator. A
 * diagnostic that names one operator's upload directory is either missing on
 * everybody else's run or, worse, describes whatever that other account last
 * uploaded -- answering confidently about a stack the host is not running.
 *
 * What is pinned here:
 *
 *   - the subcommands compose against the live install, proved by driving the
 *     script and reading the arguments it actually passed;
 *   - no path in the file is rooted in a particular person's home directory;
 *   - the upload instructions name the connecting account's own home rather
 *     than a literal one.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, chmodSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { SPAWN_GUARD } from '../fixtures/spawnGuard';

const SCRIPT = join(process.cwd(), 'scripts/staging_diagnostics.sh');
const LIVE_INSTALL = '/srv/footbag';

let workDir: string;

beforeEach(() => {
  workDir = mkdtempSync(join(tmpdir(), 'footbag-test-diag-'));
});

afterEach(() => {
  rmSync(workDir, { recursive: true, force: true });
});

/**
 * Puts a `sudo` that simply runs its arguments, and a `docker` that records
 * them, ahead of everything on PATH. Both stand in for tools whose contract the
 * caller already knows -- run this, and here are the arguments -- so an
 * acknowledged fake cannot mislead the assertion about a format either tool is
 * free to change.
 */
function stubTools(): { path: string; argsFile: string } {
  const binDir = join(workDir, 'bin');
  const argsFile = join(workDir, 'docker-args.txt');
  writeFileSync(join(workDir, 'mkbin'), '', 'utf-8');
  rmSync(join(workDir, 'mkbin'));
  spawnSync('mkdir', ['-p', binDir], SPAWN_GUARD);

  const sudo = join(binDir, 'sudo');
  writeFileSync(sudo, ['#!/usr/bin/env bash', 'exec "$@"', ''].join('\n'), 'utf-8');
  chmodSync(sudo, 0o755);

  const docker = join(binDir, 'docker');
  writeFileSync(
    docker,
    ['#!/usr/bin/env bash', `printf '%s\\n' "$*" >> ${JSON.stringify(argsFile)}`, 'exit 0', ''].join(
      '\n',
    ),
    'utf-8',
  );
  chmodSync(docker, 0o755);

  return { path: `${binDir}:${process.env.PATH ?? ''}`, argsFile };
}

function runSubcommand(sub: string) {
  const { path, argsFile } = stubTools();
  const res = spawnSync('bash', [SCRIPT, sub], {
    encoding: 'utf-8',
    env: { PATH: path, HOME: workDir },
    ...SPAWN_GUARD,
  });
  let dockerArgs = '';
  try {
    dockerArgs = readFileSync(argsFile, 'utf-8');
  } catch {
    dockerArgs = '';
  }
  return { status: res.status, stdout: res.stdout ?? '', stderr: res.stderr ?? '', dockerArgs };
}

describe('the diagnostics read the live install', () => {
  it('composes status against the live install, not an upload directory', () => {
    const r = runSubcommand('status');
    expect(r.dockerArgs).toContain(`-f ${LIVE_INSTALL}/docker/docker-compose.yml`);
    expect(r.dockerArgs).toContain(`-f ${LIVE_INSTALL}/docker/docker-compose.prod.yml`);
    expect(r.dockerArgs).toContain(`--env-file ${LIVE_INSTALL}/env`);
  });

  it('still reaches the compose subcommand it was asked for', () => {
    const r = runSubcommand('status');
    expect(r.dockerArgs.trim().endsWith(' ps')).toBe(true);
  });
});

describe('no path belongs to one particular operator', () => {
  it('roots no path in a named home directory', () => {
    const source = readFileSync(SCRIPT, 'utf-8');
    const homeRooted = source
      .split('\n')
      .map((line, i) => ({ line, n: i + 1 }))
      .filter(({ line }) => /\/home\/[a-z_][a-z0-9_-]*\//.test(line));
    expect(homeRooted.map(({ n, line }) => `${n}: ${line.trim()}`)).toEqual([]);
  });

  it('uploads to the connecting account own home rather than a literal one', () => {
    const source = readFileSync(SCRIPT, 'utf-8');
    expect(source).toMatch(/scp scripts\/staging_diagnostics\.sh footbag-staging:~\//);
  });
});

describe('the subcommands are run from a session on the host', () => {
  it('never asks ssh for a terminal, which this tree forbids', () => {
    const source = readFileSync(SCRIPT, 'utf-8');
    expect(source).not.toMatch(/ssh\s+-t\b/);
    expect(source).not.toMatch(/RequestTTY/);
  });

  it('shows no subcommand passed as a one-shot argument to ssh', () => {
    const source = readFileSync(SCRIPT, 'utf-8');
    const oneShot = source
      .split('\n')
      .filter((line) => /ssh\s+\S+\s+['"].*staging_diagnostics\.sh/.test(line));
    expect(oneShot).toEqual([]);
  });
});
