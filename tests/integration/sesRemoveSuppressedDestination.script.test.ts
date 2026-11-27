/**
 * scripts/ses-remove-suppressed-destination.sh: takes one work-queue topic
 * address off the SES account-level suppression list, so a queue address the
 * platform switched off after a bounce can be turned back on.
 *
 * Driven end to end against a stand-in AWS CLI that keeps the suppression list
 * as one file per suppressed address and removes the file the way SES removes
 * the entry. The script's own read-back decides what it reports, so the
 * verdicts here come from real runs. The confirmation path needs a terminal, so
 * those cases run under a pseudo-terminal typing the answer; the refusals run
 * with no terminal at all.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { writeFileSync, readFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

import { SPAWN_GUARD } from '../fixtures/spawnGuard';
import { createScratchDir, removeScratch } from '../fixtures/scratchDir';
import { HAS_PTY_DRIVER, spawnAtTerminal } from '../fixtures/ptySession';

const SCRIPT = join(process.cwd(), 'scripts/ses-remove-suppressed-destination.sh');

const QUEUE = 'queue-finance@footbag.org';

let work: string;
let state: string;

/**
 * A stand-in for the AWS CLI's two SES suppression calls. An address is on the
 * list while state/<address> exists, holding the reason SES recorded. A file
 * state/unreadable makes every read fail with an access error; state/fail-delete
 * makes the delete fail; state/delete-noop makes the delete succeed without
 * removing the entry; state/<address>.none makes the read return SES's None for
 * both fields. A read answers only the projection the script relies on, so a
 * wrong --query or --output is refused as the real CLI would answer it
 * differently. Every call is logged, and so is anything the stand-in finds on
 * its stdin, which must stay closed.
 */
function writeAws() {
  const bin = join(work, 'bin');
  mkdirSync(bin, { recursive: true });
  writeFileSync(join(bin, 'aws'), [
    '#!/usr/bin/env bash',
    `S=${JSON.stringify(state)}`,
    `echo "$*" >> ${JSON.stringify(join(work, 'calls.log'))}`,
    `if IFS= read -r line; then echo "STDIN:$line" >> ${JSON.stringify(join(work, 'calls.log'))}; fi`,
    'addr=""; prev=""',
    'for a in "$@"; do [[ "$prev" == --email-address ]] && addr="$a"; prev="$a"; done',
    'case "$1 $2" in',
    '  "sesv2 get-suppressed-destination")',
    '    [[ -f "$S/unreadable" ]] && { echo "An error occurred (AccessDeniedException) when calling the GetSuppressedDestination operation: not authorized" >&2; exit 254; }',
    '    [[ -f "$S/$addr" ]] || { echo "An error occurred (NotFoundException) when calling the GetSuppressedDestination operation: Email address ($addr) does not exist on your suppression list." >&2; exit 254; }',
    '    [[ "$*" == *"--query SuppressedDestination.[Reason,LastUpdateTime] --output text"* ]] || { echo "unexpected projection: $*" >&2; exit 255; }',
    '    [[ -f "$S/$addr.none" ]] && { printf "None\\tNone\\n"; exit 0; }',
    '    printf "%s\\t%s\\n" "$(cat "$S/$addr")" "2026-11-01T10:00:00+00:00" ;;',
    '  "sesv2 delete-suppressed-destination")',
    '    [[ -f "$S/fail-delete" ]] && { echo "An error occurred (TooManyRequestsException) when calling the DeleteSuppressedDestination operation: Too many requests" >&2; exit 254; }',
    '    [[ -f "$S/$addr" ]] || { echo "An error occurred (NotFoundException) when calling the DeleteSuppressedDestination operation" >&2; exit 254; }',
    '    [[ -f "$S/delete-noop" ]] && exit 0',
    '    rm -f "$S/$addr" ;;',
    '  *) exit 255 ;;',
    'esac',
  ].join('\n') + '\n', { mode: 0o755 });
  return join(bin, 'aws');
}

const suppress = (addr: string, reason = 'BOUNCE') => writeFileSync(join(state, addr), reason);
const isSuppressed = (addr: string) => existsSync(join(state, addr));
const calls = () => (existsSync(join(work, 'calls.log')) ? readFileSync(join(work, 'calls.log'), 'utf-8').trim().split('\n') : []);
const deletes = () => calls().filter((c) => c.startsWith('sesv2 delete-suppressed-destination'));
const stdinSeen = () => calls().filter((c) => c.startsWith('STDIN:'));

// Stands in for a credential an operator's wrapper piped into the run: the AWS
// CLI must never inherit it.
const PIPED_STDIN = 'piped-credential-line\n';

beforeEach(() => {
  work = createScratchDir('ses-remove-suppressed');
  state = join(work, 'state');
  mkdirSync(state);
});
afterEach(() => removeScratch(work));

function env(aws: string): NodeJS.ProcessEnv {
  return { ...process.env, SES_SUPPRESSION_AWS_BIN: aws, FOOTBAG_CR_REPORT_TO: '' };
}

/** No terminal: the condition of a scheduled job or an agent session. */
function run(args: string[], aws = writeAws()) {
  const r = spawnSync('bash', [SCRIPT, ...args], { encoding: 'utf-8', input: PIPED_STDIN, env: env(aws), ...SPAWN_GUARD });
  return { status: r.status, out: `${r.stdout ?? ''}${r.stderr ?? ''}` };
}

/** At a terminal, typing `typed`. */
function runAtTerminal(args: string[], typed = 'APPLY\n', aws = writeAws()) {
  const inner = ['bash', JSON.stringify(SCRIPT), ...args.map((a) => JSON.stringify(a)), '</dev/null'].join(' ');
  const r = spawnAtTerminal(`${inner}; echo "EXIT=$?"`, { typed, env: env(aws) });
  const out = r.stdout ?? '';
  const m = out.match(/EXIT=(\d+)/);
  return { status: m ? Number(m[1]) : -1, out };
}

describe('ses-remove-suppressed-destination.sh: arguments', () => {
  it('requires a target rather than defaulting to one, and takes a named one', () => {
    // Defect caught: a forgotten flag changing whichever environment's SES
    // account a default named.
    expect(run(['--address', QUEUE]).status).toBe(2);
    expect(run(['--target', 'prod', '--address', QUEUE]).status).toBe(2);
    expect(calls()).toEqual([]);
    const ok = run(['--target', 'staging', '--address', QUEUE]);
    expect(ok.status, ok.out).toBe(0);
  });

  it('refuses any address that is not a work-queue topic address, before reaching AWS', () => {
    // Defect caught: the script used to lift suppression from a member's or
    // some other address, sending mail to a recipient SES stopped for cause.
    const refused = ['admin@footbag.org', 'queue-finance@example.org', 'queue-finance@footbag.org.evil.com',
      'xqueue-finance@footbag.org', 'queue-other@footbag.org', 'queue-finance@footbagxorg'];
    for (const addr of refused) {
      const r = run(['--target', 'staging', '--address', addr]);
      expect(r.status, addr).toBe(2);
    }
    expect(run(['--target', 'staging']).status).toBe(2);
    expect(calls()).toEqual([]);
    // Every topic is accepted, in any letter case, and read in lowercase.
    for (const topic of ['finance', 'membership', 'platform', 'sanctioning', 'freestyle', 'moderation']) {
      const r = run(['--target', 'staging', '--address', `queue-${topic}@footbag.org`]);
      expect(r.status, `${topic}: ${r.out}`).toBe(0);
    }
    const mixed = run(['--target', 'staging', '--address', 'Queue-Finance@FOOTBAG.org']);
    expect(mixed.status, mixed.out).toBe(0);
    expect(calls().at(-1)).toContain(`--email-address ${QUEUE}`);
  });

  it('refuses --yes on production, and accepts it on staging', () => {
    // Defect caught: an unattended run changing production's suppression list
    // with nobody at the terminal.
    suppress(QUEUE);
    const prod = run(['--target', 'production', '--address', QUEUE, '--yes']);
    expect(prod.status).toBe(2);
    expect(prod.out).toMatch(/--yes does not carry a production change/);
    expect(calls()).toEqual([]);
    const staging = run(['--target', 'staging', '--address', QUEUE, '--yes']);
    expect(staging.status, staging.out).toBe(0);
    expect(isSuppressed(QUEUE)).toBe(false);
    // Defect caught: the AWS CLI inheriting the operator's stdin, where a piped
    // credential would be read by a tool that has no business with it.
    expect(stdinSeen()).toEqual([]);
  });

  it('says plainly when SES returns no reason or time, rather than printing None', () => {
    // Defect caught: an operator asked to approve a removal on "since None".
    suppress(QUEUE);
    writeFileSync(join(state, `${QUEUE}.none`), '');
    const r = run(['--target', 'staging', '--address', QUEUE, '--yes']);
    expect(r.status, r.out).toBe(0);
    expect(r.out).toMatch(/SES recorded:\s+not returned, since an unread time/);
    expect(r.out).not.toMatch(/None/);
  });

  it('announces the stand-in for the AWS CLI', () => {
    // Defect caught: a stubbed run passing itself off as a change to the account.
    expect(run(['--target', 'staging', '--address', QUEUE]).out).toMatch(/stand-in for the AWS CLI/);
  });
});

describe('ses-remove-suppressed-destination.sh: the read before any change', () => {
  it('reports nothing to do for an address not on the list, and deletes nothing', () => {
    // Defect caught: a delete sent for an address SES does not hold, or a
    // missing entry reported as a failure.
    const r = run(['--target', 'staging', '--address', QUEUE]);
    expect(r.status, r.out).toBe(0);
    expect(r.out).toMatch(/not on the staging SES suppression list; nothing to do/);
    expect(calls()).toEqual([expect.stringContaining('sesv2 get-suppressed-destination')]);
    expect(deletes()).toEqual([]);
  });

  it('reports a read failure other than not-found as an error carrying the tool\'s message', () => {
    // Defect caught: an access failure read as "not on the list", telling the
    // operator the address is clear when nothing was checked.
    suppress(QUEUE);
    writeFileSync(join(state, 'unreadable'), '');
    const r = run(['--target', 'staging', '--address', QUEUE, '--yes']);
    expect(r.status).toBe(1);
    expect(r.out).toMatch(/could not be read: .*AccessDeniedException/);
    expect(r.out).not.toMatch(/nothing to do/);
    expect(deletes()).toEqual([]);
  });
});

describe.skipIf(!HAS_PTY_DRIVER)('ses-remove-suppressed-destination.sh: the removal', () => {
  it('states the change, removes the address after APPLY, and proves it gone', () => {
    // Defect caught: a removal reported done from the delete call's exit alone,
    // or run without saying what SES recorded against the address.
    suppress(QUEUE, 'BOUNCE');
    const r = runAtTerminal(['--target', 'production', '--address', QUEUE]);
    expect(r.status, r.out).toBe(0);
    expect(r.out).toMatch(/queue-finance@footbag\.org/);
    expect(r.out).toMatch(/production/);
    // Defect caught: the statement of the change naming the wrong field as the
    // reason, so the operator approves on evidence SES did not give.
    expect(r.out).toMatch(/SES recorded:\s+BOUNCE, since 2026-11-01T10:00:00\+00:00/);
    expect(deletes()).toEqual([`sesv2 delete-suppressed-destination --email-address ${QUEUE}`]);
    expect(calls().at(-1)).toContain('sesv2 get-suppressed-destination');
    expect(isSuppressed(QUEUE)).toBe(false);
    // Defect caught: a re-run after success prompting or deleting again.
    const again = run(['--target', 'production', '--address', QUEUE]);
    expect(again.status, again.out).toBe(0);
    expect(again.out).toMatch(/nothing to do/);
    expect(deletes()).toHaveLength(1);
  });

  it('changes nothing without the typed APPLY, and nothing with no terminal', () => {
    // Defect caught: a production removal that ran with nobody confirming.
    suppress(QUEUE);
    const wrong = runAtTerminal(['--target', 'production', '--address', QUEUE], 'apply\n');
    expect(wrong.status).toBe(1);
    // Defect caught: an aborted run whose closing report does not say the
    // removal was left unproved and nothing changed.
    expect(wrong.out).toMatch(/not confirmed, and nothing was changed/);
    const detached = run(['--target', 'production', '--address', QUEUE]);
    expect(detached.status).toBe(1);
    expect(detached.out).toMatch(/no terminal to confirm on/);
    expect(deletes()).toEqual([]);
    expect(isSuppressed(QUEUE)).toBe(true);
  });

  it('fails when the read-back still finds the address on the list', () => {
    // Defect caught: an accepted delete call taken as the outcome while SES
    // still suppresses the queue address.
    suppress(QUEUE);
    writeFileSync(join(state, 'delete-noop'), '');
    const r = runAtTerminal(['--target', 'staging', '--address', QUEUE]);
    expect(r.status).toBe(1);
    expect(r.out).toMatch(/still on the staging SES suppression list/);
  });

  it('reports AWS\'s own reason when the delete call fails', () => {
    // Defect caught: a refused delete reported with no cause, so the operator
    // cannot tell throttling from a missing permission.
    suppress(QUEUE);
    writeFileSync(join(state, 'fail-delete'), '');
    const r = runAtTerminal(['--target', 'staging', '--address', QUEUE]);
    expect(r.status).toBe(1);
    expect(r.out).toMatch(/AWS answered: An error occurred \(TooManyRequestsException\)/);
    expect(isSuppressed(QUEUE)).toBe(true);
  });
});
