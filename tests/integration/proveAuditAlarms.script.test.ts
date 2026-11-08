/**
 * scripts/prove-audit-alarms.sh: proving that each audit alarm fires on a
 * deliberate trigger and clears, and that every probe it made is removed.
 *
 * Driven through its aws seam against a stub that records every call. Pinned:
 * the refusals before any change (identity, an unexpected retention, a missing
 * alarm, no typed confirmation), that each alarm is judged from its own history
 * so one that never fires fails the run, and that the probes are removed on a
 * failed run as on a clean one.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, chmodSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { SPAWN_GUARD } from '../fixtures/spawnGuard';
import { awsIdentityStubEnv } from '../fixtures/awsIdentityStub';
import { requireToolInCI } from '../fixtures/toolAvailability';

const HAS_SCRIPT = requireToolInCI('script', '--version');

const SCRIPT = join(process.cwd(), 'scripts/prove-audit-alarms.sh');
const ALARMS = [
  'footbag-production-audit-trail-tampered',
  'footbag-production-iam-write',
  'footbag-production-alerting-disabled',
  'footbag-production-kms-key-disabled',
];

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'footbag-test-auditalarms-'));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const log = () => join(dir, 'aws-calls.log');
const calls = () => (existsSync(log()) ? readFileSync(log(), 'utf8') : '');

interface Account {
  retention?: string;
  /** Alarms whose history shows ALARM then OK after the run began. */
  clears?: string[];
  /** Alarms whose history shows ALARM only. */
  firesOnly?: string[];
  missingAlarm?: string;
  analyzerFinds?: boolean;
  mfaMatches?: string;
  /** Email endpoints subscribed to each environment's alarm topic. */
  stagingMailboxes?: string[];
  productionMailboxes?: string[];
}

function awsStub(a: Account): string {
  const clears = a.clears ?? ALARMS;
  const firesOnly = a.firesOnly ?? [];
  // Each topic's subscriptions, with a non-email one beside the email ones, so
  // the script's protocol filter is what keeps it out of the comparison. The
  // stub applies the query the way AWS would only when it filters on email.
  const subs = (mailboxes: string[]) =>
    JSON.stringify(JSON.stringify(mailboxes));
  const staging = subs(a.stagingMailboxes ?? ['alarms@example.test']);
  const production = subs(a.productionMailboxes ?? ['alarms@example.test']);
  const path = join(dir, 'aws-stub.sh');
  writeFileSync(
    path,
    [
      '#!/usr/bin/env bash',
      `printf '%s\\n' "$*" >> ${JSON.stringify(log())}`,
      'name=""; prev=""',
      'for x in "$@"; do [[ "$prev" == "--alarm-name" || "$prev" == "--alarm-names" ]] && name="$x"; prev="$x"; done',
      'case "$1 $2" in',
      `  "logs describe-log-groups") echo ${JSON.stringify(a.retention ?? '90')} ;;`,
      `  "cloudwatch describe-alarms") [[ "$name" == ${JSON.stringify(a.missingAlarm ?? '')} ]] && echo 0 || echo 1 ;;`,
      '  "logs describe-metric-filters") echo "{ ($.eventName = \\"ConsoleLogin\\") }" ;;',
      `  "logs test-metric-filter") echo ${JSON.stringify(a.mfaMatches ?? '1')} ;;`,
      '  "iam create-policy") echo arn:aws:iam::111122223333:policy/probe ;;',
      '  "kms create-key") echo 1234abcd-key ;;',
      '  "sqs create-queue") echo https://sqs.us-east-1.amazonaws.com/111122223333/probe ;;',
      '  "sqs get-queue-attributes") echo arn:aws:sqs:us-east-1:111122223333:probe ;;',
      '  "guardduty list-detectors") echo d0123 ;;',
      '  "accessanalyzer list-analyzers") echo arn:aws:access-analyzer:us-east-1:111122223333:analyzer/a ;;',
      `  "accessanalyzer list-findings") echo ${a.analyzerFinds === false ? 0 : 1} ;;`,
      '  "sns list-subscriptions")',
      `    [[ "$*" == *"Protocol=='email'"* ]] || { echo '["arn:aws:sqs:us-east-1:111122223333:feed"]'; exit 0; }`,
      `    [[ "$*" == *":footbag-staging-alarms'"* ]] && { printf '%s\\n' ${staging}; exit 0; }`,
      `    [[ "$*" == *":footbag-production-alarms'"* ]] && { printf '%s\\n' ${production}; exit 0; }`,
      '    echo "[]" ;;',
      '  "cloudwatch describe-alarm-history")',
      ...clears.map((n) => `    [[ "$name" == ${JSON.stringify(n)} ]] && { echo "Alarm updated from OK to ALARM	Alarm updated from ALARM to OK"; exit 0; }`),
      ...firesOnly.map((n) => `    [[ "$name" == ${JSON.stringify(n)} ]] && { echo "Alarm updated from OK to ALARM"; exit 0; }`),
      '    echo "" ;;',
      'esac',
      'exit 0',
    ].join('\n'),
    'utf-8',
  );
  chmodSync(path, 0o755);
  return path;
}

function run(args: string[], a: Account = {}, arn?: string) {
  const r = spawnSync('bash', [SCRIPT, ...args], {
    encoding: 'utf-8',
    input: '',
    env: {
      ...process.env,
      ...awsIdentityStubEnv(dir, arn ? { arn } : {}),
      PROVE_AUDIT_ALARMS_AWS_BIN: awsStub(a),
      PROVE_AUDIT_ALARMS_POLL_SECONDS: '0',
      PROVE_AUDIT_ALARMS_WAIT_MINUTES: '0',
    },
    ...SPAWN_GUARD,
  });
  return { status: r.status ?? -1, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}

/** At a terminal, typing APPLY (unless --yes is given) and then each answer in turn. */
function runAtTerminal(answers: string[], a: Account = {}, args: string[] = []) {
  const inner = `bash ${JSON.stringify(SCRIPT)} ${args.join(' ')} </dev/null; echo "EXIT=$?"`;
  const typed = args.includes('--yes') ? answers : ['APPLY', ...answers];
  const r = spawnSync('script', ['-qec', inner, '/dev/null'], {
    encoding: 'utf-8',
    input: typed.map((x) => `${x}\n`).join(''),
    env: {
      ...process.env,
      ...awsIdentityStubEnv(dir),
      PROVE_AUDIT_ALARMS_AWS_BIN: awsStub(a),
      PROVE_AUDIT_ALARMS_POLL_SECONDS: '0',
      PROVE_AUDIT_ALARMS_WAIT_MINUTES: '0',
    },
    ...SPAWN_GUARD,
  });
  const out = r.stdout ?? '';
  const m = out.match(/EXIT=(\d+)/);
  // Matched rather than split on lines: the terminal echoes the typed answers,
  // so several prompts can land on one line of the transcript.
  const questions = [...out.matchAll(/Did an email for [^?]*? reach the [^?]*?\? \(yes\/no\):/g)].map((m) => m[0]);
  return { status: m ? Number(m[1]) : -1, out, questions };
}

/** Every mutating call the run made, so a refusal can be shown to have changed nothing. */
const mutations = () =>
  calls()
    .split('\n')
    .filter((l) => /^(logs put-|iam create|iam delete|cloudwatch put|cloudwatch delete|kms |sqs create|sqs set|sqs delete|guardduty create)/.test(l));

describe('prove-audit-alarms.sh: refusals before any change', () => {
  it('a dry run reads and changes nothing', () => {
    // A dry run that reached the account would be a probe nobody confirmed.
    const r = run(['--dry-run']);
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/Nothing was read, changed or created/);
    expect(calls()).toBe('');
  });

  it('refuses an identity that is not the directly authenticated operator', () => {
    // A run under the job role would be refused partway by IAM, leaving probes.
    const r = run(['--yes'], {}, 'arn:aws:sts::111122223333:assumed-role/FootbagDevTester/s');
    expect(r.status).not.toBe(0);
    expect(mutations()).toEqual([]);
  });

  it('refuses to re-set a trail retention it did not expect, changing nothing', () => {
    // Re-setting to 90 a log group that holds another value would shorten or
    // lengthen the audit record; the run only re-sets the value already there.
    const r = run(['--yes'], { retention: '30' });
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/reads '30', not 90/);
    expect(mutations()).toEqual([]);
  });

  it('refuses before any change when an audit alarm has not been applied', () => {
    const r = run(['--yes'], { missingAlarm: 'footbag-production-iam-write' });
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/footbag-production-iam-write does not exist/);
    expect(mutations()).toEqual([]);
  });

  it('makes no change without a typed confirmation and no terminal', () => {
    // A probe run started by a script or an agent with nobody watching must stop.
    const r = run([]);
    expect(r.status).not.toBe(0);
    expect(mutations()).toEqual([]);
  });
});

describe('prove-audit-alarms.sh: judging the outcome', () => {
  it('proves every alarm that fired and cleared, and removes every probe', () => {
    const r = run(['--yes']);
    expect(r.status, r.stderr).toBe(0);
    for (const a of ALARMS) expect(r.stdout + r.stderr).toContain(`${a} fired on its trigger and cleared`);
    // Under --yes nobody can attest to the emails, so they are reported unproved.
    expect(r.stdout + r.stderr).toMatch(/not asked: no terminal/);
    const c = calls();
    expect(c).toMatch(/iam delete-policy/);
    expect(c).toMatch(/sqs delete-queue/);
    expect(c).toMatch(/kms schedule-key-deletion --key-id 1234abcd-key --pending-window-in-days 7/);
    expect(c).toMatch(/logs put-retention-policy --log-group-name \/footbag\/production\/cloudtrail --retention-in-days 90/);
  });

  it('fails a run where an alarm never fired or never cleared, and still removes the probes', () => {
    // An alarm that never fires is the defect this run exists to find; the
    // probes must still go, or the failed proof leaves a public queue behind.
    const r = run(['--yes'], {
      clears: ALARMS.slice(2),
      firesOnly: ['footbag-production-iam-write'],
    });
    expect(r.status).not.toBe(0);
    const out = r.stdout + r.stderr;
    expect(out).toMatch(/footbag-production-audit-trail-tampered did not fire/);
    expect(out).toMatch(/footbag-production-iam-write fired but did not clear/);
    expect(calls()).toMatch(/sqs delete-queue/);
  });

  it('fails when Access Analyzer never reports the public queue', () => {
    const r = run(['--yes'], { analyzerFinds: false });
    expect(r.status).not.toBe(0);
    expect(r.stdout + r.stderr).toMatch(/Access Analyzer did not report the public probe queue/);
  });

  it('under --yes records both environments\' mailboxes unproved, asking nothing', () => {
    // A run with nobody to ask must not count an email as received in either.
    const r = run(['--yes'], { productionMailboxes: ['other@example.test'] });
    expect(r.status, r.stderr).toBe(0);
    const out = r.stdout + r.stderr;
    expect(out).toMatch(/staging alarm mailbox \(not asked: no terminal\)/);
    expect(out).toMatch(/production alarm mailbox \(not asked: no terminal\)/);
  });

  it('fails when the MFA pattern does not match a sign-in without MFA', () => {
    // A pattern that matches nothing reads exactly like a quiet account.
    const r = run(['--yes'], { mfaMatches: '0' });
    expect(r.status).not.toBe(0);
    expect(r.stdout + r.stderr).toMatch(/matched 0 of one captured sign-in without MFA/);
  });
});

describe.skipIf(!HAS_SCRIPT)('prove-audit-alarms.sh: the operator attests to each mailbox', () => {
  // Both environments' alarm topics carry the finding rules, so each finding is
  // meant to reach both environments' mailboxes. A run that asks only about
  // staging can pass while production's route delivers nothing.

  it('asks once per finding when both environments email the same destinations, and says so', () => {
    // Asking twice about one inbox invites a second "yes" from the same email.
    const r = runAtTerminal(['yes', 'yes']);
    expect(r.status, r.out).toBe(0);
    expect(r.questions).toHaveLength(2);
    for (const q of r.questions) expect(q).toMatch(/staging and production share/);
    expect(r.out).not.toContain('alarms@example.test');
  });

  it('treats the same destinations listed in another order, or repeated, as one inbox', () => {
    // AWS lists subscriptions in no promised order, and one address can be
    // subscribed twice; neither makes two inboxes.
    const r = runAtTerminal(['yes', 'yes'], {
      stagingMailboxes: ['watch@example.test', 'alarms@example.test'],
      productionMailboxes: ['alarms@example.test', 'watch@example.test', 'alarms@example.test'],
    });
    expect(r.status, r.out).toBe(0);
    expect(r.questions).toHaveLength(2);
  });

  it('counts only "yes" as attested; any other answer fails the run', () => {
    // A mistyped or empty answer is not an operator saying the email arrived.
    const r = runAtTerminal(['y', '']);
    expect(r.status).not.toBe(0);
    expect(r.out).toMatch(/no email for the GuardDuty sample finding reached the alarm mailbox that staging and production share/);
  });

  it('asks nothing under --yes even at a terminal, recording the mailboxes unproved', () => {
    // --yes means nobody is answering, whether or not a terminal happens to exist.
    const r = runAtTerminal([], {}, ['--yes']);
    expect(r.status, r.out).toBe(0);
    expect(r.questions).toHaveLength(0);
    expect(r.out).toMatch(/alarm mailbox that staging and production share \(not asked: no terminal\)/);
  });

  it('asks about each environment separately when their destinations differ', () => {
    const r = runAtTerminal(['yes', 'yes', 'yes', 'yes'], {
      productionMailboxes: ['alarms@example.test', 'watch@example.test'],
    });
    expect(r.status, r.out).toBe(0);
    expect(r.questions).toHaveLength(4);
    expect(r.questions.filter((q) => q.includes('staging alarm mailbox'))).toHaveLength(2);
    expect(r.questions.filter((q) => q.includes('production alarm mailbox'))).toHaveLength(2);
    // The mailbox is vault-governed, so no address reaches the terminal log.
    expect(r.out).not.toMatch(/@example\.test/);
  });

  it('fails the run when production\'s mailbox did not receive a finding', () => {
    // Order of questions: per finding, staging then production.
    const r = runAtTerminal(['yes', 'no', 'yes', 'yes'], {
      productionMailboxes: ['watch@example.test'],
    });
    expect(r.status).not.toBe(0);
    expect(r.out).toMatch(/no email for the GuardDuty sample finding reached the production alarm mailbox/);
  });

  it('reports an environment whose alarm topic has no email subscription, without asking about it', () => {
    // Nothing could have arrived, so a "yes" there would be a false proof.
    const r = runAtTerminal(['yes', 'yes'], { productionMailboxes: [] });
    expect(r.status).not.toBe(0);
    expect(r.out).toMatch(/footbag-production-alarms has no email subscription/);
    expect(r.questions).toHaveLength(2);
    for (const q of r.questions) expect(q).toContain('staging alarm mailbox');
  });
});
