/**
 * scripts/set-terraform-gate.sh: one on/off Terraform gate set in one
 * environment's values file, applied, and read back.
 *
 * The script runs from a scratch copy of the repository layout: its own lib
 * folder, each environment's real top-level Terraform declarations, and a
 * values file reached through a symlink into a separate "private" folder, the
 * way an operator machine holds it. Terraform, the AWS CLI and the apply
 * wrapper are stub stand-ins behind the script's named seams, so the verdict
 * comes from a real run of the script's own reading of its outcome and nothing
 * real is reached.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';

import { createScratchDir, removeScratch } from '../fixtures/scratchDir';
import { SPAWN_GUARD } from '../fixtures/spawnGuard';

let dir: string;
let repo: string;
let calls: string;

/** The stand-in for terraform. A read-only plan models a state: changes are
 *  pending (exit 2) when STUB_OTHER_PENDING is set, or when the gate named in
 *  STUB_GATE_STATE ("name=value", the value the state holds) plans at another
 *  value, which is its -var override or else the values file's line (false when
 *  absent). With no STUB_GATE_STATE the state holds what the file holds.
 *  STUB_PLAN_RC forces every plan's exit, STUB_VAR_PLAN_RC only a plan with a
 *  -var override, and STUB_CURRENT_PLAN_RC only a plan without one. The console
 *  answers var.<name> from the values file the script wrote, so the read-back
 *  reflects the write rather than a canned answer. STUB_CONSOLE_VALUE overrides
 *  it, for a tree that reads back something other than the file;
 *  STUB_CONSOLE_RC makes the console itself fail, and STUB_CONSOLE_FAIL_VAR
 *  makes only the read of that one variable fail. var.aws_region answers
 *  STUB_REGION (quoted, as terraform prints a string), and STUB_REGION_RC makes
 *  that one read fail. STUB_LOCK_NOTICES prints terraform's state-lock notices
 *  around every console answer, as a tree with a locking backend does. Like terraform, a plan with changes pending exits 2 only
 *  under -detailed-exitcode, and 0 without it. */
const TERRAFORM_STUB = `#!/usr/bin/env bash
chdir="\${1#-chdir=}"
shift
echo "terraform $*" >> "$STUB_CALLS"
file_value() {
  local v
  v="$(grep -E "^[[:space:]]*$1[[:space:]]*=" "$chdir/terraform.tfvars" | tail -n 1 | sed -E 's/.*=[[:space:]]*//')"
  echo "\${v:-false}"
}
case "$1" in
  plan)
    override=""
    prev=""
    for a in "$@"; do
      [[ "$prev" == -var ]] && override="$a"
      prev="$a"
    done
    rc=0
    [[ -n "\${STUB_OTHER_PENDING:-}" ]] && rc=2
    # The staging address the state holds: a values file naming another one
    # has that change pending.
    if [[ -n "\${STUB_STATE_ADDRESS:-}" && "$(file_value staging_web_static_ip)" != "\\"$STUB_STATE_ADDRESS\\"" ]]; then rc=2; fi
    if [[ -n "\${STUB_GATE_STATE:-}" ]]; then
      gname="\${STUB_GATE_STATE%%=*}"
      gstate="\${STUB_GATE_STATE#*=}"
      if [[ "$override" == "$gname="* ]]; then planned="\${override#*=}"; else planned="$(file_value "$gname")"; fi
      [[ "$planned" != "$gstate" ]] && rc=2
    elif [[ -n "$override" ]]; then
      [[ "\${override#*=}" != "$(file_value "\${override%%=*}")" ]] && rc=2
    fi
    if [[ -n "$override" ]]; then rc="\${STUB_VAR_PLAN_RC:-$rc}"; else rc="\${STUB_CURRENT_PLAN_RC:-$rc}"; fi
    rc="\${STUB_PLAN_RC:-$rc}"
    if [[ "$rc" == 2 ]]; then echo "Plan: 0 to add, 1 to change, 0 to destroy."; else echo "No changes."; fi
    [[ -n "\${STUB_PLAN_WARNING:-}" ]] && echo "Warning: $STUB_PLAN_WARNING"
    if [[ "$rc" == 2 && " $* " != *" -detailed-exitcode "* ]]; then rc=0; fi
    if [[ "$rc" == 1 ]]; then printf 'Error: stub plan failure\\n\\n  on terraform.tfvars line 3:\\n   3: %s\\n' "$STUB_SENSITIVE_LINE" >&2; fi
    exit "$rc"
    ;;
  console)
    read -r expr
    echo "console read $expr" >> "$STUB_CALLS"
    if [[ -n "\${STUB_LOCK_NOTICES:-}" ]]; then
      echo "Acquiring state lock. This may take a few moments..."
      trap 'echo "Releasing state lock. This may take a few moments..."' EXIT
    fi
    if [[ "$expr" == "jsonencode(local.host_keys)" ]]; then printf '%s\\n' "\${STUB_HOST_KEYS:-}"; exit 0; fi
    name="\${expr#var.}"
    if [[ "$name" == aws_region ]]; then
      if [[ -n "\${STUB_REGION_RC:-}" ]]; then echo "Error: stub region read failure" >&2; exit "$STUB_REGION_RC"; fi
      echo "\\"\${STUB_REGION:-us-east-1}\\""
      exit 0
    fi
    if [[ -n "\${STUB_CONSOLE_RC:-}" || "$name" == "\${STUB_CONSOLE_FAIL_VAR:-}" ]]; then printf 'Error: stub console failure\\n\\n  on terraform.tfvars line 3:\\n   3: %s\\n' "$STUB_SENSITIVE_LINE" >&2; exit "\${STUB_CONSOLE_RC:-1}"; fi
    if [[ -n "\${STUB_CONSOLE_VALUE:-}" ]]; then echo "$STUB_CONSOLE_VALUE"; exit 0; fi
    file_value "$name"
    ;;
  output)
    # The staging tree's static address, read by the production host-key gate.
    if [[ -n "\${STUB_OUTPUT_RC:-}" ]]; then echo "Error: stub output failure" >&2; exit "$STUB_OUTPUT_RC"; fi
    printf '%s' "\${STUB_STAGING_IP:-192.0.2.20}"
    ;;
esac
`;

/** The stand-in for scripts/terraform-apply.sh: records its arguments, and any
 *  file under the run's temp directory holding the values file's operator
 *  address, looked for while the run is still alive, and exits with
 *  STUB_APPLY_RC. */
const APPLY_STUB = `#!/usr/bin/env bash
echo "apply $*" >> "$STUB_CALLS"
grep -rlF -- "$STUB_SENSITIVE" "$TMPDIR" | sed 's/^/leak /' >> "$STUB_CALLS"
echo "stub apply output"
exit "\${STUB_APPLY_RC:-0}"
`;

/** The stand-in for the AWS CLI: records its arguments and answers the count a
 *  `--query 'length(...)' --output text` call asks for, 1 when the metric (keyed
 *  region:namespace:name) or the log events (keyed region:group:pattern) are in
 *  STUB_PRESENT, '|'-separated, and 0 otherwise. A log search whose start is not
 *  about fifteen minutes back answers 0, as a search of the wrong window would
 *  find nothing to rely on. STUB_AWS_RC makes the call fail with an
 *  AWS-shaped message, the way an expired or denied credential does. */
const AWS_STUB = `#!/usr/bin/env bash
echo "aws $*" >> "$STUB_CALLS"
if [[ -n "\${STUB_AWS_RC:-}" ]]; then
  echo "An error occurred (AccessDenied) when calling the $2 operation: stub denied" >&2
  exit "$STUB_AWS_RC"
fi
if [[ "$1" == cloudtrail ]]; then
  user=""
  for a in "$@"; do [[ "$a" == AttributeKey=Username,AttributeValue=* ]] && user="\${a#AttributeKey=Username,AttributeValue=}"; done
  if [[ -r "$STUB_TRAIL_DIR/$user.json" ]]; then cat "$STUB_TRAIL_DIR/$user.json"; else echo '[]'; fi
  exit 0
fi
region="" namespace="" metric="" group="" pattern="" start=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --region) region="$2"; shift 2 ;;
    --namespace) namespace="$2"; shift 2 ;;
    --metric-name) metric="$2"; shift 2 ;;
    --log-group-name) group="$2"; shift 2 ;;
    --filter-pattern) pattern="$2"; shift 2 ;;
    --start-time) start="$2"; shift 2 ;;
    *) shift ;;
  esac
done
if [[ -n "$group" ]]; then
  now_ms=$(( $(date +%s) * 1000 ))
  if [[ ! "$start" =~ ^[0-9]+$ ]] || (( start < now_ms - 960000 || start > now_ms - 840000 )); then echo 0; exit 0; fi
  key="$region:$group:$pattern"
else
  key="$region:$namespace:$metric"
fi
if [[ "|\${STUB_PRESENT:-}|" == *"|$key|"* ]]; then echo 1; else echo 0; fi
`;

const HEARTBEAT_PATTERN = '{ $.msg = "jobs.heartbeat" }';
/** Every metric and heartbeat each alarm reads, present where the trees put
 *  them: the environment's own namespace and log group in the primary region,
 *  and the billing metric in us-east-1, the only region AWS publishes it in. */
const PRESENT = [
  'us-east-1:Footbag/staging:BackupAgeMinutes',
  'us-east-1:Footbag/production:BackupAgeMinutes',
  'us-east-1:AWS/Billing:EstimatedCharges',
  `us-east-1:/footbag/staging/app:${HEARTBEAT_PATTERN}`,
  `us-east-1:/footbag/production/app:${HEARTBEAT_PATTERN}`,
  'us-east-1:CWAgent:container_monitor_heartbeat',
  'us-east-1:CWAgent/production:container_monitor_heartbeat',
].join('|');

/** An operator address of the kind the real values file carries, from the
 *  documentation range, placed next to a gate line so that any diff context,
 *  echoed error snippet or temp copy would carry it. */
const SENSITIVE = '203.0.113.77/32';
const SENSITIVE_LINE = `operator_cidrs             = ["${SENSITIVE}"]`;

const VALUES = [
  'environment                = "production"',
  'alarm_email                = "ops@example.invalid"',
  SENSITIVE_LINE,
  'enable_backup_alarm        = false',
  'enable_preview_record      = false',
  '',
].join('\n');

beforeEach(() => {
  dir = createScratchDir('set-terraform-gate');
  repo = join(dir, 'repo');
  mkdirSync(join(repo, 'scripts'), { recursive: true });
  cpSync(join(process.cwd(), 'scripts/set-terraform-gate.sh'), join(repo, 'scripts/set-terraform-gate.sh'));
  cpSync(join(process.cwd(), 'scripts/lib'), join(repo, 'scripts/lib'), { recursive: true });
  mkdirSync(join(dir, 'private'));
  mkdirSync(join(dir, 'tmp'));
  for (const target of ['staging', 'production']) {
    const src = join(process.cwd(), 'terraform', target);
    const dst = join(repo, 'terraform', target);
    mkdirSync(dst, { recursive: true });
    for (const f of readdirSync(src).filter((n) => n.endsWith('.tf'))) {
      cpSync(join(src, f), join(dst, f));
    }
    writeFileSync(join(dir, 'private', `${target}.tfvars`), VALUES, 'utf-8');
    symlinkSync(`../../../private/${target}.tfvars`, join(dst, 'terraform.tfvars'));
  }
  writeFileSync(join(dir, 'terraform'), TERRAFORM_STUB, { mode: 0o755 });
  writeFileSync(join(dir, 'apply.sh'), APPLY_STUB, { mode: 0o755 });
  writeFileSync(join(dir, 'aws'), AWS_STUB, { mode: 0o755 });
  calls = join(dir, 'calls.log');
  writeFileSync(calls, '', 'utf-8');
});

afterEach(() => {
  removeScratch(dir);
});

function values(target: string): string {
  return readFileSync(join(dir, 'private', `${target}.tfvars`), 'utf-8');
}

function callLog(): string {
  return readFileSync(calls, 'utf-8');
}

function run(args: string[], env: Record<string, string> = {}) {
  const r = spawnSync('bash', [join(repo, 'scripts/set-terraform-gate.sh'), ...args], {
    cwd: dir,
    encoding: 'utf-8',
    env: {
      ...process.env,
      FOOTBAG_CR_REPORT_TO: '',
      SET_TERRAFORM_GATE_TERRAFORM_BIN: join(dir, 'terraform'),
      SET_TERRAFORM_GATE_APPLY_CMD: join(dir, 'apply.sh'),
      SET_TERRAFORM_GATE_AWS_BIN: join(dir, 'aws'),
      STUB_CALLS: calls,
      STUB_PRESENT: PRESENT,
      STUB_SENSITIVE: SENSITIVE,
      STUB_SENSITIVE_LINE: SENSITIVE_LINE,
      TMPDIR: join(dir, 'tmp'),
      ...env,
    },
    ...SPAWN_GUARD,
  });
  const stderr = r.stderr ?? '';
  const at = stderr.indexOf('==== Closing report');
  return {
    status: r.status,
    stdout: r.stdout ?? '',
    stderr,
    report: at >= 0 ? stderr.slice(at) : '',
  };
}

const ON_STAGING = ['--target', 'staging', '--gate', 'enable_backup_alarm', '--state', 'on', '--yes'];

describe('set-terraform-gate.sh argument guards, each beside a run it lets through', () => {
  it('lets a valid gate, target and state through to the write and the apply', () => {
    // Defect caught: a guard that refuses every run would pass every refusal
    // case below while leaving the operator no way to set a gate.
    const r = run(ON_STAGING);
    expect(r.status, r.stderr).toBe(0);
    expect(callLog()).toContain('apply --target staging');
  });

  it('refuses a run with no target, because the environment is never defaulted', () => {
    // Defect caught: a forgotten --target landing the change on some
    // environment the operator did not name.
    const r = run(['--gate', 'enable_backup_alarm', '--state', 'on', '--yes']);
    expect(r.status).toBe(2);
    expect(r.stderr).toContain('--target is required');
    expect(callLog()).toBe('');
    expect(values('staging')).toBe(VALUES);
  });

  it('refuses a target outside staging and production', () => {
    // Defect caught: a typo or the shared tree accepted as an environment the
    // gate is then written into.
    const r = run(['--target', 'prod', '--gate', 'enable_backup_alarm', '--state', 'on', '--yes']);
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("(got 'prod')");
    expect(callLog()).toBe('');
  });

  it('refuses a gate that is not on the allowlist, even one the tree declares as a bool', () => {
    // Defect caught: any bool in the tree (the CloudFront switch, or the archive
    // custom domain) flipped and applied by a flag nobody reviewed for this
    // script.
    for (const gate of ['enable_cloudfront', 'enable_archive_custom_domain']) {
      const r = run(['--target', 'production', '--gate', gate, '--state', 'on', '--yes']);
      expect(r.status, gate).toBe(2);
      expect(r.report, gate).toContain(`'${gate}'`);
    }
    expect(callLog()).toBe('');
    expect(values('production')).toBe(VALUES);
  });

  it('refuses enable_feed_queues by name and points at the script that owns it', () => {
    // Defect caught: the feed queues brought up with no deploy and no host
    // check, leaving subscribed queues nothing drains.
    const r = run(['--target', 'staging', '--gate', 'enable_feed_queues', '--state', 'on', '--yes']);
    expect(r.status).toBe(2);
    expect(r.report).toContain('activate-notification-feeds.sh');
    expect(callLog()).toBe('');
  });

  it('refuses the two cutover flags in both directions, each naming only the applies that change it', () => {
    // Defect caught: a cutover flag applied alone, outside the apply that
    // changes it together with its other values, or an operator sent looking
    // for a "pair flip" that never happens: the notice goes on in the window
    // state and off in the launch apply, and the alias records go on only in
    // the write-freeze apply.
    const owners: Array<[string, string[], string[]]> = [
      ['enable_cutover_notice', ['window state', 'launch apply'], ['write-freeze']],
      ['enable_apex_alias_records', ['write-freeze'], ['window state', 'launch apply']],
    ];
    for (const [gate, named, notNamed] of owners) {
      for (const state of ['on', 'off']) {
        const r = run(['--target', 'production', '--gate', gate, '--state', state, '--yes']);
        expect(r.status, `${gate} ${state}`).toBe(2);
        for (const owner of named) expect(r.report, `${gate} ${state}`).toContain(owner);
        for (const other of notNamed) expect(r.report, `${gate} ${state}`).not.toContain(other);
        expect(values('production'), `${gate} ${state}`).toBe(VALUES);
      }
    }
    expect(callLog()).toBe('');
  });

  it('refuses each DNS, mail-verification and archive gate by name in both directions, naming its owner', () => {
    // Defect caught: a DNS record on the cutover path, SES domain verification
    // (published records and a running verification clock) or the archive stack
    // switched by a one-gate apply outside the sitting that owns it, or the
    // operator refused without being told where the change belongs.
    const refused: Array<[string, string]> = [
      ['enable_preview_record', 'custom-domain apply'],
      ['ses_enable_domain_identity', 'zone delegation'],
      ['ses_enable_domain_auth', 'zone delegation'],
      ['enable_archive', 'prevent_destroy'],
    ];
    for (const [gate, owner] of refused) {
      for (const state of ['on', 'off']) {
        const r = run(['--target', 'production', '--gate', gate, '--state', state, '--yes']);
        expect(r.status, `${gate} ${state}`).toBe(2);
        expect(r.report, `${gate} ${state}`).toContain(gate);
        expect(r.report, `${gate} ${state}`).toContain(owner);
        expect(values('production'), `${gate} ${state}`).toBe(VALUES);
      }
    }
    expect(callLog()).toBe('');
  });

  it('turns the cutover login alarm off outside the freeze window', () => {
    // Defect caught: a refusal so broad the zero-logins alarm can no longer be
    // stood down after its fire test.
    writeFileSync(join(dir, 'private', 'production.tfvars'), `${VALUES}enable_cutover_login_alarm = true\n`, 'utf-8');
    const off = run(['--target', 'production', '--gate', 'enable_cutover_login_alarm', '--state', 'off', '--yes']);
    expect(off.status, off.stderr).toBe(0);
    expect(values('production')).toMatch(/^enable_cutover_login_alarm = false$/m);
    expect(callLog()).toMatch(/^apply --target production$/m);
  });

  it('refuses the mail-records flag in either direction, and touches nothing', () => {
    // Defect caught: the apex mail moved to Google alone while the ifpa records
    // still route to the legacy host, or the apex MX and TXT deleted by turning
    // the flag off, because one gate was flipped outside the mail-day change;
    // or an operator told off always deletes the apex mail records, when while
    // the legacy mirror flag is on it is the mail cutover's revert.
    for (const state of ['on', 'off']) {
      const r = run(['--target', 'production', '--gate', 'ses_enable_mail_records', '--state', state, '--yes']);
      expect(r.status, state).toBe(2);
      expect(r.report, state).toContain('the mail cutover owns it');
      expect(r.report, state).toContain('enable_legacy_mirror_records');
      expect(r.report, state).toContain('revert');
      expect(values('production'), state).toBe(VALUES);
    }
    expect(callLog()).toBe('');
  });

  it('refuses a gate the target tree does not declare, and accepts it where declared', () => {
    // Defect caught: a value written for a variable the staging tree lacks,
    // which terraform only warns about, so the apply succeeds changing nothing.
    // The billing alarm is declared in production only.
    const refused = run(['--target', 'staging', '--gate', 'enable_billing_alarm', '--state', 'on', '--yes']);
    expect(refused.status).toBe(2);
    expect(refused.report).toContain('terraform/staging');
    expect(values('staging')).toBe(VALUES);
    expect(callLog()).toBe('');
    const allowed = run(['--target', 'production', '--gate', 'enable_billing_alarm', '--state', 'on', '--yes']);
    expect(allowed.status, allowed.stderr).toBe(0);
  });

  it('refuses a gate the tree declares with something other than a bool defaulting false', () => {
    // Defect caught: a variable whose shape changed (a string, or a default of
    // true) treated as an on/off gate and written as a bare bool.
    const f = join(repo, 'terraform/staging/variables.tf');
    const src = readFileSync(f, 'utf-8');
    const block = /variable "enable_backup_alarm" \{[\s\S]*?\n\}/.exec(src);
    expect(block).not.toBeNull();
    const reshaped = [
      block![0].replace('default     = false', 'default     = true'),
      block![0].replace('type        = bool', 'type        = string'),
    ];
    for (const changed of reshaped) {
      expect(changed).not.toBe(block![0]);
      writeFileSync(f, src.replace(block![0], changed), 'utf-8');
      const r = run(ON_STAGING);
      expect(r.status, changed).toBe(2);
    }
    expect(values('staging')).toBe(VALUES);
    expect(callLog()).toBe('');
  });

  it('refuses a state other than on or off', () => {
    // Defect caught: "true" or "yes" read as some state and written verbatim
    // into the values file.
    const r = run(['--target', 'staging', '--gate', 'enable_backup_alarm', '--state', 'true', '--yes']);
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("(got 'true')");
    expect(values('staging')).toBe(VALUES);
  });

  it('refuses a dangling values symlink and never creates a values file', () => {
    // Defect caught: on a machine without the private checkout, an empty values
    // file improvised and applied, planning every other variable at its default.
    removeScratch(join(dir, 'private', 'staging.tfvars'));
    const r = run(ON_STAGING);
    expect(r.status).toBe(1);
    expect(r.report).toContain('points at nothing');
    expect(existsSync(join(dir, 'private', 'staging.tfvars'))).toBe(false);
    expect(callLog()).toBe('');
  });
});

describe('set-terraform-gate.sh end to end against stand-ins', () => {
  it('adds a gate the values file lacks as a group of its own, after a blank line', () => {
    // terraform fmt aligns the = signs of consecutive lines, so a gate
    // appended straight after the file's last value must be padded to match
    // it. Defect caught: every flip that adds a gate leaving the values file
    // failing the fmt check the full gate runs.
    writeFileSync(join(dir, 'private', 'staging.tfvars'),
      VALUES.replace(/^enable_backup_alarm.*\n/m, ''), 'utf-8');
    const r = run(ON_STAGING);
    expect(r.status, r.stderr).toBe(0);
    expect(values('staging')).toMatch(/\S\n\nenable_backup_alarm = true\n$/);
  });

  it('reads the region and the read-back through terraform\'s state-lock notices', () => {
    // A tree with a locking backend prints "Releasing state lock..." after the
    // value of every console read. Defect caught: that notice taken as the
    // value, so every gate that reads the region refuses before planning and
    // the read-back of every gate fails.
    const r = run(ON_STAGING, { STUB_LOCK_NOTICES: '1' });
    expect(r.status, r.stderr).toBe(0);
    expect(r.report).toMatch(/Proven:\n {2}- enable_backup_alarm = true on staging/);
    expect(r.report).not.toMatch(/Errors \(/);
  });

  it('announces both seams on stderr, because a stubbed run proves nothing', () => {
    // Defect caught: a stubbed run whose output reads like a real apply.
    const r = run(ON_STAGING);
    expect(r.stderr).toContain(`terraform='${join(dir, 'terraform')}'`);
    expect(r.stderr).toContain(`apply='${join(dir, 'apply.sh')}'`);
    expect(r.stderr).toContain(`aws='${join(dir, 'aws')}'`);
  });

  it('writes the flag through the symlink, shows the diff, applies the target and proves it', () => {
    // Defect caught: the file written without the operator seeing the change,
    // the link replaced by a real file, the wrong tree applied, or the run
    // claiming success without reading the value back.
    const r = run(ON_STAGING);
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toContain('-enable_backup_alarm        = false');
    expect(r.stdout).toContain('+enable_backup_alarm        = true');
    expect(values('staging')).toContain('enable_backup_alarm        = true');
    expect(values('staging')).toContain('enable_preview_record      = false');
    expect(readdirSync(join(repo, 'terraform/staging'))).toContain('terraform.tfvars');
    expect(callLog()).toMatch(/^apply --target staging$/m);
    expect(callLog()).toMatch(/^console read var\.enable_backup_alarm$/m);
    expect(r.report).toMatch(/Proven:\n {2}- enable_backup_alarm = true on staging/);
    expect(r.report).not.toMatch(/Errors \(/);
    // Defect caught: an armed alarm reported as though the read-back proved it
    // pages, when nothing in the run made it fire, or carrying the disarmed
    // caveat, which misstates what the read-back proved.
    expect(r.report).toMatch(/Not proven:\n {2}- [^\n]*var\.enable_backup_alarm = true/);
    expect(r.report).not.toContain('var.enable_backup_alarm = false');
  });

  it('shows only the gate line and makes no copy of the values file', () => {
    // Defect caught: the operator addresses beside the gate line printed as
    // diff context into a captured terminal, or left in a temp copy of the
    // values file while the apply runs.
    const r = run(ON_STAGING);
    expect(r.status, r.stderr).toBe(0);
    expect(`${r.stdout}${r.stderr}`).not.toContain(SENSITIVE);
    expect(`${r.stdout}${r.stderr}`).not.toContain('alarm_email');
    expect(callLog()).toMatch(/^apply --target staging$/m);
    expect(callLog()).not.toMatch(/^leak /m);
  });

  it('never prints a values-file snippet that terraform quotes in an error', () => {
    // Defect caught: a failed plan or read-back echoing terraform's source
    // snippet, which quotes the values file, into the run's output.
    const plan = run(['--target', 'staging', '--gate', 'enable_backup_alarm', '--state', 'off'], { STUB_PLAN_RC: '1' });
    const readBack = run(ON_STAGING, { STUB_CONSOLE_RC: '1' });
    for (const r of [plan, readBack]) {
      expect(r.status).toBe(1);
      expect(r.report).toMatch(/stub (plan|console) failure/);
      expect(`${r.stdout}${r.stderr}`).not.toContain(SENSITIVE);
    }
  });

  it('appends the line when the file sets none, and shows it in the diff first', () => {
    // Defect caught: a gate missing from the values file left unset while the
    // run reports it on, or the line added without being shown.
    const r = run(['--target', 'production', '--gate', 'enable_billing_alarm', '--state', 'on', '--yes']);
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toContain('+enable_billing_alarm = true');
    expect(values('production')).toMatch(/^enable_billing_alarm = true$/m);
  });

  it('collapses a duplicate assignment, since terraform reads the last one', () => {
    // Defect caught: a stale duplicate below the rewritten line winning over the
    // value the diff showed the operator.
    // The first assignment already says true and the last says false, so a run
    // reading the first would call the file at state and leave the stale line.
    const first = VALUES.replace('enable_backup_alarm        = false', 'enable_backup_alarm        = true');
    writeFileSync(join(dir, 'private', 'staging.tfvars'), `${first}enable_backup_alarm = false\n`, 'utf-8');
    const r = run(ON_STAGING);
    expect(r.status, r.stderr).toBe(0);
    expect(values('staging').match(/enable_backup_alarm.*/g)).toEqual(['enable_backup_alarm        = true']);
    expect(callLog()).toMatch(/^apply --target staging$/m);
  });

  it('does nothing when the file and the state already hold the requested state', () => {
    // Defect caught: a re-run applying the tree again, or rewriting the file,
    // when nothing needs to change.
    const r = run(['--target', 'staging', '--gate', 'enable_backup_alarm', '--state', 'off', '--yes']);
    expect(r.status, r.stderr).toBe(0);
    expect(values('staging')).toBe(VALUES);
    expect(callLog()).toMatch(/^terraform plan /m);
    expect(callLog()).not.toMatch(/^apply /m);
    expect(r.report).toContain('nothing applied');
    // Defect caught: an already-set run closing as though the read-back proved
    // the alarm resource itself is gone.
    expect(r.report).toMatch(/Not proven:\n {2}- [^\n]*var\.enable_backup_alarm = false/);
  });

  it('turns off a gate the file never sets without adding a line or applying', () => {
    // Defect caught: an absent line, which already means off through the
    // declared default, read as "on" and answered with an append and an apply.
    const r = run(['--target', 'production', '--gate', 'enable_billing_alarm', '--state', 'off', '--yes']);
    expect(r.status, r.stderr).toBe(0);
    expect(values('production')).toBe(VALUES);
    expect(callLog()).toMatch(/^terraform plan .*-detailed-exitcode/m);
    expect(callLog()).not.toMatch(/^apply /m);
  });

  it('fails an already-at-state run whose read-back disagrees, rather than calling it done', () => {
    // Defect caught: "already set" claimed from the values file and an empty
    // plan while terraform reads a different value (an override file, say).
    const r = run(['--target', 'staging', '--gate', 'enable_backup_alarm', '--state', 'off'], { STUB_CONSOLE_VALUE: 'true' });
    expect(r.status).toBe(1);
    expect(r.report).toMatch(/Errors \(1\):/);
    expect(r.report).not.toContain('Proven:');
  });

  it('lists the console error when the read-back itself fails', () => {
    // Defect caught: a failed terraform console's error text compared as if it
    // were a value, so the operator is told the gate reads garbage rather than
    // why the read failed.
    const r = run(ON_STAGING, { STUB_CONSOLE_RC: '1' });
    expect(r.status).toBe(1);
    expect(r.report).toContain('stub console failure');
    expect(r.report).not.toContain('Proven:');
  });

  it('applies when the file already holds the state but the tree has changes pending', () => {
    // Defect caught: a run stopped between the write and the apply, re-run, and
    // told "already done" while the estate never received the change.
    // The file says true and the state still holds false: the gate is the one
    // change pending.
    writeFileSync(join(dir, 'private', 'staging.tfvars'), VALUES.replace('enable_backup_alarm        = false', 'enable_backup_alarm        = true'), 'utf-8');
    const r = run(ON_STAGING, { STUB_GATE_STATE: 'enable_backup_alarm=false' });
    expect(r.status, r.stderr).toBe(0);
    expect(callLog()).toMatch(/^apply --target staging$/m);
    expect(r.report).toMatch(/Proven:\n {2}- enable_backup_alarm = true on staging: applied/);
  });

  it('lists a warning terraform printed during the read-only plan', () => {
    // Defect caught: a provider or deprecation warning scrolling past and the
    // run ending without it.
    const r = run(['--target', 'staging', '--gate', 'enable_backup_alarm', '--state', 'off'], { STUB_PLAN_WARNING: 'stub deprecation' });
    expect(r.status, r.stderr).toBe(0);
    expect(r.report).toMatch(/Warnings \(1\):/);
    expect(r.report).toContain('stub deprecation');
  });

  it('fails the run when the read-only plan fails, applying nothing', () => {
    // Defect caught: a plan that could not reach the state read as "nothing
    // pending" and reported as already done, or terraform's own reason dropped.
    const r = run(['--target', 'staging', '--gate', 'enable_backup_alarm', '--state', 'off'], { STUB_PLAN_RC: '1' });
    expect(r.status).toBe(1);
    expect(r.report).toContain('terraform plan: Error: stub plan failure');
    expect(r.report).not.toContain('Proven:');
    expect(callLog()).not.toMatch(/^apply /m);
  });

  it('reports an apply failure as an error and leaves the written state in the file', () => {
    // Defect caught: a failed apply ending green, or the file silently put back
    // over an estate the failed apply may already have changed.
    const r = run(ON_STAGING, { STUB_APPLY_RC: '1' });
    expect(r.status).toBe(1);
    expect(r.report).toMatch(/Errors \(1\):/);
    expect(r.report).toContain('did not land');
    expect(values('staging')).toContain('enable_backup_alarm        = true');
    expect(callLog()).not.toMatch(/^console read var\.enable_backup_alarm$/m);
  });

  it('fails the run when the read-back disagrees with the requested state', () => {
    // Defect caught: the apply wrapper exiting 0 taken as proof, while terraform
    // still reads the old value (a later duplicate, an override file).
    const r = run(ON_STAGING, { STUB_CONSOLE_VALUE: 'false' });
    expect(r.status).toBe(1);
    expect(r.report).toMatch(/Errors \(1\):/);
    expect(r.report).not.toContain('Proven:');
  });

  it('refuses to write without a terminal and without --yes, leaving the file as found', () => {
    // Defect caught: the values file changed with no one confirming the diff.
    const r = run(['--target', 'staging', '--gate', 'enable_backup_alarm', '--state', 'on']);
    expect(r.status).toBe(1);
    expect(values('staging')).toBe(VALUES);
    expect(callLog()).not.toMatch(/^apply /m);
  });

  it('dry run shows the diff and writes, plans and applies nothing', () => {
    // Defect caught: a dry run that changes the values file or reaches terraform.
    const r = run(['--target', 'staging', '--gate', 'enable_backup_alarm', '--state', 'on', '--dry-run']);
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toContain('+enable_backup_alarm        = true');
    expect(values('staging')).toBe(VALUES);
    expect(callLog()).toBe('');
  });
});

describe('set-terraform-gate.sh plans the change before writing the values file', () => {
  it('plans read-only with the new value before the write and the apply', () => {
    // Defect caught: a change that Terraform's own validation rejects written
    // into the values file first and only found by the apply, leaving the file
    // and the estate disagreeing.
    const r = run(ON_STAGING);
    expect(r.status, r.stderr).toBe(0);
    const log = callLog();
    const plan = log.search(/^terraform plan .*-lock=false .*-var enable_backup_alarm=true/m);
    expect(plan, log).toBeGreaterThanOrEqual(0);
    expect(plan).toBeLessThan(log.search(/^apply --target staging$/m));
  });

  it('refuses with terraform\'s error titles and leaves the file byte-identical when that plan fails', () => {
    // Defect caught: a values file rewritten to a value the tree cannot plan,
    // or terraform's reason dropped, or the source snippet under the title
    // (which quotes the values file) printed.
    const r = run(ON_STAGING, { STUB_VAR_PLAN_RC: '1' });
    expect(r.status).toBe(1);
    expect(values('staging')).toBe(VALUES);
    expect(r.report).toContain('terraform plan: Error: stub plan failure');
    expect(r.report).not.toContain('Proven:');
    expect(callLog()).toMatch(/^terraform plan .*-var enable_backup_alarm=true/m);
    expect(callLog()).not.toMatch(/^apply /m);
    expect(`${r.stdout}${r.stderr}`).not.toContain(SENSITIVE);
  });
});

describe('set-terraform-gate.sh applies only the gate, refusing other pending changes', () => {
  const ON_TRUE = VALUES.replace('enable_backup_alarm        = false', 'enable_backup_alarm        = true');

  it('plans the current values read-only, with no override, before the write', () => {
    // Defect caught: the check for other pending changes run with the gate's
    // new value, where the gate's own change hides whether anything else is
    // pending, or run after the file is already written.
    const r = run(ON_STAGING);
    expect(r.status, r.stderr).toBe(0);
    const log = callLog();
    const current = log.search(/^terraform plan -input=false -no-color -detailed-exitcode -lock=false$/m);
    expect(current, log).toBeGreaterThanOrEqual(0);
    expect(current).toBeLessThan(log.search(/^apply --target staging$/m));
  });

  it('refuses a change while other changes are pending, leaving the file as found and applying nothing', () => {
    // Defect caught: the apply, which applies the whole tree, carrying some
    // other pending change into the estate under this gate's name.
    const r = run(ON_STAGING, { STUB_OTHER_PENDING: '1' });
    expect(r.status).toBe(1);
    expect(r.report).toMatch(/Errors \(1\):/);
    expect(r.report).toContain('scripts/terraform-apply.sh');
    expect(r.report).not.toContain('Proven:');
    expect(values('staging')).toBe(VALUES);
    expect(callLog()).not.toMatch(/^apply /m);
  });

  it('refuses when the current-values plan fails, with terraform\'s error titles and the file as found', () => {
    // Defect caught: a plan that could not run read as "nothing else pending",
    // so the gate is written and applied with the tree's state unknown.
    const r = run(ON_STAGING, { STUB_CURRENT_PLAN_RC: '1' });
    expect(r.status).toBe(1);
    expect(r.report).toContain('terraform plan: Error: stub plan failure');
    expect(r.report).not.toContain('Proven:');
    expect(values('staging')).toBe(VALUES);
    expect(callLog()).not.toMatch(/^apply /m);
    expect(`${r.stdout}${r.stderr}`).not.toContain(SENSITIVE);
  });

  it('refuses an already-set gate while other changes are pending, applying nothing', () => {
    // Defect caught: a re-run with the file and the state both at the wanted
    // value, finding something else pending and applying it as though it were
    // this gate's unfinished apply.
    writeFileSync(join(dir, 'private', 'staging.tfvars'), ON_TRUE, 'utf-8');
    const r = run(ON_STAGING, { STUB_OTHER_PENDING: '1' });
    expect(r.status).toBe(1);
    expect(r.report).toContain('scripts/terraform-apply.sh');
    expect(r.report).not.toContain('Proven:');
    expect(values('staging')).toBe(ON_TRUE);
    expect(callLog()).not.toMatch(/^apply /m);
  });

  it('refuses a stopped run\'s re-run when something besides the gate is also pending', () => {
    // Defect caught: the unfinished gate change taken as the only change, so
    // the resumed apply also carries whatever else is pending.
    writeFileSync(join(dir, 'private', 'staging.tfvars'), ON_TRUE, 'utf-8');
    const r = run(ON_STAGING, { STUB_GATE_STATE: 'enable_backup_alarm=false', STUB_OTHER_PENDING: '1' });
    expect(r.status).toBe(1);
    expect(r.report).toContain('scripts/terraform-apply.sh');
    expect(callLog()).not.toMatch(/^apply /m);
  });
});

describe('set-terraform-gate.sh keeps the login alarm on through the freeze window', () => {
  const OFF = ['--target', 'production', '--gate', 'enable_cutover_login_alarm', '--state', 'off', '--yes'];
  const withFlags = (notice: boolean, alias: boolean) =>
    `${VALUES}enable_cutover_login_alarm = true\nenable_cutover_notice = ${notice}\nenable_apex_alias_records = ${alias}\n`;

  it('refuses the alarm off while the notice and the alias records are both on, and allows it otherwise', () => {
    // Defect caught: the zero-logins alarm the freeze apply armed turned off
    // before launch, so the 48-hour watch runs without its primary sign-in
    // observable; or the refusal so broad the alarm cannot be stood down in
    // the window state or at the 48-hour close.
    const cases: Array<[boolean, boolean, number]> = [
      [true, true, 1],
      [true, false, 0],
      [false, true, 0],
    ];
    for (const [notice, alias, status] of cases) {
      const label = `notice ${notice}, alias ${alias}`;
      const content = withFlags(notice, alias);
      writeFileSync(join(dir, 'private', 'production.tfvars'), content, 'utf-8');
      writeFileSync(calls, '', 'utf-8');
      const r = run(OFF);
      expect(r.status, `${label}: ${r.stderr}`).toBe(status);
      if (status === 1) {
        expect(r.report, label).toContain('freeze window');
        expect(r.report, label).toContain('48-hour');
        expect(values('production'), label).toBe(content);
        expect(callLog(), label).not.toMatch(/^terraform plan /m);
        expect(callLog(), label).not.toMatch(/^apply /m);
      } else {
        expect(values('production'), label).toMatch(/^enable_cutover_login_alarm = false$/m);
        expect(callLog(), label).toMatch(/^apply --target production$/m);
      }
    }
  });

  it('refuses when either flag cannot be read, rather than treating it as off', () => {
    // Defect caught: a failed read of the notice or the alias flag taken as
    // false, so the alarm is turned off inside the freeze window.
    const content = withFlags(true, true);
    for (const name of ['enable_cutover_notice', 'enable_apex_alias_records']) {
      writeFileSync(join(dir, 'private', 'production.tfvars'), content, 'utf-8');
      writeFileSync(calls, '', 'utf-8');
      const r = run(OFF, { STUB_CONSOLE_FAIL_VAR: name });
      expect(r.status, name).toBe(1);
      expect(r.report, name).toContain(`var.${name}`);
      expect(r.report, name).toContain('stub console failure');
      expect(values('production'), name).toBe(content);
      expect(callLog(), name).not.toMatch(/^terraform plan /m);
      expect(`${r.stdout}${r.stderr}`, name).not.toContain(SENSITIVE);
    }
  });
});

describe('set-terraform-gate.sh arms the login alarm only in pass 1, for its fire test', () => {
  const ON = ['--target', 'production', '--gate', 'enable_cutover_login_alarm', '--state', 'on', '--yes'];
  const withFlags = (notice: boolean, alias: boolean) =>
    `${VALUES}enable_cutover_notice = ${notice}\nenable_apex_alias_records = ${alias}\n`;

  it('arms the alarm while the notice and the alias records both read false, and proves it', () => {
    // Defect caught: the pass-1 fire test of the zero-logins alarm left with no
    // scripted way to arm it, so it is armed by a hand-typed values edit, or
    // armed without the read-back proving terraform now holds it on.
    const content = withFlags(false, false);
    writeFileSync(join(dir, 'private', 'production.tfvars'), content, 'utf-8');
    const r = run(ON);
    expect(r.status, r.stderr).toBe(0);
    expect(callLog()).toMatch(/^console read var\.enable_cutover_notice$/m);
    expect(callLog()).toMatch(/^console read var\.enable_apex_alias_records$/m);
    expect(values('production')).toMatch(/^enable_cutover_login_alarm = true$/m);
    expect(callLog()).toMatch(/^apply --target production$/m);
    expect(callLog()).toMatch(/^console read var\.enable_cutover_login_alarm$/m);
    expect(r.report).toMatch(/Proven:\n {2}- enable_cutover_login_alarm = true on production: applied/);
    // Defect caught: an armed alarm reported as though it was seen to page.
    expect(r.report).toMatch(/Not proven:\n {2}- [^\n]*var\.enable_cutover_login_alarm = true/);
  });

  it('refuses to arm it when either flag reads true, having read them, and touches nothing', () => {
    // Defect caught: the zero-logins alarm armed in the window state or the
    // freeze window by this script, where the freeze stage of the cutover owns
    // it; or armed in the window state, where the launch apply then creates an
    // alarm nobody fire-tested.
    const cases: Array<[boolean, boolean]> = [
      [true, false],
      [false, true],
      [true, true],
    ];
    for (const [notice, alias] of cases) {
      const label = `notice ${notice}, alias ${alias}`;
      const content = withFlags(notice, alias);
      writeFileSync(join(dir, 'private', 'production.tfvars'), content, 'utf-8');
      writeFileSync(calls, '', 'utf-8');
      const r = run(ON);
      expect(r.status, `${label}: ${r.stderr}`).toBe(1);
      expect(callLog(), label).toMatch(/^console read var\.enable_cutover_notice$/m);
      expect(r.report, label).toContain('P1-11');
      expect(r.report, label).not.toContain('Proven:');
      expect(values('production'), label).toBe(content);
      expect(callLog(), label).not.toMatch(/^terraform plan /m);
      expect(callLog(), label).not.toMatch(/^apply /m);
    }
  });

  it('refuses to arm it when a flag cannot be read or is not a bool, rather than taking it as false', () => {
    // Defect caught: a failed or garbled read of the notice or the alias flag
    // taken as false, so the alarm is armed outside pass 1.
    const content = withFlags(false, false);
    const reads: Array<[string, Record<string, string>, string]> = [
      ['enable_cutover_notice', { STUB_CONSOLE_FAIL_VAR: 'enable_cutover_notice' }, 'stub console failure'],
      ['enable_apex_alias_records', { STUB_CONSOLE_FAIL_VAR: 'enable_apex_alias_records' }, 'stub console failure'],
      ['enable_cutover_notice', { STUB_CONSOLE_VALUE: 'null' }, 'did not read back as a bool'],
    ];
    for (const [name, env, why] of reads) {
      const label = `${name} ${JSON.stringify(env)}`;
      writeFileSync(join(dir, 'private', 'production.tfvars'), content, 'utf-8');
      writeFileSync(calls, '', 'utf-8');
      const r = run(ON, env);
      expect(r.status, `${label}: ${r.stderr}`).toBe(1);
      expect(callLog(), label).toMatch(new RegExp(`^console read var\\.${name}$`, 'm'));
      expect(r.report, label).toContain(`var.${name}`);
      expect(r.report, label).toContain(why);
      expect(r.report, label).toContain('P1-11');
      expect(values('production'), label).toBe(content);
      expect(callLog(), label).not.toMatch(/^terraform plan /m);
      expect(callLog(), label).not.toMatch(/^apply /m);
      expect(`${r.stdout}${r.stderr}`, label).not.toContain(SENSITIVE);
    }
  });
});

describe('set-terraform-gate.sh checks the metric an alarm reads before arming it', () => {
  /** Each alarm gate with a target that declares it, and the call-log line
   *  that shows the check looked where the alarm reads. */
  const ARMINGS: Array<{ gate: string; target: string; where: RegExp }> = [
    {
      gate: 'enable_backup_alarm',
      target: 'staging',
      where: /^aws cloudwatch list-metrics .*--namespace Footbag\/staging --metric-name BackupAgeMinutes .*--recently-active PT3H/m,
    },
    {
      gate: 'enable_jobs_heartbeat_alarm',
      target: 'staging',
      where: /^aws logs filter-log-events .*--log-group-name \/footbag\/staging\/app /m,
    },
    {
      gate: 'enable_billing_alarm',
      target: 'production',
      where: /^aws cloudwatch list-metrics --region us-east-1 --namespace AWS\/Billing --metric-name EstimatedCharges /m,
    },
    {
      gate: 'enable_container_alarms',
      target: 'staging',
      where: /^aws cloudwatch list-metrics .*--namespace CWAgent --metric-name container_monitor_heartbeat .*--recently-active PT3H/m,
    },
    {
      gate: 'enable_container_alarms',
      target: 'production',
      where: /^aws cloudwatch list-metrics .*--namespace CWAgent\/production --metric-name container_monitor_heartbeat .*--recently-active PT3H/m,
    },
  ];
  const arm = (a: { gate: string; target: string }, env: Record<string, string> = {}) =>
    run(['--target', a.target, '--gate', a.gate, '--state', 'on', '--yes'], env);

  it('arms each alarm when what it reads is present, having looked where the alarm reads it', () => {
    // Defect caught: a check against the wrong namespace, log group or region,
    // which would pass or refuse regardless of what the alarm will see.
    for (const a of ARMINGS) {
      writeFileSync(calls, '', 'utf-8');
      const r = arm(a);
      expect(r.status, `${a.gate}: ${r.stderr}`).toBe(0);
      expect(callLog(), a.gate).toMatch(a.where);
      expect(callLog(), a.gate).toMatch(new RegExp(`^apply --target ${a.target}$`, 'm'));
    }
  });

  it('refuses to arm when the metric or heartbeat is absent, before any plan, write or apply', () => {
    // Defect caught: an alarm that treats missing data as breaching (or a
    // billing alarm with no metric to read) armed over nothing, so it pages at
    // once or never.
    for (const a of ARMINGS) {
      writeFileSync(calls, '', 'utf-8');
      const r = arm(a, { STUB_PRESENT: '' });
      expect(r.status, a.gate).toBe(1);
      expect(r.report, a.gate).toMatch(/Errors \(1\):/);
      expect(r.report, a.gate).toContain(a.gate);
      expect(values(a.target), a.gate).toBe(VALUES);
      expect(callLog(), a.gate).not.toMatch(/^terraform plan /m);
      expect(callLog(), a.gate).not.toMatch(/^apply /m);
    }
  });

  it('treats a failed aws call as an error carrying AWS\'s message, never as absent', () => {
    // Defect caught: an expired or denied credential read as "the metric is
    // absent", sending the operator to fix a pipeline that is fine, with AWS's
    // reason dropped.
    for (const a of ARMINGS) {
      writeFileSync(calls, '', 'utf-8');
      const r = arm(a, { STUB_AWS_RC: '255' });
      expect(r.status, a.gate).toBe(1);
      expect(r.report, a.gate).toContain('stub denied');
      expect(r.report, a.gate).toMatch(/Errors \(1\):/);
      expect(values(a.target), a.gate).toBe(VALUES);
      expect(callLog(), a.gate).not.toMatch(/^apply /m);
    }
  });

  it('checks the environment\'s alarms in the tree\'s region, and billing in us-east-1 whatever it is', () => {
    // Defect caught: the region hard-coded, so a tree in another region is
    // checked where its alarm does not live; or billing looked for outside the
    // one region that carries it.
    const west = 'eu-west-1:Footbag/staging:BackupAgeMinutes';
    const backup = ARMINGS[0];
    const billing = ARMINGS[2];
    expect(arm(backup, { STUB_REGION: 'eu-west-1' }).status).toBe(1);
    expect(arm(backup, { STUB_REGION: 'eu-west-1', STUB_PRESENT: `${PRESENT}|${west}` }).status).toBe(0);
    expect(arm(billing, { STUB_REGION: 'eu-west-1' }).status).toBe(0);
  });

  it('refuses when the tree\'s region cannot be read, reaching no aws', () => {
    // Defect caught: a failed region read falling back to some default region
    // and checking a metric where the alarm does not live.
    const r = arm(ARMINGS[0], { STUB_REGION_RC: '1' });
    expect(r.status).toBe(1);
    expect(r.report).toContain('stub region read failure');
    expect(callLog()).not.toMatch(/^aws /m);
    expect(values('staging')).toBe(VALUES);
  });

  it('runs no metric check when turning an alarm off', () => {
    // Defect caught: an alarm that is paging because its metric stopped cannot
    // be stood down, since the stand-down is refused for the same missing metric.
    writeFileSync(join(dir, 'private', 'staging.tfvars'), VALUES.replace('enable_backup_alarm        = false', 'enable_backup_alarm        = true'), 'utf-8');
    const r = run(['--target', 'staging', '--gate', 'enable_backup_alarm', '--state', 'off', '--yes'], { STUB_AWS_RC: '255' });
    expect(r.status, r.stderr).toBe(0);
    expect(callLog()).not.toMatch(/^aws /m);
    expect(callLog()).toMatch(/^apply --target staging$/m);
  });
});

describe('set-terraform-gate.sh arms the host-key alarms only when the trail agrees', () => {
  /** What the console prints for jsonencode(local.host_keys): the encoded map,
   *  as a quoted string. Addresses are from the documentation ranges. */
  const hostKeys = (stagingIp: string) => JSON.stringify(JSON.stringify({
    'production-source-profile': { user: 'footbag-production-source-profile', ip: '198.51.100.10' },
    'staging-source-profile': { user: 'footbag-staging-source-profile', ip: stagingIp },
  }));
  /** A trail lookup's answer: each event is a JSON string, as CloudTrail returns
   *  them, signed by the user from the address given, or made by a service on
   *  the user's behalf. */
  const trail = (user: string, events: Array<{ ip: string; invokedBy?: string }>) => {
    mkdirSync(join(dir, 'trail'), { recursive: true });
    writeFileSync(join(dir, 'trail', `${user}.json`), JSON.stringify(events.map((e) => JSON.stringify({
      userIdentity: { type: 'IAMUser', userName: user, ...(e.invokedBy ? { invokedBy: e.invokedBy } : {}) },
      sourceIPAddress: e.ip,
    }))));
  };
  /** A production values file already carrying the staging address the staging
   *  tree reports, so the address sync has nothing to write. */
  const WITH_ADDRESS = `${VALUES}staging_web_static_ip      = "192.0.2.20"\n`;
  const writeProduction = (content: string) => writeFileSync(join(dir, 'private', 'production.tfvars'), content, 'utf-8');
  const arm = (env: Record<string, string> = {}, content = WITH_ADDRESS) => {
    writeProduction(content);
    return run(['--target', 'production', '--gate', 'enable_host_key_alarm', '--state', 'on', '--yes'],
      { STUB_TRAIL_DIR: join(dir, 'trail'), STUB_HOST_KEYS: hostKeys('192.0.2.20'), ...env });
  };

  it('arms when every call each key signed came from its host, services on its behalf aside', () => {
    // Defect caught: a check that reads the wrong user or ignores the trail,
    // arming an alarm that the hosts' own traffic then holds in ALARM.
    trail('footbag-production-source-profile', [{ ip: '198.51.100.10' }, { ip: 'AWS Internal', invokedBy: 'cloudformation.amazonaws.com' }]);
    trail('footbag-staging-source-profile', [{ ip: '192.0.2.20' }]);
    const r = arm();
    expect(r.status, r.stderr).toBe(0);
    expect(callLog()).toMatch(/^aws cloudtrail lookup-events .*AttributeValue=footbag-production-source-profile /m);
    expect(callLog()).toMatch(/^aws cloudtrail lookup-events .*AttributeValue=footbag-staging-source-profile /m);
    expect(callLog()).toMatch(/^apply --target production$/m);
  });

  it('reads the host-key map through terraform\'s state-lock notices', () => {
    // Defect caught: the lock notice handed to jq as the encoded map, so the
    // host-key alarms can never be armed on a tree with a locking backend.
    trail('footbag-production-source-profile', [{ ip: '198.51.100.10' }]);
    trail('footbag-staging-source-profile', [{ ip: '192.0.2.20' }]);
    const r = arm({ STUB_LOCK_NOTICES: '1' });
    expect(r.status, r.stderr).toBe(0);
    expect(callLog()).toMatch(/^apply --target production$/m);
  });

  it('refuses while a key signed calls from an address the alarm does not expect', () => {
    // Defect caught: the alarm armed while a host really reaches AWS from a
    // second address, so it sits in ALARM and teaches the watch to ignore it.
    trail('footbag-production-source-profile', [{ ip: '198.51.100.10' }, { ip: '2001:db8::7' }]);
    const r = arm();
    expect(r.status).toBe(1);
    expect(r.report).toContain('2001:db8::7');
    expect(r.report).toContain('198.51.100.10');
    expect(values('production')).toBe(WITH_ADDRESS);
    expect(callLog()).not.toMatch(/^apply /m);
  });

  it('refuses while a host has no address set, reading no trail for it', () => {
    // Defect caught: a filter built with an empty expected address, which
    // matches every call the key ever makes.
    const r = arm({ STUB_HOST_KEYS: hostKeys('') });
    expect(r.status).toBe(1);
    expect(r.report).toContain('no address is set for footbag-staging-source-profile');
    expect(callLog()).not.toMatch(/^apply /m);
  });

  it('writes the staging address from the staging tree when the values file lacks it, then arms', () => {
    // Defect caught: arming refused until someone hand-types the staging host's
    // address into the production values file, the step no script owned.
    trail('footbag-production-source-profile', [{ ip: '198.51.100.10' }]);
    trail('footbag-staging-source-profile', [{ ip: '192.0.2.20' }]);
    const r = arm({}, VALUES);
    expect(r.status, r.stderr).toBe(0);
    expect(values('production')).toContain('staging_web_static_ip = "192.0.2.20"');
    // Every other line kept: the operator address beside it is the only copy
    // outside the vault.
    expect(values('production')).toContain(SENSITIVE_LINE);
    expect(r.stdout).toMatch(/\+staging_web_static_ip = "192\.0\.2\.20"/);
    expect(callLog()).toMatch(/^terraform output -raw lightsail_static_ip$/m);
    expect(callLog()).toMatch(/^apply --target production$/m);
  });

  it('rewrites a stale staging address in place, never adding a second line', () => {
    // Defect caught: a value typed once and left stale after staging's address
    // changed, holding the host-key alarm in ALARM; or a second assignment
    // appended below the first, leaving terraform reading whichever is last.
    trail('footbag-production-source-profile', [{ ip: '198.51.100.10' }]);
    trail('footbag-staging-source-profile', [{ ip: '192.0.2.20' }]);
    const r = arm({}, `${VALUES}staging_web_static_ip      = "192.0.2.99"\n`);
    expect(r.status, r.stderr).toBe(0);
    expect(values('production')).toContain('staging_web_static_ip      = "192.0.2.20"');
    expect(values('production').match(/staging_web_static_ip/g)).toHaveLength(1);
  });

  it('leaves a matching staging address alone and reads no plan for it', () => {
    // Defect caught: a values file rewritten, and the operator asked to confirm,
    // on every arming when nothing changed.
    trail('footbag-production-source-profile', [{ ip: '198.51.100.10' }]);
    trail('footbag-staging-source-profile', [{ ip: '192.0.2.20' }]);
    const r = arm();
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toContain('already matches the staging tree');
    expect(r.stdout).not.toMatch(/\+staging_web_static_ip/);
  });

  it('refuses to write the address while another change is pending, leaving the file as found', () => {
    // Defect caught: the address written, and a later apply carrying unrelated
    // pending changes under this gate's name.
    const r = arm({ STUB_OTHER_PENDING: '1' }, VALUES);
    expect(r.status).toBe(1);
    expect(r.report).toMatch(/other changes are pending/);
    expect(values('production')).toBe(VALUES);
    expect(callLog()).not.toMatch(/^apply /m);
  });

  it('refuses when the staging tree\'s address cannot be read, leaving the file as found', () => {
    // Defect caught: a failed read written into the values file as an empty or
    // garbled address.
    const failed = arm({ STUB_OUTPUT_RC: '1' }, VALUES);
    expect(failed.status).toBe(1);
    expect(failed.report).toContain('stub output failure');
    expect(values('production')).toBe(VALUES);
    const garbled = arm({ STUB_STAGING_IP: 'not-an-address' }, VALUES);
    expect(garbled.status).toBe(1);
    expect(garbled.report).toMatch(/did not read back as an IPv4 address/);
    expect(values('production')).toBe(VALUES);
    expect(callLog()).not.toMatch(/^apply /m);
  });

  it('applies a corrected address when the gate is already on, the address being the one change', () => {
    // Defect caught: a stale address on an armed alarm reported as nothing to do
    // or refused as "other changes pending", so the alarm stays held in ALARM.
    trail('footbag-production-source-profile', [{ ip: '198.51.100.10' }]);
    trail('footbag-staging-source-profile', [{ ip: '192.0.2.20' }]);
    const armed = `${VALUES}enable_host_key_alarm      = true\nstaging_web_static_ip      = "192.0.2.99"\n`;
    const r = arm({ STUB_STATE_ADDRESS: '192.0.2.99' }, armed);
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toContain('Only staging_web_static_ip is pending');
    expect(callLog()).toMatch(/^apply --target production$/m);
  });

  it('treats a failed trail read as an error carrying AWS\'s message', () => {
    const r = arm({ STUB_AWS_RC: '255' });
    expect(r.status).toBe(1);
    expect(r.report).toContain('stub denied');
    expect(callLog()).not.toMatch(/^apply /m);
  });

  it('is a production gate only, because the trail lives in production', () => {
    const r = run(['--target', 'staging', '--gate', 'enable_host_key_alarm', '--state', 'on', '--yes']);
    expect(r.status).toBe(2);
    expect(r.report).toContain('not declared in terraform/staging');
  });
});

describe('set-terraform-gate.sh sets the legacy-mirror backup gate on, and never off', () => {
  const GATE = 'enable_legacy_mirror_backup';

  it('turns it on with no metric to look for, applies it and proves it', () => {
    // Defect caught: the backup bucket's gate on the allowlist but refused at
    // arming time for want of a metric check, so the bucket is created by a
    // hand-typed values edit instead.
    const r = run(['--target', 'production', '--gate', GATE, '--state', 'on', '--yes']);
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toContain(`metric check: none for ${GATE}`);
    expect(callLog()).not.toMatch(/^aws /m);
    expect(values('production')).toMatch(new RegExp(`^${GATE} = true$`, 'm'));
    expect(callLog()).toMatch(/^apply --target production$/m);
    expect(r.report).toMatch(new RegExp(`Proven:\\n {2}- ${GATE} = true on production: applied`));
  });

  it('refuses it off before any plan or write, because its bucket cannot be destroyed', () => {
    // Defect caught: an off run whose apply fails on prevent_destroy after the
    // values file was written, leaving the file saying off while the bucket
    // stands, so every later apply of the tree tries to destroy it again.
    const content = `${VALUES}${GATE} = true\n`;
    writeFileSync(join(dir, 'private', 'production.tfvars'), content, 'utf-8');
    const r = run(['--target', 'production', '--gate', GATE, '--state', 'off', '--yes']);
    expect(r.status).toBe(2);
    expect(r.report).toContain('prevent_destroy');
    expect(values('production')).toBe(content);
    expect(callLog()).not.toMatch(/^terraform plan /m);
    expect(callLog()).not.toMatch(/^apply /m);
  });
});
