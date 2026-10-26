/**
 * scripts/bringup-status.sh — step rendering and next-action guidance.
 *
 * Real runs probe a live host, terraform state, and AWS, which CI cannot
 * exercise. The synthetic --probe-file mode supplies every probe result as
 * KEY=VALUE lines; these tests pin the per-step status logic (DONE /
 * PENDING / UNKNOWN / N-A / INFO) and the next-command text the operator is
 * given for each pending step.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';

import { SPAWN_GUARD } from '../fixtures/spawnGuard';
import { awsIdentityStubEnv } from '../fixtures/awsIdentityStub';
import { chmodSync, mkdirSync, mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const SCRIPT = join(process.cwd(), 'scripts/bringup-status.sh');

interface RunResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

function runScript(args: string[], env: NodeJS.ProcessEnv = process.env): RunResult {
  const result = spawnSync('bash', [SCRIPT, ...args], {
    cwd: process.cwd(),
    env,
    encoding: 'utf-8',
    ...SPAWN_GUARD,
  });
  return {
    exitCode: result.status ?? 1,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

let tmpDir: string;
beforeAll(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'footbag-test-bringup-status-'));
});
afterAll(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

let fileCounter = 0;
function writeProbeFile(lines: string[]): string {
  fileCounter += 1;
  const p = join(tmpDir, `probe-${fileCounter}.env`);
  writeFileSync(p, lines.join('\n') + '\n');
  return p;
}

const ALL_DONE_PRODUCTION = [
  'ENV_FETCHED=yes',
  'ENV_TRUST_PROXY=2',
  'ENV_BACKUP_S3_BUCKET=set',
  'ENV_PAYMENT_ADAPTER=live',
  'ENV_WEBHOOK_SECRET=set',
  'TIMER_ACTIVE=active',
  'CONTAINERS=footbag-web-1 Up 2 hours (healthy), footbag-nginx-1 Up 2 hours (healthy), footbag-worker-1 Up 2 hours (healthy), footbag-image-1 Up 2 hours (healthy)',
  'TF_PLAN=insync',
  'TF_PLAN_SHARED=insync',
  'TF_PLAN_IDENTITY=insync',
  'TF_BACKUP_ALARM=present',
  'TF_CUTOVER_ALARM=absent',
  'TF_SES_SUBSCRIPTION=present',
  'SSM_STRIPE_KEY=live',
  'SSM_BOOTSTRAP_TOKEN=absent',
  'CW_BACKUP_METRIC=flowing',
  'ORIGIN_HOP=encrypted',
];

describe('bringup-status.sh — argument validation', () => {
  it('rejects an unknown argument', () => {
    const result = runScript(['--bogus']);
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toMatch(/unknown argument/);
  });

  it('rejects an invalid target', () => {
    const result = runScript(['--target', 'dev']);
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toMatch(/--target must be 'staging' or 'production'/);
  });

  it('rejects a nonexistent --probe-file path', () => {
    const result = runScript(['--target', 'staging', '--probe-file', join(tmpDir, 'nope')]);
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toMatch(/does not exist/);
  });
});

describe('bringup-status.sh — fully provisioned production', () => {
  it('reports the provisioned steps DONE and exits 0', () => {
    const probe = writeProbeFile(ALL_DONE_PRODUCTION);
    const result = runScript(['--target', 'production', '--probe-file', probe]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/1\. Host env file\s+DONE\s+TRUST_PROXY=2, BACKUP_S3_BUCKET set/);
    expect(result.stdout).toMatch(/2\. Terraform\s+DONE/);
    expect(result.stdout).toMatch(/3\. Payments\s+DONE/);
    expect(result.stdout).toMatch(/4\. Backup pipeline\s+DONE/);
    expect(result.stdout).toMatch(/5\. SES feedback\s+DONE/);
    expect(result.stdout).toMatch(/8\. Deployed runtime\s+DONE/);
  });

  it('an absent bootstrap token reads as claimed-or-unprovisioned, never DONE', () => {
    const probe = writeProbeFile(ALL_DONE_PRODUCTION);
    const result = runScript(['--target', 'production', '--probe-file', probe]);
    expect(result.stdout).toMatch(/6\. First admin\s+UNKNOWN\s+no bootstrap token parameter/);
    expect(result.stdout).toMatch(/aws ssm put-parameter --name \/footbag\/production\/app\/bootstrap\/admin_token/);
  });

  it('a provisioned bootstrap token reads as awaiting claim', () => {
    const probe = writeProbeFile(
      ALL_DONE_PRODUCTION.map(l => l.replace('SSM_BOOTSTRAP_TOKEN=absent', 'SSM_BOOTSTRAP_TOKEN=present')),
    );
    const result = runScript(['--target', 'production', '--probe-file', probe]);
    expect(result.stdout).toMatch(/6\. First admin\s+PENDING\s+bootstrap token provisioned, awaiting claim/);
  });

  it('the cutover login alarm renders as window-scoped INFO in both states', () => {
    const offProbe = writeProbeFile(ALL_DONE_PRODUCTION);
    const off = runScript(['--target', 'production', '--probe-file', offProbe]);
    expect(off.stdout).toMatch(/7\. Cutover login alarm\s+INFO\s+OFF; correct outside the cutover window/);

    const onProbe = writeProbeFile(
      ALL_DONE_PRODUCTION.map(l => l.replace('TF_CUTOVER_ALARM=absent', 'TF_CUTOVER_ALARM=present')),
    );
    const on = runScript(['--target', 'production', '--probe-file', onProbe]);
    expect(on.stdout).toMatch(/7\. Cutover login alarm\s+INFO\s+ON; disable after the cutover window/);
  });
});

describe('bringup-status.sh — a deactivation that did not finish', () => {
  // Deactivation resets the Stripe parameters before it removes the host's
  // copy, deliberately: a deploy landing between the two reads a placeholder
  // and leaves the host alone, where the reverse order would let it reinstall
  // the secret being removed. A run that stops in that window therefore leaves
  // the parameters at placeholder while the host keeps a live signing secret,
  // and no deploy converges it, because a placeholder means "no outgoing
  // secret". Declining says so at the time; a crash says nothing, so the state
  // has to be legible here.
  const STUCK = [
    'ENV_FETCHED=yes',
    'ENV_PAYMENTS_ARMED=dark',
    'ENV_PAYMENT_ADAPTER=stub',
    'ENV_WEBHOOK_SECRET=set',
    'SSM_STRIPE_KEY=placeholder',
    'SSM_PRODUCTION_LIVE=false',
  ];

  it('reports the host still holding a signing secret the parameters say is gone', () => {
    const probe = writeProbeFile(STUCK);
    const result = runScript(['--target', 'production', '--probe-file', probe]);
    expect(result.stdout).toMatch(/deactivation that did not finish/);
  });

  it('names finishing the deactivation as the next command, not arming', () => {
    const probe = writeProbeFile(STUCK);
    const result = runScript(['--target', 'production', '--probe-file', probe]);
    expect(result.stdout).toMatch(/--deactivate/);
    expect(result.stdout).not.toMatch(/arm payments when ready/);
  });

  it('stays quiet on an ordinary dark host that holds no secret', () => {
    const probe = writeProbeFile(STUCK.map(l => l.replace('ENV_WEBHOOK_SECRET=set', 'ENV_WEBHOOK_SECRET=unset')));
    const result = runScript(['--target', 'production', '--probe-file', probe]);
    expect(result.stdout).not.toMatch(/deactivation that did not finish/);
    expect(result.stdout).toMatch(/arm payments when ready/);
  });
});

describe('bringup-status.sh — pending steps name their next command', () => {
  it('a bare staging host points at each bring-up script in order', () => {
    const probe = writeProbeFile([
      'ENV_FETCHED=yes',
      'ENV_TRUST_PROXY=loopback',
      'ENV_BACKUP_S3_BUCKET=unset',
      'ENV_PAYMENT_ADAPTER=stub',
      'TIMER_ACTIVE=inactive',
      'CONTAINERS=none running',
      'TF_PLAN=drift',
      'TF_BACKUP_ALARM=absent',
      'TF_SES_SUBSCRIPTION=absent',
    ]);
    const result = runScript(['--target', 'staging', '--probe-file', probe]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/1\. Host env file\s+PENDING/);
    // The host env row points at the deploy that writes those values, not at
    // the verifier that only reports on them: an operator following the next
    // command should end up with the row DONE rather than told again that it
    // is not.
    expect(result.stdout).toMatch(/\.\/deploy_to_aws\.sh --target staging \(every deploy writes/);
    expect(result.stdout).toMatch(/2\. Terraform\s+PENDING/);
    // The Terraform row points at the command that applies every tree the
    // environment stands on, and never at a hand-typed import: a resource made
    // outside Terraform is taken in by an import block through a reviewed plan.
    expect(result.stdout).toMatch(/scripts\/terraform-apply-all\.sh --target staging/);
    expect(result.stdout).not.toMatch(/terraform import/);
    expect(result.stdout).toMatch(/4\. Backup pipeline\s+PENDING/);
    expect(result.stdout).toMatch(/scripts\/install-backup-timer\.sh --target staging/);
    expect(result.stdout).toMatch(/5\. SES feedback\s+PENDING/);
    expect(result.stdout).toMatch(/enable_feed_queues/);
    expect(result.stdout).toMatch(/verify-prod-email\.sh/);
    expect(result.stdout).toMatch(/8\. Deployed runtime\s+PENDING/);
    expect(result.stdout).toMatch(/\.\/deploy_to_aws\.sh/);
  });

  it('staging on the stub adapter reads as N-A for payments, not pending', () => {
    const probe = writeProbeFile(['ENV_FETCHED=yes', 'ENV_PAYMENT_ADAPTER=stub']);
    const result = runScript(['--target', 'staging', '--probe-file', probe]);
    expect(result.stdout).toMatch(/3\. Payments\s+N-A\s+staging runs the stub adapter permanently/);
    expect(result.stdout).toMatch(/6\. First admin\s+N-A/);
    expect(result.stdout).toMatch(/7\. Cutover login alarm\s+N-A/);
  });

  it('dark production reads as N-A for payments with the arming step named', () => {
    const probe = writeProbeFile([
      'ENV_FETCHED=yes',
      'ENV_PAYMENT_ADAPTER=stub',
      'ENV_PAYMENTS_ARMED=dark',
      'SSM_PRODUCTION_LIVE=false',
    ]);
    const result = runScript(['--target', 'production', '--probe-file', probe]);
    expect(result.stdout).toMatch(/3\. Payments\s+N-A\s+payments dark \(stub adapter/);
    // The next step must name the script that performs the arming, not the
    // values-file assignment it happens to write. Arming is three actions that
    // have to happen in order, and a status view that prints one of them invites
    // exactly the half-applied state the script exists to prevent.
    expect(result.stdout).toMatch(/arming\.sh --target production --switch payments --state armed/);
  });

  // Defect caught: a host one hop too generous, or one missing its backup
  // bucket, reads DONE; or the row sends the operator to the setter, which
  // writes neither and so cannot turn the row green.
  it.each([
    ['ENV_TRUST_PROXY=', 'ENV_TRUST_PROXY=3', 'TRUST_PROXY \\(integer hop count, production: 2 \\(CloudFront then nginx\\)\\)'],
    ['ENV_BACKUP_S3_BUCKET=', 'ENV_BACKUP_S3_BUCKET=unset', 'BACKUP_S3_BUCKET'],
  ])('a host whose %s is wrong is pending, and names the deploy that writes it', (prefix, wrong, reported) => {
    const probe = writeProbeFile(ALL_DONE_PRODUCTION.map((l) => (l.startsWith(prefix) ? wrong : l)));
    const result = runScript(['--target', 'production', '--probe-file', probe]);
    expect(result.stdout).toMatch(new RegExp(`1\\. Host env file\\s+PENDING\\s+missing/invalid: ${reported}`));
    expect(result.stdout).toMatch(/\.\/deploy_to_aws\.sh --target production \(every deploy writes the committed host config and the Terraform-published values\)/);
    expect(result.stdout).not.toMatch(/set-host-env\.sh --target production/);
  });

  it('production missing payments pieces points at activate-payments.sh', () => {
    const probe = writeProbeFile([
      'ENV_FETCHED=yes',
      'ENV_TRUST_PROXY=2',
      'ENV_BACKUP_S3_BUCKET=set',
      'ENV_PAYMENT_ADAPTER=stub',
      'ENV_PAYMENTS_ARMED=armed',
      'SSM_STRIPE_KEY=placeholder',
    ]);
    const result = runScript(['--target', 'production', '--probe-file', probe]);
    expect(result.stdout).toMatch(/3\. Payments\s+PENDING\s+PAYMENTS_ARMED: armed, SSM key: placeholder/);
    expect(result.stdout).toMatch(/scripts\/activate-payments\.sh --target production/);
  });

  // Defect caught: the operator reads a green bring-up while the origin hop is
  // still plaintext, and only learns of it when going live is refused.
  it('reports a plaintext origin hop on production as pending, naming what it blocks', () => {
    const plaintext = runScript(['--target', 'production', '--probe-file',
      writeProbeFile(['ORIGIN_HOP=plaintext (http-only)'])]);
    expect(plaintext.stdout).toMatch(/10\. Origin TLS\s+PENDING\s+plaintext \(http-only\); going live and a live Stripe key are refused/);
    expect(plaintext.stdout).toMatch(/next: put origin TLS in place after the zone move/);

    const encrypted = runScript(['--target', 'production', '--probe-file',
      writeProbeFile(['ORIGIN_HOP=encrypted'])]);
    expect(encrypted.stdout).toMatch(/10\. Origin TLS\s+DONE\s+the distribution reaches its origin https-only/);

    const unread = runScript(['--target', 'production', '--probe-file', writeProbeFile([])]);
    expect(unread.stdout).toMatch(/10\. Origin TLS\s+UNKNOWN/);

    const staging = runScript(['--target', 'staging', '--probe-file', writeProbeFile([])]);
    expect(staging.stdout).toMatch(/10\. Origin TLS\s+N-A/);
  });

  // Defect caught: the live probe misreads what CloudFront reports, so a
  // plaintext hop shows as unknown, or an unreadable one as plaintext.
  it('classifies the origin protocol the live probe reads from the distribution', () => {
    const probeWith = (policy: string | null) => {
      const caseDir = mkdtempSync(join(tmpDir, 'origin-probe-'));
      const bin = join(caseDir, 'bin');
      mkdirSync(bin, { recursive: true });
      const exe = (name: string, lines: string[]) => {
        writeFileSync(join(bin, name), ['#!/usr/bin/env bash', ...lines].join('\n') + '\n');
        chmodSync(join(bin, name), 0o755);
      };
      // Every other aws read in the probe answers nothing, so those rows stay unknown.
      exe('aws', ['exit 1']);
      exe('terraform', [
        'if [[ "$*" == *"output -raw cloudfront_distribution_id"* ]]; then echo E2TESTDIST; exit 0; fi',
        'exit 1',
      ]);
      exe('cloudfront', [policy === null ? 'exit 255' : `echo ${policy}`]);
      return runScript(['--target', 'production', '--skip-remote', '--skip-terraform', '--profile', 'footbag-operator'], {
        ...process.env,
        ...awsIdentityStubEnv(caseDir),
        PATH: `${bin}:${process.env.PATH ?? ''}`,
        TF_OUTPUT_BIN: join(bin, 'terraform'),
        ORIGIN_TLS_AWS_BIN: join(bin, 'cloudfront'),
      });
    };
    expect(probeWith('http-only').stdout).toMatch(/10\. Origin TLS\s+PENDING\s+plaintext \(http-only\)/);
    expect(probeWith('https-only').stdout).toMatch(/10\. Origin TLS\s+DONE/);
    expect(probeWith(null).stdout).toMatch(/10\. Origin TLS\s+UNKNOWN/);
  });

  it('a backup timer active but metric missing advises waiting, not reinstalling', () => {
    const probe = writeProbeFile([
      'ENV_FETCHED=yes',
      'TIMER_ACTIVE=active',
      'CW_BACKUP_METRIC=missing',
      'TF_BACKUP_ALARM=absent',
    ]);
    const result = runScript(['--target', 'staging', '--probe-file', probe]);
    expect(result.stdout).toMatch(/4\. Backup pipeline\s+PENDING/);
    expect(result.stdout).toMatch(/wait for two timer runs/);
    expect(result.stdout).not.toMatch(/next: scripts\/install-backup-timer\.sh/);
  });

  it('a flowing metric with the alarm unarmed advises the terraform flag flip', () => {
    const probe = writeProbeFile([
      'ENV_FETCHED=yes',
      'TIMER_ACTIVE=active',
      'CW_BACKUP_METRIC=flowing',
      'TF_BACKUP_ALARM=absent',
    ]);
    const result = runScript(['--target', 'staging', '--probe-file', probe]);
    expect(result.stdout).toMatch(/enable_backup_alarm = true in terraform\/staging\/terraform\.tfvars/);
  });
});

describe('bringup-status.sh — the Terraform row covers every tree the environment stands on', () => {
  it('a change pending only in an account tree reads as pending, naming that tree', () => {
    // An operator told the infrastructure is done would never apply a change
    // committed to the shared or identity tree.
    const probe = writeProbeFile(ALL_DONE_PRODUCTION.map((l) => (l === 'TF_PLAN_SHARED=insync' ? 'TF_PLAN_SHARED=drift' : l)));
    const result = runScript(['--target', 'production', '--probe-file', probe]);
    expect(result.stdout).toMatch(/2\. Terraform\s+PENDING\s+pending changes in: shared\b/);
    expect(result.stdout).toMatch(/scripts\/terraform-apply-all\.sh --target production/);
  });

  it('an account tree it could not read is unknown, never done', () => {
    const probe = writeProbeFile(ALL_DONE_PRODUCTION.filter((l) => !l.startsWith('TF_PLAN_IDENTITY=')));
    const result = runScript(['--target', 'production', '--probe-file', probe]);
    expect(result.stdout).toMatch(/2\. Terraform\s+UNKNOWN\s+plan not run or failed for: identity\b/);
  });

  it('plans all three trees by their real paths when started outside the repository root', () => {
    // Run from elsewhere, a relative tree path finds nothing and every plan
    // reads as unknown, which an operator takes for a bring-up not yet done.
    const binDir = join(tmpDir, 'terraform-bin');
    const callLog = join(tmpDir, 'terraform-calls.log');
    mkdirSync(binDir, { recursive: true });
    writeFileSync(join(binDir, 'terraform'), [
      '#!/usr/bin/env bash',
      `echo "$*" >> "${callLog}"`,
      'exit 0',
    ].join('\n'));
    chmodSync(join(binDir, 'terraform'), 0o755);
    const elsewhere = join(tmpDir, 'elsewhere');
    mkdirSync(elsewhere, { recursive: true });
    const result = spawnSync(
      'bash',
      [SCRIPT, '--target', 'production', '--skip-remote', '--skip-aws'],
      {
        cwd: elsewhere,
        env: { ...process.env, ...awsIdentityStubEnv(tmpDir), PATH: `${binDir}:${process.env.PATH ?? ''}` },
        encoding: 'utf-8',
        ...SPAWN_GUARD,
      },
    );
    expect(result.stdout, result.stderr).toMatch(/2\. Terraform\s+DONE\s+plan reports no changes in shared, identity or production/);
    const planned = readFileSync(callLog, 'utf-8')
      .split('\n')
      .filter((l) => / plan /.test(l))
      .map((l) => l.match(/-chdir=(\S+)\/terraform\/(\w+)/)?.[2]);
    expect(planned.sort()).toEqual(['identity', 'production', 'shared']);
  });
});

describe('bringup-status.sh — the Stripe key mode read from the parameter', () => {
  // The probe file supplies the mode already classified, so these drive the
  // real aws probe through a stand-in aws ahead of PATH that answers the key
  // parameter and reports every other parameter absent.
  function runWithKey(key: string): RunResult {
    const binDir = join(tmpDir, `aws-bin-${key}`);
    mkdirSync(binDir, { recursive: true });
    writeFileSync(join(binDir, 'aws'), [
      '#!/usr/bin/env bash',
      'case "$*" in',
      `  *secrets/stripe_secret_key*--with-decryption*) printf '%s\\n' ${JSON.stringify(key)} ;;`,
      '  cloudwatch*) echo 0 ;;',
      '  *) echo "An error occurred (ParameterNotFound) when calling the GetParameter operation" >&2; exit 254 ;;',
      'esac',
    ].join('\n'));
    chmodSync(join(binDir, 'aws'), 0o755);
    return runScript(
      ['--target', 'production', '--profile', 'stand-in', '--skip-remote', '--skip-terraform'],
      { ...process.env, PATH: `${binDir}:${process.env.PATH ?? ''}` },
    );
  }

  it.each([
    // An operator reading "live" for a test key believes payments take real
    // money while every checkout is a test-mode one.
    ['sk_test_abc123', 'test'],
    ['sk_live_abc123', 'live'],
  ])('reports %s as %s on the Payments row, never printing the key', (key, mode) => {
    const result = runWithKey(key);
    expect(result.exitCode, result.stderr).toBe(0);
    expect(result.stdout).toMatch(/probes: aws\)/);
    expect(result.stdout).toMatch(new RegExp(`3\\. Payments\\s+PENDING\\s+.*SSM key: ${mode},`));
    expect(result.stdout + result.stderr).not.toContain(key);
  });
});

describe('bringup-status.sh — unprobed state degrades to UNKNOWN', () => {
  it('an empty probe file renders UNKNOWN rows and still exits 0', () => {
    const probe = writeProbeFile(['# nothing probed']);
    const result = runScript(['--target', 'production', '--probe-file', probe]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/1\. Host env file\s+UNKNOWN/);
    expect(result.stdout).toMatch(/2\. Terraform\s+UNKNOWN/);
    expect(result.stdout).toMatch(/4\. Backup pipeline\s+UNKNOWN/);
    expect(result.stdout).toMatch(/5\. SES feedback\s+UNKNOWN/);
    expect(result.stdout).toMatch(/8\. Deployed runtime\s+UNKNOWN/);
  });
});

describe('bringup-status.sh — webhook-secret rotation window', () => {
  it('surfaces an open rotation window on the provisioned Payments row', () => {
    const probe = writeProbeFile([...ALL_DONE_PRODUCTION, 'ENV_WEBHOOK_SECRET_PREVIOUS=set']);
    const result = runScript(['--target', 'production', '--probe-file', probe]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/3\. Payments\s+DONE/);
    expect(result.stdout).toMatch(/rotation window open/);
    expect(result.stdout).toMatch(/--complete-webhook-rotation/);
  });

  it('shows no rotation note when the previous secret is unset', () => {
    const probe = writeProbeFile(ALL_DONE_PRODUCTION);
    const result = runScript(['--target', 'production', '--probe-file', probe]);
    expect(result.stdout).toMatch(/3\. Payments\s+DONE/);
    expect(result.stdout).not.toMatch(/rotation window open/);
  });
});

describe('bringup-status.sh — email wording row', () => {
  // The wording a running environment renders comes from rows the full-rebuild
  // deploy seeds, so a sidecar edit reaches nothing deployed until one runs.
  // This row is the only thing that says so; before it, production rendered
  // wording nobody knew was stale.
  const currentDigest = (): string => {
    const r = spawnSync(
      'bash',
      [
        '-c',
        `source "${join(process.cwd(), 'scripts/lib/email-template-digest.sh')}"; ` +
          `email_template_digest "${join(process.cwd(), 'curated/email_templates')}"`,
      ],
      { encoding: 'utf-8', ...SPAWN_GUARD },
    );
    return (r.stdout ?? '').trim();
  };

  it('reports agreement when the host was seeded from the sidecars as they read now', () => {
    const probe = writeProbeFile([
      ...ALL_DONE_PRODUCTION,
      `DEPLOYED_EMAIL_TEMPLATES=${currentDigest()}`,
    ]);
    const result = runScript(['--target', 'production', '--probe-file', probe]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/9\. Email wording\s+DONE/);
  });

  it('reports a difference, and names a remedy that does not rebuild the database', () => {
    const probe = writeProbeFile([...ALL_DONE_PRODUCTION, 'DEPLOYED_EMAIL_TEMPLATES=0000badf00d']);
    const result = runScript(['--target', 'production', '--probe-file', probe]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/9\. Email wording\s+PENDING/);
    expect(result.stdout, 'says why a code-only deploy will not fix it').toMatch(
      /code-only deploy will not change it/,
    );
    expect(result.stdout).toMatch(/admin email-template editor/);
  });

  it('is UNKNOWN rather than DONE when the host records nothing', () => {
    const probe = writeProbeFile(ALL_DONE_PRODUCTION);
    const result = runScript(['--target', 'production', '--probe-file', probe]);
    expect(result.exitCode).toBe(0);
    // Silence is what this row exists to remove, so an absent record must not
    // read as agreement.
    expect(result.stdout).toMatch(/9\. Email wording\s+UNKNOWN/);
  });

  it('the digest ignores the directory it is reached by, so both sides agree', () => {
    const viaRelative = spawnSync(
      'bash',
      [
        '-c',
        `source "${join(process.cwd(), 'scripts/lib/email-template-digest.sh')}"; ` +
          `email_template_digest "${join(process.cwd(), 'scripts/../curated/email_templates')}"`,
      ],
      { encoding: 'utf-8', ...SPAWN_GUARD },
    );
    expect((viaRelative.stdout ?? '').trim()).toBe(currentDigest());
  });
});

describe('bringup-status.sh — the deployed runtime is all four containers healthy', () => {
  const HEALTHY = ALL_DONE_PRODUCTION.find((l) => l.startsWith('CONTAINERS='))!.slice('CONTAINERS='.length);

  it('reads pending when any one container is missing, unhealthy or still starting', () => {
    // Defect caught: a host with no worker (no mail, no scheduled jobs) or no
    // image service (no media) reads as deployed because web and nginx are up.
    for (const svc of ['web', 'worker', 'image', 'nginx']) {
      for (const variant of ['missing', 'unhealthy', 'starting']) {
        const containers = variant === 'missing'
          ? HEALTHY.split(', ').filter((c) => !c.startsWith(`footbag-${svc}-1 `)).join(', ')
          : HEALTHY.replace(`footbag-${svc}-1 Up 2 hours (healthy)`, `footbag-${svc}-1 Up 5 seconds (health: ${variant})`);
        const probe = writeProbeFile([...ALL_DONE_PRODUCTION.filter((l) => !l.startsWith('CONTAINERS=')), `CONTAINERS=${containers}`]);
        const result = runScript(['--target', 'production', '--probe-file', probe]);
        expect(result.stdout, `${svc} ${variant}`).toMatch(new RegExp(`8\\. Deployed runtime\\s+PENDING\\s+not healthy: ${svc} `));
      }
    }
  });
});

describe('bringup-status.sh — one row per host bootstrap step', () => {
  // The facts a finished host reports through the bootstrap status body, plus
  // the workstation-side reads. A stand-in manifest pins the versions.
  const FINISHED_HOST = [
    'HOST_REACHED=yes', 'ACCOUNT_USER=footbag', 'ACCOUNT_WHEEL=yes', 'ACCOUNT_KEYS=1', 'SSHD_PORTS=22 2222',
    'SSHD_ROOT=no', 'SSHD_PASSWORD=no', 'SSHD_KBD=no', 'SSHD_REVERT_PENDING=no', 'ARCH=x86_64',
    'DOCKER_ACTIVE=active', 'DOCKER_ENABLED=enabled', 'COMPOSE_VERSION=2.29.7', 'SQLITE=yes', 'RSYNC=yes',
    'AWSCLI=yes', 'SRV_DIR=root:root 755', 'ENV_FILE=root:root 600', 'DB_DIR=1000:1000', 'FOOTBAG_ENV=production',
    'CRED_CHAIN=ok', 'CRED_KEY_ID=AKIAEXAMPLEEXAMPLE01', 'CWAGENT_ACTIVE=active', 'CWAGENT_ENABLED=enabled',
    'CWAGENT_VERSION=1.300050.0b1', 'CWAGENT_KEY_ID=AKIAEXAMPLEEXAMPLE01',
    'LOG_DRIVERS=footbag-web-1:awslogs footbag-worker-1:awslogs footbag-nginx-1:awslogs', 'SERVICE_ENABLED=enabled',
    'TIMER_ENABLED=enabled', 'ZRAM_ACTIVE=yes', 'ZRAM_SUPPRESSED=no', 'SWAPFILE=yes',
    'SSHD_LISTEN=22 2222', 'DB_FILE=present', 'REPLAY_PENDING=no', 'FEED_SES_QUEUE=set', 'FEED_ALARM_QUEUE=set',
    'HOST_ENV_VERIFY=ok',
    'PIN=current', 'IAM_SRC_KEYS=AKIAEXAMPLEEXAMPLE01', 'IAM_CW_KEYS=AKIAEXAMPLEEXAMPLE01', 'CW_METRICS=ok',
    'SNAPSHOT=ok', 'FEEDS_FLAG=false', 'MARKER=false',
  ];

  function manifestEnv(): NodeJS.ProcessEnv {
    const p = join(tmpDir, 'host-tools.env');
    writeFileSync(p, 'COMPOSE_VERSION=v2.29.7\nCWAGENT_VERSION=1.300050.0b1\n');
    return { ...process.env, FOOTBAG_HOST_TOOLS_MANIFEST: p };
  }
  function render(lines: string[]): string {
    return runScript(['--target', 'production', '--probe-file', writeProbeFile([...ALL_DONE_PRODUCTION, ...lines])], manifestEnv()).stdout;
  }
  function override(key: string, value: string): string[] {
    return [...FINISHED_HOST.filter((l) => !l.startsWith(`${key}=`)), `${key}=${value}`];
  }

  it('covers every fact the bootstrap status body emits', () => {
    // Defect caught: a fact the body reports has no counterpart here, so the
    // rows below pass on a host the real probe would describe differently.
    const body = readFileSync(join(process.cwd(), 'scripts/internal/bootstrap-host-status-remote.sh'), 'utf-8');
    const emitted = [...body.matchAll(/^emit ([A-Z_]+) /gm)].map((m) => m[1]);
    const supplied = new Set([...FINISHED_HOST, ...ALL_DONE_PRODUCTION].map((l) => l.split('=')[0]));
    expect(emitted.filter((k) => !supplied.has(k))).toEqual([]);
  });

  it('reads every bootstrap row done or informational on a finished host', () => {
    const out = render(FINISHED_HOST);
    const rows = out.split('-- host bootstrap')[1].split('\n').filter((l) => /^\s*\d+\.\s/.test(l));
    expect(rows.length).toBe(13);
    for (const r of rows) expect(r, r).toMatch(/\s(DONE|INFO)\s/);
  });

  const removals: Array<[string, string[], RegExp, RegExp]> = [
    ['the pin', override('PIN', 'stale'), /Pinned host key\s+PENDING/, /install-known-hosts\.sh --target production/],
    ['the shared account', override('HOST_REACHED', 'no'), /Shared account, sshd ports\s+PENDING/, /bootstrap-host\.sh --target production/],
    ['the host tools', override('SQLITE', 'no'), /Host tools\s+PENDING/, /bootstrap-host\.sh --target production/],
    ['the env file', override('ENV_FILE', 'absent'), /\/srv\/footbag and env file\s+PENDING/, /bootstrap-host\.sh/],
    ['the environment record', override('FOOTBAG_ENV', ''), /Host environment record\s+PENDING/, /set-host-env\.sh --target production/],
    ['the env file the verifier passes', override('HOST_ENV_VERIFY', 'fail'), /Host environment record\s+PENDING/, /verify-host-env\.sh --target production/],
    ['sshd listening on its second port', override('SSHD_LISTEN', '22'), /Shared account, sshd ports\s+PENDING/, /bootstrap-host\.sh --target production/],
    ['the database directory', override('DB_DIR', '0:0'), /Database directory\s+PENDING/, /bootstrap-host\.sh/],
    ['the credential chain', override('CRED_CHAIN', 'fail'), /Host credential chain\s+PENDING/, /install-host-credentials\.sh --target production --rotate/],
    ['the agent', override('CWAGENT_ENABLED', 'disabled'), /CloudWatch agent\s+PENDING/, /install-cwagent-production\.sh --rotate/],
    ['log shipping', override('LOG_DRIVERS', 'footbag-web-1:awslogs'), /Deployed runtime\s+PENDING\s+not yet: worker shipping/, /deploy_to_aws\.sh/],
    ['the sshd posture', override('SSHD_ROOT', 'prohibit-password'), /sshd posture\s+PENDING/, /harden-sshd\.sh --target production --apply/],
    ['the swap file', override('SWAPFILE', 'no'), /Swap\s+PENDING/, /bootstrap-host\.sh/],
    ['a recent snapshot', override('SNAPSHOT', 'fail'), /Recent host snapshot\s+PENDING/, /verify-host-snapshots\.sh --target production/],
  ];
  it.each(removals)('reports %s pending with its command', (_name, lines, row, next) => {
    // Defect caught: a host missing this bootstrap step reads done on the
    // dashboard the go-live sitting reads first.
    const out = render(lines).split('-- host bootstrap')[1];
    expect(out).toMatch(row);
    const i = out.split('\n').findIndex((l) => row.test(l));
    expect(out.split('\n')[i + 1]).toMatch(next);
  });
});
