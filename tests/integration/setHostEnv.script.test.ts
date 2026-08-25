/**
 * scripts/set-host-env.sh — the rewrite contract, the refusals, and the single
 * definition of the proxy hop count.
 *
 * A real run stages /srv/footbag/env down from a host through an interactive
 * sudo and reads the snapshots bucket name out of Terraform state, neither of
 * which CI can do. The synthetic --env-file mode operates on a local file with
 * the bucket name supplied through BACKUP_S3_BUCKET_VALUE, reaching no host and
 * no AWS.
 *
 * The hop count is the reason this suite exists as much as the script is. Three
 * scripts have an opinion about the same host, and the value used to be written
 * out in two of them independently. The assertions below pin that there is now
 * one definition, that each script reads it, and that nothing reintroduces a
 * literal alongside it, because a disagreement between those copies would fail
 * nothing at runtime and would quietly coarsen rate limiting.
 */
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { SPAWN_GUARD } from '../fixtures/spawnGuard';

const SCRIPT = join(process.cwd(), 'scripts/set-host-env.sh');
const LIB = join(process.cwd(), 'scripts/lib/host-env-expectations.sh');
const STATUS_SCRIPT = join(process.cwd(), 'scripts/bringup-status.sh');
const VERIFY_SCRIPT = join(process.cwd(), 'scripts/verify-host-env.sh');

interface RunResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

/** The two SNS topic ARNs the setter also writes. Real runs read them from the
 *  Terraform outputs; synthetic mode takes them from the environment, and every
 *  case below that is not about them supplies these so the suite stays about
 *  the hop count and the bucket. A case that IS about them overrides. */
const SYNTHETIC_ARNS = {
  ALARM_TOPIC_ARN_VALUE: 'arn:aws:sns:us-east-1:000000000000:footbag-alarms',
  SES_FEEDBACK_TOPIC_ARN_VALUE: 'arn:aws:sns:us-east-1:000000000000:footbag-ses-feedback',
} as const;

function run(args: string[], extraEnv: Record<string, string> = {}): RunResult {
  const r = spawnSync('bash', [SCRIPT, ...args], {
    cwd: process.cwd(),
    env: { ...process.env, ...SYNTHETIC_ARNS, ...extraEnv },
    encoding: 'utf-8',
    ...SPAWN_GUARD,
  });
  return { exitCode: r.status ?? -1, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}

/** Evaluate the shared helper directly, the way each script does. */
function helper(fn: string, ...args: string[]): string {
  const r = spawnSync('bash', ['-c', `source "${LIB}"; ${fn} ${args.join(' ')}`], {
    encoding: 'utf-8',
    ...SPAWN_GUARD,
  });
  return (r.stdout ?? '').trim();
}

function withEnvFile(contents: string, fn: (path: string) => void): void {
  const dir = mkdtempSync(join(tmpdir(), 'footbag-test-sethostenv-'));
  const path = join(dir, 'env');
  writeFileSync(path, contents, 'utf-8');
  try {
    fn(path);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('the proxy hop count has exactly one definition', () => {
  it('states the same two-hop chain for both environments, at every milestone', () => {
    // CloudFront then nginx, in staging and in production, before and after the
    // DNS cutover: the platform is reached through its own distribution either
    // way, so no legacy front-door hop sits in front of it. Being wrong upward
    // here would let a client spoof its own address by sending a longer header.
    expect(helper('expected_trust_proxy', 'staging')).toBe('2');
    expect(helper('expected_trust_proxy', 'production')).toBe('2');
  });

  it('an unknown target is refused rather than resolving empty', () => {
    const r = spawnSync('bash', ['-c', `source "${LIB}"; expected_trust_proxy bogus`], {
      encoding: 'utf-8',
      ...SPAWN_GUARD,
    });
    expect(r.status).not.toBe(0);
  });

  it('every script that has an opinion reads the helper rather than its own copy', () => {
    for (const path of [SCRIPT, STATUS_SCRIPT, VERIFY_SCRIPT]) {
      const body = readFileSync(path, 'utf-8');
      expect(body, `${path} sources the shared definition`).toContain('host-env-expectations.sh');
      // A bare hop-count literal beside the helper call is how the three copies
      // came back last time. The helper is the only thing allowed to say 3.
      const declaresOwn = /TRUST_PROXY=["']?[0-9]/.test(body)
        && !body.includes('TRUST_PROXY=" ENVIRON')
        && !body.includes('TRUST_PROXY=${TRUST_PROXY_VALUE}');
      expect(declaresOwn, `${path} states no hop count of its own`).toBe(false);
    }
  });
});

describe('set-host-env.sh rewrite contract', () => {
  it('replaces an existing assignment and appends a missing one', () => {
    withEnvFile('NODE_ENV=production\nTRUST_PROXY=9\nOTHER=keep\n', (path) => {
      const r = run(['--target', 'production', '--env-file', path], {
        BACKUP_S3_BUCKET_VALUE: 'snapshots-bucket',
      });
      expect(r.exitCode).toBe(0);
      const out = readFileSync(path, 'utf-8');
      expect(out).toContain('TRUST_PROXY=2');
      expect(out).toContain('BACKUP_S3_BUCKET=snapshots-bucket');
      expect(out, 'unrelated lines survive verbatim').toContain('OTHER=keep');
      expect(out).not.toContain('TRUST_PROXY=9');
    });
  });

  it('collapses duplicate assignments, so last-wins parsing matches the diff shown', () => {
    withEnvFile('TRUST_PROXY=9\nA=1\nTRUST_PROXY=7\nBACKUP_S3_BUCKET=old\nBACKUP_S3_BUCKET=older\n', (path) => {
      const r = run(['--target', 'staging', '--env-file', path], {
        BACKUP_S3_BUCKET_VALUE: 'new-bucket',
      });
      expect(r.exitCode).toBe(0);
      const lines = readFileSync(path, 'utf-8').trim().split('\n');
      expect(lines.filter((l) => l.startsWith('TRUST_PROXY='))).toEqual(['TRUST_PROXY=2']);
      expect(lines.filter((l) => l.startsWith('BACKUP_S3_BUCKET='))).toEqual([
        'BACKUP_S3_BUCKET=new-bucket',
      ]);
    });
  });

  it('corrects a host that carries a hop count one too generous', () => {
    withEnvFile('TRUST_PROXY=3\n', (path) => {
      const r = run(['--target', 'production', '--env-file', path], {
        BACKUP_S3_BUCKET_VALUE: 'b',
      });
      expect(r.exitCode).toBe(0);
      expect(readFileSync(path, 'utf-8')).toContain('TRUST_PROXY=2');
    });
  });

  it('is a no-op when every value already reads as intended', () => {
    const contents = [
      'TRUST_PROXY=2',
      'BACKUP_S3_BUCKET=b',
      `ALARM_TOPIC_ARN=${SYNTHETIC_ARNS.ALARM_TOPIC_ARN_VALUE}`,
      `SES_FEEDBACK_TOPIC_ARN=${SYNTHETIC_ARNS.SES_FEEDBACK_TOPIC_ARN_VALUE}`,
      '',
    ].join('\n');
    withEnvFile(contents, (path) => {
      const r = run(['--target', 'staging', '--env-file', path], { BACKUP_S3_BUCKET_VALUE: 'b' });
      expect(r.exitCode).toBe(0);
      expect(r.stdout).toContain('Nothing to write');
      expect(readFileSync(path, 'utf-8')).toBe(contents);
    });
  });

  it('writes the queue the worker polls when there is one to name', () => {
    withEnvFile('TRUST_PROXY=2\n', (path) => {
      const r = run(['--target', 'staging', '--env-file', path], {
        BACKUP_S3_BUCKET_VALUE: 'b',
        ALARM_QUEUE_URL_VALUE: 'https://sqs.us-east-1.amazonaws.com/000/alarm-feed',
        SES_FEEDBACK_QUEUE_URL_VALUE: 'https://sqs.us-east-1.amazonaws.com/000/ses-feed',
      });
      expect(r.exitCode).toBe(0);
      const written = readFileSync(path, 'utf-8');
      expect(written).toContain('ALARM_QUEUE_URL=https://sqs.us-east-1.amazonaws.com/000/alarm-feed');
      expect(written).toContain('SES_FEEDBACK_QUEUE_URL=https://sqs.us-east-1.amazonaws.com/000/ses-feed');
    });
  });

  it('adds no queue line for an environment that has no queues yet', () => {
    // An empty assignment reads no feed either way, so appending one would put a
    // line in the file that changes nothing and would make a re-run against an
    // already-correct host report a change it did not make.
    withEnvFile('TRUST_PROXY=2\n', (path) => {
      const r = run(['--target', 'staging', '--env-file', path], { BACKUP_S3_BUCKET_VALUE: 'b' });
      expect(r.exitCode).toBe(0);
      expect(readFileSync(path, 'utf-8')).not.toContain('QUEUE_URL');
    });
  });

  it('clears a queue line already on the host when the queue is gone', () => {
    // The host must stop polling a queue that no longer exists. A line already
    // present is rewritten whatever its new value, empty included, which is what
    // an existing assignment and an absent one differ on.
    withEnvFile('TRUST_PROXY=2\nALARM_QUEUE_URL=https://sqs.us-east-1.amazonaws.com/000/retired\n',
      (path) => {
        const r = run(['--target', 'staging', '--env-file', path], { BACKUP_S3_BUCKET_VALUE: 'b' });
        expect(r.exitCode).toBe(0);
        expect(readFileSync(path, 'utf-8')).toContain('ALARM_QUEUE_URL=\n');
        expect(readFileSync(path, 'utf-8')).not.toContain('retired');
      });
  });
});

describe('set-host-env.sh refusals', () => {
  it('refuses an unknown target', () => {
    const r = run(['--target', 'bogus', '--dry-run']);
    expect(r.exitCode).toBe(2);
    expect(r.stderr).toContain("must be 'staging' or 'production'");
  });

  it('refuses a missing env file rather than creating one', () => {
    const r = run(['--target', 'staging', '--env-file', '/nonexistent/footbag-env'], {
      BACKUP_S3_BUCKET_VALUE: 'b',
    });
    expect(r.exitCode).toBe(2);
    expect(r.stderr).toContain('does not exist');
  });

  it('refuses synthetic mode without a bucket value rather than writing an empty one', () => {
    withEnvFile('A=1\n', (path) => {
      const r = run(['--target', 'staging', '--env-file', path]);
      expect(r.exitCode).toBe(2);
      expect(r.stderr).toContain('BACKUP_S3_BUCKET_VALUE');
      expect(readFileSync(path, 'utf-8'), 'the file is untouched').toBe('A=1\n');
    });
  });

  it('writes both SNS topic ARNs, because a feed missing one refuses every delivery', () => {
    withEnvFile('A=1\n', (path) => {
      const r = run(['--target', 'staging', '--env-file', path], { BACKUP_S3_BUCKET_VALUE: 'b' });
      expect(r.exitCode).toBe(0);
      const out = readFileSync(path, 'utf-8');
      expect(out).toContain(`ALARM_TOPIC_ARN=${SYNTHETIC_ARNS.ALARM_TOPIC_ARN_VALUE}`);
      expect(out).toContain(`SES_FEEDBACK_TOPIC_ARN=${SYNTHETIC_ARNS.SES_FEEDBACK_TOPIC_ARN_VALUE}`);
    });
  });

  it('refuses synthetic mode without the topic ARNs rather than writing empty ones', () => {
    // An empty ARN is worse than an absent one: the webhook compares the
    // publishing topic against it and refuses every delivery, quietly.
    withEnvFile('A=1\n', (path) => {
      const r = run(['--target', 'staging', '--env-file', path], {
        BACKUP_S3_BUCKET_VALUE: 'b',
        ALARM_TOPIC_ARN_VALUE: '',
        SES_FEEDBACK_TOPIC_ARN_VALUE: '',
      });
      expect(r.exitCode).toBe(2);
      expect(r.stderr).toContain('ALARM_TOPIC_ARN_VALUE');
      expect(readFileSync(path, 'utf-8'), 'the file is untouched').toBe('A=1\n');
    });
  });

  it('dry run resolves every value and writes nothing', () => {
    withEnvFile('A=1\n', (path) => {
      const r = run(['--target', 'production', '--dry-run', '--env-file', path], {
        BACKUP_S3_BUCKET_VALUE: 'b',
      });
      expect(r.exitCode).toBe(0);
      expect(r.stdout).toContain('TRUST_PROXY=2');
      expect(r.stdout).toContain('BACKUP_S3_BUCKET=b');
      expect(r.stdout).toContain('Nothing was written');
      expect(readFileSync(path, 'utf-8')).toBe('A=1\n');
    });
  });
});
