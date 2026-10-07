/**
 * scripts/internal/host-identity-remote.sh, the root-side body that tells every
 * host-reaching operator script which environment the host it reached records.
 *
 * Every refusal of a mistargeted run rests on this answer, and every other suite
 * stands in for it with a canned reply, so here the real body runs: directly
 * against fixture env files, and once end to end behind the shared library's
 * check through a stand-in client that does what the host does (consume the
 * password line as sudo would, run the rest in bash).
 *
 * The env file holds the host's whole secret set; the body exists to answer
 * with two non-secret values and nothing else.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

import { SPAWN_GUARD } from '../fixtures/spawnGuard';
import { createScratchDir, removeScratch } from '../fixtures/scratchDir';

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const BODY = path.join(REPO_ROOT, 'scripts', 'internal', 'host-identity-remote.sh');
const LIB = path.join(REPO_ROOT, 'scripts', 'lib', 'host-env-remote.sh');

const SECRET = 'session-secret-fixture-value';

let root: string;
let n = 0;

beforeAll(() => {
  root = createScratchDir('host-identity-remote');
});
afterAll(() => removeScratch(root));

function envFile(lines: string[]): string {
  const file = path.join(root, `env-${++n}`);
  fs.writeFileSync(file, lines.join('\n') + '\n');
  return file;
}

function answer(file: string) {
  const res = spawnSync('bash', [BODY], {
    encoding: 'utf-8',
    env: { ...process.env, HOST_ENV_PATH: file },
    ...SPAWN_GUARD,
  });
  return res;
}

/** The two values between the sentinels, as the shared library reads them. */
function parsed(stdout: string) {
  const lines = stdout.split('\n');
  const after = (marker: string) => lines[lines.indexOf(marker) + 1];
  return { env: after('---FOOTBAG-HOST-ENV---'), url: after('---FOOTBAG-HOST-URL---') };
}

describe('host-identity-remote.sh answers which environment the host records', () => {
  it('answers the environment and the address, and nothing of the secrets beside them', () => {
    const res = answer(envFile([
      `SESSION_SECRET=${SECRET}`,
      'FOOTBAG_ENV=staging',
      'PUBLIC_BASE_URL=https://staging.example.invalid',
      `AWS_SECRET_ACCESS_KEY=${SECRET}`,
    ]));
    expect(res.status, res.stderr).toBe(0);
    expect(parsed(res.stdout)).toEqual({ env: 'staging', url: 'https://staging.example.invalid' });
    expect(res.stdout).not.toContain(SECRET);
    expect(res.stdout.trim().split('\n')).toHaveLength(5);
  });

  it('takes the last assignment, as the services reading the file do', () => {
    // A file edited by appending carries both lines; answering the first would
    // confirm the environment the host has stopped being.
    const res = answer(envFile(['FOOTBAG_ENV=staging', 'FOOTBAG_ENV=production']));
    expect(parsed(res.stdout).env).toBe('production');
  });

  it('matches the whole name, never a longer one that starts with it', () => {
    const res = answer(envFile(['FOOTBAG_ENV_PREVIOUS=production', 'FOOTBAG_ENV=staging']));
    expect(parsed(res.stdout).env).toBe('staging');
    const none = answer(envFile(['FOOTBAG_ENV_PREVIOUS=production']));
    expect(parsed(none.stdout).env).toBe('');
  });

  it('keeps an address whose query carries an equals sign whole', () => {
    const res = answer(envFile(['FOOTBAG_ENV=staging', 'PUBLIC_BASE_URL=https://x.example.invalid/?a=b']));
    expect(parsed(res.stdout).url).toBe('https://x.example.invalid/?a=b');
  });

  it('answers empty, not an error, for a host that records nothing yet', () => {
    // What an unrecorded host means is the caller's rule; the body only reports.
    const res = answer(envFile(['OTHER=1']));
    expect(res.status).toBe(0);
    expect(parsed(res.stdout)).toEqual({ env: '', url: '' });
  });

  it('refuses a missing env file rather than answering empty', () => {
    const res = answer(path.join(root, 'absent-env'));
    expect(res.status).toBe(1);
    expect(res.stderr).toContain('does not exist or is unreadable');
    expect(res.stdout).not.toContain('---FOOTBAG-HOST-ENV---');
  });
});

describe('the shared check, answered by the real body', () => {
  const stub = () => {
    const file = path.join(root, 'ssh');
    fs.writeFileSync(file, '#!/usr/bin/env bash\nIFS= read -r _password\nexec bash\n', { mode: 0o755 });
    return file;
  };

  function ask(target: string, file: string) {
    return spawnSync('bash', ['-c',
      `source "${LIB}"; HOST_SSH_OPTS=(-o BatchMode=yes); HOST_SSH_BIN="${stub()}"; SUDO_PASS=pw; ` +
      `require_host_is footbag-${target} ${target} "${file}"`], {
      encoding: 'utf-8',
      ...SPAWN_GUARD,
    });
  }

  it('confirms a host recording the target, and refuses one recording the other or none', () => {
    const staging = envFile(['FOOTBAG_ENV=staging']);
    const ok = ask('staging', staging);
    expect(ok.status, ok.stderr).toBe(0);
    expect(ok.stderr).toContain('host confirmed: footbag-staging records FOOTBAG_ENV=staging');

    const wrong = ask('production', staging);
    expect(wrong.status).toBe(1);
    expect(wrong.stderr).toContain('records FOOTBAG_ENV=staging, but this run is --target production');

    const blank = ask('staging', envFile(['OTHER=1']));
    expect(blank.status).toBe(1);
    expect(blank.stderr).toContain('records no FOOTBAG_ENV');
  });
});
