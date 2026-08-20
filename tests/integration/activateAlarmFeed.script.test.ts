/**
 * scripts/activate-alarm-feed.sh — the rewrite contract and the refusals.
 *
 * A real run reads /srv/footbag/env down from a deployed host over ssh, so CI
 * exercises the synthetic --env-file mode, which reaches no host and needs no
 * credentials.
 *
 * The refusal this suite exists for is the topic one. The alarm webhook
 * authenticates on its shared key AND on the publishing topic, because a valid
 * signature proves only that some topic in some AWS account signed the payload.
 * A host holding the key with no expected topic therefore refuses every
 * delivery — and refuses it quietly, which reads as a feed nobody has pointed at
 * the app yet rather than one that is broken. Installing the key without the
 * topic is the single most plausible way to reach that state, so the script
 * refuses to create it and names the script that owns the missing value.
 */
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { SPAWN_GUARD } from '../fixtures/spawnGuard';

const SCRIPT = join(process.cwd(), 'scripts/activate-alarm-feed.sh');

const TOPIC = 'ALARM_TOPIC_ARN=arn:aws:sns:us-east-1:000000000000:footbag-staging-alarms';
const BASE = 'PUBLIC_BASE_URL=https://staging.example.test';

interface RunResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

function run(args: string[]): RunResult {
  const r = spawnSync('bash', [SCRIPT, ...args], {
    cwd: process.cwd(),
    encoding: 'utf-8',
    ...SPAWN_GUARD,
  });
  return { exitCode: r.status ?? -1, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}

function withEnvFile(contents: string, fn: (path: string) => void): void {
  const dir = mkdtempSync(join(tmpdir(), 'footbag-test-alarmfeed-'));
  const path = join(dir, 'env');
  writeFileSync(path, contents, 'utf-8');
  try {
    fn(path);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function keyLines(path: string): string[] {
  return readFileSync(path, 'utf-8')
    .split('\n')
    .filter((l) => l.startsWith('ALARM_WEBHOOK_KEY='));
}

describe('activate-alarm-feed.sh', () => {
  it('refuses when the expected topic is unset, and changes nothing', () => {
    withEnvFile(`${BASE}\nINTERNAL_EVENT_SECRET=abc\n`, (path) => {
      const before = readFileSync(path, 'utf-8');
      const r = run(['--target', 'staging', '--env-file', path]);
      expect(r.exitCode).toBe(1);
      expect(r.stderr).toMatch(/ALARM_TOPIC_ARN is not set/);
      // The refusal names the script that owns the missing value, so the
      // operator is not left to guess where a non-secret host value comes from.
      expect(r.stderr).toMatch(/set-host-env\.sh/);
      expect(readFileSync(path, 'utf-8')).toBe(before);
    });
  });

  it('appends a fresh key when the topic is set', () => {
    withEnvFile(`${BASE}\n${TOPIC}\nINTERNAL_EVENT_SECRET=abc\n`, (path) => {
      const r = run(['--target', 'staging', '--env-file', path]);
      expect(r.exitCode).toBe(0);
      const keys = keyLines(path);
      expect(keys).toHaveLength(1);
      expect(keys[0]).toMatch(/^ALARM_WEBHOOK_KEY=[0-9a-f]{64}$/);
      // The value the operator must copy into tfvars is printed exactly once.
      expect(r.stdout).toContain('alarm_webhook_url = "https://staging.example.test/webhooks/platform-alarm?key=');
    });
  });

  it('never prints the key unmasked in the diff it shows', () => {
    withEnvFile(`${BASE}\n${TOPIC}\n`, (path) => {
      const r = run(['--target', 'staging', '--env-file', path]);
      expect(r.exitCode).toBe(0);
      const installed = keyLines(path)[0].split('=')[1];
      const diffSection = r.stdout.slice(0, r.stdout.indexOf('== Platform-alarm webhook key installed'));
      expect(diffSection).toContain('ALARM_WEBHOOK_KEY=********');
      expect(diffSection).not.toContain(installed);
    });
  });

  it('refuses to clobber a key already in service, and replaces it under --rotate', () => {
    withEnvFile(`${BASE}\n${TOPIC}\nALARM_WEBHOOK_KEY=live-key-in-service\n`, (path) => {
      const refused = run(['--target', 'staging', '--env-file', path]);
      expect(refused.exitCode).toBe(1);
      expect(refused.stderr).toMatch(/already set/);
      expect(keyLines(path)).toEqual(['ALARM_WEBHOOK_KEY=live-key-in-service']);

      const rotated = run(['--target', 'staging', '--env-file', path, '--rotate']);
      expect(rotated.exitCode).toBe(0);
      const keys = keyLines(path);
      expect(keys).toHaveLength(1);
      expect(keys[0]).not.toBe('ALARM_WEBHOOK_KEY=live-key-in-service');
    });
  });

  it('collapses duplicate assignments so the file cannot disagree with the diff', () => {
    // Last-wins parsing means a stale duplicate below the rewritten line would
    // silently win over the value the operator was shown.
    withEnvFile(`${BASE}\n${TOPIC}\nALARM_WEBHOOK_KEY=one\nOTHER=x\nALARM_WEBHOOK_KEY=two\n`, (path) => {
      const r = run(['--target', 'staging', '--env-file', path, '--rotate']);
      expect(r.exitCode).toBe(0);
      expect(keyLines(path)).toHaveLength(1);
      expect(readFileSync(path, 'utf-8')).toContain('OTHER=x');
    });
  });

  it('refuses without a base URL, since the subscription URL cannot be composed', () => {
    withEnvFile(`${TOPIC}\n`, (path) => {
      const r = run(['--target', 'staging', '--env-file', path]);
      expect(r.exitCode).toBe(1);
      expect(r.stderr).toMatch(/PUBLIC_BASE_URL/);
      expect(keyLines(path)).toHaveLength(0);
    });
  });

  it('refuses an unknown target rather than guessing a host', () => {
    const r = run(['--target', 'nowhere']);
    expect(r.exitCode).toBe(2);
    expect(r.stderr).toMatch(/must be 'staging' or 'production'/);
  });
});

describe('activate-alarm-feed.sh — retrieving a pending confirmation', () => {
  // The confirmation URL is a bearer token the application deliberately keeps
  // out of the audit trail and puts on its log line instead. Reading it back is
  // a scripted step so no operator types `docker logs | grep` at a host.
  const source = readFileSync(SCRIPT, 'utf-8');

  it('refuses without a credential file rather than reaching a host', () => {
    const r = run(['--target', 'staging', '--show-confirmation']);
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toMatch(/expected the host sudo password/);
  });

  it('reads the log rather than the audit trail', () => {
    // The audit row carries the topic ARN and not the URL, by design, so a
    // sqlite query here would return a row that never holds what is wanted.
    const mode = source.slice(source.indexOf('if (( SHOW_CONFIRMATION ))'));
    const block = mode.slice(0, mode.indexOf('exit 0'));
    expect(block).toMatch(/host_log_tail/);
    expect(block).toMatch(/alarm_feed\.subscription_confirmation_pending/);
    expect(block).not.toMatch(/sqlite3/);
  });

  it('prints the URL and never opens it', () => {
    // The application refuses to fetch that URL because a forged confirmation
    // makes it attacker-chosen. A script fetching it moves the same hazard one
    // layer out rather than removing it.
    //
    // Matched at command position, not by mention: the mode's own text tells
    // the operator to open the URL with curl, which is advice rather than an
    // invocation.
    const mode = source.slice(source.indexOf('if (( SHOW_CONFIRMATION ))'));
    const block = mode.slice(0, mode.indexOf('exit 0'));
    const invocations = block
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => /^(curl|wget|xdg-open|open)\b/.test(l));
    expect(invocations).toEqual([]);
  });

  it('names what a rejected URL means instead of reporting it as absent', () => {
    // '(rejected)' is the app declining to log a URL that failed validation.
    // Reported as "not found" it sends the operator looking for a missing
    // message rather than at a refusal.
    const mode = source.slice(source.indexOf('if (( SHOW_CONFIRMATION ))'));
    expect(mode).toMatch(/refused to log that URL/);
    expect(mode).toMatch(/length bound/);
  });

  it('generates no key in this mode', () => {
    // It reads. An accidental rotation here would invalidate a subscription
    // that is mid-confirmation.
    const mode = source.slice(source.indexOf('if (( SHOW_CONFIRMATION ))'));
    const block = mode.slice(0, mode.indexOf('exit 0'));
    expect(block).not.toMatch(/openssl rand/);
    expect(block).not.toMatch(/host_env_install/);
  });
});

describe('activate-alarm-feed.sh — writing the terraform values file', () => {
  it('writes the url into the values file instead of printing it', () => {
    withEnvFile(`${BASE}\n${TOPIC}\n`, (envPath) => {
      const tfvars = join(dirname(envPath), 'staging.secrets.auto.tfvars');
      writeFileSync(tfvars, 'other_var = "x"\n', 'utf-8');

      const r = run(['--target', 'staging', '--env-file', envPath, '--tfvars', tfvars, '--yes']);
      expect(r.exitCode).toBe(0);

      const installedKey = keyLines(envPath)[0].split('=')[1];
      const written = readFileSync(tfvars, 'utf-8');
      expect(written).toContain(`alarm_webhook_url = "https://staging.example.test/webhooks/platform-alarm?key=${installedKey}"`);
      expect(written).toContain('other_var = "x"');
      // The whole point: the secret reaches the file without crossing a screen.
      expect(r.stdout).not.toContain(installedKey);
    });
  });

  it('masks the key in the values-file diff it shows', () => {
    withEnvFile(`${BASE}\n${TOPIC}\n`, (envPath) => {
      const tfvars = join(dirname(envPath), 'staging.secrets.auto.tfvars');
      writeFileSync(tfvars, 'other_var = "x"\n', 'utf-8');

      const r = run(['--target', 'staging', '--env-file', envPath, '--tfvars', tfvars, '--yes']);
      expect(r.exitCode).toBe(0);
      // The host-env mask keys on SECRET/KEY in the variable NAME, which
      // alarm_webhook_url does not carry; the query-string mask is what covers
      // this, and its absence would print the key in the diff.
      expect(r.stdout).toContain('key=********');
    });
  });

  it('collapses a stale duplicate assignment, which terraform would otherwise prefer', () => {
    withEnvFile(`${BASE}\n${TOPIC}\n`, (envPath) => {
      const tfvars = join(dirname(envPath), 'staging.secrets.auto.tfvars');
      writeFileSync(tfvars, 'alarm_webhook_url = "old-one"\nkeep = "me"\nalarm_webhook_url = "old-two"\n', 'utf-8');

      const r = run(['--target', 'staging', '--env-file', envPath, '--tfvars', tfvars, '--yes']);
      expect(r.exitCode).toBe(0);
      const lines = readFileSync(tfvars, 'utf-8').split('\n').filter(l => l.startsWith('alarm_webhook_url'));
      expect(lines).toHaveLength(1);
      expect(lines[0]).not.toContain('old-one');
      expect(lines[0]).not.toContain('old-two');
      expect(readFileSync(tfvars, 'utf-8')).toContain('keep = "me"');
    });
  });

  it('refuses an in-repo path that git does not ignore', () => {
    // What protects a live webhook secret is gitignore, not the file's
    // location. A path git would pick up is refused wherever it sits.
    withEnvFile(`${BASE}\n${TOPIC}\n`, (envPath) => {
      const tracked = join(process.cwd(), 'tmp-footbag-test-values.txt');
      writeFileSync(tracked, 'x = "y"\n', 'utf-8');
      try {
        const r = run(['--target', 'staging', '--env-file', envPath, '--tfvars', tracked, '--yes']);
        expect(r.exitCode).toBe(1);
        expect(r.stderr).toMatch(/git does not ignore it/);
        expect(readFileSync(tracked, 'utf-8')).toBe('x = "y"\n');
      } finally {
        rmSync(tracked, { force: true });
      }
    });
  });

  it('accepts a gitignored path inside the repository', () => {
    // The ordinary in-tree location. Requiring a second checkout to hold this
    // file would make a machine with only a local credential file unable to
    // activate anything, which is a supported configuration.
    withEnvFile(`${BASE}\n${TOPIC}\n`, (envPath) => {
      const ignored = join(process.cwd(), 'tmp-footbag-test.auto.tfvars');
      writeFileSync(ignored, 'keep = "me"\n', 'utf-8');
      try {
        const r = run(['--target', 'staging', '--env-file', envPath, '--tfvars', ignored, '--yes']);
        expect(r.exitCode).toBe(0);
        const written = readFileSync(ignored, 'utf-8');
        expect(written).toContain('alarm_webhook_url = "https://staging.example.test/webhooks/platform-alarm?key=');
        expect(written).toContain('keep = "me"');
      } finally {
        rmSync(ignored, { force: true });
      }
    });
  });

  it('creates the values file when it does not exist yet', () => {
    // First activation on a fresh machine: refusing here would leave the
    // operator holding a correct key with nowhere to put it.
    withEnvFile(`${BASE}\n${TOPIC}\n`, (envPath) => {
      const fresh = join(dirname(envPath), 'not-there-yet.auto.tfvars');
      const r = run(['--target', 'staging', '--env-file', envPath, '--tfvars', fresh, '--yes']);
      expect(r.exitCode).toBe(0);
      expect(readFileSync(fresh, 'utf-8')).toContain('alarm_webhook_url = "https://');
    });
  });

  it('refuses a symlink pointing at nothing rather than replacing it', () => {
    withEnvFile(`${BASE}\n${TOPIC}\n`, (envPath) => {
      const dangling = join(dirname(envPath), 'dangling.auto.tfvars');
      symlinkSync(join(dirname(envPath), 'no-such-target'), dangling);
      const r = run(['--target', 'staging', '--env-file', envPath, '--tfvars', dangling, '--yes']);
      expect(r.exitCode).toBe(1);
      expect(r.stderr).toMatch(/pointing at nothing/);
    });
  });

  it('--no-tfvars keeps the old printed-value behaviour', () => {
    withEnvFile(`${BASE}\n${TOPIC}\n`, (envPath) => {
      const r = run(['--target', 'staging', '--env-file', envPath, '--no-tfvars']);
      expect(r.exitCode).toBe(0);
      expect(r.stdout).toContain('alarm_webhook_url = "https://staging.example.test/webhooks/platform-alarm?key=');
    });
  });
});
