/**
 * scripts/production-cutover.sh, stage archive-base: the archive base stack's
 * three values written together into an environment's values file, applied,
 * the signing key stored, and the edge verified.
 *
 * The script runs from a scratch copy of the repository layout: its own lib
 * folder, each environment's real Terraform declarations, and a values file
 * reached through a symlink into a separate "private" folder, the way an
 * operator machine holds it. Terraform, the apply wrapper, the key script and
 * the edge check are stand-ins behind the script's named seams, so each verdict
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
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';

import { createScratchDir, removeScratch } from '../fixtures/scratchDir';
import { SPAWN_GUARD } from '../fixtures/spawnGuard';

let dir: string;
let repo: string;
let calls: string;
let keyDir: string;

/** The stand-in for terraform. `output -raw platform_url` answers
 *  STUB_PLATFORM_URL. A plan exits STUB_CURRENT_PLAN_RC when it carries no -var
 *  override and STUB_VAR_PLAN_RC when it does, 0 by default, and prints a Plan
 *  line when it would exit 2. Once an apply has been logged, a plain plan exits
 *  STUB_AFTER_APPLY_PLAN_RC (0 by default). A plan with -out writes a saved-plan
 *  marker there and exits STUB_SAVED_PLAN_RC (2 by default); a -var-file is
 *  copied beside the call log for the test to read; and show -json prints the
 *  file STUB_PLAN_JSON names, the JSON plan representation Terraform documents. */
const TERRAFORM_STUB = `#!/usr/bin/env bash
shift
case "$1" in
  output)
    echo "terraform output" >> "$STUB_CALLS"
    [[ -n "\${STUB_OUTPUT_RC:-}" ]] && exit "$STUB_OUTPUT_RC"
    printf '%s' "$STUB_PLATFORM_URL"
    ;;
  show)
    echo "terraform show $2" >> "$STUB_CALLS"
    cat "$STUB_PLAN_JSON"
    ;;
  plan)
    out=""
    for a in "$@"; do
      case "$a" in
        -out=*) out="\${a#-out=}" ;;
        -var-file=*) cp "\${a#-var-file=}" "$STUB_CALLS.varfile"; echo "terraform var-file" >> "$STUB_CALLS" ;;
      esac
    done
    if [[ -n "$out" ]]; then
      echo "terraform plan-saved" >> "$STUB_CALLS"
      echo "plan-dir-mode $(stat -c %a "$(dirname "$out")")" >> "$STUB_CALLS"
      echo "saved plan" > "$out"
      rc="\${STUB_SAVED_PLAN_RC:-2}"
    elif grep -q '^apply ' "$STUB_CALLS"; then
      echo "terraform plan-after-apply" >> "$STUB_CALLS"
      rc="\${STUB_AFTER_APPLY_PLAN_RC:-0}"
    elif [[ " $* " == *" -var "* ]]; then
      vars="" prev=""
      for a in "$@"; do
        [[ "$prev" == -var ]] && vars="$vars [\${a//$'\\n'/|}]"
        prev="$a"
      done
      echo "terraform plan-with-vars$vars" >> "$STUB_CALLS"
      rc="\${STUB_VAR_PLAN_RC:-0}"
    else
      echo "terraform plan" >> "$STUB_CALLS"
      rc="\${STUB_CURRENT_PLAN_RC:-0}"
    fi
    if [[ "$rc" == 2 ]]; then echo "Plan: 3 to add, 0 to change, 0 to destroy."; else echo "No changes."; fi
    exit "$rc"
    ;;
esac
`;

/** The stand-in for scripts/terraform-apply.sh: records its arguments and any
 *  file under the run's temp directory holding the operator address, looked
 *  for while the run is alive, and exits STUB_APPLY_RC. */
const APPLY_STUB = `#!/usr/bin/env bash
echo "apply $*" >> "$STUB_CALLS"
grep -rlF -- "$STUB_SENSITIVE" "$TMPDIR" | sed 's/^/leak /' >> "$STUB_CALLS"
exit "\${STUB_APPLY_RC:-0}"
`;

/** The stand-in for provision-archive-signing-key.sh, the actions this stage
 *  uses. generate writes the key files into --key-dir; tfvars prints what the
 *  real script prints, comments included; store marks the key stored; status
 *  reports a match only once it is. */
const KEY_STUB = `#!/usr/bin/env bash
target="" keydir="" action=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --target) target="$2"; shift 2 ;;
    --key-dir) keydir="$2"; shift 2 ;;
    *) action="$1"; shift ;;
  esac
done
echo "key $action $target" >> "$STUB_CALLS"
case "$action" in
  generate)
    printf 'stub-private\\n' > "$keydir/archive-signing-key-$target.pem"
    ;;
  tfvars)
    echo "# Paste into terraform/$target/terraform.tfvars (or redirect this"
    echo "# action's output), replacing any existing assignment:"
    echo 'archive_signing_public_key = <<-EOT'
    printf '%s\\n' "-----BEGIN PUBLIC KEY-----" "$STUB_KEY_BODY" "-----END PUBLIC KEY-----" | sed 's/^/  /'
    echo '  EOT'
    ;;
  store)
    exit "\${STUB_STORE_RC:-0}"
    ;;
  status)
    if [[ -n "\${STUB_NEVER_MATCH:-}" ]]; then
      echo "  match:             NO - the stored key differs from the local one"
    elif grep -q "^key store $target\\$" "$STUB_CALLS" || [[ -n "\${STUB_ALREADY_STORED:-}" ]]; then
      echo "  match:             yes (stored key is the local key)"
    else
      echo "  match:             NO - the stored key differs from the local one"
    fi
    ;;
esac
`;

/** The stand-in for scripts/verify-archive-edge.sh: records it ran and exits
 *  STUB_VERIFY_RC. */
const VERIFY_STUB = `#!/usr/bin/env bash
echo "verify $*" >> "$STUB_CALLS"
exit "\${STUB_VERIFY_RC:-0}"
`;

/** The stand-in for dig: answers a reverse lookup of the first legacy address
 *  with a name and the rest with nothing, and exits STUB_DIG_RC. */
const DIG_STUB = `#!/usr/bin/env bash
echo "dig $*" >> "$STUB_CALLS"
[[ -n "\${STUB_DIG_RC:-}" ]] && { echo "connection timed out"; exit "$STUB_DIG_RC"; }
[[ "$*" == *"74.50.54.203"* ]] && echo "rimu3.footbag.org."
exit 0
`;

const PLATFORM_URL = 'https://placeholder.cloudfront.net';
const KEY_BODY = 'STUB-PUBLIC-KEY-BODY-NOT-A-KEY';
/** An operator address of the kind the real values file carries, from the
 *  documentation range, beside the archive lines so that any diff context or
 *  temp copy would carry it. */
const SENSITIVE = '203.0.113.77/32';
const SENSITIVE_LINE = `operator_cidrs               = ["${SENSITIVE}"]`;

const FALSE_VALUES = [
  'environment                  = "production"',
  SENSITIVE_LINE,
  'enable_archive               = false',
  'enable_archive_custom_domain = false',
  '# Pin this to the distribution\'s own address in the same change.',
  '# archive_signing_public_key = <<-EOT',
  '#   (paste here)',
  '#   EOT',
  'enable_billing_alarm         = true',
  '',
].join('\n');

/** The heredoc the key stand-in prints, without its comment lines. */
const KEY_BLOCK = [
  'archive_signing_public_key = <<-EOT',
  '  -----BEGIN PUBLIC KEY-----',
  `  ${KEY_BODY}`,
  '  -----END PUBLIC KEY-----',
  '  EOT',
].join('\n');

const SET_VALUES = [
  'environment                  = "production"',
  SENSITIVE_LINE,
  'enable_archive = true',
  `archive_platform_url = "${PLATFORM_URL}"`,
  KEY_BLOCK,
  'enable_archive_custom_domain = false',
  'enable_billing_alarm         = true',
  '',
].join('\n');

beforeEach(() => {
  dir = createScratchDir('production-cutover');
  repo = join(dir, 'repo');
  mkdirSync(join(repo, 'scripts'), { recursive: true });
  cpSync(join(process.cwd(), 'scripts/production-cutover.sh'), join(repo, 'scripts/production-cutover.sh'));
  cpSync(join(process.cwd(), 'scripts/lib'), join(repo, 'scripts/lib'), { recursive: true });
  mkdirSync(join(dir, 'private'));
  mkdirSync(join(dir, 'tmp'));
  keyDir = join(dir, 'keys');
  mkdirSync(keyDir);
  for (const target of ['staging', 'production']) {
    const src = join(process.cwd(), 'terraform', target);
    const dst = join(repo, 'terraform', target);
    mkdirSync(dst, { recursive: true });
    for (const f of readdirSync(src).filter((n) => n.endsWith('.tf'))) {
      cpSync(join(src, f), join(dst, f));
    }
    writeFileSync(join(dir, 'private', `${target}.tfvars`), FALSE_VALUES, 'utf-8');
    symlinkSync(`../../../private/${target}.tfvars`, join(dst, 'terraform.tfvars'));
  }
  writeFileSync(join(dir, 'terraform'), TERRAFORM_STUB, { mode: 0o755 });
  writeFileSync(join(dir, 'apply.sh'), APPLY_STUB, { mode: 0o755 });
  writeFileSync(join(dir, 'key.sh'), KEY_STUB, { mode: 0o755 });
  writeFileSync(join(dir, 'verify.sh'), VERIFY_STUB, { mode: 0o755 });
  writeFileSync(join(dir, 'dig'), DIG_STUB, { mode: 0o755 });
  calls = join(dir, 'calls.log');
  writeFileSync(calls, '', 'utf-8');
});

afterEach(() => {
  removeScratch(dir);
});

function values(target = 'production'): string {
  return readFileSync(join(dir, 'private', `${target}.tfvars`), 'utf-8');
}

function setValues(content: string, target = 'production'): void {
  writeFileSync(join(dir, 'private', `${target}.tfvars`), content, 'utf-8');
}

function haveKey(target = 'production'): void {
  writeFileSync(join(keyDir, `archive-signing-key-${target}.pem`), 'stub-private\n', 'utf-8');
}

function callLog(): string {
  return readFileSync(calls, 'utf-8');
}

function run(args: string[], env: Record<string, string> = {}) {
  const r = spawnSync('bash', [join(repo, 'scripts/production-cutover.sh'), ...args], {
    cwd: dir,
    encoding: 'utf-8',
    env: {
      ...process.env,
      FOOTBAG_CR_REPORT_TO: '',
      PRODUCTION_CUTOVER_TERRAFORM_BIN: join(dir, 'terraform'),
      PRODUCTION_CUTOVER_APPLY_CMD: join(dir, 'apply.sh'),
      PRODUCTION_CUTOVER_KEY_CMD: join(dir, 'key.sh'),
      PRODUCTION_CUTOVER_VERIFY_CMD: join(dir, 'verify.sh'),
      PRODUCTION_CUTOVER_KEY_DIR: keyDir,
      STUB_CALLS: calls,
      STUB_PLATFORM_URL: PLATFORM_URL,
      STUB_KEY_BODY: KEY_BODY,
      STUB_SENSITIVE: SENSITIVE,
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

const PROD = ['--target', 'production', '--stage', 'archive-base'];

describe('production-cutover.sh argument guards, each beside a run it lets through', () => {
  // Defect caught: a stage run with no stage, a misspelt one or the wrong
  // environment would otherwise reach an environment's values file.
  it('refuses a missing or unknown stage and an unknown target before reading anything', () => {
    for (const args of [
      ['--target', 'production'],
      ['--target', 'production', '--stage', 'archive'],
      ['--target', 'development', '--stage', 'archive-base'],
    ]) {
      const r = run([...args, '--dry-run']);
      expect(r.status, args.join(' ')).toBe(2);
      expect(callLog(), args.join(' ')).toBe('');
    }
    const ok = run([...PROD, '--dry-run']);
    expect(ok.status, ok.stderr).toBe(0);
    expect(values()).toBe(FALSE_VALUES);
  });

  // Defect caught: a run on a machine without the private checkout would
  // invent a values file and apply production from it.
  it('refuses a values file that is a symlink pointing at nothing', () => {
    rmSync(join(dir, 'private', 'production.tfvars'));
    const r = run([...PROD, '--yes']);
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/points at nothing/);
    expect(existsSync(join(dir, 'private', 'production.tfvars'))).toBe(false);
    expect(callLog()).not.toMatch(/^apply /m);
  });

  // Defect caught: past pass 1 the archive's address is the preview's, and
  // pinning a non-CloudFront platform address would bake it into the gate pages.
  it('refuses a platform_url that is not a cloudfront.net address, with the file unchanged', () => {
    for (const url of [
      'https://preview.footbag.org',
      'https://placeholder.cloudfront.net.evil.example',
      'https://placeholder.cloudfront.net/path',
      'http://placeholder.cloudfront.net',
    ]) {
      const r = run([...PROD, '--yes'], { STUB_PLATFORM_URL: url });
      expect(r.status, url).not.toBe(0);
      expect(r.stderr, url).toMatch(/not the distribution's own/);
      expect(values(), url).toBe(FALSE_VALUES);
      expect(callLog(), url).not.toMatch(/^apply /m);
    }
  });
});

describe('production-cutover.sh archive-base: the write and the apply', () => {
  // Defect caught: other pending changes would ride along on an apply the
  // operator ran to turn the archive on.
  it('refuses a tree with other changes pending before anything is generated or written', () => {
    const r = run([...PROD, '--yes'], { STUB_CURRENT_PLAN_RC: '2' });
    expect(r.status).not.toBe(0);
    expect(r.report).toMatch(/other changes are pending/);
    expect(values()).toBe(FALSE_VALUES);
    expect(callLog()).not.toMatch(/^key generate /m);
    expect(callLog()).not.toMatch(/^apply /m);
  });

  // Defect caught: a write with no one to confirm it would turn a one-way
  // switch on unattended.
  it('writes nothing and applies nothing without a terminal to confirm on', () => {
    haveKey();
    const r = run(PROD);
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/no terminal to confirm on/);
    expect(values()).toBe(FALSE_VALUES);
    expect(callLog()).not.toMatch(/^apply /m);
  });

  // Defect caught: the values written must be exactly the three settings, the
  // key as the key script printed it, with every other line kept and the
  // operator address never shown or copied.
  it('writes exactly the three settings, applies, stores the key and verifies the edge', () => {
    haveKey();
    const r = run([...PROD, '--yes']);
    expect(r.status, r.stderr).toBe(0);
    const written = values();
    expect(written).toContain('enable_archive = true');
    expect(written).toContain(`archive_platform_url = "${PLATFORM_URL}"`);
    expect(written).toContain(KEY_BLOCK);
    expect(written).not.toMatch(/^enable_archive\s+= false/m);
    // Every other line, the commented placeholder included, is kept.
    const others = (s: string) =>
      s.split('\n').filter((l) => !/^(enable_archive|archive_platform_url|archive_signing_public_key)\s*=/.test(l)
        && !/^ {2}(-----|STUB-|EOT)/.test(l));
    expect(others(written)).toEqual(others(FALSE_VALUES));
    const log = callLog();
    // The plan made before the write validates the very values written.
    const varPlan = log.split('\n').find((l) => l.startsWith('terraform plan-with-vars')) ?? '';
    expect(varPlan).toContain('[enable_archive=true]');
    expect(varPlan).toContain(`[archive_platform_url=${PLATFORM_URL}]`);
    expect(varPlan).toContain(`[archive_signing_public_key=-----BEGIN PUBLIC KEY-----|${KEY_BODY}|-----END PUBLIC KEY-----]`);
    expect(log).toMatch(/^apply --target production$/m);
    expect(log).toMatch(/^key store production$/m);
    expect(log).toMatch(/^verify --target production$/m);
    expect(log).not.toMatch(/^leak /m);
    expect(`${r.stdout}${r.stderr}`).not.toContain(SENSITIVE);
    expect(r.report).toMatch(/archive base stack applied to production/);
    expect(r.report).toMatch(/production archive edge/);
  });

  // Defect caught: a first bring-up on a machine with no key would write an
  // empty key; one with a key must never replace it.
  it('generates the signing key only when this environment has none', () => {
    const fresh = run([...PROD, '--yes']);
    expect(fresh.status, fresh.stderr).toBe(0);
    expect(callLog()).toMatch(/^key generate production$/m);
    expect(values()).toContain(KEY_BLOCK);

    writeFileSync(calls, '', 'utf-8');
    setValues(FALSE_VALUES);
    const again = run([...PROD, '--yes']);
    expect(again.status, again.stderr).toBe(0);
    expect(callLog()).not.toMatch(/^key generate /m);
  });

  // Defect caught: a staging run must read and write staging's own file and
  // key, never production's.
  it('on staging, changes only the staging values file and uses staging\'s key', () => {
    haveKey('staging');
    const r = run(['--target', 'staging', '--stage', 'archive-base', '--yes']);
    expect(r.status, r.stderr).toBe(0);
    expect(values('staging')).toContain('enable_archive = true');
    expect(values('production')).toBe(FALSE_VALUES);
    const log = callLog();
    expect(log).toMatch(/^apply --target staging$/m);
    expect(log).toMatch(/^key store staging$/m);
    expect(log).not.toMatch(/^key generate /m);
    expect(log).not.toMatch(/production/);
  });

  // Defect caught: a file already holding duplicate or stale archive lines
  // would keep a stale one below the new value, and terraform reads the last.
  it('collapses duplicate and stale archive lines into one of each', () => {
    haveKey();
    setValues([
      'environment                  = "production"',
      SENSITIVE_LINE,
      'enable_archive               = false',
      'archive_platform_url         = "https://www.footbag.org"',
      'enable_billing_alarm         = true',
      'enable_archive               = false',
      '',
    ].join('\n'));
    const r = run([...PROD, '--yes']);
    expect(r.status, r.stderr).toBe(0);
    const written = values();
    expect(written.match(/^enable_archive\s*=/gm)).toHaveLength(1);
    expect(written.match(/^archive_platform_url\s*=/gm)).toHaveLength(1);
    expect(written).toContain(`archive_platform_url = "${PLATFORM_URL}"`);
    expect(written).not.toContain('www.footbag.org');
  });

  // Defect caught: an apply that failed must stop the run before the key is
  // stored or the edge is reported checked.
  it('stops after a failed apply, storing nothing and verifying nothing', () => {
    haveKey();
    const r = run([...PROD, '--yes'], { STUB_APPLY_RC: '1' });
    expect(r.status).not.toBe(0);
    expect(r.report).toMatch(/the apply failed/);
    expect(callLog()).not.toMatch(/^key store /m);
    expect(callLog()).not.toMatch(/^verify /m);
  });

  // Defect caught: a store that failed, or one whose stored key does not
  // match, would leave the edge unable to sign while the run reports success.
  it('stops when the key store fails or the stored key does not match', () => {
    haveKey();
    const failed = run([...PROD, '--yes'], { STUB_STORE_RC: '1' });
    expect(failed.status).not.toBe(0);
    expect(failed.report).toMatch(/private key is not stored/);
    expect(callLog()).not.toMatch(/^verify /m);

    writeFileSync(calls, '', 'utf-8');
    setValues(FALSE_VALUES);
    const unmatched = run([...PROD, '--yes'], { STUB_NEVER_MATCH: '1' });
    expect(unmatched.status).not.toBe(0);
    expect(unmatched.report).toMatch(/stored key is unconfirmed/);
    expect(callLog()).not.toMatch(/^verify /m);
  });

  // Defect caught: a values change Terraform rejects at plan time would leave
  // the file holding values that cannot be applied.
  it('leaves the file as it was when the plan with the new values fails', () => {
    haveKey();
    const r = run([...PROD, '--yes'], { STUB_VAR_PLAN_RC: '1' });
    expect(r.status).not.toBe(0);
    expect(values()).toBe(FALSE_VALUES);
    expect(callLog()).not.toMatch(/^apply /m);
  });
});

describe('production-cutover.sh archive-base: re-runs', () => {
  // Defect caught: a second run of a finished stage would apply or store again
  // instead of only proving what is served.
  it('skips the write, the apply and the store when all of it already holds, and still verifies', () => {
    haveKey();
    setValues(SET_VALUES);
    const r = run([...PROD, '--yes'], { STUB_ALREADY_STORED: '1' });
    expect(r.status, r.stderr).toBe(0);
    expect(values()).toBe(SET_VALUES);
    const log = callLog();
    expect(log).not.toMatch(/^apply /m);
    expect(log).not.toMatch(/^key store /m);
    expect(log).toMatch(/^verify --target production$/m);
  });

  // Defect caught: a run interrupted between the write and the apply would be
  // stuck, refused as "other changes pending" by its own unapplied archive.
  it('resumes at the apply when the archive stack is the only thing pending', () => {
    haveKey();
    setValues(SET_VALUES);
    const r = run([...PROD, '--yes'], { STUB_CURRENT_PLAN_RC: '2', STUB_VAR_PLAN_RC: '0' });
    expect(r.status, r.stderr).toBe(0);
    expect(values()).toBe(SET_VALUES);
    // The test of "only the archive" is a plan with the archive off.
    expect(callLog()).toMatch(/^terraform plan-with-vars \[enable_archive=false\]$/m);
    expect(callLog()).toMatch(/^apply --target production$/m);
  });

  // Defect caught: a file holding the flag on with a stale address or another
  // key would be taken as done, and the edge would carry the wrong values.
  it('rewrites a stale address or key rather than taking the stage as done', () => {
    haveKey();
    for (const stale of [
      SET_VALUES.replace(PLATFORM_URL, 'https://d1234abcdef8.cloudfront.net'),
      SET_VALUES.replace(KEY_BODY, 'STUB-OLD-PUBLIC-KEY-BODY-NOT-A-KEY'),
    ]) {
      writeFileSync(calls, '', 'utf-8');
      setValues(stale);
      const r = run([...PROD, '--yes'], { STUB_ALREADY_STORED: '1' });
      expect(r.status, r.stderr).toBe(0);
      expect(values()).toContain(`archive_platform_url = "${PLATFORM_URL}"`);
      expect(values()).toContain(KEY_BLOCK);
      expect(callLog()).toMatch(/^apply --target production$/m);
    }
  });

  // Defect caught: the resume path must not carry another change in with the
  // archive.
  it('refuses a re-run when something besides the archive stack is pending', () => {
    haveKey();
    setValues(SET_VALUES);
    const r = run([...PROD, '--yes'], { STUB_CURRENT_PLAN_RC: '2', STUB_VAR_PLAN_RC: '2' });
    expect(r.status).not.toBe(0);
    expect(r.report).toMatch(/other changes are pending/);
    expect(callLog()).not.toMatch(/^apply /m);
  });

  // Defect caught: on a machine without the key the file's key and the edge
  // cannot be checked, so the run must stop rather than report success.
  it('refuses when the archive is already on but this machine has no signing key', () => {
    setValues(SET_VALUES);
    const r = run([...PROD, '--yes']);
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/has no .*archive-signing-key-production\.pem/);
    expect(callLog()).not.toMatch(/^apply /m);
    expect(callLog()).not.toMatch(/^verify /m);
  });

  // Defect caught: an edge that does not pass must not be reported as proved.
  it('fails the run when the edge check fails', () => {
    haveKey();
    setValues(SET_VALUES);
    const r = run([...PROD, '--yes'], { STUB_ALREADY_STORED: '1', STUB_VERIFY_RC: '1' });
    expect(r.status).not.toBe(0);
    expect(r.report).toMatch(/verify-archive-edge\.sh --target production did not pass/);
  });
});

// ── STAGE launch ─────────────────────────────────────────────────────────────

const LAUNCH = ['--target', 'production', '--stage', 'launch'];

/** The production values file in the launch window: the apex already on the
 *  platform, the mail apply on, the ifpa mail records already moved into the
 *  Workspace maps, and the notice, the preview and the mirror still up. */
const WINDOW_VALUES = [
  'environment                  = "production"',
  SENSITIVE_LINE,
  'enable_legacy_mirror_records = true',
  'legacy_mirror_mx_records = {',
  '  "rimu"  = ["10 rimu.llic.net."]',
  '  "rimu3" = ["10 rimu3.llic.net."]',
  '}',
  '',
  'legacy_mirror_txt_records = {',
  '  "rimu3" = ["v=spf1 a mx ip4:192.0.2.10 a:google.com ~all"]',
  '}',
  '',
  '# The Google Workspace tenant\'s own names.',
  'workspace_mx_records = {',
  '  "g" = [',
  '    "10 ASPMX.L.GOOGLE.COM.",',
  '    "20 ALT1.ASPMX.L.GOOGLE.COM.",',
  '  ]',
  '  "my" = [',
  '    "10 ASPMX.L.GOOGLE.COM.",',
  '  ]',
  '  "ifpa" = ["1 smtp.google.com."]',
  '}',
  '',
  'workspace_txt_records = {',
  '  "my"   = ["v=spf1 include:_spf.google.com ~all"]',
  '  "ifpa" = ["v=spf1 include:_spf.google.com ~all"]',
  '}',
  '',
  'workspace_cname_records = {',
  '  "www.my" = "ghs.google.com."',
  '}',
  '',
  'enable_platform_custom_domain = true',
  'enable_preview_record         = true',
  'enable_apex_alias_records     = true',
  'enable_cutover_notice         = true',
  'ses_enable_mail_records     = true',
  'enable_cutover_login_alarm  = true',
  '',
].join('\n');

/** The same file after the launch write, written out by hand: the three flags
 *  false where they stood, the g entry gone, every other line as it was. */
const LAUNCHED_VALUES = [
  'environment                  = "production"',
  SENSITIVE_LINE,
  'enable_legacy_mirror_records = false',
  'legacy_mirror_mx_records = {',
  '  "rimu"  = ["10 rimu.llic.net."]',
  '  "rimu3" = ["10 rimu3.llic.net."]',
  '}',
  '',
  'legacy_mirror_txt_records = {',
  '  "rimu3" = ["v=spf1 a mx ip4:192.0.2.10 a:google.com ~all"]',
  '}',
  '',
  '# The Google Workspace tenant\'s own names.',
  'workspace_mx_records = {',
  '  "my" = [',
  '    "10 ASPMX.L.GOOGLE.COM.",',
  '  ]',
  '  "ifpa" = ["1 smtp.google.com."]',
  '}',
  '',
  'workspace_txt_records = {',
  '  "my"   = ["v=spf1 include:_spf.google.com ~all"]',
  '  "ifpa" = ["v=spf1 include:_spf.google.com ~all"]',
  '}',
  '',
  'workspace_cname_records = {',
  '  "www.my" = "ghs.google.com."',
  '}',
  '',
  'enable_platform_custom_domain = true',
  'enable_preview_record = false',
  'enable_apex_alias_records     = true',
  'enable_cutover_notice = false',
  'ses_enable_mail_records     = true',
  'enable_cutover_login_alarm  = true',
  '',
].join('\n');

/** The cutover log's T-0 section, every row the launch waits on recorded as
 *  passed, plus a launch section below it. */
const LOG_ROWS: Record<string, string> = {
  'Mail apply': 'applied',
  '`scripts/verify-mail-records.sh --stage mail-day` passes': 'pass',
  'Outside tests, incl. `brat@` and `dleberknight@` two-way': 'pass',
  '`admin@` receive-and-reply test': 'pass: three readers confirmed, reply received',
  'Certificate-address bounce test': 'pass: all five bounced',
  'Bounce domain healthy (`scripts/verify-prod-email.sh`)': '',
  'Alarm subscriptions confirmed (root mailbox and `ops-alert@`)': 'pass',
  'Test alarm (`scripts/send-test-alarm.sh`) received by all three watchers': 'Passed',
};

function cutoverLog(rows: Record<string, string> = LOG_ROWS, launchSection = ''): string {
  return [
    '# Cutover log',
    '',
    '## 4. Step timings',
    '',
    '### 4b. T-0: the alias flip, then the mail apply',
    '',
    '| Reading | Value | When measured | Notes |',
    '|---|---|---|---|',
    ...Object.entries(rows).map(([k, v]) => `| ${k} | ${v} | | |`),
    '',
    '### 4c. Launch: the launch apply',
    '',
    '| Reading | Value | When measured | Notes |',
    '|---|---|---|---|',
    launchSection,
    '',
  ].join('\n');
}

/** A fresh zone capture as scripts/capture-legacy-zone.sh saves it: dig's
 *  transfer output, tab-separated, opening and closing with the zone's SOA. The
 *  layout is that of the newest committed capture in the private operations
 *  checkout; the names are a subset of it and the addresses are
 *  documentation-range stand-ins. */
const CAPTURE_LINES = [
  '; <<>> DiG 9.18.28 <<>> axfr footbag.org @ns1.example.',
  'footbag.org.\t\t86400\tIN\tSOA\tns1.example. hostmaster.example. 2026111401 86400 7200 2419200 3600',
  'footbag.org.\t\t86400\tIN\tA\t192.0.2.1',
  'fi.footbag.org.\t86400\tIN\tCNAME\tfootbag.org.',
  'g.footbag.org.\t\t86400\tIN\tMX\t10 ASPMX.L.GOOGLE.COM.',
  'ifpa.footbag.org.\t86400\tIN\tA\t192.0.2.10',
  'ifpa.footbag.org.\t86400\tIN\tMX\t10 rimu3.footbag.org.',
  'list.footbag.org.\t86400\tIN\tCNAME\trimu3.footbag.org.',
  'my.footbag.org.\t\t86400\tIN\tMX\t10 ASPMX.L.GOOGLE.COM.',
  'rimu.footbag.org.\t86400\tIN\tA\t192.0.2.11',
  'rimu3.footbag.org.\t86400\tIN\tA\t192.0.2.12',
  'www.footbag.org.\t86400\tIN\tCNAME\tfootbag.org.',
  'footbag.org.\t\t86400\tIN\tSOA\tns1.example. hostmaster.example. 2026111401 86400 7200 2419200 3600',
  ';; XFR size: 13 records (messages 1, bytes 512)',
];
const CAPTURE = `${CAPTURE_LINES.join('\n')}\n`;

const MUST_GO = [
  'aws_route53_record.legacy_mirror_a["ifpa"]',
  'aws_route53_record.legacy_mirror_mx["rimu"]',
  'aws_route53_record.legacy_mirror_mx["rimu3"]',
  'aws_route53_record.legacy_mirror_txt["rimu3"]',
  'aws_route53_record.legacy_mirror_a["rimu3"]',
  'aws_route53_record.legacy_mirror_cname["list"]',
  'aws_route53_record.preview_a[0]',
  'aws_route53_record.preview_aaaa[0]',
  'aws_route53_record.workspace_mx["g"]',
];
const STAYS = [
  'aws_route53_record.workspace_mx["my"]',
  'aws_route53_record.workspace_mx["ifpa"]',
  'aws_route53_record.workspace_txt["ifpa"]',
  'aws_route53_record.apex_a[0]',
];
const ALARMS = [
  'aws_route53_health_check.site_ready[0]',
  'aws_cloudwatch_metric_alarm.site_unavailable[0]',
  'aws_cloudwatch_metric_alarm.cloudfront_5xx[0]',
];
const ZERO_LOGINS = 'aws_cloudwatch_metric_alarm.cutover_zero_logins[0]';

interface PlanShape {
  prior?: string[] | null;
  deletes?: string[];
  creates?: string[];
  updates?: string[];
  other?: Array<[string, string[]]>;
}

/** A plan in Terraform's documented JSON plan representation, holding only the
 *  fields the stage reads: each resource change's address, mode and actions,
 *  and the prior state's managed resources. By default, exactly the launch
 *  with the zero-logins watch armed. */
function planJson(shape: PlanShape = {}): string {
  const prior = shape.prior === undefined ? [...MUST_GO, ...STAYS] : shape.prior;
  const deletes = shape.deletes ?? MUST_GO;
  const creates = shape.creates ?? [...ALARMS, ZERO_LOGINS];
  const updates = shape.updates ?? ['aws_cloudfront_function.apex_redirect[0]'];
  const change = (address: string, actions: string[]) => ({ address, mode: 'managed', change: { actions } });
  return JSON.stringify({
    format_version: '1.2',
    resource_changes: [
      ...deletes.map((a) => change(a, ['delete'])),
      ...creates.map((a) => change(a, ['create'])),
      ...updates.map((a) => change(a, ['update'])),
      ...STAYS.map((a) => change(a, ['no-op'])),
      ...(shape.other ?? []).map(([a, x]) => change(a, x)),
      { address: 'data.aws_caller_identity.current', mode: 'data', change: { actions: ['read'] } },
    ],
    prior_state:
      prior === null
        ? null
        : {
            values: {
              root_module: {
                resources: [
                  ...prior.map((address) => ({ address, mode: 'managed', type: 'aws_route53_record' })),
                  { address: 'data.aws_caller_identity.current', mode: 'data' },
                ],
              },
            },
          },
  });
}

function launchSetup(
  opts: { values?: string; log?: string | null; plan?: PlanShape; capture?: string } = {},
): void {
  setValues(opts.values ?? WINDOW_VALUES);
  if (opts.log !== null) writeFileSync(join(dir, 'CUTOVER_LOG.md'), opts.log ?? cutoverLog(), 'utf-8');
  writeFileSync(join(dir, 'plan.json'), planJson(opts.plan), 'utf-8');
  writeFileSync(join(dir, 'capture.zone'), opts.capture ?? CAPTURE, 'utf-8');
}

/** Runs the script with the launch seams, passing the fresh capture unless the
 *  case is about its absence. */
function runLaunch(args: string[], env: Record<string, string> = {}, opts: { noCapture?: boolean } = {}) {
  const withCapture = opts.noCapture ? args : [...args, '--capture', join(dir, 'capture.zone')];
  return run(withCapture, {
    PRODUCTION_CUTOVER_DIG_BIN: join(dir, 'dig'),
    PRODUCTION_CUTOVER_LOG: join(dir, 'CUTOVER_LOG.md'),
    STUB_PLAN_JSON: join(dir, 'plan.json'),
    ...env,
  });
}

function varFile(): string {
  return readFileSync(`${calls}.varfile`, 'utf-8');
}

describe('production-cutover.sh launch: where and when it may run, each beside a run it lets through', () => {
  // Defect caught: the launch stage run against staging would edit staging's
  // values file for a window staging never has.
  it('refuses any target but production before reading anything', () => {
    launchSetup();
    const r = runLaunch(['--target', 'staging', '--stage', 'launch', '--yes']);
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/production only/);
    expect(callLog()).toBe('');
    const ok = runLaunch([...LAUNCH, '--yes']);
    expect(ok.status, ok.stderr).toBe(0);
  });

  // Defect caught: a launch with no fresh zone capture would decide the
  // removal set with nothing taken from the zone just before it, and a
  // capture handed to another stage would be silently ignored.
  it('requires the fresh capture for launch and refuses it for any other stage', () => {
    launchSetup();
    const none = runLaunch([...LAUNCH, '--yes'], {}, { noCapture: true });
    expect(none.status).toBe(2);
    expect(none.stderr).toMatch(/needs --capture/);
    const other = runLaunch([...PROD, '--yes']);
    expect(other.status).toBe(2);
    expect(other.stderr).toMatch(/--capture is the launch stage's/);
    expect(callLog()).toBe('');
    expect(values()).toBe(WINDOW_VALUES);
  });

  // Defect caught: a truncated or refused transfer read as the zone, so every
  // name it lost would look deliberately absent.
  it('refuses a capture that is not a complete transfer, before anything is planned', () => {
    for (const [name, content] of [
      ['no closing SOA', `${CAPTURE_LINES.slice(0, -2).join('\n')}\n`],
      ['no opening SOA', `${CAPTURE_LINES.filter((_, i) => i !== 1).join('\n')}\n`],
      ['empty', ''],
    ] as Array<[string, string]>) {
      launchSetup({ capture: content });
      writeFileSync(calls, '', 'utf-8');
      const r = runLaunch([...LAUNCH, '--yes']);
      expect(r.status, name).not.toBe(0);
      expect(r.stderr, name).toMatch(/not a complete transfer/);
      expect(values(), name).toBe(WINDOW_VALUES);
      expect(callLog(), name).not.toMatch(/^terraform plan/m);
    }
  });

  // Defect caught: a launch outside the window would lift the notice before the
  // apex points at the platform, or remove the mirror while the apex mail
  // records still depend on it, or delete the ifpa list domain's mail.
  it('refuses outside the launch window, with the file unchanged and nothing planned', () => {
    const cases: Array<[string, string, RegExp]> = [
      ['apex not switched', WINDOW_VALUES.replace('enable_apex_alias_records     = true', 'enable_apex_alias_records     = false'), /enable_apex_alias_records is not true/],
      ['mail apply off', WINDOW_VALUES.replace('ses_enable_mail_records     = true', 'ses_enable_mail_records     = false'), /ses_enable_mail_records is not true/],
      ['ifpa still in the mirror mx map', WINDOW_VALUES.replace('  "rimu"  = ["10 rimu.llic.net."]', '  "ifpa" = ["10 rimu3.footbag.org."]\n  "rimu"  = ["10 rimu.llic.net."]'), /legacy_mirror_mx_records still carries ifpa/],
      ['ifpa still in the mirror txt map', WINDOW_VALUES.replace('legacy_mirror_txt_records = {', 'legacy_mirror_txt_records = {\n  "ifpa" = ["v=spf1 ~all"]'), /legacy_mirror_txt_records still carries ifpa/],
      ['notice flag absent', WINDOW_VALUES.replace('enable_cutover_notice         = true\n', ''), /enable_cutover_notice is not set/],
      ['preview flag absent', WINDOW_VALUES.replace('enable_preview_record         = true\n', ''), /enable_preview_record is not set/],
      ['mirror flag absent', WINDOW_VALUES.replace('enable_legacy_mirror_records = true\n', ''), /enable_legacy_mirror_records is not set/],
      ['login alarm neither true nor false', WINDOW_VALUES.replace('enable_cutover_login_alarm  = true', 'enable_cutover_login_alarm  = maybe'), /neither true nor false/],
      ['half written', WINDOW_VALUES.replace('enable_cutover_notice         = true', 'enable_cutover_notice         = false'), /half set/],
      ['half written, mirror still on', LAUNCHED_VALUES.replace('enable_legacy_mirror_records = false', 'enable_legacy_mirror_records = true'), /half set/],
    ];
    for (const [name, content, why] of cases) {
      launchSetup({ values: content });
      writeFileSync(calls, '', 'utf-8');
      const r = runLaunch([...LAUNCH, '--yes']);
      expect(r.status, name).not.toBe(0);
      expect(r.stderr, name).toMatch(why);
      expect(values(), name).toBe(content);
      expect(callLog(), name).not.toMatch(/^terraform plan/m);
      expect(callLog(), name).not.toMatch(/^apply /m);
    }
  });
});

describe('production-cutover.sh launch: the cutover log gate', () => {
  // Defect caught: launch would open the site, with the legal page linking
  // admin@ as the public contact, before the cutover-day mail results, the
  // admin@ receive-and-reply test among them, were recorded as passed.
  it('refuses while any row the launch waits on is missing or not passed, naming the row', () => {
    const required = [
      'Mail apply',
      '`scripts/verify-mail-records.sh --stage mail-day` passes',
      'Outside tests, incl. `brat@` and `dleberknight@` two-way',
      '`admin@` receive-and-reply test',
      'Certificate-address bounce test',
      'Alarm subscriptions confirmed (root mailbox and `ops-alert@`)',
      'Test alarm (`scripts/send-test-alarm.sh`) received by all three watchers',
    ];
    for (const row of required) {
      for (const [how, rows] of [
        ['missing', Object.fromEntries(Object.entries(LOG_ROWS).filter(([k]) => k !== row))],
        ['empty', { ...LOG_ROWS, [row]: '' }],
        // Carries both pass words, but not at the start, as a failure written up in words would.
        ['failed', { ...LOG_ROWS, [row]: 'fail: did not pass, not applied' }],
      ] as Array<[string, Record<string, string>]>) {
        launchSetup({ log: cutoverLog(rows) });
        writeFileSync(calls, '', 'utf-8');
        const r = runLaunch([...LAUNCH, '--yes']);
        const label = `${row} ${how}`;
        expect(r.status, label).not.toBe(0);
        expect(r.report, label).toContain(row.split(' (')[0].split(', incl.')[0]);
        expect(values(), label).toBe(WINDOW_VALUES);
        expect(callLog(), label).not.toMatch(/^terraform plan/m);
      }
    }
  });

  // Defect caught: a passed row recorded in the launch section, or a T-0 row
  // the launch does not wait on, would stand in for the admin@ test itself.
  it('reads the T-0 section only, and ignores the rows the launch does not wait on', () => {
    launchSetup({
      log: cutoverLog({ ...LOG_ROWS, '`admin@` receive-and-reply test': '' }, '| `admin@` receive-and-reply test | pass | | |'),
    });
    const r = runLaunch([...LAUNCH, '--yes']);
    expect(r.status).not.toBe(0);
    expect(r.report).toMatch(/`admin@` receive-and-reply test/);
    expect(values()).toBe(WINDOW_VALUES);

    // The T-0 row missing outright: neither a passed row in the launch section
    // nor a T-0 row whose name merely contains the required one stands in for it.
    const withoutAdmin = Object.fromEntries(
      Object.entries(LOG_ROWS).filter(([k]) => k !== '`admin@` receive-and-reply test'),
    );
    launchSetup({
      log: cutoverLog(
        { ...withoutAdmin, 'Repeat of the `admin@` receive-and-reply test': 'pass' },
        '| `admin@` receive-and-reply test | pass | | |',
      ),
    });
    writeFileSync(calls, '', 'utf-8');
    const missing = runLaunch([...LAUNCH, '--yes']);
    expect(missing.status).not.toBe(0);
    expect(missing.report).toMatch(/no row "`admin@` receive-and-reply test"/);
    expect(values()).toBe(WINDOW_VALUES);

    // The bounce-domain row is empty in the default log and the launch still runs.
    launchSetup();
    writeFileSync(calls, '', 'utf-8');
    const ok = runLaunch([...LAUNCH, '--yes']);
    expect(ok.status, ok.stderr).toBe(0);
  });

  // Defect caught: a machine without the private checkout would launch with
  // no record of the mail results at all.
  it('refuses when the cutover log is missing', () => {
    launchSetup({ log: null });
    const r = runLaunch([...LAUNCH, '--yes']);
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/no cutover log/);
    expect(values()).toBe(WINDOW_VALUES);
    expect(callLog()).not.toMatch(/^terraform plan/m);
  });
});

describe('production-cutover.sh launch: the plan must be exactly the launch', () => {
  // Defect caught: other pending changes would ride along on the go-live apply.
  it('refuses a tree with other changes pending before planning the launch', () => {
    launchSetup();
    const r = runLaunch([...LAUNCH, '--yes'], { STUB_CURRENT_PLAN_RC: '2' });
    expect(r.status).not.toBe(0);
    expect(r.report).toMatch(/other changes are pending/);
    expect(values()).toBe(WINDOW_VALUES);
    expect(callLog()).not.toMatch(/^terraform plan-saved/m);
    expect(callLog()).not.toMatch(/^apply /m);
  });

  // Defect caught: a launch plan that deletes something it should not, leaves
  // a legacy or preview name served, or comes up without the alarms the watch
  // depends on would be applied as if it were the launch.
  it('refuses any plan that is not exactly the launch, with the file unchanged', () => {
    const cases: Array<[string, PlanShape, RegExp]> = [
      ['destroys a survivor', { deletes: [...MUST_GO, 'aws_route53_record.apex_a[0]'] }, /would destroy aws_route53_record\.apex_a\[0\]/],
      ['destroys a Workspace my entry', { deletes: [...MUST_GO, 'aws_route53_record.workspace_mx["my"]'] }, /would destroy aws_route53_record\.workspace_mx\["my"\]/],
      ['leaves a mirror record', { deletes: MUST_GO.filter((a) => !a.includes('cname["list"]')) }, /leaves aws_route53_record\.legacy_mirror_cname\["list"\] in place/],
      ['leaves the preview', { deletes: MUST_GO.filter((a) => !a.includes('preview_aaaa')) }, /leaves aws_route53_record\.preview_aaaa\[0\] in place/],
      ['leaves the g entry', { deletes: MUST_GO.filter((a) => !a.includes('["g"]')) }, /leaves aws_route53_record\.workspace_mx\["g"\] in place/],
      ['no 5xx alarm', { creates: [...ALARMS.filter((a) => !a.includes('5xx')), ZERO_LOGINS] }, /does not create aws_cloudwatch_metric_alarm\.cloudfront_5xx\[0\]/],
      ['no zero-logins watch while armed', { creates: ALARMS }, /does not create aws_cloudwatch_metric_alarm\.cutover_zero_logins\[0\]/],
      ['an extra resource', { creates: [...ALARMS, ZERO_LOGINS, 'aws_s3_bucket.extra[0]'] }, /would create aws_s3_bucket\.extra\[0\]/],
      ['a replacement', { other: [['aws_cloudfront_distribution.main[0]', ['delete', 'create']]] }, /would delete,create aws_cloudfront_distribution\.main\[0\]/],
      ['no prior state', { prior: null }, /no prior state/],
      [
        'a captured name stays served by a record outside the launch set',
        { prior: [...MUST_GO, ...STAYS, 'aws_route53_record.legacy_apex_cname["list"]'] },
        /the fresh capture names list, which stays served by aws_route53_record\.legacy_apex_cname\["list"\]/,
      ],
    ];
    for (const [name, shape, why] of cases) {
      launchSetup({ plan: shape });
      writeFileSync(calls, '', 'utf-8');
      const r = runLaunch([...LAUNCH, '--yes']);
      expect(r.status, name).not.toBe(0);
      expect(r.report, name).toMatch(why);
      expect(values(), name).toBe(WINDOW_VALUES);
      expect(callLog(), name).not.toMatch(/^apply /m);
      // A refused run leaves no saved plan behind either.
      expect(readdirSync(join(dir, 'tmp')), name).toEqual([]);
    }
  });

  // Defect caught: with the zero-logins watch never armed, a plan creating it
  // would start a watch nobody set up, and one requiring it would refuse a
  // correct launch.
  it('expects the zero-logins watch only when it was armed', () => {
    const unarmed = WINDOW_VALUES.replace('enable_cutover_login_alarm  = true', 'enable_cutover_login_alarm  = false');
    launchSetup({ values: unarmed });
    const r = runLaunch([...LAUNCH, '--yes']);
    expect(r.status).not.toBe(0);
    expect(r.report).toMatch(/would create aws_cloudwatch_metric_alarm\.cutover_zero_logins\[0\]/);
    expect(values()).toBe(unarmed);

    launchSetup({ values: unarmed, plan: { creates: ALARMS } });
    writeFileSync(calls, '', 'utf-8');
    const ok = runLaunch([...LAUNCH, '--yes']);
    expect(ok.status, ok.stderr).toBe(0);
  });

  // Defect caught: a plan terraform could not make would be taken as clean.
  it('stops with the file unchanged when the launch plan fails', () => {
    launchSetup();
    const r = runLaunch([...LAUNCH, '--yes'], { STUB_SAVED_PLAN_RC: '1' });
    expect(r.status).not.toBe(0);
    expect(r.report).toMatch(/launch plan of production failed/);
    expect(values()).toBe(WINDOW_VALUES);
    expect(callLog()).not.toMatch(/^apply /m);
  });
});

describe('production-cutover.sh launch: the write and the apply', () => {
  // Defect caught: the go-live write applied with no one to confirm it.
  it('writes nothing and applies nothing without a terminal to confirm on', () => {
    launchSetup();
    const r = runLaunch(LAUNCH);
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/no terminal to confirm on/);
    expect(values()).toBe(WINDOW_VALUES);
    expect(callLog()).not.toMatch(/^apply /m);
  });

  // Defect caught: the write must change exactly the launch settings, keep
  // every other line including the operator address, plan the launch from an
  // override that carries no operator address, and prove the tree plans clean.
  it('writes exactly the launch settings, applies production and proves the tree plans clean', () => {
    launchSetup();
    const r = runLaunch([...LAUNCH, '--yes']);
    expect(r.status, r.stderr).toBe(0);
    expect(values()).toBe(LAUNCHED_VALUES);
    const log = callLog();
    expect(log).toMatch(/^apply --target production$/m);
    expect(log.indexOf('terraform plan-saved')).toBeLessThan(log.indexOf('apply --target production'));
    expect(log.indexOf('apply --target production')).toBeLessThan(log.indexOf('terraform plan-after-apply'));
    expect(log).not.toMatch(/^leak /m);
    const override = varFile();
    expect(override).toContain('enable_cutover_notice = false');
    expect(override).toContain('enable_preview_record = false');
    expect(override).toContain('enable_legacy_mirror_records = false');
    expect(override).toContain('"my" = [');
    expect(override).not.toContain('"g"');
    expect(override).not.toContain(SENSITIVE);
    expect(r.stdout).not.toContain(SENSITIVE);
    expect(r.stdout).toMatch(/74\.50\.54\.203 -> rimu3\.footbag\.org\./);
    for (const ip of ['173.8.190.53', '173.8.190.59', '173.8.190.60']) {
      expect(r.stdout, ip).toContain(`${ip} -> <no PTR record>`);
    }
    expect(r.report).toMatch(/launch apply in production: applied/);
    expect(r.report).toMatch(/admin@ receive-and-reply test/);
    // Each name in the fresh capture is accounted for, for the cutover log.
    expect(r.stdout).toMatch(/^ {2}rimu: removed by this plan$/m);
    expect(r.stdout).toMatch(/^ {2}list: removed by this plan$/m);
    expect(r.stdout).toMatch(/^ {2}g: removed by this plan$/m);
    expect(r.stdout).toMatch(/^ {2}my: kept by its Workspace entry$/m);
    expect(r.stdout).toMatch(/^ {2}ifpa: partly removed; its Workspace entry stays$/m);
    expect(r.stdout).toMatch(/^ {2}fi: no per-name record in Terraform/m);
    expect(r.stdout).toMatch(/^ {2}www: no per-name record in Terraform/m);
    // The saved plan can carry secrets: it is planned into a directory only
    // the operator can read, and nothing of it is left once the run ends.
    expect(log).toMatch(/^plan-dir-mode 700$/m);
    expect(readdirSync(join(dir, 'tmp'))).toEqual([]);
  });

  // Defect caught: a rewrite that lost lines (here, a Workspace g entry never
  // closed, which would swallow the rest of the file) written over the only
  // copy of the values file outside the vault.
  it('refuses a rewrite that would change more than the launch settings', () => {
    const malformed = WINDOW_VALUES.replace('    "20 ALT1.ASPMX.L.GOOGLE.COM.",\n  ]\n', '    "20 ALT1.ASPMX.L.GOOGLE.COM.",\n');
    expect(malformed).not.toBe(WINDOW_VALUES);
    launchSetup({ values: malformed });
    const r = runLaunch([...LAUNCH, '--yes']);
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/never closes/);
    expect(values()).toBe(malformed);
    expect(callLog()).not.toMatch(/^terraform plan-saved/m);
    expect(callLog()).not.toMatch(/^apply /m);
  });

  // Defect caught: a failed reverse lookup would stop the launch it is only
  // meant to inform, or vanish without the operator recording it by hand.
  it('reports a failed reverse lookup as a warning and still launches', () => {
    launchSetup();
    const r = runLaunch([...LAUNCH, '--yes'], { STUB_DIG_RC: '9' });
    expect(r.status, r.stderr).toBe(0);
    expect(r.report).toMatch(/dig -x 74\.50\.54\.203 failed/);
    expect(values()).toBe(LAUNCHED_VALUES);
  });

  // Defect caught: a failed apply reported as a launch.
  it('stops after a failed apply, with the values written for the re-run', () => {
    launchSetup();
    const r = runLaunch([...LAUNCH, '--yes'], { STUB_APPLY_RC: '1' });
    expect(r.status).not.toBe(0);
    expect(r.report).toMatch(/apply did not land/);
    expect(values()).toBe(LAUNCHED_VALUES);
  });

  // Defect caught: an apply that left changes behind reported as complete.
  it('fails the run when the tree still plans changes after the apply', () => {
    launchSetup();
    const r = runLaunch([...LAUNCH, '--yes'], { STUB_AFTER_APPLY_PLAN_RC: '2' });
    expect(r.status).not.toBe(0);
    expect(r.report).toMatch(/still plans changes/);
  });

  // Defect caught: a run that stopped between the write and the apply could
  // never be finished, or a finished launch would be applied again.
  it('finishes a launch whose write landed, and leaves a finished one alone', () => {
    launchSetup({ values: LAUNCHED_VALUES });
    const r = runLaunch([...LAUNCH, '--yes'], { STUB_CURRENT_PLAN_RC: '2' });
    expect(r.status, r.stderr).toBe(0);
    expect(callLog()).toMatch(/^terraform plan-saved$/m);
    expect(callLog()).toMatch(/^apply --target production$/m);
    expect(values()).toBe(LAUNCHED_VALUES);

    launchSetup({ values: LAUNCHED_VALUES });
    writeFileSync(calls, '', 'utf-8');
    const done = runLaunch([...LAUNCH, '--yes']);
    expect(done.status, done.stderr).toBe(0);
    expect(done.report).toMatch(/already in production/);
    expect(callLog()).not.toMatch(/^apply /m);
  });

  // Defect caught: a re-run would apply a pending change that is not the
  // launch under the launch's name.
  it('refuses to finish when what is pending is not exactly the launch', () => {
    launchSetup({ values: LAUNCHED_VALUES, plan: { deletes: [...MUST_GO, 'aws_route53_record.apex_a[0]'] } });
    const r = runLaunch([...LAUNCH, '--yes'], { STUB_CURRENT_PLAN_RC: '2' });
    expect(r.status).not.toBe(0);
    expect(r.report).toMatch(/would destroy aws_route53_record\.apex_a\[0\]/);
    expect(callLog()).not.toMatch(/^apply /m);
  });

  // Defect caught: a dry run that planned, wrote or applied.
  it('changes nothing on a dry run, after checking the window and the log', () => {
    launchSetup();
    const r = runLaunch([...LAUNCH, '--dry-run']);
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toMatch(/cutover log: `admin@` receive-and-reply test: pass/);
    expect(values()).toBe(WINDOW_VALUES);
    expect(callLog()).not.toMatch(/^terraform plan/m);
  });
});
