/**
 * scripts/kms-key-status.sh: reads an environment's two encryption keys through
 * their aliases, and recovers one scheduled for deletion or disabled.
 *
 * Driven end to end against a stand-in AWS CLI that keeps each key's state in a
 * file and changes it the way KMS does: cancelling a deletion leaves the key
 * Disabled, enabling makes it Enabled. The script's own read-back decides what
 * it reports, so the verdicts here come from real runs. The confirmation path
 * needs a terminal, so those cases run under a pseudo-terminal typing the
 * answer; the refusals run with no terminal at all.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { writeFileSync, readFileSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';

import { SPAWN_GUARD } from '../fixtures/spawnGuard';
import { createScratchDir, removeScratch } from '../fixtures/scratchDir';
import { requireToolInCI } from '../fixtures/toolAvailability';

const SCRIPT = join(process.cwd(), 'scripts/kms-key-status.sh');
const HAS_SCRIPT = requireToolInCI('script', '--version');

const MAIN_ID = '1111aaaa-1111-4111-8111-111111111111';
const JWT_ID = '2222bbbb-2222-4222-8222-222222222222';

let work: string;
let state: string;

/**
 * A stand-in for the AWS CLI's KMS calls. Each alias maps to a key id; each key
 * id's state lives in state/<id>, and a DeletionDate in state/<id>.date. A key
 * named in state/<id>.fail-enable refuses enable-key. Every call is logged.
 */
function writeAws(aliasTarget: Record<string, string> = {}) {
  const bin = join(work, 'bin');
  mkdirSync(bin, { recursive: true });
  const targets = { 'alias/footbag-staging': MAIN_ID, 'alias/footbag-staging-jwt': JWT_ID,
    'alias/footbag-production': MAIN_ID, 'alias/footbag-production-jwt': JWT_ID, ...aliasTarget };
  const aliasCases = Object.entries(targets).map(([a, id]) => `  ${a}) id=${id} ;;`);
  writeFileSync(join(bin, 'aws'), [
    '#!/usr/bin/env bash',
    `S=${JSON.stringify(state)}`,
    `echo "$*" >> ${JSON.stringify(join(work, 'calls.log'))}`,
    'key=""; prev=""',
    'for a in "$@"; do [[ "$prev" == --key-id ]] && key="$a"; prev="$a"; done',
    'id="$key"',
    'case "$key" in',
    ...aliasCases,
    '  alias/*) echo "An error occurred (NotFoundException) when calling the DescribeKey operation: Alias $key is not found." >&2; exit 254 ;;',
    'esac',
    '[[ -f "$S/$id" ]] || { echo "An error occurred (NotFoundException): Key $id does not exist" >&2; exit 254; }',
    'case "$1 $2" in',
    '  "kms describe-key")',
    '    st="$(cat "$S/$id")"',
    '    [[ "$st" == unreadable ]] && { echo "An error occurred (AccessDeniedException): not authorized" >&2; exit 254; }',
    '    d="None"; [[ -f "$S/$id.date" ]] && d="$(cat "$S/$id.date")"',
    '    printf "%s\\t%s\\t%s\\n" "$id" "$st" "$d" ;;',
    '  "kms cancel-key-deletion")',
    '    [[ -f "$S/$id.fail-cancel" ]] && { echo "An error occurred (KMSInternalException)" >&2; exit 254; }',
    '    echo Disabled > "$S/$id"; rm -f "$S/$id.date" ;;',
    '  "kms enable-key")',
    '    [[ -f "$S/$id.fail-enable" ]] && { echo "An error occurred (KMSInvalidStateException)" >&2; exit 254; }',
    '    [[ -f "$S/$id.enable-noop" ]] && exit 0',
    '    [[ "$(cat "$S/$id")" == PendingDeletion ]] && { echo "An error occurred (KMSInvalidStateException): pending deletion" >&2; exit 254; }',
    '    echo Enabled > "$S/$id" ;;',
    '  *) exit 255 ;;',
    'esac',
  ].join('\n') + '\n', { mode: 0o755 });
  return join(bin, 'aws');
}

function setKey(id: string, st: string, date?: string) {
  writeFileSync(join(state, id), `${st}\n`);
  if (date) writeFileSync(join(state, `${id}.date`), date);
}
const keyState = (id: string) => readFileSync(join(state, id), 'utf-8').trim();
const calls = () => (existsSync(join(work, 'calls.log')) ? readFileSync(join(work, 'calls.log'), 'utf-8').trim().split('\n') : []);
const mutating = () => calls().filter((c) => /cancel-key-deletion|enable-key/.test(c));

beforeEach(() => {
  work = createScratchDir('kms-key-status');
  state = join(work, 'state');
  mkdirSync(state);
  setKey(MAIN_ID, 'Enabled');
  setKey(JWT_ID, 'Enabled');
});
afterEach(() => removeScratch(work));

function env(aws: string): NodeJS.ProcessEnv {
  return { ...process.env, KMS_KEY_STATUS_AWS_BIN: aws, FOOTBAG_CR_REPORT_TO: '' };
}

/** No terminal: the condition of a scheduled job or an agent session. */
function run(args: string[], aws = writeAws()) {
  const r = spawnSync('bash', [SCRIPT, ...args], { encoding: 'utf-8', input: '', env: env(aws), ...SPAWN_GUARD });
  return { status: r.status, out: `${r.stdout ?? ''}${r.stderr ?? ''}` };
}

/** At a terminal, typing `typed`. */
function runAtTerminal(args: string[], typed = 'APPLY\n', aws = writeAws()) {
  const inner = ['bash', JSON.stringify(SCRIPT), ...args.map((a) => JSON.stringify(a)), '</dev/null'].join(' ');
  const r = spawnSync('script', ['-qec', `${inner}; echo "EXIT=$?"`, '/dev/null'], {
    encoding: 'utf-8', input: typed, env: env(aws), ...SPAWN_GUARD,
  });
  const out = r.stdout ?? '';
  const m = out.match(/EXIT=(\d+)/);
  return { status: m ? Number(m[1]) : -1, out };
}

describe('kms-key-status.sh: arguments', () => {
  it('requires a target rather than defaulting to one, and takes a named one', () => {
    // Defect caught: a forgotten flag reading or recovering whichever
    // environment a default named.
    expect(run([]).status).toBe(2);
    expect(run(['--target', 'prod']).status).toBe(2);
    expect(calls()).toEqual([]);
    const ok = run(['--target', 'staging']);
    expect(ok.status, ok.out).toBe(0);
  });

  it('refuses --yes on production, and accepts it on staging', () => {
    // Defect caught: an unattended run recovering production keys with nobody
    // at the terminal, against the rule that production asks every time.
    const prod = run(['--target', 'production', '--cancel-deletion', '--yes']);
    expect(prod.status).toBe(2);
    expect(prod.out).toMatch(/--yes does not carry a production change/);
    setKey(JWT_ID, 'Disabled');
    const staging = run(['--target', 'staging', '--cancel-deletion', '--yes']);
    expect(staging.status, staging.out).toBe(0);
    expect(keyState(JWT_ID)).toBe('Enabled');
  });

  it('announces the stand-in for the AWS CLI', () => {
    // Defect caught: a stubbed run passing itself off as a read of the account.
    expect(run(['--target', 'staging']).out).toMatch(/stand-in for the AWS CLI/);
  });
});

describe('kms-key-status.sh: the status read', () => {
  it('exits 0 with both keys Enabled, read through the target\'s own aliases', () => {
    // Defect caught: the read asking another environment's aliases, or reporting
    // keys ready that it never read.
    const r = run(['--target', 'production']);
    expect(r.status, r.out).toBe(0);
    const described = calls().filter((c) => c.startsWith('kms describe-key'));
    expect(described.some((c) => c.includes('--key-id alias/footbag-production '))).toBe(true);
    expect(described.some((c) => c.includes('--key-id alias/footbag-production-jwt '))).toBe(true);
    expect(described.some((c) => c.includes('staging'))).toBe(false);
  });

  it('exits non-zero on a key pending deletion, naming the date and the recovery command, and changes nothing', () => {
    // Defect caught: a key counting down to permanent deletion read as fine, or
    // a status read that alters the key.
    setKey(MAIN_ID, 'PendingDeletion', '2026-12-10T00:00:00+00:00');
    const r = run(['--target', 'staging']);
    expect(r.status).toBe(1);
    expect(r.out).toMatch(/application key \(alias\/footbag-staging\): PendingDeletion, deletion scheduled for 2026-12-10/);
    expect(r.out).toMatch(/kms-key-status\.sh --target staging --cancel-deletion/);
    expect(mutating()).toEqual([]);
  });

  it('never prints the CLI\'s None placeholder as a deletion date', () => {
    // Defect caught: the operator told a deletion lands on "None", reading it
    // as no deletion scheduled.
    setKey(JWT_ID, 'PendingDeletion');
    const r = run(['--target', 'staging']);
    expect(r.status).toBe(1);
    expect(r.out).toMatch(/PendingDeletion, deletion scheduled for an unread date/);
    expect(r.out).not.toMatch(/scheduled for None/);
  });

  it('exits non-zero on a disabled key', () => {
    // Defect caught: a disabled signing key, with which no member can sign in,
    // read as fine because it is not scheduled for deletion.
    setKey(JWT_ID, 'Disabled');
    const r = run(['--target', 'staging']);
    expect(r.status).toBe(1);
    expect(r.out).toMatch(/session signing key \(alias\/footbag-staging-jwt\): Disabled/);
  });

  it('reads a missing alias as no such key and any other failure as an error carrying the tool\'s message', () => {
    // Defect caught: an access failure reported as a missing key (or the
    // reverse), sending the operator after the wrong cause.
    setKey(MAIN_ID, 'unreadable');
    const r = run(['--target', 'staging'], writeAws({ 'alias/footbag-staging-jwt': 'alias/missing' }));
    expect(r.status).toBe(1);
    expect(r.out).toMatch(/application key \(alias\/footbag-staging\): could not be read: .*AccessDeniedException/);
    expect(r.out).toMatch(/session signing key \(alias\/footbag-staging-jwt\): no such key or alias/);
  });
});

describe.skipIf(!HAS_SCRIPT)('kms-key-status.sh: --cancel-deletion', () => {
  it('cancels a scheduled deletion, enables the key, and proves the alias resolves to it Enabled', () => {
    // Defect caught: a recovery that cancels the deletion and stops, leaving the
    // key Disabled while the run reports success.
    setKey(MAIN_ID, 'PendingDeletion', '2026-12-10T00:00:00+00:00');
    const r = runAtTerminal(['--target', 'production', '--cancel-deletion']);
    expect(r.status, r.out).toBe(0);
    expect(keyState(MAIN_ID)).toBe('Enabled');
    expect(mutating()).toEqual([
      `kms cancel-key-deletion --key-id ${MAIN_ID}`,
      `kms enable-key --key-id ${MAIN_ID}`,
    ]);
    expect(r.out).toMatch(/alias\/footbag-production\) is Enabled and its alias resolves to it/);
  });

  it('enables a key that was only disabled, without a cancel call', () => {
    // Defect caught: a cancel sent to a key with no deletion scheduled, which
    // KMS refuses, failing the recovery of a merely disabled key.
    setKey(JWT_ID, 'Disabled');
    const r = runAtTerminal(['--target', 'staging', '--cancel-deletion']);
    expect(r.status, r.out).toBe(0);
    expect(mutating()).toEqual([`kms enable-key --key-id ${JWT_ID}`]);
  });

  it('changes nothing without the typed APPLY, and nothing with no terminal', () => {
    // Defect caught: a recovery on production that ran with nobody confirming.
    setKey(MAIN_ID, 'PendingDeletion');
    const wrong = runAtTerminal(['--target', 'production', '--cancel-deletion'], 'apply\n');
    expect(wrong.status).toBe(1);
    const detached = run(['--target', 'production', '--cancel-deletion']);
    expect(detached.status).toBe(1);
    expect(detached.out).toMatch(/no terminal to confirm on/);
    expect(mutating()).toEqual([]);
    expect(keyState(MAIN_ID)).toBe('PendingDeletion');
  });

  it('says there is nothing to do when both keys are Enabled, and asks nothing', () => {
    // Defect caught: a re-run after a finished recovery prompting or calling KMS
    // again.
    const r = run(['--target', 'staging', '--cancel-deletion']);
    expect(r.status, r.out).toBe(0);
    expect(r.out).toMatch(/nothing to enable/);
    expect(mutating()).toEqual([]);
  });

  it('finishes a recovery stopped between the cancel and the enable', () => {
    // Defect caught: a re-run after a stop part way refusing or looping on the
    // half-done state rather than finishing it.
    setKey(MAIN_ID, 'PendingDeletion');
    const aws = writeAws();
    writeFileSync(join(state, `${MAIN_ID}.fail-enable`), '');
    const first = runAtTerminal(['--target', 'staging', '--cancel-deletion'], 'APPLY\n', aws);
    expect(first.status).toBe(1);
    expect(keyState(MAIN_ID)).toBe('Disabled');
    expect(first.out).toMatch(/could not be enabled/);
    // With the refusal lifted, the re-run enables the now Disabled key.
    rmSync(join(state, `${MAIN_ID}.fail-enable`));
    const before = mutating().length;
    const done = runAtTerminal(['--target', 'staging', '--cancel-deletion'], 'APPLY\n', aws);
    expect(done.status, done.out).toBe(0);
    expect(keyState(MAIN_ID)).toBe('Enabled');
    expect(mutating().slice(before)).toEqual([`kms enable-key --key-id ${MAIN_ID}`]);
  });

  it('fails when the alias resolves to a different key after the recovery', () => {
    // Defect caught: reporting the platform's key recovered when the alias it
    // reaches the key by points elsewhere, so nothing the platform uses changed.
    setKey(MAIN_ID, 'Disabled');
    const other = '3333cccc-3333-4333-8333-333333333333';
    setKey(other, 'Enabled');
    // describe-key on the alias answers with the other key once MAIN_ID is
    // enabled: the stand-in reports the alias's target by state file contents.
    const aws = writeAws();
    const swapped = readFileSync(aws, 'utf-8').replace(
      `  alias/footbag-staging) id=${MAIN_ID} ;;`,
      `  alias/footbag-staging) id=${MAIN_ID}; [[ "$(cat "$S/${MAIN_ID}")" == Enabled ]] && id=${other} ;;`,
    );
    writeFileSync(aws, swapped);
    const r = runAtTerminal(['--target', 'staging', '--cancel-deletion'], 'APPLY\n', aws);
    expect(r.status).toBe(1);
    expect(r.out).toMatch(/alias now resolves to a different key/);
  });

  it('changes neither key when one of them could not be read', () => {
    // Defect caught: the readable key recovered while the other's state is
    // unknown, so the run changes production on half a picture.
    setKey(MAIN_ID, 'unreadable');
    setKey(JWT_ID, 'Disabled');
    const r = runAtTerminal(['--target', 'staging', '--cancel-deletion']);
    expect(r.status).toBe(1);
    expect(r.out).toMatch(/a key could not be read; nothing was changed/);
    expect(mutating()).toEqual([]);
  });

  it('does not enable a key whose deletion could not be cancelled', () => {
    // Defect caught: a failed cancel followed by an enable and a proof, so the
    // run reads further than the key, which is still counting down, really got.
    setKey(MAIN_ID, 'PendingDeletion');
    writeFileSync(join(state, `${MAIN_ID}.fail-cancel`), '');
    const r = runAtTerminal(['--target', 'staging', '--cancel-deletion']);
    expect(r.status).toBe(1);
    expect(r.out).toMatch(/the deletion could not be cancelled; it is still scheduled/);
    // Defect caught: the operator told the change failed but not why, with
    // AWS's reason dropped.
    expect(r.out).toMatch(/still scheduled\. AWS answered: An error occurred \(KMSInternalException\)/);
    expect(mutating()).toEqual([`kms cancel-key-deletion --key-id ${MAIN_ID}`]);
  });

  it('reports AWS\'s own reason when the enable call fails', () => {
    // Defect caught: a refused enable reported with no cause, so the operator
    // cannot tell a missing permission from a key in the wrong state.
    setKey(MAIN_ID, 'Disabled');
    writeFileSync(join(state, `${MAIN_ID}.fail-enable`), '');
    const r = runAtTerminal(['--target', 'staging', '--cancel-deletion']);
    expect(r.status).toBe(1);
    expect(r.out).toMatch(/could not be enabled; it stays Disabled\. AWS answered: An error occurred \(KMSInvalidStateException\)/);
  });

  it('fails when the key does not read Enabled after the enable call', () => {
    // Defect caught: an accepted enable call taken as the outcome, when the key
    // the platform needs is still Disabled.
    setKey(MAIN_ID, 'Disabled');
    writeFileSync(join(state, `${MAIN_ID}.enable-noop`), '');
    const r = runAtTerminal(['--target', 'staging', '--cancel-deletion']);
    expect(r.status).toBe(1);
    expect(r.out).toMatch(/after enabling, the key reads Disabled, not Enabled/);
  });

  it('refuses a key in a state it cannot repair before changing anything', () => {
    // Defect caught: one key recovered while the other, which this cannot fix,
    // is passed over as though the environment were whole.
    setKey(MAIN_ID, 'PendingDeletion');
    setKey(JWT_ID, 'PendingImport');
    const r = runAtTerminal(['--target', 'staging', '--cancel-deletion']);
    expect(r.status).toBe(1);
    expect(r.out).toMatch(/PendingImport, which this script cannot repair/);
    expect(mutating()).toEqual([]);
  });
});
