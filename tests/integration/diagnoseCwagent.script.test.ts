/**
 * scripts/diagnose-cwagent.sh — the read-only CloudWatch agent diagnostic.
 *
 * The workstation cannot tell two silences apart: an agent running with no
 * configuration and an agent running with one whose writes are refused look the
 * same from outside, so the diagnostic reaches the host to distinguish them.
 *
 * What is pinned here is the front half, which is all of it that runs on the
 * workstation: the argument guards, and the credential guard. The credential
 * guard is the part worth pinning: a refusal naming a placeholder rather than a
 * file sends a dev-and-tester reading it to the shared account's file, the
 * connection succeeds on their key,
 * and sudo then fails with a message that reads as a broken account rather than
 * as the wrong password. Which file a run needs is a property of the account the
 * alias connects as, so both branches are exercised with that account supplied
 * rather than read from whichever machine the suite happens to run on.
 *
 * The root-side half is driven against a stand-in agent tree, as a plain user,
 * for what it reports: every config the translator merges, the translator's own
 * verdict on them written to a throwaway directory, and the credentials file by
 * shape only, never its values.
 */
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { SPAWN_GUARD } from '../fixtures/spawnGuard';
import { createScratchDir, removeScratch } from '../fixtures/scratchDir';
import { connectingAs, SHARED_ACCOUNT, NAMED_ACCOUNT } from '../fixtures/sshConfigStub';

const SCRIPT = join(process.cwd(), 'scripts/diagnose-cwagent.sh');

interface RunResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

function runScript(args: string[], extraEnv: NodeJS.ProcessEnv = {}): RunResult {
  const result = spawnSync('bash', [SCRIPT, ...args], {
    cwd: process.cwd(),
    encoding: 'utf-8',
    input: '',
    env: { ...process.env, ...extraEnv },
    ...SPAWN_GUARD,
  });
  return {
    exitCode: result.status ?? 1,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

describe('diagnose-cwagent.sh — argument validation', () => {
  it('rejects an unknown argument rather than ignoring it', () => {
    const result = runScript(['--bogus']);
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toMatch(/unknown argument/);
  });

  it('refuses a target that is neither environment', () => {
    const result = runScript(['--target', 'dev']);
    expect(result.exitCode).toBe(2);
  });

  it('refuses with no target at all rather than defaulting to one', () => {
    const result = runScript([]);
    expect(result.exitCode).toBe(2);
  });

  it('--help prints usage and exits 0', () => {
    const result = runScript(['--help']);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/diagnose-cwagent\.sh --target/);
  });
});

describe('diagnose-cwagent.sh — the credential it names', () => {
  it('names the shared account file when the alias connects as the shared account', () => {
    const result = runScript(['--target', 'staging'], connectingAs(SHARED_ACCOUNT));
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(/~\/AWS\/AWS_OPERATOR\.txt/);
  });

  it('names the personal file when the alias connects as a named account', () => {
    // The pasteable line is the whole value of naming a file, and the shared
    // account's file pasted while connected as a person pipes one identity's
    // password into another's sudo.
    const result = runScript(['--target', 'staging'], connectingAs(NAMED_ACCOUNT));
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(/~\/AWS\/DEV_TESTER_HOST\.txt/);
    expect(result.stderr).not.toMatch(/~\/AWS\/AWS_OPERATOR\.txt/);
  });

  it('refuses a production run connecting as a named account, since none exists there', () => {
    const result = runScript(['--target', 'production'], connectingAs(NAMED_ACCOUNT));
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(/is a named account, and there is none on production/);
    expect(result.stderr).not.toMatch(/DEV_TESTER_HOST_PRODUCTION/);
  });

  it('names the command to re-run, not only the file', () => {
    const result = runScript(['--target', 'staging'], connectingAs(SHARED_ACCOUNT));
    expect(result.stderr).toMatch(/diagnose-cwagent\.sh --target staging/);
    expect(result.stderr).not.toMatch(/<operator-credential-file>/);
  });

  it('refuses on an empty first line rather than piping it at the host as a password', () => {
    // A password that never arrived is not an empty password: sent on, it
    // reaches sudo as a failed attempt on a deployed host, and the diagnostic
    // reports an authentication problem it caused itself.
    const result = runScript(['--target', 'staging'], connectingAs(NAMED_ACCOUNT));
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(/expected the host sudo password/);
    expect(result.stdout).not.toMatch(/Diagnosing the CloudWatch agent/);
  });
});

describe('diagnose-cwagent-remote.sh: what the translator merges, and its verdict', () => {
  // Defect caught: the agent's log only ever says "exit status 1", so a stale
  // drop-in merged with the installer's config stopped the agent and nothing
  // named it. The diagnostic shows every merged config and the translator's
  // own message, without touching the agent's translated config.
  it('prints every merged config and the translator message, leaves no temp dir, and never prints the credentials', () => {
    const dir = createScratchDir('diagnose-cwagent');
    try {
      const agent = join(dir, 'agent');
      for (const sub of ['bin', 'etc/amazon-cloudwatch-agent.d', 'logs']) mkdirSync(join(agent, sub), { recursive: true });
      writeFileSync(join(agent, 'etc', 'amazon-cloudwatch-agent.json'), '{"metrics": {"namespace": "CWAgent"}}\n');
      writeFileSync(join(agent, 'etc', 'amazon-cloudwatch-agent.d', 'file_amazon-cloudwatch-agent.json'), '{"metrics": {"stale": true}}\n');
      const outputs = join(dir, 'translator-outputs');
      // The translator's merge refusal as staging's translator printed it on 2026-11-01.
      writeFileSync(join(agent, 'bin', 'config-translator'), [
        '#!/usr/bin/env bash',
        'while (( $# )); do [[ "$1" == --output ]] && echo "$2" >> ' + JSON.stringify(outputs) + '; shift; done',
        'echo "Failed to merge multiple json config files."',
        'echo "Under path : /metrics/metrics_collected/cpu | Error : Different values are specified for cpu"',
        'exit 1',
      ].join('\n'));
      chmodSync(join(agent, 'bin', 'config-translator'), 0o755);
      const creds = join(dir, 'credentials');
      writeFileSync(creds, '[footbag-staging-cwagent]\naws_access_key_id = AKIAEXAMPLEEXAMPLE01\naws_secret_access_key = stub-secret-never-printed\n');
      const bin = join(dir, 'stub-bin');
      mkdirSync(bin);
      writeFileSync(join(bin, 'systemctl'), '#!/usr/bin/env bash\necho stub\n');
      chmodSync(join(bin, 'systemctl'), 0o755);

      const r = spawnSync('bash', [join(process.cwd(), 'scripts/internal/diagnose-cwagent-remote.sh')], {
        encoding: 'utf-8',
        env: { ...process.env, PATH: `${bin}:${process.env.PATH ?? ''}`, CWAGENT_AGENT_DIR: agent, CWAGENT_CREDS_FILE: creds, TMPDIR: dir },
        ...SPAWN_GUARD,
      });
      const out = (r.stdout ?? '') + (r.stderr ?? '');
      expect(out).toContain('"stale": true');
      expect(out).toContain('"namespace": "CWAgent"');
      expect(out).toContain('Different values are specified for cpu');
      expect(out).toContain('translator exit: 1');
      // Its output went to a throwaway directory, removed on exit, and never to
      // the agent's own translated config.
      const written = readFileSync(outputs, 'utf-8').trim();
      expect(written).not.toBe(join(agent, 'etc', 'amazon-cloudwatch-agent.toml'));
      expect(existsSync(written)).toBe(false);
      expect(out).not.toContain('stub-secret-never-printed');
      expect(out).toContain('secret lines: 1');
    } finally {
      removeScratch(dir);
    }
  });
});
