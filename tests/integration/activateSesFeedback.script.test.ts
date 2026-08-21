/**
 * scripts/activate-ses-feedback.sh — the rewrite contract and the refusals.
 *
 * A real run reads /srv/footbag/env down from a deployed host over ssh, so CI
 * exercises the synthetic --env-file mode, which reaches no host and needs no
 * credentials. That mode must also need no ssh configuration: a preflight that
 * demands a deploy alias before the local-file branch is reached turns the mode
 * meant for machines without a host into one that only a host operator can run.
 *
 * The refusal this suite exists for is the topic one. The feedback webhook
 * authenticates on its shared key AND on the publishing topic, because a valid
 * signature proves only that some topic in some AWS account signed the payload.
 * A host holding the key with no expected topic therefore refuses every
 * delivery — and refuses it quietly, which reads as a feed nobody has pointed at
 * the app yet rather than one that is broken. Installing the key without the
 * topic is the single most plausible way to reach that state, so the script
 * refuses to create it and names the script that owns the missing value.
 *
 * The key is also its own secret, distinct from the worker IPC secret. It rides
 * the subscription URL's query string, where access logs capture it, so a leak
 * there must not extend to anything else.
 */
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { SPAWN_GUARD } from '../fixtures/spawnGuard';

const SCRIPT = join(process.cwd(), 'scripts/activate-ses-feedback.sh');

const TOPIC = 'SES_FEEDBACK_TOPIC_ARN=arn:aws:sns:us-east-1:000000000000:footbag-staging-ses-feedback';
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
  const dir = mkdtempSync(join(tmpdir(), 'footbag-test-sesfeedback-'));
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
    .filter((l) => l.startsWith('SES_FEEDBACK_WEBHOOK_KEY='));
}

describe('activate-ses-feedback.sh', () => {
  it('refuses when the expected topic is unset, and changes nothing', () => {
    withEnvFile(`${BASE}\nINTERNAL_EVENT_SECRET=abc\n`, (path) => {
      const before = readFileSync(path, 'utf-8');
      const r = run(['--target', 'staging', '--env-file', path]);
      expect(r.exitCode).toBe(1);
      expect(r.stderr).toMatch(/SES_FEEDBACK_TOPIC_ARN is not set/);
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
      expect(keys[0]).toMatch(/^SES_FEEDBACK_WEBHOOK_KEY=[0-9a-f]{64}$/);
      // The value the operator must copy into tfvars is printed exactly once.
      expect(r.stdout).toContain(
        'ses_feedback_webhook_url = "https://staging.example.test/webhooks/ses-feedback?key=',
      );
    });
  });

  it('generates a key distinct from the worker IPC secret', () => {
    withEnvFile(`${BASE}\n${TOPIC}\nINTERNAL_EVENT_SECRET=abc\n`, (path) => {
      const r = run(['--target', 'staging', '--env-file', path]);
      expect(r.exitCode).toBe(0);
      const installed = keyLines(path)[0].split('=')[1];
      expect(installed).not.toBe('abc');
      // Reassigning the IPC secret would extend an access-log leak of the
      // query string to the endpoints that secret protects.
      expect(readFileSync(path, 'utf-8')).toContain('INTERNAL_EVENT_SECRET=abc');
    });
  });

  it('never prints the key unmasked in the diff it shows', () => {
    withEnvFile(`${BASE}\n${TOPIC}\n`, (path) => {
      const r = run(['--target', 'staging', '--env-file', path]);
      expect(r.exitCode).toBe(0);
      const installed = keyLines(path)[0].split('=')[1];
      const diffSection = r.stdout.slice(
        0,
        r.stdout.indexOf('== SES feedback-webhook key installed'),
      );
      expect(diffSection).toContain('SES_FEEDBACK_WEBHOOK_KEY=********');
      expect(diffSection).not.toContain(installed);
    });
  });

  it('refuses to clobber a key already in service, and replaces it under --rotate', () => {
    withEnvFile(`${BASE}\n${TOPIC}\nSES_FEEDBACK_WEBHOOK_KEY=live-key-in-service\n`, (path) => {
      const refused = run(['--target', 'staging', '--env-file', path]);
      expect(refused.exitCode).toBe(1);
      expect(refused.stderr).toMatch(/already set/);
      expect(keyLines(path)).toEqual(['SES_FEEDBACK_WEBHOOK_KEY=live-key-in-service']);

      const rotated = run(['--target', 'staging', '--env-file', path, '--rotate']);
      expect(rotated.exitCode).toBe(0);
      const keys = keyLines(path);
      expect(keys).toHaveLength(1);
      expect(keys[0]).not.toBe('SES_FEEDBACK_WEBHOOK_KEY=live-key-in-service');
    });
  });

  it('collapses duplicate assignments so the file cannot disagree with the diff', () => {
    // Last-wins parsing means a stale duplicate below the rewritten line would
    // silently win over the value the operator was shown.
    withEnvFile(
      `${BASE}\n${TOPIC}\nSES_FEEDBACK_WEBHOOK_KEY=one\nOTHER=x\nSES_FEEDBACK_WEBHOOK_KEY=two\n`,
      (path) => {
        const r = run(['--target', 'staging', '--env-file', path, '--rotate']);
        expect(r.exitCode).toBe(0);
        expect(keyLines(path)).toHaveLength(1);
        expect(readFileSync(path, 'utf-8')).toContain('OTHER=x');
      },
    );
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

  it('runs the local-file mode without any ssh alias configured', () => {
    // The synthetic mode exists for machines that never reach a host. An ssh
    // preflight running ahead of this branch would make it demand the deploy
    // alias it is defined not to need, and CI would be the first to notice.
    withEnvFile(`${BASE}\n${TOPIC}\n`, (path) => {
      const r = run([
        '--target',
        'staging',
        '--ssh-alias',
        'no-such-alias-in-any-ssh-config',
        '--env-file',
        path,
      ]);
      expect(r.exitCode).toBe(0);
      expect(r.stderr).not.toMatch(/is not configured/);
      expect(keyLines(path)).toHaveLength(1);
    });
  });
});

/**
 * The reverse of activation. It exists so arming the feedback loop is a
 * decision that can be taken back: without it, returning to a clean state means
 * unsetting a host env line by hand, deleting a subscription, and re-editing a
 * values file, all improvised after the fact from a procedure that was scripted
 * on the way in.
 *
 * The refusal it turns on is the live-adapter one. Removing the key from a host
 * still sending real mail leaves the subscription publishing to an endpoint
 * that rejects every delivery, which looks like a feed with nothing to report
 * rather than a broken one — the same quiet-failure shape the topic refusal
 * above exists to prevent on the way in.
 */
describe('activate-ses-feedback.sh --deactivate', () => {
  const STUB = 'SES_ADAPTER=stub';

  it('removes the key and leaves every other value untouched', () => {
    withEnvFile(
      `${BASE}\n${TOPIC}\n${STUB}\nSES_FEEDBACK_WEBHOOK_KEY=installed-key\nINTERNAL_EVENT_SECRET=abc\n`,
      (path) => {
        const r = run(['--target', 'staging', '--env-file', path, '--deactivate', '--no-tfvars']);
        expect(r.exitCode).toBe(0);
        expect(keyLines(path)).toHaveLength(0);
        const after = readFileSync(path, 'utf-8');
        // The topic ARN is a non-secret operator value owned elsewhere, and it
        // is what a later activation checks before installing a key at all.
        expect(after).toContain(TOPIC);
        expect(after).toContain('INTERNAL_EVENT_SECRET=abc');
      },
    );
  });

  it('refuses while the host still runs the live SES adapter, and changes nothing', () => {
    withEnvFile(
      `${BASE}\n${TOPIC}\nSES_ADAPTER=live\nSES_FEEDBACK_WEBHOOK_KEY=installed-key\n`,
      (path) => {
        const before = readFileSync(path, 'utf-8');
        const r = run(['--target', 'staging', '--env-file', path, '--deactivate', '--no-tfvars']);
        expect(r.exitCode).toBe(1);
        expect(r.stderr).toMatch(/still runs the live SES adapter/);
        expect(readFileSync(path, 'utf-8')).toBe(before);
      },
    );
  });

  it('reports the state rather than failing when there is no key to remove', () => {
    withEnvFile(`${BASE}\n${TOPIC}\n${STUB}\n`, (path) => {
      const r = run(['--target', 'staging', '--env-file', path, '--deactivate', '--no-tfvars']);
      // Idempotent, so an interrupted removal can simply be repeated.
      expect(r.exitCode).toBe(0);
      expect(r.stdout).toMatch(/already absent/);
      expect(keyLines(path)).toHaveLength(0);
    });
  });

  it('never prints the removed key in the diff it shows', () => {
    withEnvFile(
      `${BASE}\n${TOPIC}\n${STUB}\nSES_FEEDBACK_WEBHOOK_KEY=secret-value-here\n`,
      (path) => {
        const r = run(['--target', 'staging', '--env-file', path, '--deactivate', '--no-tfvars']);
        expect(r.exitCode).toBe(0);
        expect(r.stdout).not.toContain('secret-value-here');
      },
    );
  });

  it('refuses the two opposite outcomes asked for together', () => {
    const r = run(['--target', 'staging', '--deactivate', '--rotate']);
    expect(r.exitCode).toBe(2);
    expect(r.stderr).toMatch(/opposite outcomes/);
  });

  it('directs the operator to clear the terraform value that counts the subscription', () => {
    withEnvFile(
      `${BASE}\n${TOPIC}\n${STUB}\nSES_FEEDBACK_WEBHOOK_KEY=installed-key\n`,
      (path) => {
        const r = run(['--target', 'staging', '--env-file', path, '--deactivate', '--no-tfvars']);
        expect(r.exitCode).toBe(0);
        // Every feedback resource is counted on this value being non-empty, so
        // emptying it is what actually removes the subscription.
        expect(r.stdout).toContain('ses_feedback_webhook_url = ""');
      },
    );
  });
});
