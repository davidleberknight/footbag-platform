/**
 * scripts/install-cwagent-staging.sh and install-cwagent-production.sh — the
 * refusals around retiring the monitoring publisher's access key.
 *
 * A rotation of this credential is three runs: mint the replacement alongside
 * the old key so metrics never stop, prove the new one is the one publishing,
 * then cut the predecessor. The last two were documented and had no code, so a
 * rotation ended with two live keys and retired nothing, which is the failure
 * the shared key library exists to close.
 *
 * The install half carries a credential to a host and belongs to an operator
 * with a real terminal; it is not exercised here. What is pinned is everything
 * that decides whether a live key changes state:
 *
 *   - minting and cutting are separate runs, and asking for both at once is
 *     refused rather than ordered arbitrarily;
 *   - a retirement reaches no host, so it does not fail on an unreachable one
 *     and leave the rotation stuck halfway;
 *   - a retirement is refused unless the three host metrics are bound and live,
 *     because a running agent proves nothing about which credential is
 *     publishing or whether the alarms are watching anything;
 *   - each environment's retirement proves that environment's own namespace;
 *   - deactivating and deleting each take a typed confirmation, and without a
 *     terminal to type it on the key is left alone.
 *
 * The aws CLI is stubbed through the scripts' own seams, so nothing here
 * reaches an account.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, chmodSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { SPAWN_GUARD } from '../fixtures/spawnGuard';
import { NO_AWS_CREDENTIALS } from '../fixtures/awsIsolation';
import { awsIdentityStubEnv } from '../fixtures/awsIdentityStub';

const INSTALLERS = [
  {
    environment: 'staging',
    script: 'scripts/install-cwagent-staging.sh',
    publisher: 'footbag-staging-cwagent-publisher',
    namespace: 'CWAgent',
  },
  {
    environment: 'production',
    script: 'scripts/install-cwagent-production.sh',
    publisher: 'footbag-production-cwagent-publisher',
    namespace: 'CWAgent/production',
  },
] as const;

let stubDir: string;

beforeEach(() => {
  stubDir = mkdtempSync(join(tmpdir(), 'footbag-test-cwagent-install-'));
});

afterEach(() => {
  rmSync(stubDir, { recursive: true, force: true });
});

/**
 * One stub serving both seams, because both scripts reach the same binary: the
 * verification child asks CloudWatch for datapoints and the key library asks
 * IAM for the key list. `datapoints` is what every metric query returns, so a
 * zero is the whole-estate "nothing is arriving" case the retirement must
 * refuse on.
 */
function awsStub(opts: { datapoints?: string; keyRows?: string } = {}): string {
  const datapoints = opts.datapoints ?? '3';
  const keyRows = opts.keyRows ?? 'AKIAOLD\\tActive\\nAKIANEW\\tActive\\n';
  const path = join(stubDir, 'aws-stub.sh');
  writeFileSync(
    path,
    [
      '#!/usr/bin/env bash',
      `echo "$*" >> "${join(stubDir, 'calls.log')}"`,
      'case "$2" in',
      `  get-metric-statistics) echo "${datapoints}";;`,
      '  describe-alarms) echo 3;;',
      `  list-access-keys) printf '%b' "${keyRows}";;`,
      '  update-access-key) exit 0;;',
      '  delete-access-key) exit 0;;',
      'esac',
      'exit 0',
    ].join('\n'),
    'utf-8',
  );
  chmodSync(path, 0o755);
  return path;
}

function run(script: string, args: string[], stubOpts: Parameters<typeof awsStub>[0] = {}) {
  const stub = awsStub(stubOpts);
  const result = spawnSync('bash', [join(process.cwd(), script), ...args], {
    cwd: process.cwd(),
    encoding: 'utf-8',
    input: '',
    env: {
      ...process.env,
      ...NO_AWS_CREDENTIALS,
      // The run settles and proves its operator identity before it mints a key.
      ...awsIdentityStubEnv(stubDir),
      IAM_KEY_AWS_BIN: stub,
      CWAGENT_VERIFY_AWS_BIN: stub,
    },
    ...SPAWN_GUARD,
  });
  return {
    status: result.status,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

function calls(): string[] {
  const log = join(stubDir, 'calls.log');
  if (!existsSync(log)) return [];
  return readFileSync(log, 'utf-8').trim().split('\n');
}

describe.each(INSTALLERS)(
  '$script — retirement guards',
  ({ environment, script, publisher, namespace }) => {
    it('refuses an unknown argument rather than ignoring it', () => {
      const r = run(script, ['--retire', 'AKIAOLD', '--nope']);
      expect(r.status).toBe(2);
      expect(r.stderr).toContain("unknown argument '--nope'");
    });

    it('refuses --retire with no key id', () => {
      const r = run(script, ['--retire']);
      expect(r.status).toBe(2);
      expect(r.stderr).toMatch(/--retire requires the key id/);
    });

    it('refuses --delete with no key id', () => {
      const r = run(script, ['--delete']);
      expect(r.status).toBe(2);
      expect(r.stderr).toMatch(/--delete requires the key id/);
    });

    it('refuses to mint and cut in one run', () => {
      // The window between them is the point: the old key stays active so
      // metrics never stop, and the operator watches before cutting it.
      const r = run(script, ['--rotate', '--retire', 'AKIAOLD']);
      expect(r.status).toBe(2);
      expect(r.stderr).toMatch(/separate/);
    });

    it('reaches no host on a retirement', () => {
      // A key retirement has nothing to do with whether the host is answering.
      // Failing it on an unreachable host would leave a rotation halfway, with
      // two live keys and nothing to say which is in service.
      const r = run(script, ['--retire', 'AKIAOLD'], { datapoints: '0' });
      expect(r.stdout).not.toContain('Deploy target');
      expect(r.stdout).not.toContain('SSH OK');
    });

    it('refuses to retire while the host metrics are not arriving', () => {
      const r = run(script, ['--retire', 'AKIAOLD'], { datapoints: '0' });
      expect(r.status).toBe(1);
      expect(r.stderr).toMatch(/Nothing retired/);
      // Refused before IAM was touched at all, not after reading the key list
      // and changing its mind.
      expect(calls().join('\n')).not.toMatch(/access-key/);
    });

    it(`proves ${environment}'s own metric namespace before retiring`, () => {
      // The agent publishes no instance dimension, so the namespace is the only
      // thing separating one environment's numbers from the other's. Proving
      // the wrong one would retire a production key on staging's evidence.
      run(script, ['--retire', 'AKIAOLD'], { datapoints: '0' });
      const queried = calls().filter((c) => c.includes('get-metric-statistics'));
      expect(queried.length).toBeGreaterThan(0);
      expect(queried.every((c) => c.includes(`--namespace ${namespace} `))).toBe(true);
    });

    it('leaves the key alone when there is no terminal to confirm on', () => {
      const r = run(script, ['--retire', 'AKIAOLD']);
      expect(r.status).toBe(1);
      expect(r.stderr).toMatch(/no terminal to confirm on/);
      expect(calls().join('\n')).not.toMatch(/update-access-key/);
    });

    it('takes a typed confirmation before deleting, and deletes nothing without one', () => {
      const r = run(script, ['--delete', 'AKIAOLD']);
      expect(r.status).toBe(1);
      expect(r.stderr).toMatch(/no terminal to confirm on/);
      expect(calls().join('\n')).not.toMatch(/delete-access-key/);
    });

    it('names the publisher user it would act on, not a generic identity', () => {
      const r = run(script, ['--delete', 'AKIAOLD']);
      expect(r.stdout).toContain(publisher);
    });

    it('offers the retirement flags in its own usage text', () => {
      // The vault entry this script writes tells the operator to rotate with
      // these flags. A flag named in a credential record and absent from the
      // script is how a documented rotation stops halfway.
      const r = run(script, ['--help']);
      expect(r.stdout).toMatch(/--retire <id>/);
      expect(r.stdout).toMatch(/--delete <id>/);
    });
  },
);
