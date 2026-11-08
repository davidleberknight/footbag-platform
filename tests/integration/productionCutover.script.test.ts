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
 *  line when it would exit 2. */
const TERRAFORM_STUB = `#!/usr/bin/env bash
shift
case "$1" in
  output)
    echo "terraform output" >> "$STUB_CALLS"
    [[ -n "\${STUB_OUTPUT_RC:-}" ]] && exit "$STUB_OUTPUT_RC"
    printf '%s' "$STUB_PLATFORM_URL"
    ;;
  plan)
    if [[ " $* " == *" -var "* ]]; then
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
