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
  'footbag-production-backup-protection-changed',
  'footbag-production-backup-access-changed',
];
const WEST_QUEUE_URL = 'https://sqs.us-west-2.amazonaws.com/111122223333/probe';
const WEST_QUEUE_ARN = 'arn:aws:sqs:us-west-2:111122223333:probe';
const WEST_ANALYZER = 'arn:aws:access-analyzer:us-west-2:111122223333:analyzer/w';

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
  /** Whether the us-west-2 analyzer reports the us-west-2 queue. */
  westAnalyzerFinds?: boolean;
  /** The us-west-2 analyzer reports the queue only from this poll onward. */
  westFindsOnPoll?: number;
  /** No active account analyzer in us-west-2. */
  noWestAnalyzer?: boolean;
  /** The media backup bucket's versioning status. */
  versioning?: string;
  /** The media backup bucket's public access block, as the CLI's text output lists it. */
  blocks?: string;
  mfaMatches?: string;
  /** Email endpoints subscribed to each environment's alarm topic. */
  stagingMailboxes?: string[];
  productionMailboxes?: string[];
  /** Email endpoints subscribed to each environment's us-west-2 alarm topic. */
  westStagingMailboxes?: string[];
  westProductionMailboxes?: string[];
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
  const westStaging = subs(a.westStagingMailboxes ?? ['alarms@example.test', 'watch@example.test']);
  const westProduction = subs(a.westProductionMailboxes ?? ['alarms@example.test', 'watch@example.test']);
  const path = join(dir, 'aws-stub.sh');
  writeFileSync(
    path,
    [
      '#!/usr/bin/env bash',
      `printf '%s\\n' "$*" >> ${JSON.stringify(log())}`,
      'name=""; prev=""; west=0',
      'for x in "$@"; do [[ "$prev" == "--alarm-name" || "$prev" == "--alarm-names" ]] && name="$x"; [[ "$prev" == "--region" && "$x" == "us-west-2" ]] && west=1; prev="$x"; done',
      'case "$1 $2" in',
      `  "logs describe-log-groups") echo ${JSON.stringify(a.retention ?? '90')} ;;`,
      `  "s3api get-bucket-versioning") echo ${JSON.stringify(a.versioning ?? 'Enabled')} ;;`,
      `  "s3api get-public-access-block") printf '%b\\n' ${JSON.stringify(a.blocks ?? 'True\tTrue\tTrue\tTrue')} ;;`,
      `  "cloudwatch describe-alarms") [[ "$name" == ${JSON.stringify(a.missingAlarm ?? '')} ]] && echo 0 || echo 1 ;;`,
      '  "logs describe-metric-filters") echo "{ ($.eventName = \\"ConsoleLogin\\") }" ;;',
      `  "logs test-metric-filter") echo ${JSON.stringify(a.mfaMatches ?? '1')} ;;`,
      '  "iam create-policy") echo arn:aws:iam::111122223333:policy/probe ;;',
      '  "kms create-key") echo 1234abcd-key ;;',
      `  "sqs create-queue") (( west )) && echo ${WEST_QUEUE_URL} || echo https://sqs.us-east-1.amazonaws.com/111122223333/probe ;;`,
      // The ARN is answered only for the queue the region holds, so a us-west-2
      // queue read without its region is refused as AWS would refuse it.
      '  "sqs get-queue-attributes")',
      `    [[ "$*" == *${WEST_QUEUE_URL}* ]] && { (( west )) && echo ${WEST_QUEUE_ARN} || exit 254; exit 0; }`,
      '    echo arn:aws:sqs:us-east-1:111122223333:probe ;;',
      '  "guardduty list-detectors") echo d0123 ;;',
      `  "accessanalyzer list-analyzers") (( west )) && echo ${a.noWestAnalyzer ? 'None' : WEST_ANALYZER} || echo arn:aws:access-analyzer:us-east-1:111122223333:analyzer/a ;;`,
      '  "accessanalyzer list-findings")',
      ...(a.westFindsOnPoll
        ? [
          `    polls=${JSON.stringify(join(dir, 'west-polls'))}`,
          '    if (( west )); then n=$(( $(cat "$polls" 2>/dev/null || echo 0) + 1 )); echo "$n" > "$polls";',
          `      (( n >= ${a.westFindsOnPoll} )) && echo 1 || echo 0; exit 0; fi`,
        ]
        : []),
      `    if (( west )); then [[ "$*" == *${WEST_ANALYZER}* && "$*" == *${WEST_QUEUE_ARN}* ]] && echo ${a.westAnalyzerFinds === false ? 0 : 1} || echo 0; exit 0; fi`,
      `    echo ${a.analyzerFinds === false ? 0 : 1} ;;`,
      '  "sns list-subscriptions")',
      `    [[ "$*" == *"Protocol=='email'"* ]] || { echo '["arn:aws:sqs:us-east-1:111122223333:feed"]'; exit 0; }`,
      `    (( west )) && [[ "$*" == *":footbag-staging-alarms-usw2'"* ]] && { printf '%s\\n' ${westStaging}; exit 0; }`,
      `    (( west )) && [[ "$*" == *":footbag-production-alarms-usw2'"* ]] && { printf '%s\\n' ${westProduction}; exit 0; }`,
      '    (( west )) && { echo "[]"; exit 0; }',
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

function run(args: string[], a: Account = {}, arn?: string, waitMinutes = '0') {
  const r = spawnSync('bash', [SCRIPT, ...args], {
    encoding: 'utf-8',
    input: '',
    env: {
      ...process.env,
      ...awsIdentityStubEnv(dir, arn ? { arn } : {}),
      PROVE_AUDIT_ALARMS_AWS_BIN: awsStub(a),
      PROVE_AUDIT_ALARMS_POLL_SECONDS: '0',
      PROVE_AUDIT_ALARMS_WAIT_MINUTES: waitMinutes,
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
    .filter((l) => /^(logs put-|iam create|iam delete|cloudwatch put|cloudwatch delete|kms |sqs create|sqs set|sqs delete|guardduty create|s3api put)/.test(l));

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

  it('refuses to re-set backup versioning it did not find Enabled, changing nothing', () => {
    // Writing Enabled over a suspended bucket would be a real change to a
    // backup bucket, not a harmless trigger; the run only re-sets what is there.
    const r = run(['--yes'], { versioning: 'Suspended' });
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/footbag-production-media-dr's versioning reads 'Suspended', not Enabled/);
    expect(mutations()).toEqual([]);
    expect(calls()).toMatch(/s3api get-bucket-versioning --bucket footbag-production-media-dr --region us-west-2/);
  });

  it('refuses to re-set a backup public access block it did not find fully on, changing nothing', () => {
    // Writing all four blocks over a bucket that reads one off would close a
    // gap someone opened, a real change rather than a harmless trigger.
    const r = run(['--yes'], { blocks: 'True\tTrue\tFalse\tTrue' });
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/footbag-production-media-dr's public access block reads 'True True False True', not all four on/);
    expect(mutations()).toEqual([]);
    expect(calls()).toMatch(/s3api get-public-access-block --bucket footbag-production-media-dr --region us-west-2/);
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
    // The backup-protection trigger re-sets the value it read, in the bucket's own region.
    expect(c).toMatch(/s3api put-bucket-versioning --bucket footbag-production-media-dr --region us-west-2 --versioning-configuration Status=Enabled/);
    // The backup-access trigger re-sets the four blocks it read, in the same region.
    expect(c).toMatch(/s3api put-public-access-block --bucket footbag-production-media-dr --region us-west-2 --public-access-block-configuration BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true/);
  });

  it('raises and removes a public queue in us-west-2, judged by that region\'s analyzer', () => {
    // The us-west-2 analyzer sees only its own region and publishes only to
    // its event bus there, so a run probing us-east-1 alone proves nothing
    // about the backup region's finding route. Both queues must go afterwards.
    const r = run(['--yes']);
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout + r.stderr).toContain('the us-west-2 Access Analyzer reported the public probe queue there');
    const c = calls();
    expect(c).toMatch(/sqs create-queue --queue-name footbag-staging-probe-\d+ --region us-west-2/);
    expect(c).toContain(`sqs set-queue-attributes --queue-url ${WEST_QUEUE_URL} --region us-west-2`);
    expect(c).toContain(`sqs delete-queue --queue-url ${WEST_QUEUE_URL} --region us-west-2`);
    expect(c).toMatch(/sqs delete-queue --queue-url https:\/\/sqs\.us-east-1\./);
  });

  it('fails when the us-west-2 analyzer never reports its queue, though us-east-1\'s does', () => {
    // A finding route in one region must not stand in for the other's.
    const r = run(['--yes'], { westAnalyzerFinds: false });
    expect(r.status).not.toBe(0);
    const out = r.stdout + r.stderr;
    expect(out).toMatch(/the us-west-2 Access Analyzer did not report the public probe queue there/);
    expect(out).toContain('Access Analyzer reported the public probe queue');
    expect(calls()).toContain(`sqs delete-queue --queue-url ${WEST_QUEUE_URL} --region us-west-2`);
  });

  it('keeps waiting for a us-west-2 finding that arrives after the rest', () => {
    // Defect caught: the wait ending once us-east-1's outcomes are in, which
    // fails a healthy backup-region route whose finding is a poll behind.
    // The wait is a minute, well above the second poll this needs, so the
    // run's own clock never decides the verdict.
    const r = run(['--yes'], { westFindsOnPoll: 2 }, undefined, '1');
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout + r.stderr).toContain('the us-west-2 Access Analyzer reported the public probe queue there');
  });

  it('fails when us-west-2 has no active analyzer to report anything', () => {
    // Without the analyzer the backup region's buckets are never analysed.
    const r = run(['--yes'], { noWestAnalyzer: true });
    expect(r.status).not.toBe(0);
    expect(r.stdout + r.stderr).toMatch(/no active account analyzer in us-west-2/);
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
    expect(out).toMatch(/us-west-2 Access Analyzer finding for \S+ reached the us-west-2 alarm mailbox that staging and production share \(not asked: no terminal\)/);
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
    const r = runAtTerminal(['yes', 'yes', 'yes']);
    expect(r.status, r.out).toBe(0);
    expect(r.questions).toHaveLength(3);
    for (const q of r.questions) expect(q).toMatch(/staging and production share/);
    expect(r.out).not.toContain('alarms@example.test');
  });

  it('treats the same destinations listed in another order, or repeated, as one inbox', () => {
    // AWS lists subscriptions in no promised order, and one address can be
    // subscribed twice; neither makes two inboxes.
    const r = runAtTerminal(['yes', 'yes', 'yes'], {
      stagingMailboxes: ['watch@example.test', 'alarms@example.test'],
      productionMailboxes: ['alarms@example.test', 'watch@example.test', 'alarms@example.test'],
    });
    expect(r.status, r.out).toBe(0);
    expect(r.questions).toHaveLength(3);
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
    const r = runAtTerminal(['yes', 'yes', 'yes', 'yes', 'yes'], {
      productionMailboxes: ['alarms@example.test', 'watch@example.test'],
    });
    expect(r.status, r.out).toBe(0);
    expect(r.questions).toHaveLength(5);
    expect(r.questions.filter((q) => q.includes('staging alarm mailbox'))).toHaveLength(2);
    expect(r.questions.filter((q) => q.includes('production alarm mailbox'))).toHaveLength(2);
    // The mailbox is vault-governed, so no address reaches the terminal log.
    expect(r.out).not.toMatch(/@example\.test/);
  });

  it('fails the run when production\'s mailbox did not receive a finding', () => {
    // Order of questions: per finding, staging then production.
    const r = runAtTerminal(['yes', 'no', 'yes', 'yes', 'yes'], {
      productionMailboxes: ['watch@example.test'],
    });
    expect(r.status).not.toBe(0);
    expect(r.out).toMatch(/no email for the GuardDuty sample finding reached the production alarm mailbox/);
  });

  it('reports an environment whose alarm topic has no email subscription, without asking about it', () => {
    // Nothing could have arrived, so a "yes" there would be a false proof.
    const r = runAtTerminal(['yes', 'yes', 'yes'], { productionMailboxes: [] });
    expect(r.status).not.toBe(0);
    expect(r.out).toMatch(/footbag-production-alarms has no email subscription/);
    const east = r.questions.filter((q) => !q.includes('us-west-2 alarm mailbox'));
    expect(east).toHaveLength(2);
    for (const q of east) expect(q).toContain('staging alarm mailbox');
  });

  it('asks about the us-west-2 finding at the us-west-2 topics\' mailboxes, apart from us-east-1\'s', () => {
    // The backup region's findings travel by its own -alarms-usw2 topics, so
    // an answer about the us-east-1 mailbox says nothing about them.
    const r = runAtTerminal(['yes', 'yes', 'yes', 'yes'], {
      westProductionMailboxes: ['other@example.test'],
    });
    expect(r.status, r.out).toBe(0);
    const west = r.questions.filter((q) => q.includes('the us-west-2 Access Analyzer finding'));
    expect(west).toHaveLength(2);
    expect(west.some((q) => q.includes('reach the staging us-west-2 alarm mailbox'))).toBe(true);
    expect(west.some((q) => q.includes('reach the production us-west-2 alarm mailbox'))).toBe(true);
    // The us-east-1 questions keep their own shared mailbox.
    expect(r.questions.filter((q) => q.includes('alarm mailbox that staging and production share'))).toHaveLength(2);
  });

  it('reports a us-west-2 alarm topic with no email subscription, without asking about it', () => {
    // Nothing could have arrived there, so a "yes" would be a false proof.
    const r = runAtTerminal(['yes', 'yes', 'yes'], { westProductionMailboxes: [] });
    expect(r.status).not.toBe(0);
    expect(r.out).toMatch(/footbag-production-alarms-usw2 has no email subscription/);
    const west = r.questions.filter((q) => q.includes('the us-west-2 Access Analyzer finding'));
    expect(west).toHaveLength(1);
    expect(west[0]).toContain('staging us-west-2 alarm mailbox');
  });
});
