/**
 * Contract tests for scripts/confirm-alarm-subscription.sh: confirming the
 * ops-alert group's alarm subscription so that the unsubscribe link in an alarm
 * email cannot remove it.
 *
 * What carries the risk: a confirmation that leaves the subscription removable
 * by one stray click, which is silent and removes it for every member of the
 * group; a link for the wrong topic or the wrong environment being confirmed;
 * a confirmation happening without the typed answer; and a pass reported on the
 * strength of the call returning rather than on what the service now holds.
 *
 * Hermetic: a stand-in AWS CLI, named through the script's test seam, answers
 * the two subscription calls and logs its argv, and the shared identity stub
 * settles the profile. The link is built from the two parameters the service's
 * confirmation call takes, the topic and the token, which is all the script
 * reads from it; its other parameters and their order do not matter to a URL
 * parser.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import * as path from 'node:path';
import * as fs from 'node:fs';

import { SPAWN_GUARD } from '../fixtures/spawnGuard';
import { createScratchDir, removeScratch } from '../fixtures/scratchDir';
import { awsIdentityStubEnv } from '../fixtures/awsIdentityStub';

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const SCRIPT = path.join(REPO_ROOT, 'scripts', 'confirm-alarm-subscription.sh');

function link(topic: string, token = 'a1b2c3d4e5', region = 'us-east-1'): string {
  return (
    `https://sns.${region}.amazonaws.com/confirmation.html?TopicArn=` +
    encodeURIComponent(`arn:aws:sns:${region}:000000000000:${topic}`) +
    `&Token=${token}&Endpoint=ops-alert@footbag.org`
  );
}

let dir: string;
let fakeAws: string;
let awsLog: string;

function run(
  args: string[],
  stdin: string,
  env: Record<string, string> = {},
): { status: number | null; stdout: string; stderr: string } {
  const res = spawnSync('bash', [SCRIPT, ...args], {
    encoding: 'utf8',
    input: stdin + '\n',
    env: {
      ...process.env,
      ...awsIdentityStubEnv(dir),
      FOOTBAG_AWS_BIN: fakeAws,
      FAKE_AWS_LOG: awsLog,
      ...env,
    },
    ...SPAWN_GUARD,
  });
  return { status: res.status, stdout: res.stdout, stderr: res.stderr };
}

const confirmCalls = (): string[] =>
  fs.readFileSync(awsLog, 'utf8').split('\n').filter((l) => l.includes('confirm-subscription'));

beforeEach(() => {
  dir = createScratchDir('confirm-alarm-subscription');
  awsLog = path.join(dir, 'aws.log');
  fs.writeFileSync(awsLog, '');
  fakeAws = path.join(dir, 'aws');
  fs.writeFileSync(
    fakeAws,
    [
      '#!/usr/bin/env bash',
      'printf \'%s\\n\' "$*" >> "$FAKE_AWS_LOG"',
      'case "$2" in',
      '  confirm-subscription)',
      '    [[ "${FAKE_CONFIRM_FAIL:-}" == "1" ]] && { echo "InvalidParameter: Token expired" >&2; exit 254; }',
      '    printf \'arn:aws:sns:us-east-1:000000000000:footbag-production-alarms:11111111-2222\\n\' ;;',
      '  get-subscription-attributes)',
      '    printf \'%s\\n\' "${FAKE_ATTRS:-false	true	ops-alert@footbag.org}" ;;',
      'esac',
      '',
    ].join('\n'),
    { mode: 0o755 },
  );
});

afterEach(() => {
  removeScratch(dir);
});

describe('confirm-alarm-subscription: confirming', () => {
  it('confirms with authentication required on unsubscribe, and passes on the read-back', () => {
    const res = run(['--target', 'production', '--yes'], link('footbag-production-alarms'));
    expect(res.status).toBe(0);
    expect(res.stdout).toContain('PASS: ops-alert@footbag.org is confirmed on footbag-production-alarms');
    const [call] = confirmCalls();
    expect(call).toContain('--authenticate-on-unsubscribe true');
    expect(call).toContain('--topic-arn arn:aws:sns:us-east-1:000000000000:footbag-production-alarms');
    expect(call).toContain('--token a1b2c3d4e5');
    expect(call).toContain('--region us-east-1');
  });

  it('accepts each of the environment’s three alarm topics, each in its own region', () => {
    // Defect caught: the group's critical-topic link, or either address's
    // us-west-2 link, refused, so that subscription can only be confirmed by
    // clicking, which leaves it removable by any unsubscribe link.
    expect(run(['--target', 'production', '--yes'], link('footbag-production-alarms-critical')).status).toBe(0);
    const west = run(['--target', 'staging', '--yes'], link('footbag-staging-alarms-usw2', 'a1b2c3d4e5', 'us-west-2'));
    expect(west.status, west.stderr).toBe(0);
    expect(confirmCalls().at(-1)).toContain('--region us-west-2');
  });

  it('refuses the us-west-2 topic named in another region', () => {
    const res = run(['--target', 'staging', '--yes'], link('footbag-staging-alarms-usw2'));
    expect(res.status).toBe(2);
    expect(res.stderr).toContain('where it does not live');
  });

  it('fails when the read-back shows a subscription an unsubscribe link could still remove', () => {
    const res = run(['--target', 'production', '--yes'], link('footbag-production-alarms'), {
      FAKE_ATTRS: 'false\tfalse\tops-alert@footbag.org',
    });
    expect(res.status).toBe(1);
    expect(res.stdout).toContain('not confirmed with authentication required');
  });

  it('fails when the read-back shows the subscription still pending', () => {
    const res = run(['--target', 'production', '--yes'], link('footbag-production-alarms'), {
      FAKE_ATTRS: 'true\tfalse\tops-alert@footbag.org',
    });
    expect(res.status).toBe(1);
  });

  it('fails, naming the fresh-email remedy, when the service refuses the token', () => {
    const res = run(['--target', 'production', '--yes'], link('footbag-production-alarms'), { FAKE_CONFIRM_FAIL: '1' });
    expect(res.status).toBe(1);
    expect(res.stderr).toContain('fresh confirmation email');
  });
});

describe('confirm-alarm-subscription: the walk at a terminal', () => {
  // The stand-in lists the three staging topics; PENDING names which of them
  // has a pending email subscription to the operations mailbox.
  function walkAws(pending: string[]): string {
    const p = path.join(dir, 'aws-walk');
    const arn = (r: string, t: string) => `arn:aws:sns:${r}:000000000000:${t}`;
    fs.writeFileSync(p, [
      '#!/usr/bin/env bash',
      'printf \'%s\\n\' "$*" >> "$FAKE_AWS_LOG"',
      'region=""; topic=""; prev=""',
      'for a in "$@"; do [[ "$prev" == --region ]] && region="$a"; [[ "$prev" == --topic-arn ]] && topic="$a"; prev="$a"; done',
      'case "$2" in',
      '  list-topics)',
      '    [[ "${FAKE_LIST_FAIL:-}" == "1" ]] && { echo "AccessDenied: not authorized" >&2; exit 254; }',
      `    [[ "$region" == us-east-1 ]] && printf '%s\\t%s\\n' ${JSON.stringify(arn('us-east-1', 'footbag-staging-alarms'))} ${JSON.stringify(arn('us-east-1', 'footbag-staging-alarms-critical'))}`,
      `    [[ "$region" == us-west-2 ]] && printf '%s\\n' ${JSON.stringify(arn('us-west-2', 'footbag-staging-alarms-usw2'))}`,
      '    exit 0 ;;',
      '  list-subscriptions-by-topic)',
      // With FAKE_CLICK_AFTER_FIRST, the first read finds the topics pending and
      // every later read finds them confirmed, as after the operator clicks.
      '    reads=$(grep -c list-subscriptions-by-topic "$FAKE_AWS_LOG")',
      '    if [[ -n "${FAKE_CLICK_AFTER_FIRST:-}" && "$reads" -gt 3 ]]; then',
      `      for t in ${pending.join(' ')}; do [[ "$topic" == *":$t" ]] && printf '%s:3333\\tops@example.org\\n' "$topic"; done; exit 0`,
      '    fi',
      `    for t in ${pending.join(' ')}; do [[ "$topic" == *":$t" ]] && printf 'PendingConfirmation\\tops@example.org\\n'; done`,
      '    for t in ${FAKE_CLICKED:-}; do [[ "$topic" == *":$t" ]] && printf \'%s:2222\\tops@example.org\\n\' "$topic"; done',
      '    exit 0 ;;',
      '  confirm-subscription) [[ "${FAKE_CONFIRM_FAIL:-}" == "1" ]] && { echo "InvalidParameter: Token expired" >&2; exit 254; }; printf \'%s:1111\\n\' "$topic" ;;',
      '  get-subscription-attributes) printf \'false\\ttrue\\tops@example.org\\n\' ;;',
      'esac',
      '',
    ].join('\n'), { mode: 0o755 });
    return p;
  }

  /** At a terminal, answering each prompt in turn. */
  function walk(answers: string[], pending: string[], extra: Record<string, string> = {}) {
    const r = spawnSync('script', ['-qec', `bash ${JSON.stringify(SCRIPT)} --target staging; echo "EXIT=$?"`, '/dev/null'], {
      encoding: 'utf8',
      input: answers.map((a) => `${a}\n`).join(''),
      env: { ...process.env, ...awsIdentityStubEnv(dir), FOOTBAG_AWS_BIN: walkAws(pending), FAKE_AWS_LOG: awsLog, ...extra },
      ...SPAWN_GUARD,
    });
    const out = r.stdout ?? '';
    return { status: Number(out.match(/EXIT=(\d+)/)?.[1] ?? -1), out };
  }

  const MAIN = link('footbag-staging-alarms');
  const WEST = link('footbag-staging-alarms-usw2', 'b2c3d4e5f6', 'us-west-2');

  // Defect caught: the operator left to work out which email holds which link,
  // or that clicking it is the wrong move.
  it('names each pending topic, the inbox, the search and not to click, then confirms the links in any order', () => {
    const r = walk(['yes', WEST, 'APPLY', MAIN, 'APPLY'], ['footbag-staging-alarms', 'footbag-staging-alarms-usw2']);
    expect(r.status, r.out).toBe(0);
    expect(r.out).toMatch(/footbag-staging-alarms +\(us-east-1\) +sent to ops@example\.org/);
    expect(r.out).toContain('from:no-reply@sns.amazonaws.com "Subscription Confirmation"');
    expect(r.out).toContain('click "Confirm subscription", then come back here and press');
    expect(r.out).toContain('in any order');
    const calls = confirmCalls();
    expect(calls).toHaveLength(2);
    expect(calls[0]).toContain('--region us-west-2');
    expect(calls[1]).toContain('footbag-staging-alarms --token');
    for (const c of calls) expect(c).toContain('--authenticate-on-unsubscribe true');
  });

  // Defect caught: a link for a topic that is not waiting confirmed again, or
  // a foreign link ending the walk instead of asking again.
  it('explains a link for a topic not waiting or for another environment, and asks again', () => {
    const r = walk(['yes', WEST, link('footbag-production-alarms'), MAIN, 'APPLY'], ['footbag-staging-alarms']);
    expect(r.status, r.out).toBe(0);
    expect(r.out).toContain('That link is for footbag-staging-alarms-usw2 (us-west-2), which is not waiting to be confirmed');
    expect(r.out).toContain("not one of staging's alarm topics");
    expect(confirmCalls()).toHaveLength(1);
  });

  // Defect caught: a skipped topic reported as done, or the run ending
  // without saying how to get a fresh email.
  it('leaves a topic pending when the operator stops, names the resend, and exits 3', () => {
    const r = walk(['yes', WEST, 'APPLY', ''], ['footbag-staging-alarms', 'footbag-staging-alarms-usw2']);
    expect(r.status, r.out).toBe(3);
    expect(r.out).toContain('Still pending: footbag-staging-alarms.');
    expect(r.out).toContain('bash scripts/reconfirm-alarm-subscriptions.sh --target staging');
    expect(confirmCalls()).toHaveLength(1);
  });

  // Defect caught: an operator who confirmed by clicking the emails still asked
  // to paste every link, or the walk ending pending when AWS reads them done.
  it('finishes when the operator clicks the links and presses Enter', () => {
    const r = walk(['yes', ''], ['footbag-staging-alarms', 'footbag-staging-alarms-usw2'], { FAKE_CLICK_AFTER_FIRST: '1' });
    expect(r.status, r.out).toBe(0);
    expect(r.out).toContain('AWS now reads 2 more of them confirmed.');
    expect(confirmCalls()).toHaveLength(0);
  });

  // Defect caught: a link pasted into a terminal that wraps pastes in its
  // invisible bracketed-paste markers refused as not a confirmation link.
  it('accepts a link wrapped in the terminal paste markers', () => {
    const r = walk(['yes', `\u001b[200~${MAIN}\u001b[201~`, 'APPLY'], ['footbag-staging-alarms']);
    expect(r.status, r.out).toBe(0);
    expect(confirmCalls()).toHaveLength(1);
  });

  // Defect caught: a pasted link confirmed without the typed APPLY.
  it('confirms nothing for a topic whose confirmation is not typed', () => {
    const r = walk(['yes', MAIN, 'no', ''], ['footbag-staging-alarms']);
    expect(r.status, r.out).toBe(3);
    expect(r.out).toContain('Not confirmed; footbag-staging-alarms stays pending.');
    expect(confirmCalls()).toHaveLength(0);
  });

  // Defect caught: a confirmation the service refused counted as done, so the
  // walk ends green with the topic still unable to receive alarm mail.
  it('keeps a topic pending and fails when the service refuses its link', () => {
    const r = walk(['yes', MAIN, 'APPLY', ''], ['footbag-staging-alarms'], { FAKE_CONFIRM_FAIL: '1' });
    expect(r.status, r.out).toBe(1);
    expect(r.out).toContain('Still pending: footbag-staging-alarms.');
    expect(r.out).toContain('fresh confirmation email');
  });

  // Defect caught: a failed read taken as "nothing pending", so the run
  // reports nothing to confirm on an account it could not read.
  it('stops without asking when the topics cannot be read', () => {
    const r = walk([], ['footbag-staging-alarms'], { FAKE_LIST_FAIL: '1' });
    expect(r.status, r.out).toBe(1);
    expect(r.out).toContain('could not list the us-east-1 topics');
    expect(r.out).not.toContain('Nothing to confirm');
    expect(r.out).not.toContain('Paste the link');
  });

  // Defect caught: an operator without the emails left to hunt for ones that
  // were deleted or expired, with no way to get fresh ones from the walk.
  it('sends fresh emails when asked, then walks the recreated subscriptions', () => {
    const resend = path.join(dir, 'reconfirm');
    fs.writeFileSync(resend, `#!/usr/bin/env bash\necho "reconfirm $*" >> ${JSON.stringify(awsLog)}\n`, { mode: 0o755 });
    const r = walk(['no', MAIN, 'APPLY'], ['footbag-staging-alarms'], { CONFIRM_RECONFIRM_BIN: resend });
    expect(r.status, r.out).toBe(0);
    const log = fs.readFileSync(awsLog, 'utf8');
    expect(log).toContain('reconfirm --target staging');
    expect(log.indexOf('reconfirm --target staging')).toBeLessThan(log.indexOf('confirm-subscription'));
    // The operator is told when the fresh emails went out, so the older ones,
    // whose links point at deleted subscriptions, can be told apart.
    expect(r.out).toMatch(/Fresh confirmation emails were sent at \d{2}:\d{2} your time \(\d{2}:\d{2} UTC\)/);
    expect(confirmCalls()).toHaveLength(1);
  });

  it('sends nothing when the operator has the emails', () => {
    const resend = path.join(dir, 'reconfirm');
    fs.writeFileSync(resend, `#!/usr/bin/env bash\necho "reconfirm $*" >> ${JSON.stringify(awsLog)}\n`, { mode: 0o755 });
    const r = walk(['yes', MAIN, 'APPLY'], ['footbag-staging-alarms'], { CONFIRM_RECONFIRM_BIN: resend });
    expect(r.status, r.out).toBe(0);
    expect(fs.readFileSync(awsLog, 'utf8')).not.toContain('reconfirm');
  });

  // Defect caught: a subscription the operator confirmed by clicking its email,
  // which receives alarm mail, sent fresh emails or asked about again.
  it('takes a subscription confirmed by a click as done, asking nothing and sending nothing', () => {
    const resend = path.join(dir, 'reconfirm');
    fs.writeFileSync(resend, `#!/usr/bin/env bash\necho "reconfirm $*" >> ${JSON.stringify(awsLog)}\n`, { mode: 0o755 });
    const r = walk([], [], { FAKE_CLICKED: 'footbag-staging-alarms', CONFIRM_RECONFIRM_BIN: resend });
    expect(r.status, r.out).toBe(0);
    expect(r.out).toContain('Nothing to confirm');
    expect(r.out).not.toContain('(yes/no)');
    expect(fs.readFileSync(awsLog, 'utf8')).not.toContain('reconfirm');
  });

  it('says there is nothing to confirm and asks nothing when nothing is pending', () => {
    const r = walk([], []);
    expect(r.status, r.out).toBe(0);
    expect(r.out).toContain('Nothing to confirm');
    expect(r.out).not.toContain('Paste the link');
  });
});

describe('confirm-alarm-subscription: refusals', () => {
  it('refuses a link for the other environment’s alarm topic', () => {
    const res = run(['--target', 'staging', '--yes'], link('footbag-production-alarms'));
    expect(res.status).toBe(2);
    expect(confirmCalls()).toHaveLength(0);
  });

  it('refuses the other environment’s critical topic', () => {
    const res = run(['--target', 'staging', '--yes'], link('footbag-production-alarms-critical'));
    expect(res.status).toBe(2);
    expect(res.stderr).toContain("not one of staging's alarm topics");
  });

  it('refuses a topic that is not an alarm topic', () => {
    const res = run(['--target', 'production', '--yes'], link('footbag-production-ses-feedback'));
    expect(res.status).toBe(2);
    expect(confirmCalls()).toHaveLength(0);
  });

  it('refuses a link that is not a confirmation link from the service', () => {
    const res = run(['--target', 'production', '--yes'], 'https://example.com/confirmation.html?TopicArn=x&Token=y');
    expect(res.status).toBe(2);
    expect(res.stderr).toContain('not a subscription confirmation link');
  });

  it('refuses an empty link', () => {
    expect(run(['--target', 'production', '--yes'], '').status).toBe(2);
  });

  it('refuses without a target', () => {
    expect(run(['--yes'], link('footbag-production-alarms')).status).toBe(2);
  });

  it('changes nothing without the typed confirmation when no terminal is attached', () => {
    const res = run(['--target', 'production'], link('footbag-production-alarms'));
    expect(res.status).toBe(1);
    expect(confirmCalls()).toHaveLength(0);
  });

  it('says on stderr that a stand-in AWS CLI proves nothing about the account', () => {
    const res = run(['--target', 'production', '--yes'], link('footbag-production-alarms'));
    expect(res.stderr).toContain('proves nothing about the account');
  });
});
