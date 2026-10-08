/**
 * scripts/ses-sender-cutover.sh — moving production's sender off the interim
 * address identity and onto the footbag.org domain identity.
 *
 * The move destroys the interim identity one-way, and four things must move with
 * it or sending breaks: the values file, the apply, the sender on the host and a
 * deploy. So the cases below run the whole sequence against stand-ins for every
 * command it hands off to, each of which records its call, and judge the run by
 * what was called, in what order, and what was left behind:
 *
 *   - nothing is paused, written or applied while SES does not report the domain
 *     ready to carry the mail;
 *   - a plan carrying anything beyond the retirement is refused before the apply;
 *   - a stop before the apply resumes the outbox, and a stop after it does not,
 *     because resuming then would send as an identity that may already be gone.
 *
 * Confirmations are answered through a pseudo-terminal, the same gate an
 * operator passes, with the credential redirected on stdin as an operator runs
 * it. Nothing real is reached.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { writeFileSync, readFileSync, rmSync, mkdirSync, chmodSync, existsSync } from 'node:fs';
import { join } from 'node:path';

import { SPAWN_GUARD } from '../fixtures/spawnGuard';
import { createScratchDir } from '../fixtures/scratchDir';
import { awsIdentityStubEnv } from '../fixtures/awsIdentityStub';

const SCRIPT = join(process.cwd(), 'scripts/ses-sender-cutover.sh');
const INTERIM = 'noreply@footbaghalloffame.net';
const CANONICAL = 'noreply@footbag.org';

let dir: string;
let calls: string;
let tfvars: string;
let cred: string;

const TFVARS_BEFORE = [
  'environment = "production"',
  `ses_sender_identity = "${INTERIM}"`,
  '',
  'ses_permitted_from_addresses = [',
  `  "${INTERIM}",`,
  '  "announce@footbag.org",',
  ']',
  '',
  'ses_enable_domain_identity = true',
  'ses_enable_domain_auth     = true',
  'ses_enable_mail_records    = false',
  '',
].join('\n');

interface World {
  verified?: boolean;
  dkim?: string;
  forwarding?: boolean;
  /** Which feedback topics the domain carries. */
  topics?: 'both' | 'none' | 'bounce-only';
  applyFails?: boolean;
  /** Resource changes the plan carries, as [address, action]. */
  plan?: [string, string][];
  /** The ses_sender_identity output Terraform's state holds. */
  stateSender?: string;
  outbox?: 'PAUSED' | 'DRAINING';
  deployFails?: boolean;
  verifyHostFails?: boolean;
}

const RETIREMENT: [string, string][] = [
  ['aws_ses_email_identity.sender[0]', 'delete'],
  ['aws_ses_identity_notification_topic.sender_bounce[0]', 'delete'],
  ['aws_ses_identity_notification_topic.sender_complaint[0]', 'delete'],
  ['aws_iam_role_policy.app_jwt_ses', 'update'],
];

function stub(name: string, body: string): string {
  const path = join(dir, 'bin', name);
  writeFileSync(path, `#!/usr/bin/env bash\n${body}\n`);
  chmodSync(path, 0o755);
  return path;
}

const log = (label: string) => `printf '%s\\n' "${label} $*" >> ${JSON.stringify(calls)}`;

function world(w: World): NodeJS.ProcessEnv {
  const state = join(dir, 'state');
  mkdirSync(state, { recursive: true });
  writeFileSync(join(state, 'outbox'), w.outbox ?? 'DRAINING');
  writeFileSync(join(state, 'sender'), w.stateSender ?? INTERIM);
  writeFileSync(
    join(state, 'identity.json'),
    JSON.stringify({
      VerifiedForSendingStatus: w.verified ?? true,
      DkimAttributes: { Status: w.dkim ?? 'SUCCESS' },
      FeedbackForwardingStatus: w.forwarding ?? false,
    }),
  );
  const topicAttrs = {
    both: { BounceTopic: 'arn:topic', ComplaintTopic: 'arn:topic' },
    none: {},
    'bounce-only': { BounceTopic: 'arn:topic' },
  }[w.topics ?? 'both'];
  writeFileSync(join(state, 'topics.json'), JSON.stringify({ NotificationAttributes: { 'footbag.org': topicAttrs } }));
  writeFileSync(
    join(state, 'plan.json'),
    JSON.stringify({
      resource_changes: (w.plan ?? RETIREMENT).map(([address, action]) => ({ address, change: { actions: [action] } })),
    }),
  );

  // The account the alias connects as is what picks the credential file.
  stub('ssh', 'if [[ "${1:-}" == "-G" ]]; then echo "hostname 198.51.100.9"; echo "user footbag"; exit 0; fi\nexit 1');
  const aws = stub(
    'aws',
    [
      log('aws'),
      `case "$1 $2" in`,
      `  "sesv2 get-email-identity") cat ${JSON.stringify(join(state, 'identity.json'))} ;;`,
      `  "ses get-identity-notification-attributes") cat ${JSON.stringify(join(state, 'topics.json'))} ;;`,
      '  *) exit 1 ;;',
      'esac',
    ].join('\n'),
  );
  const tf = stub(
    'terraform',
    [
      log('terraform'),
      'shift',
      'case "$1" in',
      '  plan) exit 0 ;;',
      `  show) cat ${JSON.stringify(join(state, 'plan.json'))} ;;`,
      w.applyFails
        ? '  apply) exit 1 ;;'
        : `  apply) printf '%s' ${JSON.stringify(CANONICAL)} > ${JSON.stringify(join(state, 'sender'))} ;;`,
      `  output) cat ${JSON.stringify(join(state, 'sender'))} ;;`,
      'esac',
    ].join('\n'),
  );
  const pause = stub(
    'pause',
    [
      'IFS= read -r _password || true',
      log('pause'),
      `f=${JSON.stringify(join(state, 'outbox'))}`,
      'case " $* " in',
      '  *" --pause "*) echo PAUSED > "$f" ;;',
      '  *" --resume "*) echo DRAINING > "$f" ;;',
      'esac',
      'echo "outbound mail on production: $(cat "$f")"',
    ].join('\n'),
  );
  const setHostEnv = stub('set-host-env', `IFS= read -r _password || true\n${log('set-host-env')}`);
  const deploy = stub('deploy', `${log('deploy')}\n${w.deployFails ? 'exit 1' : 'exit 0'}`);
  const verifyHost = stub(
    'verify-host-env',
    `IFS= read -r _password || true\n${log('verify-host-env')}\n${w.verifyHostFails ? 'exit 1' : 'exit 0'}`,
  );
  const verifyEmail = stub('verify-email', log('verify-email'));

  const home = join(dir, 'home');
  mkdirSync(join(home, 'AWS'), { recursive: true });
  cred = join(home, 'AWS', 'AWS_OPERATOR_PRODUCTION.txt');
  writeFileSync(cred, 'host-sudo-password-not-real\n');
  chmodSync(cred, 0o600);

  return {
    ...process.env,
    ...awsIdentityStubEnv(dir),
    PATH: `${join(dir, 'bin')}:${process.env.PATH ?? ''}`,
    HOME: home,
    SENDER_CUTOVER_AWS_BIN: aws,
    SENDER_CUTOVER_TF_BIN: tf,
    SENDER_CUTOVER_PAUSE_CMD: pause,
    SENDER_CUTOVER_SET_HOST_ENV_CMD: setHostEnv,
    SENDER_CUTOVER_DEPLOY_CMD: deploy,
    SENDER_CUTOVER_VERIFY_HOST_ENV_CMD: verifyHost,
    SENDER_CUTOVER_VERIFY_EMAIL_CMD: verifyEmail,
    SENDER_CUTOVER_EGRESS_CHECK: 'covered',
    SENDER_CUTOVER_TFVARS: tfvars,
  };
}

/** Runs the script at a pseudo-terminal, typing `answers` at it, credential on stdin. */
function run(w: World, args: string[] = [], answers: string[] = ['APPLY', 'APPLY']) {
  const env = world(w);
  const inner = ['bash', SCRIPT, '--target', 'production', ...args].map((a) => JSON.stringify(a)).join(' ');
  const res = spawnSync('script', ['-qec', `${inner} < ${JSON.stringify(cred)}`, '/dev/null'], {
    env,
    input: answers.map((a) => `${a}\n`).join(''),
    encoding: 'utf-8',
    ...SPAWN_GUARD,
  });
  return {
    status: res.status,
    out: `${res.stdout ?? ''}${res.stderr ?? ''}`,
    calls: existsSync(calls) ? readFileSync(calls, 'utf-8').trim().split('\n') : [],
    tfvars: readFileSync(tfvars, 'utf-8'),
    outbox: readFileSync(join(dir, 'state', 'outbox'), 'utf-8').trim(),
  };
}

/** Each call reduced to the command and, for the pause lever, its action. */
function sequence(calls: string[]): string[] {
  return calls
    .map((c) => {
      const [cmd, ...rest] = c.split(' ');
      if (cmd === 'pause') return `pause ${rest.find((a) => /^--(pause|resume|status)$/.test(a))}`;
      if (cmd === 'terraform') return `terraform ${rest[1]}`;
      // The code-only flag is what keeps a deploy from offering a database replace.
      if (cmd === 'deploy') return `deploy ${rest.slice(2).join(' ')}`.trim();
      return cmd;
    })
    .filter((c) => c !== 'aws' && c !== 'terraform output');
}

beforeEach(() => {
  dir = createScratchDir('ses-sender-cutover');
  mkdirSync(join(dir, 'bin'), { recursive: true });
  calls = join(dir, 'calls');
  tfvars = join(dir, 'production.tfvars');
  writeFileSync(tfvars, TFVARS_BEFORE);
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('ses-sender-cutover.sh: a full move', () => {
  // Defect caught: a step runs out of order, so the host holds the new sender
  // before the identity exists, or sends resume before the deploy lands.
  it('pauses, writes, applies, moves the host sender, deploys, verifies and resumes, in that order', () => {
    const r = run({});
    expect(r.status, r.out).toBe(0);
    expect(sequence(r.calls)).toEqual([
      'pause --pause',
      'terraform plan',
      'terraform show',
      'terraform apply',
      'set-host-env',
      'deploy -k',
      'verify-host-env',
      'verify-email',
      'pause --resume',
    ]);
    expect(r.outbox).toBe('DRAINING');
    // The send check refuses any principal but the runtime role, and a send as
    // that role is what proves the rewritten From-address condition.
    expect(r.calls.find((c) => c.startsWith('verify-email'))).toContain('--profile footbag-production-runtime');
  });

  // Defect caught: a list written on one line is rewritten as a pattern match,
  // so the file no longer parses or keeps the interim address it should drop.
  it('rewrites a permitted list written on one line, with or without the canonical address in it', () => {
    for (const [list, want] of [
      [`["${INTERIM}", "announce@footbag.org"]`, `["${CANONICAL}", "announce@footbag.org"]`],
      [`["${INTERIM}", "${CANONICAL}", "announce@footbag.org"]`, `["${CANONICAL}", "announce@footbag.org"]`],
    ]) {
      const before = TFVARS_BEFORE.replace(/ses_permitted_from_addresses = \[[^\]]*\]/, `ses_permitted_from_addresses = ${list}`);
      writeFileSync(tfvars, before);
      const r = run({});
      expect(r.status, r.out).toBe(0);
      expect(r.tfvars).toContain(`ses_permitted_from_addresses = ${want}\n`);
      rmSync(calls, { force: true });
    }
  });

  // Defect caught: the rewrite drops the announce address, keeps the interim one
  // the role may still send as, or never sets the flag that retires it.
  it('moves the sender and the permitted list, keeps every other entry, and adds the retire flag', () => {
    const r = run({});
    expect(r.status, r.out).toBe(0);
    expect(r.tfvars).toMatch(new RegExp(`^ses_sender_identity = "${CANONICAL}"$`, 'm'));
    expect(r.tfvars).not.toContain(INTERIM);
    expect(r.tfvars).toContain(`  "${CANONICAL}",\n  "announce@footbag.org",\n]`);
    expect(r.tfvars).toMatch(/^ses_sender_on_domain_identity = true$/m);
    expect(r.tfvars).toMatch(/^environment = "production"$/m);
  });
});

describe('ses-sender-cutover.sh: refused before anything changes', () => {
  // Defect caught: the interim identity is retired while the domain cannot yet
  // send, leaving production with no identity that authorises its mail.
  it('refuses while SES does not report the domain verified for sending', () => {
    for (const w of [{ verified: false }, { dkim: 'PENDING' }] as World[]) {
      const r = run(w);
      expect(r.status, JSON.stringify(w)).not.toBe(0);
      expect(r.out).toContain('REFUSING: SES reports footbag.org');
      expect(sequence(r.calls)).toEqual([]);
      expect(r.tfvars).toBe(TFVARS_BEFORE);
    }
  });

  // Defect caught: mail moves under an identity whose bounces go nowhere, or are
  // mailed to the unread sender address as well as to the feed.
  it('refuses while the domain has no feedback topics or still forwards feedback', () => {
    for (const [w, words] of [
      [{ topics: 'none' }, 'no bounce or complaint topic'],
      [{ topics: 'bounce-only' }, 'no bounce or complaint topic'],
      [{ forwarding: true }, 'feedback forwarding is still on'],
    ] as [World, string][]) {
      const r = run(w);
      expect(r.status).not.toBe(0);
      expect(r.out).toContain(words);
      expect(sequence(r.calls)).toEqual([]);
    }
  });

  // Defect caught: the run proceeds on a values file that would plan the domain
  // identity away in the same apply as the retirement.
  it('refuses a values file without the domain identity or domain-auth flag on', () => {
    for (const flag of ['ses_enable_domain_identity = ', 'ses_enable_domain_auth     = ']) {
      writeFileSync(tfvars, TFVARS_BEFORE.replace(`${flag}true`, `${flag}false`));
      const r = run({});
      expect(r.status, flag).not.toBe(0);
      expect(r.out).toContain('ses_enable_domain_auth set to true');
      expect(sequence(r.calls)).toEqual([]);
    }
  });

  // Defect caught: the outbox is paused or the values file written without the
  // operator choosing to, and left that way.
  it('changes nothing when the change is not confirmed', () => {
    const r = run({}, [], ['no']);
    expect(r.status).not.toBe(0);
    expect(r.out).toContain('Aborted: nothing changed');
    expect(sequence(r.calls)).toEqual([]);
    expect(r.tfvars).toBe(TFVARS_BEFORE);
  });
});

describe('ses-sender-cutover.sh: the plan, and where a stop leaves the outbox', () => {
  // Defect caught: unrelated pending changes are applied under cover of the
  // sender move, or a plan that never retires the identity is applied as if it
  // did, and the host is then pointed at a sender nothing authorises.
  it('refuses a plan beyond the retirement, or short of it, and resumes the outbox it paused', () => {
    for (const plan of [
      [...RETIREMENT, ['aws_lightsail_instance.web', 'update']],
      RETIREMENT.slice(1),
      // A replace is not a retirement: it recreates an identity nobody can verify.
      [['aws_ses_email_identity.sender[0]', 'delete,create'], ...RETIREMENT.slice(1)],
    ] as [string, string][][]) {
      const r = run({ plan });
      expect(r.status).not.toBe(0);
      expect(r.out).toMatch(/REFUSING: the plan (carries changes beyond|does not retire)/);
      expect(sequence(r.calls)).toEqual(['pause --pause', 'terraform plan', 'terraform show', 'pause --resume']);
      expect(r.outbox).toBe('DRAINING');
      // A values file left holding the cutover would retire the interim
      // identity on the next routine apply while the host still sends as it.
      expect(r.tfvars).toBe(TFVARS_BEFORE);
      expect(r.out).toContain('--from-step 1');
      rmSync(calls, { force: true });
    }
  });

  // Defect caught: a failure after the identity was destroyed resumes the
  // outbox, and every queued message is refused at the drain as the old sender.
  it('leaves the outbox paused when a step after the apply fails, and names the resume point', () => {
    const r = run({ deployFails: true });
    expect(r.status).not.toBe(0);
    expect(sequence(r.calls)).toEqual(['pause --pause', 'terraform plan', 'terraform show', 'terraform apply', 'set-host-env', 'deploy -k']);
    expect(r.outbox).toBe('PAUSED');
    expect(r.out).toContain('LEFT PAUSED');
    expect(r.out).toContain('--from-step 4');

    // The apply itself failing part-way is the same: the identity may be gone.
    rmSync(calls, { force: true });
    writeFileSync(tfvars, TFVARS_BEFORE);
    const partial = run({ applyFails: true });
    expect(partial.status).not.toBe(0);
    expect(partial.outbox).toBe('PAUSED');
    expect(partial.tfvars).not.toBe(TFVARS_BEFORE);
    expect(partial.out).toContain('LEFT PAUSED');
  });

  // Defect caught: a resumed run trusts an earlier run's pause, or redoes the
  // one-way apply instead of carrying on from where it stopped.
  it('resumes from a later step, re-checking the pause and never re-applying', () => {
    writeFileSync(tfvars, TFVARS_BEFORE.replace(`ses_sender_identity = "${INTERIM}"`, `ses_sender_identity = "${CANONICAL}"`)
      .replace(`  "${INTERIM}",`, `  "${CANONICAL}",`) + 'ses_sender_on_domain_identity = true\n');
    const r = run({ outbox: 'PAUSED', stateSender: CANONICAL }, ['--from-step', '4'], []);
    expect(r.status, r.out).toBe(0);
    expect(sequence(r.calls)).toEqual(['pause --status', 'deploy -k', 'verify-host-env', 'verify-email', 'pause --resume']);

    // The same resume finding the outbox draining pauses it before deploying.
    rmSync(calls, { force: true });
    const drained = run({ outbox: 'DRAINING', stateSender: CANONICAL }, ['--from-step', '4'], []);
    expect(drained.status, drained.out).toBe(0);
    expect(sequence(drained.calls).slice(0, 3)).toEqual(['pause --status', 'pause --pause', 'deploy -k']);
  });

  // Defect caught: a finished cutover is run again and pauses live mail, or a
  // half-finished one is reported finished.
  it('reports a finished cutover as done and changes nothing', () => {
    writeFileSync(tfvars, TFVARS_BEFORE.replace(`ses_sender_identity = "${INTERIM}"`, `ses_sender_identity = "${CANONICAL}"`)
      .replace(`  "${INTERIM}",`, `  "${CANONICAL}",`) + 'ses_sender_on_domain_identity = true\n');
    const done = run({ stateSender: CANONICAL });
    expect(done.status, done.out).toBe(0);
    expect(done.out).toContain('Already done');
    expect(sequence(done.calls)).toEqual(['verify-host-env', 'pause --status']);

    rmSync(calls, { force: true });
    const half = run({ stateSender: CANONICAL, verifyHostFails: true });
    expect(half.status).not.toBe(0);
    expect(half.out).toContain('Finish with --from-step 3');
    expect(sequence(half.calls)).toEqual(['verify-host-env']);

    // A run that stopped before resuming the outbox is not finished either.
    rmSync(calls, { force: true });
    const stillPaused = run({ stateSender: CANONICAL, outbox: 'PAUSED' });
    expect(stillPaused.status).not.toBe(0);
    expect(stillPaused.out).not.toContain('Already done');
    expect(stillPaused.out).toContain('Finish with --from-step 3');

    // Nor is a values file that was written but never applied: the run carries
    // on to the apply rather than calling it done.
    rmSync(calls, { force: true });
    const unapplied = run({ stateSender: INTERIM });
    expect(unapplied.out).not.toContain('Already done');
    expect(sequence(unapplied.calls).slice(0, 2)).toEqual(['pause --pause', 'terraform plan']);
  });
});

describe('ses-sender-cutover.sh: arguments', () => {
  // Defect caught: the move runs against staging, which has no domain identity,
  // or with no environment named at all.
  it('takes production only, named explicitly', () => {
    for (const args of [[], ['--target', 'staging']]) {
      const res = spawnSync('bash', [SCRIPT, ...args], { encoding: 'utf-8', ...SPAWN_GUARD });
      expect(res.status, args.join(' ')).toBe(2);
      expect(res.stderr).toMatch(/--target/);
    }
  });

  // Defect caught: a dry run pauses mail, writes the values file or reaches AWS.
  it('changes and calls nothing on a dry run', () => {
    const env = world({});
    const res = spawnSync('bash', [SCRIPT, '--target', 'production', '--dry-run'], { env, encoding: 'utf-8', ...SPAWN_GUARD });
    expect(res.status, res.stderr).toBe(0);
    expect(existsSync(calls)).toBe(false);
    expect(readFileSync(tfvars, 'utf-8')).toBe(TFVARS_BEFORE);
  });
});
