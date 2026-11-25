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

/** The stand-in for terraform. `output <name>` answers STUB_OUT_<name> when
 *  the case sets it, and STUB_PLATFORM_URL otherwise. A plan exits
 *  STUB_CURRENT_PLAN_RC when it carries no -var override and
 *  STUB_VAR_PLAN_RC when it does, 0 by default, and prints a Plan
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
    name="\${@: -1}"
    var="STUB_OUT_$name"
    if [[ -n "\${!var+set}" ]]; then printf '%s' "\${!var}"; else printf '%s' "$STUB_PLATFORM_URL"; fi
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
[[ "$*" == *" footbag.org NS" ]] && printf '%s\\n' \${STUB_DELEGATED_NS:-}
exit 0
`;

/** The stand-in for curl: records the address it was asked for and prints
 *  STUB_ROBOTS as the body, or fails with STUB_CURL_RC. */
const CURL_STUB = `#!/usr/bin/env bash
echo "curl \${@: -1}" >> "$STUB_CALLS"
[[ -n "\${STUB_CURL_RC:-}" ]] && { echo "curl: (6) Could not resolve host" >&2; exit "$STUB_CURL_RC"; }
printf '%s' "$STUB_ROBOTS"
`;

/** The stand-in for aws: answers list-conflicting-aliases with the JSON
 *  CloudFront documents, Items from STUB_CONFLICTS (a JSON list, the
 *  distribution's own exact alias by default), or fails with STUB_AWS_RC. */
const AWS_STUB = `#!/usr/bin/env bash
alias=""
prev=""
for a in "$@"; do [[ "$prev" == --alias ]] && alias="$a"; prev="$a"; done
echo "aws $1 $2 $alias" >> "$STUB_CALLS"
[[ -n "\${STUB_AWS_RC:-}" ]] && { echo "An error occurred (AccessDenied)" >&2; exit "$STUB_AWS_RC"; }
own='[{"Alias":"'"$alias"'","DistributionId":"E1*******XYZ","AccountId":"******789012"}]'
items="\${STUB_CONFLICTS:-$own}"
printf '{"ConflictingAliasesList":{"MaxItems":100,"Quantity":1,"Items":%s}}' "$items"
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
  writeFileSync(join(dir, 'curl'), CURL_STUB, { mode: 0o755 });
  writeFileSync(join(dir, 'aws'), AWS_STUB, { mode: 0o755 });
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

const ARCHIVE_BUCKET = 'aws_s3_bucket.archive[0]';
const ARCHIVE_PAGE = 'aws_s3_object.archive_not_found_page[0]';
const ARCHIVE_CERT = 'aws_acm_certificate.archive[0]';
const REPLICATION_POLICY = 'aws_iam_role_policy.s3_replication';
const OTHER = 'aws_instance.web';

/** The configuration half of Terraform's JSON plan representation for the
 *  resources these cases plan: each declaration's address, the references of
 *  its count expression, and the references inside its argument expressions,
 *  as Terraform records them (a reference to an indexed attribute is listed
 *  with the bare resource address beside it). The bucket and the page are gated
 *  on the archive flag; the certificate is counted on the custom-domain flag
 *  and its validation records keyed on it; the alias record is counted on it
 *  and points at the distribution; the distribution is counted on the
 *  archive flag and switches its aliases on the custom-domain flag; the
 *  replication policy names the archive's replica bucket inline; the
 *  notification names the archive bucket and nothing else. These mirror the
 *  production archive declarations. */
const ARCHIVE_CONFIG = [
  { address: 'aws_s3_bucket.archive', count_expression: { references: ['var.enable_archive'] }, expressions: {} },
  {
    address: 'aws_s3_object.archive_not_found_page',
    count_expression: { references: ['var.enable_archive'] },
    expressions: { bucket: { references: ['aws_s3_bucket.archive[0].id', 'aws_s3_bucket.archive'] } },
  },
  {
    address: 'aws_acm_certificate.archive',
    count_expression: { references: ['var.enable_archive_custom_domain'] },
    expressions: {},
  },
  {
    address: 'aws_route53_record.archive_cert_validation',
    for_each_expression: { references: ['var.enable_archive_custom_domain', 'aws_acm_certificate.archive[0].domain_validation_options', 'aws_acm_certificate.archive'] },
    expressions: { zone_id: { references: ['var.route53_zone_id'] } },
  },
  {
    address: 'aws_route53_record.archive_a',
    count_expression: { references: ['var.enable_archive_custom_domain'] },
    expressions: { alias: [{ name: { references: ['aws_cloudfront_distribution.archive[0].domain_name', 'aws_cloudfront_distribution.archive'] } }] },
  },
  {
    address: 'aws_cloudfront_distribution.archive',
    count_expression: { references: ['var.enable_archive'] },
    expressions: { aliases: { references: ['var.enable_archive_custom_domain', 'local.archive_domain'] } },
  },
  {
    address: 'aws_iam_role_policy.s3_replication',
    expressions: { policy: { references: ['var.enable_archive', 'aws_s3_bucket.archive_dr[0].arn', 'aws_s3_bucket.archive_dr'] } },
  },
  {
    address: 'aws_s3_bucket.archive_dr',
    count_expression: { references: ['var.enable_archive'] },
    expressions: {},
  },
  { address: 'aws_instance.web', expressions: { ami: { references: ['var.ami'] } } },
  {
    address: 'aws_s3_bucket_notification.archive_watch',
    expressions: { bucket: { references: ['aws_s3_bucket.archive[0].id', 'aws_s3_bucket.archive'] } },
  },
];

let planFiles = 0;
/** Writes a plan in Terraform's documented JSON plan representation, holding
 *  the resource changes given and the configuration above, and returns its path
 *  for the terraform stand-in's show -json. */
function archivePlan(changes: Array<[string, string[]]>, raw?: string): string {
  const file = join(dir, `archive-plan-${++planFiles}.json`);
  const json =
    raw ??
    JSON.stringify({
      format_version: '1.2',
      resource_changes: [
        ...changes.map(([address, actions]) => ({ address, mode: 'managed', change: { actions } })),
        { address: 'data.aws_caller_identity.current', mode: 'data', change: { actions: ['read'] } },
      ],
      configuration: { root_module: { resources: ARCHIVE_CONFIG.map((c) => ({ mode: 'managed', ...c })) } },
    });
  writeFileSync(file, json, 'utf-8');
  return file;
}

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
  // stuck, refused as "other changes pending" by its own unapplied archive,
  // including the replication policy that names the archive buckets inline.
  it('resumes at the apply when the archive stack is the only thing pending', () => {
    haveKey();
    setValues(SET_VALUES);
    const r = run([...PROD, '--yes'], {
      STUB_CURRENT_PLAN_RC: '2',
      STUB_PLAN_JSON: archivePlan([
        [ARCHIVE_BUCKET, ['create']],
        [ARCHIVE_PAGE, ['create']],
        [REPLICATION_POLICY, ['update']],
        // Names an archive bucket but not the archive flag.
        ['aws_s3_bucket_notification.archive_watch', ['create']],
        // Counted on the archive flag; only its aliases name the custom domain.
        ['aws_cloudfront_distribution.archive[0]', ['create']],
      ]),
    });
    expect(r.status, r.stderr).toBe(0);
    expect(values()).toBe(SET_VALUES);
    expect(callLog()).toMatch(/^terraform plan-saved$/m);
    // The saved plan can carry secrets, so it sits in a directory only the
    // operator can read.
    expect(callLog()).toMatch(/^plan-dir-mode 700$/m);
    expect(callLog()).toMatch(/^apply --target production$/m);
    expect(readdirSync(join(dir, 'tmp'), { recursive: true }).map(String).filter((f) => f.endsWith('.tfplan'))).toEqual([]);
  });

  // Defect caught: an apply that stopped part way leaves the protected archive
  // bucket in the state; a check that plans the archive off then needs that
  // bucket destroyed, Terraform refuses the plan, and the stage can never
  // finish its own half-done run.
  it('finishes an apply that stopped part way, with the protected bucket already in the state', () => {
    haveKey();
    setValues(SET_VALUES);
    const r = run([...PROD, '--yes'], {
      STUB_CURRENT_PLAN_RC: '2',
      // Terraform refuses any plan that would destroy the protected bucket.
      STUB_VAR_PLAN_RC: '1',
      STUB_PLAN_JSON: archivePlan([
        [ARCHIVE_BUCKET, ['no-op']],
        [ARCHIVE_PAGE, ['delete', 'create']],
      ]),
    });
    expect(r.status, r.stderr).toBe(0);
    expect(callLog()).toMatch(/^apply --target production$/m);
    expect(callLog()).toMatch(/^verify --target production$/m);
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
  // archive, nor destroy any part of it, nor take an unreadable plan as clean.
  it('refuses a re-run when something besides the archive stack is pending, naming it', () => {
    haveKey();
    const cases: Array<[string, string, RegExp]> = [
      ['another resource', archivePlan([[ARCHIVE_PAGE, ['create']], [OTHER, ['update']]]), /would update aws_instance\.web/],
      ['an archive destroy', archivePlan([[ARCHIVE_PAGE, ['delete']]]), /would destroy aws_s3_object\.archive_not_found_page\[0\]/],
      ['a custom-domain resource', archivePlan([[ARCHIVE_CERT, ['create']]]), /would create aws_acm_certificate\.archive\[0\]/],
      ['a custom-domain record', archivePlan([['aws_route53_record.archive_cert_validation["archive.example.org"]', ['create']]]), /would create aws_route53_record\.archive_cert_validation/],
      ['a custom-domain record naming the distribution', archivePlan([['aws_route53_record.archive_a[0]', ['create']]]), /would create aws_route53_record\.archive_a\[0\]/],
      ['a plan with no configuration', archivePlan([], JSON.stringify({ format_version: '1.2', resource_changes: [] })), /could not be read/],
    ];
    for (const [label, plan, named] of cases) {
      writeFileSync(calls, '', 'utf-8');
      setValues(SET_VALUES);
      const r = run([...PROD, '--yes'], { STUB_CURRENT_PLAN_RC: '2', STUB_PLAN_JSON: plan });
      expect(r.status, label).not.toBe(0);
      expect(r.report, label).toMatch(named);
      expect(callLog(), label).not.toMatch(/^apply /m);
      expect(values(), label).toBe(SET_VALUES);
    }
  });

  // Defect caught: a pending plan that cannot be planned or read must stop the
  // resume rather than be taken as clean, and the private copy of the saved
  // plan, which can hold secrets, must not outlive the run.
  it('stops when the pending plan cannot be planned or read, and leaves no saved plan behind', () => {
    haveKey();
    const cases: Array<[string, Record<string, string>, RegExp]> = [
      ['the saved plan fails', { STUB_SAVED_PLAN_RC: '1', STUB_PLAN_JSON: archivePlan([[ARCHIVE_PAGE, ['create']]]) }, /saved plan of production failed \(exit 1\)/],
      ['show -json fails', { STUB_PLAN_JSON: join(dir, 'no-such-plan.json') }, /terraform show -json of the pending plan failed/],
    ];
    for (const [label, env, named] of cases) {
      writeFileSync(calls, '', 'utf-8');
      setValues(SET_VALUES);
      const r = run([...PROD, '--yes'], { STUB_CURRENT_PLAN_RC: '2', ...env });
      expect(r.status, label).not.toBe(0);
      expect(r.report, label).toMatch(named);
      expect(callLog(), label).not.toMatch(/^apply /m);
      expect(readdirSync(join(dir, 'tmp'), { recursive: true }).map(String).filter((f) => f.endsWith('.tfplan')), label).toEqual([]);
    }
  });

  // Defect caught: a pending change that settled between the two plans must not
  // stop the run, and the apply still runs so the state is proved to match.
  it('applies when the saved plan finds nothing pending after the first plan did', () => {
    haveKey();
    setValues(SET_VALUES);
    const r = run([...PROD, '--yes'], { STUB_CURRENT_PLAN_RC: '2', STUB_SAVED_PLAN_RC: '0' });
    expect(r.status, r.stderr).toBe(0);
    expect(callLog()).not.toMatch(/^terraform show /m);
    expect(callLog()).toMatch(/^apply --target production$/m);
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
  'launch_www_base_address     = true',
  '',
].join('\n');

/** The window before the launch's first run: www not yet published as the
 *  base address. */
const PRE_LAUNCH_VALUES = WINDOW_VALUES.replace('launch_www_base_address     = true\n', '');

/** The same file after the first run's write, written out by hand: the
 *  setting the file did not carry added at its end. */
const PUBLISHED_VALUES = `${PRE_LAUNCH_VALUES}launch_www_base_address = true\n`;

/** The same file after the launch write, written out by hand: the four flags
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
  'launch_www_base_address = false',
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
  'Work-queue area groups receive the platform\'s mail (six live SES sends)': 'pass',
  'Work-queue area owners saved (after the load)': 'pass',
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
  noop?: string[];
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
      ...(shape.noop ?? STAYS).map((a) => change(a, ['no-op'])),
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

/** The day the stand-in runs are pinned to, through the script's date seam,
 *  and the capture named for it the way scripts/capture-legacy-zone.sh is told
 *  to name one. */
const TODAY = '2026-12-17';
function capturePath(day = TODAY): string {
  return join(dir, `footbag.org.${day}.zone`);
}

function launchSetup(
  opts: { values?: string; log?: string | null; plan?: PlanShape; capture?: string } = {},
): void {
  setValues(opts.values ?? WINDOW_VALUES);
  if (opts.log !== null) writeFileSync(join(dir, 'CUTOVER_LOG.md'), opts.log ?? cutoverLog(), 'utf-8');
  writeFileSync(join(dir, 'plan.json'), planJson(opts.plan), 'utf-8');
  writeFileSync(capturePath(), opts.capture ?? CAPTURE, 'utf-8');
}

/** Runs the script with the launch seams, passing the fresh capture unless the
 *  case is about its absence. */
function runLaunch(args: string[], env: Record<string, string> = {}, opts: { noCapture?: boolean } = {}) {
  const withCapture = opts.noCapture ? args : [...args, '--capture', capturePath()];
  return run(withCapture, {
    PRODUCTION_CUTOVER_DIG_BIN: join(dir, 'dig'),
    PRODUCTION_CUTOVER_CURL_BIN: join(dir, 'curl'),
    PRODUCTION_CUTOVER_AWS_BIN: join(dir, 'aws'),
    PRODUCTION_CUTOVER_LOG: join(dir, 'CUTOVER_LOG.md'),
    PRODUCTION_CUTOVER_TODAY: TODAY,
    STUB_PLAN_JSON: join(dir, 'plan.json'),
    STUB_OUT_preview_url: 'https://preview.footbag.org',
    STUB_OUT_platform_url: 'https://www.footbag.org',
    STUB_ROBOTS: ROBOTS_ON_WWW,
    ...env,
  });
}

/** preview's robots.txt as the platform serves it with each base address. On
 *  www the platform is indexable and names www's sitemap; on preview it keeps
 *  every page out of the index. */
const ROBOTS_ON_WWW = 'User-agent: *\nAllow: /\n\nSitemap: https://www.footbag.org/sitemap.xml\n';
const ROBOTS_ON_PREVIEW = 'User-agent: *\nDisallow: /\n';

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
    expect(other.stderr).toMatch(/--capture is the launch and record-switch stages'/);
    const raise = runLaunch(['--target', 'production', '--stage', 'notice-raise', '--yes']);
    expect(raise.status).toBe(2);
    expect(raise.stderr).toMatch(/--capture is the launch and record-switch stages'/);
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

  // Defect caught: the launch run again to lift the notice after a rollback
  // refused for want of a same-day capture, when by then the legacy
  // nameservers that a capture is taken from may no longer answer.
  it('takes a complete capture from an earlier day', () => {
    launchSetup();
    writeFileSync(join(dir, 'capture.zone'), CAPTURE, 'utf-8');
    const r = runLaunch([...LAUNCH, '--yes', '--capture', join(dir, 'capture.zone')], {}, { noCapture: true });
    expect(r.status, r.stderr).toBe(0);
    expect(values()).toBe(LAUNCHED_VALUES);
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
      // Defect caught: launch with the work-queue area emails unproven or
      // switched off, so an area's group receives nothing from the first day.
      'Work-queue area groups receive the platform\'s mail (six live SES sends)',
      'Work-queue area owners saved (after the load)',
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
    // What is pending is read, to tell a first run left unapplied from other
    // changes; the launch's own settings are never planned.
    expect(callLog()).not.toMatch(/^terraform var-file/m);
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

// ── STAGE record-switch ──────────────────────────────────────────────────────

const SWITCH = ['--target', 'production', '--stage', 'record-switch'];

/** The production values file in the window, before the switch: the custom
 *  domain, the preview, the notice and the mirror on, the apex still on the
 *  legacy host, the archive pointing at preview, and the four legacy names
 *  that ride the apex and www mirrored. */
const PRE_SWITCH_VALUES = [
  'environment                  = "production"',
  SENSITIVE_LINE,
  'enable_legacy_mirror_records = true',
  'legacy_apex_cname_records = {',
  '  "fi"                 = "footbag.org."',
  '  "ftp"                = "footbag.org."',
  '  "worldchampionships" = "www.footbag.org."',
  '  "worlds"             = "www.footbag.org."',
  '}',
  '',
  'enable_platform_custom_domain = true',
  'enable_preview_record         = true',
  'enable_apex_alias_records     = false',
  'enable_cutover_notice         = true',
  'enable_cutover_login_alarm  = false',
  'enable_archive = true',
  'archive_platform_url = "https://preview.footbag.org"',
  '',
].join('\n');

/** The same file after the switch's write, written out by hand: the alias and
 *  the login watch on and the archive address cleared where each stood, every
 *  other line as it was. */
const SWITCHED_VALUES = [
  'environment                  = "production"',
  SENSITIVE_LINE,
  'enable_legacy_mirror_records = true',
  'legacy_apex_cname_records = {',
  '  "fi"                 = "footbag.org."',
  '  "ftp"                = "footbag.org."',
  '  "worldchampionships" = "www.footbag.org."',
  '  "worlds"             = "www.footbag.org."',
  '}',
  '',
  'enable_platform_custom_domain = true',
  'enable_preview_record         = true',
  'enable_apex_alias_records = true',
  'enable_cutover_notice         = true',
  'enable_cutover_login_alarm = true',
  'enable_archive = true',
  'archive_platform_url = ""',
  '',
].join('\n');

/** A capture taken the day of the switch, in the layout of the newest
 *  committed capture: the four names riding the apex or www, www itself, and
 *  a CNAME elsewhere that does not ride them. One line keeps the space-
 *  separated layout the real transfer printed for its longest name. */
const SWITCH_CAPTURE_LINES = [
  '; <<>> DiG 9.18.28 <<>> axfr footbag.org @ns1.example.',
  'footbag.org.\t\t86400\tIN\tSOA\tns1.example. hostmaster.example. 2026121701 86400 7200 2419200 3600',
  'footbag.org.\t\t86400\tIN\tA\t192.0.2.1',
  'fi.footbag.org.\t\t86400\tIN\tCNAME\tfootbag.org.',
  'ftp.footbag.org.\t86400\tIN\tCNAME\tfootbag.org.',
  'list.footbag.org.\t86400\tIN\tCNAME\trimu3.footbag.org.',
  'worldchampionships.footbag.org.\t86400 IN CNAME\twww.footbag.org.',
  'worlds.footbag.org.\t86400\tIN\tCNAME\twww.footbag.org.',
  'www.footbag.org.\t86400\tIN\tCNAME\tfootbag.org.',
  'footbag.org.\t\t86400\tIN\tSOA\tns1.example. hostmaster.example. 2026121701 86400 7200 2419200 3600',
];
const SWITCH_CAPTURE = `${SWITCH_CAPTURE_LINES.join('\n')}\n`;

const RIDING = ['fi', 'ftp', 'worldchampionships', 'worlds'].map(
  (n) => `aws_route53_record.legacy_apex_cnames["${n}"]`,
);
const ALIAS_PAIR = ['aws_route53_record.apex_aaaa[0]', 'aws_route53_record.www_aaaa[0]'];
const FLIPPED = ['aws_route53_record.apex_a[0]', 'aws_route53_record.www[0]'];
const SWITCH_STAYS = ['aws_route53_record.legacy_mirror_cname["list"]'];

/** By default, exactly the switch: the four riding names destroyed, the apex
 *  and www switched in place with the archive's gate page following the
 *  address, and the IPv6 pair created. */
function switchPlan(shape: PlanShape = {}): PlanShape {
  return {
    prior: [...RIDING, ...FLIPPED, ...SWITCH_STAYS],
    deletes: RIDING,
    creates: ALIAS_PAIR,
    updates: [...FLIPPED, 'aws_s3_object.archive_denied[0]'],
    noop: SWITCH_STAYS,
    ...shape,
  };
}

/** The day of the capture the mirror was last written from and verified
 *  against, a week before the switch: the re-capture taken just before the
 *  nameserver move. */
const VERIFIED_DAY = '2026-12-10';

/** The cutover log's zone-move section as the zone move leaves it: the
 *  verified capture named in its capture row, in the form the real log
 *  records it (which also names the older capture it was diffed against),
 *  and the mirror verification against it passed. */
function zoneMoveLog(
  captureValue = `\`footbag.org.${VERIFIED_DAY}.zone\`, serial 2026121001, 6 names (1 removed since \`footbag.org.2026-11-23.zone\`, nothing added or changed)`,
  verification = 'pass: 6 names, 0 differing, none served here only, apex CAA served',
): string {
  return [
    '# Cutover log',
    '',
    '## 4. Step timings',
    '',
    '### 4a. The zone move and the mail preparation',
    '',
    '| Reading | Value | When measured | Notes |',
    '|---|---|---|---|',
    `| Fresh capture and diff (\`scripts/capture-legacy-zone.sh\`) | ${captureValue} | ${VERIFIED_DAY} | |`,
    `| Name and apex CAA verification (\`scripts/verify-zone-mirror.sh\`) | ${verification} | ${VERIFIED_DAY} | |`,
    '| Delegation converged | | | |',
    '',
    '### 4b. T-0: the alias flip, then the mail apply',
    '',
    '| Reading | Value | When measured | Notes |',
    '|---|---|---|---|',
    '| Alias flip applied (T-0) | | | |',
    '',
  ].join('\n');
}

/** The verified capture: the same records as the switch-day capture, under an
 *  older serial, with the transfer's own comment lines and one cache lifetime
 *  different, as two real transfers of an unchanged zone differ; none of
 *  those is a change to the zone. */
const VERIFIED_CAPTURE = `${SWITCH_CAPTURE.replaceAll('2026121701', '2026121001')
  .replace('; <<>> DiG 9.18.28 <<>>', '; <<>> DiG 9.18.30 <<>>')
  .replace('list.footbag.org.\t86400', 'list.footbag.org.\t3600')};; Query time: 41 msec\n`;

function switchSetup(
  opts: { values?: string; plan?: PlanShape; capture?: string; log?: string | null; verified?: string | null } = {},
): void {
  setValues(opts.values ?? PRE_SWITCH_VALUES);
  writeFileSync(join(dir, 'plan.json'), planJson(switchPlan(opts.plan)), 'utf-8');
  writeFileSync(capturePath(), opts.capture ?? SWITCH_CAPTURE, 'utf-8');
  const log = join(dir, 'CUTOVER_LOG.md');
  if (opts.log === null) rmSync(log, { force: true });
  else writeFileSync(log, opts.log ?? zoneMoveLog(), 'utf-8');
  const verified = capturePath(VERIFIED_DAY);
  if (opts.verified === null) rmSync(verified, { force: true });
  else writeFileSync(verified, opts.verified ?? VERIFIED_CAPTURE, 'utf-8');
}

/** Asserts a refused run changed and applied nothing. */
function expectRefusedUntouched(r: ReturnType<typeof run>, label: string, before: string, why: RegExp, plannedOk = false): void {
  expect(r.status, label).not.toBe(0);
  expect(`${r.stderr}`, label).toMatch(why);
  expect(values(), label).toBe(before);
  if (!plannedOk) expect(callLog(), label).not.toMatch(/^terraform plan/m);
  expect(callLog(), label).not.toMatch(/^apply /m);
}

describe('production-cutover.sh record-switch: where and when it may run, each beside a run it lets through', () => {
  // Defect caught: the switch run against staging would edit a values file
  // that has no notice and no legacy names to remove.
  it('refuses any target but production before reading anything', () => {
    switchSetup();
    const r = runLaunch(['--target', 'staging', '--stage', 'record-switch', '--yes']);
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/production only/);
    expect(callLog()).toBe('');
    const ok = runLaunch([...SWITCH, '--yes']);
    expect(ok.status, ok.stderr).toBe(0);
  });

  // Defect caught: the switch removing the apex-riding names with no capture
  // to check them against, a truncated one, or one whose day is unknown or
  // still to come.
  it('requires a complete capture named for a day that has come', () => {
    switchSetup();
    const none = runLaunch([...SWITCH, '--yes'], {}, { noCapture: true });
    expect(none.status).toBe(2);
    expect(none.stderr).toMatch(/record-switch stage needs --capture/);
    expect(callLog()).toBe('');

    for (const [name, file, why] of [
      ['taken the day after', capturePath('2026-12-18'), /named for 2026-12-18, after today/],
      ['named with no date', join(dir, 'capture.zone'), /not named footbag\.org\.<YYYY-MM-DD>\.zone/],
    ] as Array<[string, string, RegExp]>) {
      switchSetup();
      writeFileSync(file, SWITCH_CAPTURE, 'utf-8');
      writeFileSync(calls, '', 'utf-8');
      expectRefusedUntouched(
        runLaunch([...SWITCH, '--yes', '--capture', file], {}, { noCapture: true }),
        name, PRE_SWITCH_VALUES, why,
      );
    }

    switchSetup({ capture: `${SWITCH_CAPTURE_LINES.slice(0, -1).join('\n')}\n` });
    expectRefusedUntouched(runLaunch([...SWITCH, '--yes']), 'truncated', PRE_SWITCH_VALUES, /not a complete transfer/);
  });

  // Defect caught: once the legacy nameservers stop answering, a same-day
  // capture cannot be taken, so the switch must run on the newest capture on
  // file; the verified capture itself, a week old, lets the switch through.
  it('takes the newest capture on file, the verified one included, with no change since it', () => {
    switchSetup();
    const today = runLaunch([...SWITCH, '--yes']);
    expect(today.status, today.stderr).toBe(0);
    expect(today.stdout).toMatch(new RegExp(`unchanged since the verified capture footbag\\.org\\.${VERIFIED_DAY}\\.zone`));

    switchSetup();
    writeFileSync(calls, '', 'utf-8');
    const verified = runLaunch([...SWITCH, '--yes', '--capture', capturePath(VERIFIED_DAY)], {}, { noCapture: true });
    expect(verified.status, verified.stderr).toBe(0);
    expect(callLog()).toMatch(/^apply /m);
  });

  // Defect caught: a capture older than the one the mirror was verified
  // against would check the removals against a zone already superseded, and a
  // missing or failed verification record would let the switch run on a
  // mirror nobody compared with the zone.
  it('refuses a capture older than the verified one, or no verified capture to check it against', () => {
    switchSetup();
    writeFileSync(capturePath('2026-12-09'), SWITCH_CAPTURE, 'utf-8');
    writeFileSync(calls, '', 'utf-8');
    expectRefusedUntouched(
      runLaunch([...SWITCH, '--yes', '--capture', capturePath('2026-12-09')], {}, { noCapture: true }),
      'older than verified', PRE_SWITCH_VALUES, /taken 2026-12-09, before the verified capture/,
    );

    const cases: Array<[string, Parameters<typeof switchSetup>[0], RegExp]> = [
      ['no cutover log', { log: null }, /no cutover log/],
      ['no verified capture recorded', { log: zoneMoveLog('') }, /names no verified capture/],
      ['verification not passed', { log: zoneMoveLog(undefined, 'fail: 1 differing') }, /does not record the mirror verified/],
      ['verified capture missing', { verified: null }, /is not beside/],
    ];
    for (const [name, opts, why] of cases) {
      switchSetup(opts);
      writeFileSync(calls, '', 'utf-8');
      expectRefusedUntouched(runLaunch([...SWITCH, '--yes']), name, PRE_SWITCH_VALUES, why);
    }
  });

  // Defect caught: a last-minute edit by the legacy operator, away from the
  // names riding the apex, would pass unseen, or would block the switch
  // outright although it needs no re-sync.
  it('lists each record changed since the verified capture and lets the switch through', () => {
    const tweaked = SWITCH_CAPTURE
      .replace('footbag.org.\t\t86400\tIN\tA\t192.0.2.1\n', 'footbag.org.\t\t86400\tIN\tA\t192.0.2.1\nnew.footbag.org.\t86400\tIN\tA\t192.0.2.9\n')
      .replace('list.footbag.org.\t86400\tIN\tCNAME\trimu3.footbag.org.\n', '');
    switchSetup({ capture: tweaked });
    const r = runLaunch([...SWITCH, '--yes']);
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toMatch(/changed since the verified capture/);
    expect(r.stdout).toMatch(/added +new\.footbag\.org\. IN A 192\.0\.2\.9/);
    expect(r.stdout).toMatch(/removed +list\.footbag\.org\. IN CNAME rimu3\.footbag\.org\./);
    expect(r.stdout).toMatch(/differs from the verified capture by 2 record/);
    expect(r.stdout).not.toMatch(/added +footbag\.org\. IN SOA/);

    // An edit that only adds, or only removes, is a change all the same.
    for (const [name, capture, line] of [
      ['added only', SWITCH_CAPTURE.replace('footbag.org.\t\t86400\tIN\tA\t192.0.2.1\n', 'footbag.org.\t\t86400\tIN\tA\t192.0.2.1\nnew.footbag.org.\t86400\tIN\tA\t192.0.2.9\n'), /added +new\.footbag\.org\./],
      ['removed only', SWITCH_CAPTURE.replace('list.footbag.org.\t86400\tIN\tCNAME\trimu3.footbag.org.\n', ''), /removed +list\.footbag\.org\./],
    ] as Array<[string, string, RegExp]>) {
      switchSetup({ capture });
      const one = runLaunch([...SWITCH, '--yes']);
      expect(one.status, `${name}: ${one.stderr}`).toBe(0);
      expect(one.stdout, name).toMatch(line);
      expect(one.stdout, name).toMatch(/differs from the verified capture by 1 record/);
    }
  });

  // Defect caught: the switch outside the window would put the apex on the
  // platform with no notice, no preview for the operator, or no custom domain
  // for it to answer on; or under a launch rehearsal, which Terraform refuses
  // mid-freeze; or finish a write that is neither the window nor the switch.
  it('refuses outside the window or half set, with the file unchanged and nothing planned', () => {
    const cases: Array<[string, string, RegExp]> = [
      ['custom domain off', PRE_SWITCH_VALUES.replace('enable_platform_custom_domain = true', 'enable_platform_custom_domain = false'), /enable_platform_custom_domain is not true/],
      ['preview off', PRE_SWITCH_VALUES.replace('enable_preview_record         = true', 'enable_preview_record         = false'), /enable_preview_record is not true/],
      ['notice off', PRE_SWITCH_VALUES.replace('enable_cutover_notice         = true', 'enable_cutover_notice         = false'), /enable_cutover_notice is not true/],
      ['mirror off', PRE_SWITCH_VALUES.replace('enable_legacy_mirror_records = true', 'enable_legacy_mirror_records = false'), /enable_legacy_mirror_records is not true/],
      ['rehearsal on', `${PRE_SWITCH_VALUES}rehearse_launch_base_address = true\n`, /rehearse_launch_base_address is on/],
      ['alias flag absent', PRE_SWITCH_VALUES.replace('enable_apex_alias_records     = false\n', ''), /enable_apex_alias_records is not set/],
      ['login flag absent', PRE_SWITCH_VALUES.replace('enable_cutover_login_alarm  = false\n', ''), /enable_cutover_login_alarm is not set/],
      ['half set, login watch off', SWITCHED_VALUES.replace('enable_cutover_login_alarm = true', 'enable_cutover_login_alarm = false'), /half set/],
      ['half set, archive still on preview', SWITCHED_VALUES.replace('archive_platform_url = ""', 'archive_platform_url = "https://preview.footbag.org"'), /half set/],
    ];
    for (const [name, content, why] of cases) {
      switchSetup({ values: content });
      writeFileSync(calls, '', 'utf-8');
      expectRefusedUntouched(runLaunch([...SWITCH, '--yes']), name, content, why);
    }
  });

  // Defect caught: a legacy name added onto the apex since the mirror was
  // written would be left resolving to a distribution that refuses it, or a
  // name the legacy operator removed would still be mirrored as if live.
  it('refuses when the names riding the apex in the capture differ from the mirrored ones', () => {
    const added = SWITCH_CAPTURE.replace('www.footbag.org.\t86400', 'new.footbag.org.\t86400\tIN\tCNAME\twww.footbag.org.\nwww.footbag.org.\t86400');
    switchSetup({ capture: added });
    expectRefusedUntouched(runLaunch([...SWITCH, '--yes']), 'added', PRE_SWITCH_VALUES, /resync-zone-mirror\.sh --with-removals/);

    const dropped = PRE_SWITCH_VALUES.replace('  "ftp"                = "footbag.org."\n', '');
    switchSetup({ values: dropped });
    writeFileSync(calls, '', 'utf-8');
    expectRefusedUntouched(runLaunch([...SWITCH, '--yes']), 'dropped', dropped, /resync-zone-mirror\.sh --with-removals/);
  });
});

describe('production-cutover.sh record-switch: the plan must be exactly the switch', () => {
  // Defect caught: other pending changes would ride along under the switch.
  it('refuses a tree with other changes pending before planning the switch', () => {
    switchSetup();
    const r = runLaunch([...SWITCH, '--yes'], { STUB_CURRENT_PLAN_RC: '2' });
    expectRefusedUntouched(r, 'pending', PRE_SWITCH_VALUES, /other changes are pending/, true);
    expect(callLog()).not.toMatch(/^terraform plan-saved/m);
  });

  // Defect caught: a switch plan that destroys something else, leaves an
  // apex-riding name served, never actually moves the apex, or comes up
  // without the IPv6 pair would be applied as though it were the switch.
  it('refuses any plan that is not exactly the switch, with the file unchanged', () => {
    const cases: Array<[string, PlanShape, RegExp]> = [
      ['destroys the apex', { deletes: [...RIDING, 'aws_route53_record.apex_a[0]'] }, /would destroy aws_route53_record\.apex_a\[0\]/],
      ['destroys a mirrored name', { deletes: [...RIDING, ...SWITCH_STAYS] }, /would destroy aws_route53_record\.legacy_mirror_cname\["list"\]/],
      ['leaves a riding name the state holds', { deletes: RIDING.filter((a) => !a.includes('"ftp"')) }, /leaves aws_route53_record\.legacy_apex_cnames\["ftp"\] in place/],
      [
        'a riding name in the capture the plan does not remove',
        { prior: [...RIDING.filter((a) => !a.includes('"worlds"')), ...FLIPPED, ...SWITCH_STAYS], deletes: RIDING.filter((a) => !a.includes('"worlds"')) },
        /does not remove worlds/,
      ],
      ['creates something else', { creates: [...ALIAS_PAIR, 'aws_s3_bucket.extra[0]'] }, /would create aws_s3_bucket\.extra\[0\]/],
      ['no IPv6 pair', { creates: ['aws_route53_record.apex_aaaa[0]'] }, /does not create aws_route53_record\.www_aaaa\[0\]/],
      ['the apex not switched', { updates: ['aws_route53_record.www[0]'] }, /does not switch aws_route53_record\.apex_a\[0\]/],
      ['a replacement', { other: [['aws_route53_record.www[0]', ['delete', 'create']]], updates: ['aws_route53_record.apex_a[0]'] }, /would delete,create aws_route53_record\.www\[0\]/],
      ['no prior state', { prior: null }, /no prior state/],
    ];
    for (const [name, shape, why] of cases) {
      switchSetup({ plan: shape });
      writeFileSync(calls, '', 'utf-8');
      const r = runLaunch([...SWITCH, '--yes']);
      expect(r.status, name).not.toBe(0);
      expect(r.report, name).toMatch(why);
      expect(values(), name).toBe(PRE_SWITCH_VALUES);
      expect(callLog(), name).not.toMatch(/^apply /m);
      expect(readdirSync(join(dir, 'tmp')), name).toEqual([]);
    }
  });

  // Defect caught: a plan terraform could not make taken as the switch.
  it('stops with the file unchanged when the switch plan fails', () => {
    switchSetup();
    const r = runLaunch([...SWITCH, '--yes'], { STUB_SAVED_PLAN_RC: '1' });
    expectRefusedUntouched(r, 'plan failed', PRE_SWITCH_VALUES, /record-switch plan of production failed/, true);
  });
});

describe('production-cutover.sh record-switch: the write and the apply', () => {
  // Defect caught: the irreversible switch applied with no one to confirm it.
  it('writes nothing and applies nothing without a terminal to confirm on', () => {
    switchSetup();
    expectRefusedUntouched(runLaunch(SWITCH), 'no terminal', PRE_SWITCH_VALUES, /no terminal to confirm on/, true);
  });

  // Defect caught: the write must change exactly the switch's settings, keep
  // every other line including the operator address, plan from an override
  // carrying only those settings, and prove the tree plans clean afterwards.
  it('writes exactly the switch settings, applies production and proves the tree plans clean', () => {
    switchSetup();
    const r = runLaunch([...SWITCH, '--yes']);
    expect(r.status, r.stderr).toBe(0);
    expect(values()).toBe(SWITCHED_VALUES);
    const log = callLog();
    expect(log.indexOf('terraform plan-saved')).toBeGreaterThan(-1);
    expect(log.indexOf('terraform plan-saved')).toBeLessThan(log.indexOf('apply --target production'));
    expect(log.indexOf('apply --target production')).toBeLessThan(log.indexOf('terraform plan-after-apply'));
    expect(log).not.toMatch(/^leak /m);
    expect(varFile()).toBe('enable_apex_alias_records = true\nenable_cutover_login_alarm = true\narchive_platform_url = ""\n');
    expect(r.stdout).not.toContain(SENSITIVE);
    for (const a of RIDING) expect(r.stdout, a).toContain(`  removed by this plan: ${a}`);
    expect(r.report).toMatch(/record switch in production: applied/);
    expect(log).toMatch(/^plan-dir-mode 700$/m);
    expect(readdirSync(join(dir, 'tmp'))).toEqual([]);
  });

  // Defect caught: a file that never set the archive address would gain one,
  // or be refused, when the derived default is already what the switch wants.
  it('leaves an archive address that was never set unset', () => {
    const noUrl = PRE_SWITCH_VALUES.replace('archive_platform_url = "https://preview.footbag.org"\n', '');
    switchSetup({ values: noUrl });
    const r = runLaunch([...SWITCH, '--yes']);
    expect(r.status, r.stderr).toBe(0);
    expect(values()).toBe(SWITCHED_VALUES.replace('archive_platform_url = ""\n', ''));
  });

  // Defect caught: a failed apply, or one that left changes behind, reported
  // as the switch.
  it('fails the run when the apply fails or the tree still plans changes after it', () => {
    switchSetup();
    const failed = runLaunch([...SWITCH, '--yes'], { STUB_APPLY_RC: '1' });
    expect(failed.status).not.toBe(0);
    expect(failed.report).toMatch(/apply did not land/);
    expect(values()).toBe(SWITCHED_VALUES);

    switchSetup();
    writeFileSync(calls, '', 'utf-8');
    const dirty = runLaunch([...SWITCH, '--yes'], { STUB_AFTER_APPLY_PLAN_RC: '2' });
    expect(dirty.status).not.toBe(0);
    expect(dirty.report).toMatch(/still plans changes/);
  });

  // Defect caught: a run that stopped between the write and the apply could
  // never be finished, a finished switch would be applied again, or a re-run
  // would apply something that is not the switch under its name.
  it('finishes a switch whose write landed, leaves a finished one alone, and refuses a pending change that is not the switch', () => {
    switchSetup({ values: SWITCHED_VALUES, plan: { prior: [...RIDING, ...FLIPPED, ...SWITCH_STAYS, ...ALIAS_PAIR], creates: [] } });
    const r = runLaunch([...SWITCH, '--yes'], { STUB_CURRENT_PLAN_RC: '2' });
    expect(r.status, r.stderr).toBe(0);
    expect(callLog()).toMatch(/^terraform plan-saved$/m);
    expect(callLog()).toMatch(/^apply --target production$/m);
    expect(values()).toBe(SWITCHED_VALUES);

    switchSetup({ values: SWITCHED_VALUES });
    writeFileSync(calls, '', 'utf-8');
    const done = runLaunch([...SWITCH, '--yes']);
    expect(done.status, done.stderr).toBe(0);
    expect(done.report).toMatch(/already in production/);
    expect(callLog()).not.toMatch(/^apply /m);

    switchSetup({ values: SWITCHED_VALUES, plan: { deletes: [...RIDING, 'aws_route53_record.apex_a[0]'] } });
    writeFileSync(calls, '', 'utf-8');
    const other = runLaunch([...SWITCH, '--yes'], { STUB_CURRENT_PLAN_RC: '2' });
    expect(other.status).not.toBe(0);
    expect(other.report).toMatch(/would destroy aws_route53_record\.apex_a\[0\]/);
    expect(callLog()).not.toMatch(/^apply /m);
  });

  // Defect caught: a dry run that planned, wrote or applied.
  it('changes nothing on a dry run, after checking the window and the capture', () => {
    switchSetup();
    const r = runLaunch([...SWITCH, '--dry-run']);
    expect(r.status, r.stderr).toBe(0);
    expect(values()).toBe(PRE_SWITCH_VALUES);
    expect(callLog()).not.toMatch(/^terraform plan/m);
  });
});

// ── STAGE notice-raise ───────────────────────────────────────────────────────

const RAISE = ['--target', 'production', '--stage', 'notice-raise'];

/** The production values file after launch: the notice and the preview off,
 *  the apex on the platform, the mirror gone. */
const LIVE_VALUES = [
  'environment                  = "production"',
  SENSITIVE_LINE,
  'enable_legacy_mirror_records = false',
  'enable_platform_custom_domain = true',
  'enable_preview_record = false',
  'enable_apex_alias_records     = true',
  'enable_cutover_notice = false',
  'ses_enable_mail_records     = true',
  'enable_cutover_login_alarm  = true',
  '',
].join('\n');

/** The same file after the raise's write, written out by hand. */
const RAISED_VALUES = LIVE_VALUES.replace('enable_preview_record = false', 'enable_preview_record = true').replace(
  'enable_cutover_notice = false',
  'enable_cutover_notice = true',
);

const PREVIEW_PAIR = ['aws_route53_record.preview_a[0]', 'aws_route53_record.preview_aaaa[0]'];
const NOTICE_FUNCTION = 'aws_cloudfront_function.apex_redirect[0]';
const RAISE_STAYS = ['aws_route53_record.apex_a[0]'];

/** By default, exactly the raise: the notice compiled into the edge function,
 *  the preview pair created, and the window alarms the notice keeps absent
 *  destroyed, the zero-logins watch among them. */
function raisePlan(shape: PlanShape = {}): PlanShape {
  return {
    prior: [...ALARMS, ZERO_LOGINS, ...RAISE_STAYS, NOTICE_FUNCTION],
    deletes: [...ALARMS, ZERO_LOGINS],
    creates: PREVIEW_PAIR,
    updates: [NOTICE_FUNCTION],
    noop: RAISE_STAYS,
    ...shape,
  };
}

function raiseSetup(opts: { values?: string; plan?: PlanShape } = {}): void {
  setValues(opts.values ?? LIVE_VALUES);
  writeFileSync(join(dir, 'plan.json'), planJson(raisePlan(opts.plan)), 'utf-8');
}

function runRaise(args: string[], env: Record<string, string> = {}) {
  return runLaunch(args, env, { noCapture: true });
}

describe('production-cutover.sh notice-raise: where and when it may run, each beside a run it lets through', () => {
  // Defect caught: the raise run against staging would edit a values file
  // with no notice to raise.
  it('refuses any target but production before reading anything', () => {
    raiseSetup();
    const r = runRaise(['--target', 'staging', '--stage', 'notice-raise', '--yes']);
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/production only/);
    expect(callLog()).toBe('');
    const ok = runRaise([...RAISE, '--yes']);
    expect(ok.status, ok.stderr).toBe(0);
  });

  // Defect caught: a raise before the apex is switched is the window state,
  // not a rollback; without the custom domain or under a rehearsal Terraform
  // refuses the notice mid-incident; a half-set pair is neither state.
  it('refuses outside a launched site or half set, with the file unchanged and nothing planned', () => {
    const cases: Array<[string, string, RegExp]> = [
      ['custom domain off', LIVE_VALUES.replace('enable_platform_custom_domain = true', 'enable_platform_custom_domain = false'), /enable_platform_custom_domain is not true/],
      ['apex not switched', LIVE_VALUES.replace('enable_apex_alias_records     = true', 'enable_apex_alias_records     = false'), /before the window/],
      ['rehearsal on', `${LIVE_VALUES}rehearse_launch_base_address = true\n`, /rehearse_launch_base_address is on/],
      ['notice flag absent', LIVE_VALUES.replace('enable_cutover_notice = false\n', ''), /enable_cutover_notice is not set/],
      ['preview flag absent', LIVE_VALUES.replace('enable_preview_record = false\n', ''), /enable_preview_record is not set/],
      ['half set', LIVE_VALUES.replace('enable_cutover_notice = false', 'enable_cutover_notice = true'), /half set/],
    ];
    for (const [name, content, why] of cases) {
      raiseSetup({ values: content });
      writeFileSync(calls, '', 'utf-8');
      expectRefusedUntouched(runRaise([...RAISE, '--yes']), name, content, why);
    }
  });
});

describe('production-cutover.sh notice-raise: the plan must be exactly the raise', () => {
  // Defect caught: other pending changes would ride along on the rollback.
  it('refuses a tree with other changes pending before planning the raise', () => {
    raiseSetup();
    const r = runRaise([...RAISE, '--yes'], { STUB_CURRENT_PLAN_RC: '2' });
    expectRefusedUntouched(r, 'pending', LIVE_VALUES, /other changes are pending/, true);
    expect(callLog()).not.toMatch(/^terraform plan-saved/m);
  });

  // Defect caught: a raise plan that destroys something else, keeps an alarm
  // that would page all through the restore, never compiles the notice in, or
  // leaves the operator with no preview name would be applied as the raise.
  it('refuses any plan that is not exactly the raise, with the file unchanged', () => {
    const cases: Array<[string, PlanShape, RegExp]> = [
      ['destroys the apex', { deletes: [...ALARMS, ZERO_LOGINS, 'aws_route53_record.apex_a[0]'] }, /would destroy aws_route53_record\.apex_a\[0\]/],
      ['leaves an alarm the state holds', { deletes: [...ALARMS.filter((a) => !a.includes('5xx')), ZERO_LOGINS] }, /leaves aws_cloudwatch_metric_alarm\.cloudfront_5xx\[0\] in place/],
      ['creates something else', { creates: [...PREVIEW_PAIR, 'aws_s3_bucket.extra[0]'] }, /would create aws_s3_bucket\.extra\[0\]/],
      ['no preview IPv6', { creates: ['aws_route53_record.preview_a[0]'] }, /does not create aws_route53_record\.preview_aaaa\[0\]/],
      ['the notice not compiled in', { updates: [] }, /does not change aws_cloudfront_function\.apex_redirect\[0\]/],
      ['a replacement', { other: [['aws_cloudfront_distribution.main[0]', ['delete', 'create']]] }, /would delete,create aws_cloudfront_distribution\.main\[0\]/],
      ['no prior state', { prior: null }, /no prior state/],
    ];
    for (const [name, shape, why] of cases) {
      raiseSetup({ plan: shape });
      writeFileSync(calls, '', 'utf-8');
      const r = runRaise([...RAISE, '--yes']);
      expect(r.status, name).not.toBe(0);
      expect(r.report, name).toMatch(why);
      expect(values(), name).toBe(LIVE_VALUES);
      expect(callLog(), name).not.toMatch(/^apply /m);
      expect(readdirSync(join(dir, 'tmp')), name).toEqual([]);
    }
  });

  // Defect caught: with the watch never armed, a raise refused for not
  // destroying an alarm the state does not hold.
  it('destroys only the alarms the state holds', () => {
    raiseSetup({ plan: { prior: [...ALARMS, ...RAISE_STAYS, NOTICE_FUNCTION], deletes: ALARMS } });
    const r = runRaise([...RAISE, '--yes']);
    expect(r.status, r.stderr).toBe(0);
    expect(values()).toBe(RAISED_VALUES);
  });
});

describe('production-cutover.sh notice-raise: the write and the apply', () => {
  // Defect caught: the public site taken private with no one to confirm it.
  it('writes nothing and applies nothing without a terminal to confirm on', () => {
    raiseSetup();
    expectRefusedUntouched(runRaise(RAISE), 'no terminal', LIVE_VALUES, /no terminal to confirm on/, true);
  });

  // Defect caught: the write must change exactly the notice and the preview,
  // keep every other line, plan from an override carrying only those two, and
  // prove the tree plans clean afterwards.
  it('writes exactly the notice and the preview, applies production and proves the tree plans clean', () => {
    raiseSetup();
    const r = runRaise([...RAISE, '--yes']);
    expect(r.status, r.stderr).toBe(0);
    expect(values()).toBe(RAISED_VALUES);
    const log = callLog();
    expect(log.indexOf('terraform plan-saved')).toBeGreaterThan(-1);
    expect(log.indexOf('terraform plan-saved')).toBeLessThan(log.indexOf('apply --target production'));
    expect(log.indexOf('apply --target production')).toBeLessThan(log.indexOf('terraform plan-after-apply'));
    expect(log).not.toMatch(/^leak /m);
    expect(varFile()).toBe('enable_cutover_notice = true\nenable_preview_record = true\n');
    expect(r.stdout).not.toContain(SENSITIVE);
    expect(r.report).toMatch(/notice raise in production: applied/);
    expect(readdirSync(join(dir, 'tmp'))).toEqual([]);
  });

  // Defect caught: a failed apply, or one that left changes behind, reported
  // as the raise.
  it('fails the run when the apply fails or the tree still plans changes after it', () => {
    raiseSetup();
    const failed = runRaise([...RAISE, '--yes'], { STUB_APPLY_RC: '1' });
    expect(failed.status).not.toBe(0);
    expect(failed.report).toMatch(/apply did not land/);
    expect(values()).toBe(RAISED_VALUES);

    raiseSetup();
    writeFileSync(calls, '', 'utf-8');
    const dirty = runRaise([...RAISE, '--yes'], { STUB_AFTER_APPLY_PLAN_RC: '2' });
    expect(dirty.status).not.toBe(0);
    expect(dirty.report).toMatch(/still plans changes/);
  });

  // Defect caught: a raise whose write landed could never be finished, or a
  // finished one would be applied again.
  it('finishes a raise whose write landed, and leaves a finished one alone', () => {
    raiseSetup({ values: RAISED_VALUES, plan: { prior: [...ALARMS, ...RAISE_STAYS, NOTICE_FUNCTION, ...PREVIEW_PAIR], creates: [], deletes: ALARMS, updates: [] } });
    const r = runRaise([...RAISE, '--yes'], { STUB_CURRENT_PLAN_RC: '2' });
    expect(r.status, r.stderr).toBe(0);
    expect(callLog()).toMatch(/^apply --target production$/m);
    expect(values()).toBe(RAISED_VALUES);

    raiseSetup({ values: RAISED_VALUES });
    writeFileSync(calls, '', 'utf-8');
    const done = runRaise([...RAISE, '--yes']);
    expect(done.status, done.stderr).toBe(0);
    expect(done.report).toMatch(/already in production/);
    expect(callLog()).not.toMatch(/^apply /m);
  });
});

// ── The launch's two runs: www published first ───────────────────────────────

const BASE_PARAM = 'aws_ssm_parameter.app_public_base_url[0]';

/** The first run's plan: the base-address parameter moved to www, nothing
 *  else. */
const PUBLISH_PLAN: PlanShape = { prior: [BASE_PARAM, ...STAYS], deletes: [], creates: [], updates: [BASE_PARAM], noop: STAYS };

describe('production-cutover.sh launch: www is published and on the host before the notice lifts', () => {
  // Defect caught: the launch would lift the notice while the host still
  // builds against preview, so www refuses every form post until a deploy.
  it('first publishes www alone, applies it and stops for the deploy', () => {
    launchSetup({ values: PRE_LAUNCH_VALUES, plan: PUBLISH_PLAN });
    const r = runLaunch([...LAUNCH, '--yes']);
    expect(r.status, r.stderr).toBe(0);
    expect(values()).toBe(PUBLISHED_VALUES);
    expect(varFile()).toBe('launch_www_base_address = true\n');
    expect(callLog()).toMatch(/^apply --target production$/m);
    expect(callLog()).not.toMatch(/^curl /m);
    expect(r.report).toMatch(/launch base address in production: applied/);
    expect(r.report).toMatch(/code-only deploy/);
  });

  // Defect caught: the first run would carry the launch itself, or anything
  // else pending, under the base-address step's name.
  it('refuses a first-run plan that is anything but the base address', () => {
    const cases: Array<[string, PlanShape, RegExp]> = [
      ['the base address not moved', { ...PUBLISH_PLAN, updates: [] }, /does not update aws_ssm_parameter\.app_public_base_url\[0\] in place/],
      ['the notice lifted too', { ...PUBLISH_PLAN, updates: [BASE_PARAM, NOTICE_FUNCTION] }, /would update aws_cloudfront_function\.apex_redirect\[0\]/],
      ['a record removed', { ...PUBLISH_PLAN, deletes: ['aws_route53_record.preview_a[0]'] }, /would destroy aws_route53_record\.preview_a\[0\]/],
      ['an alarm created', { ...PUBLISH_PLAN, creates: ALARMS }, /would create aws_route53_health_check\.site_ready\[0\]/],
    ];
    for (const [name, shape, why] of cases) {
      launchSetup({ values: PRE_LAUNCH_VALUES, plan: shape });
      writeFileSync(calls, '', 'utf-8');
      const r = runLaunch([...LAUNCH, '--yes']);
      expect(r.status, name).not.toBe(0);
      expect(r.report, name).toMatch(why);
      expect(values(), name).toBe(PRE_LAUNCH_VALUES);
      expect(callLog(), name).not.toMatch(/^apply /m);
    }
  });

  // Defect caught: the second run would lift the notice before the deploy put
  // www on the host, or on a robots.txt it could not read.
  it('lifts the notice only once preview serves the www robots.txt', () => {
    for (const [name, env, why] of [
      ['host still on preview', { STUB_ROBOTS: ROBOTS_ON_PREVIEW }, /not on the www base address/],
      ['robots unreadable', { STUB_CURL_RC: '6' }, /could not read https:\/\/preview\.footbag\.org\/robots\.txt/],
      ['a sitemap on another name', { STUB_ROBOTS: ROBOTS_ON_WWW.replace('www.footbag.org', 'preview.footbag.org') }, /not on the www base address/],
    ] as Array<[string, Record<string, string>, RegExp]>) {
      launchSetup();
      writeFileSync(calls, '', 'utf-8');
      const r = runLaunch([...LAUNCH, '--yes'], env);
      expect(r.status, name).not.toBe(0);
      expect(r.report, name).toMatch(why);
      expect(values(), name).toBe(WINDOW_VALUES);
      expect(callLog(), name).toMatch(/^curl https:\/\/preview\.footbag\.org\/robots\.txt$/m);
      expect(callLog(), name).not.toMatch(/^apply /m);
    }
    launchSetup();
    writeFileSync(calls, '', 'utf-8');
    const ok = runLaunch([...LAUNCH, '--yes']);
    expect(ok.status, ok.stderr).toBe(0);
    expect(ok.report).toMatch(/host is on the www base address/);
    expect(varFile()).toContain('launch_www_base_address = false');
    expect(values()).toBe(LAUNCHED_VALUES);
  });

  // Defect caught: a first run whose write landed but whose apply did not
  // would be taken for a published base address and launched on.
  it('finishes a first run whose apply did not land, and stops for the deploy', () => {
    launchSetup({ values: PUBLISHED_VALUES, plan: PUBLISH_PLAN });
    const r = runLaunch([...LAUNCH, '--yes'], { STUB_CURRENT_PLAN_RC: '2' });
    expect(r.status, r.stderr).toBe(0);
    expect(callLog()).toMatch(/^apply --target production$/m);
    expect(callLog()).not.toMatch(/^curl /m);
    expect(values()).toBe(PUBLISHED_VALUES);
    expect(r.report).toMatch(/launch base address in production: applied/);
  });

  // Defect caught: a lifted notice with the launch-only setting still on is no
  // state the stage makes, and Terraform would refuse its next plan.
  it('refuses the notice lifted with www still published by the first run', () => {
    const odd = LAUNCHED_VALUES.replace('launch_www_base_address = false', 'launch_www_base_address = true');
    launchSetup({ values: odd });
    expectRefusedUntouched(runLaunch([...LAUNCH, '--yes']), 'odd', odd, /still on/);
  });

  // Defect caught: a stage other than the launch run between the launch's
  // two runs would change the window under a published www.
  it('refuses every other stage between the launch runs', () => {
    switchSetup({ values: `${PRE_SWITCH_VALUES}launch_www_base_address = true\n` });
    expectRefusedUntouched(runLaunch([...SWITCH, '--yes']), 'record switch', `${PRE_SWITCH_VALUES}launch_www_base_address = true\n`, /launch_www_base_address is on/);
    raiseSetup({ values: `${LIVE_VALUES}launch_www_base_address = true\n` });
    writeFileSync(calls, '', 'utf-8');
    expectRefusedUntouched(runRaise([...RAISE, '--yes']), 'notice raise', `${LIVE_VALUES}launch_www_base_address = true\n`, /launch_www_base_address is on/);
    for (const [stage, content] of [
      ['custom-domain', `${PASS1_VALUES}launch_www_base_address = true\n`],
      ['window', `${CUSTOM_VALUES}launch_www_base_address = true\n`],
      ['rehearsal', `${WINDOWED_VALUES}launch_www_base_address = true\n`],
    ] as Array<[string, string]>) {
      pass2Setup({ values: content });
      writeFileSync(calls, '', 'utf-8');
      expectRefusedUntouched(runPass2(['--target', 'production', '--stage', stage, '--yes']), stage, content, /launch_www_base_address is on/);
    }
  });

  // Defect caught: a dry run that published www.
  it('changes nothing on a dry run of the first run', () => {
    launchSetup({ values: PRE_LAUNCH_VALUES, plan: PUBLISH_PLAN });
    const r = runLaunch([...LAUNCH, '--dry-run']);
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toMatch(/Would set launch_www_base_address to true/);
    expect(values()).toBe(PRE_LAUNCH_VALUES);
    expect(callLog()).not.toMatch(/^terraform plan/m);
  });
});

// ── The pass-2 stages ────────────────────────────────────────────────────────

const DISTRIBUTION = 'placeholder.cloudfront.net';
const ZONE_NS = ['ns-101.awsdns-12.com', 'ns-202.awsdns-25.net', 'ns-303.awsdns-37.org', 'ns-404.awsdns-50.co.uk'];
const CONVERGED = '2026-12-15T10:00Z';
/** Epoch seconds of CONVERGED, and of the earliest moment the 25-hour wait
 *  (the registry's 3600 plus the legacy zone's 86400 NS lifetime) allows. */
const CONVERGED_EPOCH = Date.parse('2026-12-15T10:00:00Z') / 1000;
const WAIT_OVER = String(CONVERGED_EPOCH + 90000);

/** Pass 1, as the archive base stack leaves it: the archive on its
 *  cloudfront.net name, the mirror serving, nothing of the custom domain. */
const PASS1_VALUES = [
  'environment                  = "production"',
  SENSITIVE_LINE,
  'enable_legacy_mirror_records = true',
  'enable_platform_custom_domain = false',
  'enable_preview_record         = false',
  'enable_apex_alias_records     = false',
  'enable_cutover_notice         = false',
  'enable_cutover_login_alarm  = false',
  'enable_archive = true',
  'enable_archive_custom_domain = false',
  `archive_platform_url = "https://${DISTRIBUTION}"`,
  '',
].join('\n');

/** The same file after the custom-domain write, written out by hand. */
const CUSTOM_VALUES = [
  'environment                  = "production"',
  SENSITIVE_LINE,
  'enable_legacy_mirror_records = true',
  'enable_platform_custom_domain = true',
  'enable_preview_record = true',
  'enable_apex_alias_records     = false',
  'enable_cutover_notice         = false',
  'enable_cutover_login_alarm  = false',
  'enable_archive = true',
  'enable_archive_custom_domain = true',
  'archive_platform_url = "https://preview.footbag.org"',
  '',
].join('\n');

/** The custom-domain file with the notice up: the window state. */
const WINDOWED_VALUES = CUSTOM_VALUES.replace('enable_cutover_notice         = false', 'enable_cutover_notice = true');

/** Pass 1 again after the undo's write: the three flags back off where they
 *  stood, and the archive back on the distribution's own name. */
const UNDONE_VALUES = CUSTOM_VALUES.replace('enable_platform_custom_domain = true', 'enable_platform_custom_domain = false')
  .replace('enable_preview_record = true', 'enable_preview_record = false')
  .replace('enable_archive_custom_domain = true', 'enable_archive_custom_domain = false')
  .replace('archive_platform_url = "https://preview.footbag.org"', `archive_platform_url = "https://${DISTRIBUTION}"`);

const CUSTOM_SET = [
  'aws_acm_certificate.main[0]',
  'aws_route53_record.cert_validation["footbag.org"]',
  'aws_route53_record.cert_validation["www.footbag.org"]',
  'aws_route53_record.cert_validation["preview.footbag.org"]',
  'aws_acm_certificate_validation.main[0]',
  'aws_route53_record.preview_a[0]',
  'aws_route53_record.preview_aaaa[0]',
  'aws_cloudwatch_metric_alarm.acm_cert_expiry[0]',
  'aws_acm_certificate.archive[0]',
  'aws_route53_record.archive_cert_validation["archive.footbag.org"]',
  'aws_acm_certificate_validation.archive[0]',
  'aws_route53_record.archive_a[0]',
  'aws_route53_record.archive_aaaa[0]',
  'aws_cloudwatch_metric_alarm.acm_archive_cert_expiry[0]',
];
const COOKIE_PARAM = 'aws_ssm_parameter.app_archive_cookie_domain[0]';
const DIST = 'aws_cloudfront_distribution.main[0]';
const PASS2_STAYS = ['aws_route53_record.apex_a[0]', 'aws_route53_record.www[0]'];

/** By default, exactly the custom domain: everything it brings created, the
 *  distribution and the base address moved, the archive's pages rebuilt. */
function customPlan(shape: PlanShape = {}): PlanShape {
  return {
    prior: [...PASS2_STAYS, DIST, BASE_PARAM],
    deletes: [],
    creates: [...CUSTOM_SET, COOKIE_PARAM],
    updates: [DIST, BASE_PARAM, 'aws_s3_object.archive_denied_page[0]'],
    noop: PASS2_STAYS,
    ...shape,
  };
}

/** The cutover log's zone-move section with the delegation's convergence
 *  time recorded as the zone move records it. */
function delegationLog(converged: string = CONVERGED): string {
  return [
    '# Cutover log',
    '',
    '### 4a. The zone move and the mail preparation',
    '',
    '| Reading | Value | When measured | Notes |',
    '|---|---|---|---|',
    '| Registrar nameserver change saved | 2026-12-14T09:00Z | | |',
    `| Delegation converged | ${converged} | | |`,
    '',
    '### 4b. T-0: the alias flip, then the mail apply',
    '',
    '| Reading | Value | When measured | Notes |',
    '|---|---|---|---|',
    '| Delegation converged | 2026-12-01T00:00Z | | a row of the same name in another section |',
    '',
  ].join('\n');
}

function pass2Setup(opts: { values?: string; plan?: PlanShape; log?: string | null } = {}): void {
  setValues(opts.values ?? PASS1_VALUES);
  writeFileSync(join(dir, 'plan.json'), planJson(opts.plan ?? customPlan()), 'utf-8');
  const log = join(dir, 'CUTOVER_LOG.md');
  if (opts.log === null) rmSync(log, { force: true });
  else writeFileSync(log, opts.log ?? delegationLog(), 'utf-8');
}

/** Runs a pass-2 stage with its seams: the delegation converged 25 hours ago
 *  and answered by the public resolver, CloudFront reporting no conflict. */
function runPass2(args: string[], env: Record<string, string> = {}) {
  return runLaunch(args, {
    PRODUCTION_CUTOVER_NOW: WAIT_OVER,
    STUB_OUT_cloudfront_domain: DISTRIBUTION,
    STUB_OUT_cloudfront_distribution_id: 'E1EXAMPLE0XYZ',
    STUB_OUT_route53_name_servers: JSON.stringify(ZONE_NS),
    STUB_DELEGATED_NS: ZONE_NS.map((n) => `${n.toUpperCase()}.`).join(' '),
    ...env,
  }, { noCapture: true });
}

const CUSTOM = ['--target', 'production', '--stage', 'custom-domain'];

describe('production-cutover.sh custom-domain: where and when it may run, each beside a run it lets through', () => {
  // Defect caught: a pass-2 stage run against staging, or --undo on a stage
  // that has none, would reach a values file it has no business in.
  it('refuses staging, and --undo on any stage but the custom domain and the window', () => {
    pass2Setup();
    const staging = runPass2(['--target', 'staging', '--stage', 'custom-domain', '--yes']);
    expect(staging.status).toBe(2);
    expect(staging.stderr).toMatch(/production only/);
    for (const stage of ['ses-domain', 'rehearsal', 'record-switch', 'notice-raise', 'archive-base']) {
      const r = runPass2(['--target', 'production', '--stage', stage, '--undo', '--yes']);
      expect(r.status, stage).toBe(2);
      expect(r.stderr, stage).toMatch(/--undo is the custom-domain and window stages' own/);
    }
    expect(callLog()).toBe('');
    const ok = runPass2([...CUSTOM, '--yes']);
    expect(ok.status, ok.stderr).toBe(0);
  });

  // Defect caught: the custom domain applied over a state that is not pass 1
  // (the record switch made, the notice up, the archive not built, a half
  // write, a rehearsal running) would move the wrong names.
  it('refuses outside pass 1 or half set, with the file unchanged and nothing planned', () => {
    const cases: Array<[string, string, RegExp]> = [
      ['alias on', PASS1_VALUES.replace('enable_apex_alias_records     = false', 'enable_apex_alias_records     = true'), /enable_apex_alias_records is true, not false/],
      ['notice on', PASS1_VALUES.replace('enable_cutover_notice         = false', 'enable_cutover_notice         = true'), /enable_cutover_notice is true, not false/],
      ['archive off', PASS1_VALUES.replace('enable_archive = true', 'enable_archive = false'), /enable_archive is false, not true/],
      ['mirror off', PASS1_VALUES.replace('enable_legacy_mirror_records = true', 'enable_legacy_mirror_records = false'), /enable_legacy_mirror_records is false, not true/],
      ['half set', PASS1_VALUES.replace('enable_preview_record         = false', 'enable_preview_record         = true'), /half set/],
      ['archive address elsewhere', PASS1_VALUES.replace(`https://${DISTRIBUTION}`, 'https://legacy.example'), /half set/],
      ['rehearsal on', `${PASS1_VALUES}rehearse_launch_base_address = true\n`, /rehearse_launch_base_address is on/],
      ['flag neither true nor false', PASS1_VALUES.replace('enable_preview_record         = false', 'enable_preview_record         = yes'), /neither true nor false/],
    ];
    for (const [name, content, why] of cases) {
      pass2Setup({ values: content });
      writeFileSync(calls, '', 'utf-8');
      expectRefusedUntouched(runPass2([...CUSTOM, '--yes']), name, content, why);
    }
  });

  // Defect caught: the certificates validated before every resolver reads
  // the Route 53 nameservers, which hangs the apply, or with the delegation
  // not where the log says it is.
  it('waits 90000 seconds from the recorded convergence, and on the delegation itself', () => {
    const cases: Array<[string, { log?: string | null; env?: Record<string, string> }, RegExp]> = [
      ['one second early', { env: { PRODUCTION_CUTOVER_NOW: String(CONVERGED_EPOCH + 89999) } }, /89999 seconds ago; the custom-domain stage waits 90000 seconds/],
      ['no time recorded', { log: delegationLog('') }, /reads '<empty>'/],
      ['a time not in UTC', { log: delegationLog('2026-12-15 10:00') }, /not a UTC time/],
      ['a time in the future', { log: delegationLog('2026-12-30T10:00Z') }, /in the future/],
      ['no cutover log', { log: null }, /no cutover log/],
      ['not delegated', { env: { STUB_DELEGATED_NS: 'dns1.llic.net. dns2.llic.net.' } }, /not delegated to the Route 53 zone/],
      ['the resolver unreachable', { env: { STUB_DIG_RC: '9' } }, /could not ask 8\.8\.8\.8/],
    ];
    for (const [name, opt, why] of cases) {
      pass2Setup({ log: opt.log });
      writeFileSync(calls, '', 'utf-8');
      expectRefusedUntouched(runPass2([...CUSTOM, '--yes'], opt.env ?? {}), name, PASS1_VALUES, why);
    }
    pass2Setup();
    writeFileSync(calls, '', 'utf-8');
    const exact = runPass2([...CUSTOM, '--yes'], { PRODUCTION_CUTOVER_NOW: WAIT_OVER });
    expect(exact.status, exact.stderr).toBe(0);
    expect(exact.stdout).toMatch(/delegation converged: 2026-12-15T10:00Z, 90000 seconds ago/);
  });
});

describe('production-cutover.sh custom-domain: the plan must be exactly the custom domain', () => {
  // Defect caught: other pending changes would ride along on the custom domain.
  it('refuses a tree with other changes pending', () => {
    pass2Setup();
    const r = runPass2([...CUSTOM, '--yes'], { STUB_CURRENT_PLAN_RC: '2' });
    expectRefusedUntouched(r, 'pending', PASS1_VALUES, /other changes are pending/, true);
  });

  // Defect caught: a custom-domain plan that removes a record, misses a piece
  // (the archive's IPv6 name), creates something else, or never moves the
  // distribution onto the certificate would be applied as the custom domain.
  it('refuses any plan that is not exactly the custom domain, with the file unchanged', () => {
    const cases: Array<[string, PlanShape, RegExp]> = [
      ['destroys the apex', { deletes: ['aws_route53_record.apex_a[0]'] }, /would destroy aws_route53_record\.apex_a\[0\]/],
      ['misses the archive IPv6 name', { creates: CUSTOM_SET.filter((a) => !a.includes('archive_aaaa')) }, /does not create aws_route53_record\.archive_aaaa\[0\]/],
      ['creates something else', { creates: [...CUSTOM_SET, 'aws_route53_record.apex_aaaa[0]'] }, /would create aws_route53_record\.apex_aaaa\[0\]/],
      ['the distribution not moved', { updates: [BASE_PARAM] }, /does not update aws_cloudfront_distribution\.main\[0\] in place/],
      ['the base address not moved', { updates: [DIST] }, /does not update aws_ssm_parameter\.app_public_base_url\[0\] in place/],
      ['a replacement', { other: [[DIST, ['delete', 'create']]] }, /would delete,create aws_cloudfront_distribution\.main\[0\]/],
    ];
    for (const [name, shape, why] of cases) {
      pass2Setup({ plan: customPlan(shape) });
      writeFileSync(calls, '', 'utf-8');
      const r = runPass2([...CUSTOM, '--yes']);
      expect(r.status, name).not.toBe(0);
      expect(r.report, name).toMatch(why);
      expect(values(), name).toBe(PASS1_VALUES);
      expect(callLog(), name).not.toMatch(/^apply /m);
    }
  });

  // Defect caught: with the archive not requiring signed cookies, the custom
  // domain refused for not creating the cookie-domain parameter.
  it('takes the plan without the archive cookie domain', () => {
    pass2Setup({ plan: customPlan({ creates: CUSTOM_SET }) });
    const r = runPass2([...CUSTOM, '--yes']);
    expect(r.status, r.stderr).toBe(0);
    expect(values()).toBe(CUSTOM_VALUES);
  });
});

describe('production-cutover.sh custom-domain: the write, the apply and the undo', () => {
  // Defect caught: the write must change exactly the four settings, plan from
  // an override carrying only them, apply, prove the tree clean, and ask
  // CloudFront about each of the three names.
  it('writes exactly the custom-domain settings, applies and checks every name', () => {
    pass2Setup();
    const r = runPass2([...CUSTOM, '--yes']);
    expect(r.status, r.stderr).toBe(0);
    expect(values()).toBe(CUSTOM_VALUES);
    expect(varFile()).toBe([
      'enable_platform_custom_domain = true',
      'enable_preview_record = true',
      'enable_archive_custom_domain = true',
      'archive_platform_url = "https://preview.footbag.org"',
      '',
    ].join('\n'));
    const log = callLog();
    for (const alias of ['footbag.org', 'www.footbag.org', 'preview.footbag.org']) {
      expect(log, alias).toContain(`aws cloudfront list-conflicting-aliases ${alias}`);
      expect(log.indexOf(`aws cloudfront list-conflicting-aliases ${alias}`), alias).toBeGreaterThan(log.indexOf('apply --target production'));
    }
    expect(r.stdout).not.toContain(SENSITIVE);
    expect(r.report).toMatch(/custom domain in production: applied/);
    expect(readdirSync(join(dir, 'tmp'))).toEqual([]);
  });

  // Defect caught: a name another distribution overlaps, or an unreadable
  // answer, reported as a working custom domain.
  it('fails the run when another distribution overlaps a name or CloudFront cannot be asked', () => {
    pass2Setup();
    const overlap = runPass2([...CUSTOM, '--yes'], {
      STUB_CONFLICTS: '[{"Alias":"*.footbag.org","DistributionId":"E9*******ABC","AccountId":"******111111"}]',
    });
    expect(overlap.status).not.toBe(0);
    expect(overlap.report).toMatch(/www\.footbag\.org is overlapped by \*\.footbag\.org/);
    expect(values()).toBe(CUSTOM_VALUES);

    pass2Setup();
    writeFileSync(calls, '', 'utf-8');
    const failed = runPass2([...CUSTOM, '--yes'], { STUB_AWS_RC: '254' });
    expect(failed.status).not.toBe(0);
    expect(failed.report).toMatch(/list-conflicting-aliases for footbag\.org failed/);
  });

  // Defect caught: a custom domain whose write landed could never be finished,
  // or a finished one would be applied again unchecked.
  it('finishes a custom domain whose write landed, and leaves a finished one alone', () => {
    pass2Setup({ values: CUSTOM_VALUES, plan: customPlan({ updates: [] }) });
    const r = runPass2([...CUSTOM, '--yes'], { STUB_CURRENT_PLAN_RC: '2' });
    expect(r.status, r.stderr).toBe(0);
    expect(callLog()).toMatch(/^apply --target production$/m);
    expect(values()).toBe(CUSTOM_VALUES);

    pass2Setup({ values: CUSTOM_VALUES });
    writeFileSync(calls, '', 'utf-8');
    const done = runPass2([...CUSTOM, '--yes']);
    expect(done.status, done.stderr).toBe(0);
    expect(done.report).toMatch(/already in production/);
    expect(callLog()).toContain('aws cloudfront list-conflicting-aliases www.footbag.org');
    expect(callLog()).not.toMatch(/^apply /m);
  });

  // Defect caught: the undo would leave a piece of the custom domain behind,
  // or point the archive's pages anywhere but the distribution's own name.
  it('undoes it all, and refuses an undo that leaves a piece behind', () => {
    const undoPlan = customPlan({ prior: [...CUSTOM_SET, COOKIE_PARAM, ...PASS2_STAYS], deletes: [...CUSTOM_SET, COOKIE_PARAM], creates: [], updates: [DIST, BASE_PARAM] });
    pass2Setup({ values: CUSTOM_VALUES, plan: undoPlan });
    const r = runPass2([...CUSTOM, '--undo', '--yes']);
    expect(r.status, r.stderr).toBe(0);
    expect(values()).toBe(UNDONE_VALUES);
    expect(callLog()).not.toMatch(/^aws /m);

    const partial = { ...undoPlan, deletes: CUSTOM_SET.filter((a) => !a.includes('preview_aaaa')) };
    pass2Setup({ values: CUSTOM_VALUES, plan: partial });
    writeFileSync(calls, '', 'utf-8');
    const left = runPass2([...CUSTOM, '--undo', '--yes']);
    expect(left.status).not.toBe(0);
    expect(left.report).toMatch(/leaves aws_route53_record\.preview_aaaa\[0\] in place/);
    expect(values()).toBe(CUSTOM_VALUES);
  });

  // Defect caught: a dry run that planned, wrote or applied.
  it('changes nothing on a dry run, after checking the state and the delegation', () => {
    pass2Setup();
    const r = runPass2([...CUSTOM, '--dry-run']);
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toMatch(/footbag\.org is delegated to the Route 53 zone/);
    expect(values()).toBe(PASS1_VALUES);
    expect(callLog()).not.toMatch(/^terraform plan/m);
  });
});

// ── STAGE ses-domain ─────────────────────────────────────────────────────────

const SES = ['--target', 'production', '--stage', 'ses-domain'];
const SES_SET = [
  'aws_ses_domain_identity.main[0]',
  'aws_ses_domain_dkim.main[0]',
  'aws_route53_record.ses_domain_verification[0]',
  'aws_ses_domain_identity_verification.main[0]',
  'aws_route53_record.ses_dkim[0]',
  'aws_route53_record.ses_dkim[1]',
  'aws_route53_record.ses_dkim[2]',
  'aws_ses_identity_notification_topic.domain_bounce[0]',
  'aws_ses_identity_notification_topic.domain_complaint[0]',
  'aws_sesv2_email_identity_feedback_attributes.domain[0]',
];

/** The window's values file as production carries it: the domain
 *  authentication flag written, the identity flag left to its default. */
const PRE_SES_VALUES = `${CUSTOM_VALUES}ses_enable_domain_auth      = false\n`;
/** After the write, by hand: the auth flag set where it stood, the identity
 *  flag added at the end. */
const SES_VALUES = `${CUSTOM_VALUES}ses_enable_domain_auth = true\nses_enable_domain_identity = true\n`;

function sesPlan(shape: PlanShape = {}): PlanShape {
  return { prior: PASS2_STAYS, deletes: [], creates: SES_SET, updates: [], noop: PASS2_STAYS, ...shape };
}

describe('production-cutover.sh ses-domain', () => {
  // Defect caught: the identity and its authentication applied one without
  // the other, or before the delegation wait, when SES may abandon the domain.
  it('refuses a half-set pair or an early run, beside a run it lets through', () => {
    const half = PRE_SES_VALUES.replace('ses_enable_domain_auth      = false', 'ses_enable_domain_auth      = true');
    pass2Setup({ values: half, plan: sesPlan() });
    expectRefusedUntouched(runPass2([...SES, '--yes']), 'half', half, /half set/);
    pass2Setup({ values: PRE_SES_VALUES, plan: sesPlan() });
    writeFileSync(calls, '', 'utf-8');
    expectRefusedUntouched(runPass2([...SES, '--yes'], { PRODUCTION_CUTOVER_NOW: String(CONVERGED_EPOCH + 3600) }), 'early', PRE_SES_VALUES, /the ses-domain stage waits 90000 seconds/);
    pass2Setup({ values: PRE_SES_VALUES, plan: sesPlan() });
    writeFileSync(calls, '', 'utf-8');
    const ok = runPass2([...SES, '--yes']);
    expect(ok.status, ok.stderr).toBe(0);
  });

  // Defect caught: an SES plan that misses a DKIM record, creates or changes
  // anything else, or removes something would be applied as the SES domain.
  it('refuses any plan that is not exactly the SES domain', () => {
    const cases: Array<[string, PlanShape, RegExp]> = [
      ['a DKIM record missing', { creates: SES_SET.filter((a) => !a.endsWith('ses_dkim[2]')) }, /does not create aws_route53_record\.ses_dkim\[2\]/],
      ['the sender moved too', { updates: ['aws_ssm_parameter.app_ses_sender_identity[0]'] }, /would update aws_ssm_parameter\.app_ses_sender_identity\[0\]/],
      ['the mail records too', { creates: [...SES_SET, 'aws_ses_domain_mail_from.main[0]'] }, /would create aws_ses_domain_mail_from\.main\[0\]/],
      ['the sender identity removed', { deletes: ['aws_ses_email_identity.sender[0]'] }, /would destroy aws_ses_email_identity\.sender\[0\]/],
    ];
    for (const [name, shape, why] of cases) {
      pass2Setup({ values: PRE_SES_VALUES, plan: sesPlan(shape) });
      writeFileSync(calls, '', 'utf-8');
      const r = runPass2([...SES, '--yes']);
      expect(r.status, name).not.toBe(0);
      expect(r.report, name).toMatch(why);
      expect(values(), name).toBe(PRE_SES_VALUES);
      expect(callLog(), name).not.toMatch(/^apply /m);
    }
  });

  // Defect caught: a setting the values file leaves out never written, so the
  // stage could not run on the file production actually carries; or written
  // anywhere but where the file holds it.
  it('writes both settings, adding the one the file leaves out, and applies', () => {
    pass2Setup({ values: PRE_SES_VALUES, plan: sesPlan() });
    const r = runPass2([...SES, '--yes']);
    expect(r.status, r.stderr).toBe(0);
    expect(values()).toBe(SES_VALUES);
    expect(varFile()).toBe('ses_enable_domain_identity = true\nses_enable_domain_auth = true\n');
    expect(r.report).toMatch(/SES domain in production: applied/);
    expect(r.report).toMatch(/ses-sender-cutover\.sh/);
  });

  // Defect caught: a write that landed could never be finished.
  it('finishes a write that landed, and changes nothing on a dry run', () => {
    pass2Setup({ values: SES_VALUES, plan: sesPlan() });
    const r = runPass2([...SES, '--yes'], { STUB_CURRENT_PLAN_RC: '2' });
    expect(r.status, r.stderr).toBe(0);
    expect(callLog()).toMatch(/^apply --target production$/m);
    expect(values()).toBe(SES_VALUES);

    pass2Setup({ values: PRE_SES_VALUES, plan: sesPlan() });
    writeFileSync(calls, '', 'utf-8');
    const dry = runPass2([...SES, '--dry-run']);
    expect(dry.status, dry.stderr).toBe(0);
    expect(values()).toBe(PRE_SES_VALUES);
    expect(callLog()).not.toMatch(/^terraform plan/m);
  });
});

// ── STAGE window, and STAGE rehearsal ────────────────────────────────────────

const WINDOW = ['--target', 'production', '--stage', 'window'];
const REHEARSAL = ['--target', 'production', '--stage', 'rehearsal'];

/** The notice raised before the switch: the window alarms removed and the
 *  notice compiled into the edge function. */
function windowPlan(shape: PlanShape = {}): PlanShape {
  return { prior: [...ALARMS, ...PASS2_STAYS, NOTICE_FUNCTION, BASE_PARAM], deletes: ALARMS, creates: [], updates: [NOTICE_FUNCTION], noop: PASS2_STAYS, ...shape };
}
/** The notice lowered: the window alarms back, the edge function changed, the
 *  base address moved when the rehearsal gives the host www. */
function loweredPlan(shape: PlanShape = {}): PlanShape {
  return { prior: [...PASS2_STAYS, NOTICE_FUNCTION, BASE_PARAM], deletes: [], creates: ALARMS, updates: [NOTICE_FUNCTION, BASE_PARAM], noop: PASS2_STAYS, ...shape };
}

/** The rehearsal's write, by hand: the notice down where it stood, the
 *  rehearsal setting added at the end. */
const REHEARSING_VALUES = `${WINDOWED_VALUES.replace('enable_cutover_notice = true', 'enable_cutover_notice = false')}rehearse_launch_base_address = true\n`;
/** The return's write, by hand. */
const RETURNED_VALUES = `${WINDOWED_VALUES}rehearse_launch_base_address = false\n`;

describe('production-cutover.sh window', () => {
  // Defect caught: the notice raised without the custom domain and preview
  // (Terraform refuses it), after the record switch (where it is the
  // rollback's), or past launch.
  it('refuses outside the pass-2 window state, beside a run it lets through', () => {
    const cases: Array<[string, string, RegExp]> = [
      ['custom domain off', PASS1_VALUES, /enable_platform_custom_domain is false, not true/],
      ['alias on', CUSTOM_VALUES.replace('enable_apex_alias_records     = false', 'enable_apex_alias_records     = true'), /enable_apex_alias_records is true, not false/],
      ['mirror off', CUSTOM_VALUES.replace('enable_legacy_mirror_records = true', 'enable_legacy_mirror_records = false'), /notice-raise/],
      ['notice and rehearsal both on', `${WINDOWED_VALUES}rehearse_launch_base_address = true\n`, /both on/],
    ];
    for (const [name, content, why] of cases) {
      pass2Setup({ values: content, plan: windowPlan() });
      writeFileSync(calls, '', 'utf-8');
      expectRefusedUntouched(runPass2([...WINDOW, '--yes']), name, content, why);
    }
    pass2Setup({ values: CUSTOM_VALUES, plan: windowPlan() });
    writeFileSync(calls, '', 'utf-8');
    const ok = runPass2([...WINDOW, '--yes']);
    expect(ok.status, ok.stderr).toBe(0);
    expect(values()).toBe(WINDOWED_VALUES);
    expect(varFile()).toBe('enable_cutover_notice = true\n');
    expect(ok.report).toMatch(/window state in production: applied/);
    expect(ok.report).toMatch(/code-only deploy/);
  });

  // Defect caught: a window plan that keeps an alarm paging through the
  // window, never compiles the notice in, or carries anything else.
  it('refuses any plan that is not exactly the notice raised', () => {
    const cases: Array<[string, PlanShape, RegExp]> = [
      ['leaves an alarm', { deletes: ALARMS.slice(1) }, /leaves aws_route53_health_check\.site_ready\[0\] in place/],
      ['the notice not compiled in', { updates: [] }, /does not update aws_cloudfront_function\.apex_redirect\[0\] in place/],
      ['destroys a record', { deletes: [...ALARMS, 'aws_route53_record.www[0]'] }, /would destroy aws_route53_record\.www\[0\]/],
      ['creates something', { creates: ['aws_route53_record.apex_aaaa[0]'] }, /would create aws_route53_record\.apex_aaaa\[0\]/],
    ];
    for (const [name, shape, why] of cases) {
      pass2Setup({ values: CUSTOM_VALUES, plan: windowPlan(shape) });
      writeFileSync(calls, '', 'utf-8');
      const r = runPass2([...WINDOW, '--yes']);
      expect(r.status, name).not.toBe(0);
      expect(r.report, name).toMatch(why);
      expect(values(), name).toBe(CUSTOM_VALUES);
    }
  });

  // Defect caught: the rehearsal's return would leave the host on www, where
  // mail built after it links to a site still serving the legacy pages.
  it('returns from the rehearsal, moving the base address back', () => {
    const returnPlan = windowPlan({ updates: [NOTICE_FUNCTION, BASE_PARAM] });
    pass2Setup({ values: REHEARSING_VALUES, plan: returnPlan });
    const r = runPass2([...WINDOW, '--yes']);
    expect(r.status, r.stderr).toBe(0);
    expect(values()).toBe(RETURNED_VALUES);
    expect(r.report).toMatch(/rehearsal return in production: applied/);

    pass2Setup({ values: REHEARSING_VALUES, plan: windowPlan() });
    writeFileSync(calls, '', 'utf-8');
    const stuck = runPass2([...WINDOW, '--yes']);
    expect(stuck.status).not.toBe(0);
    expect(stuck.report).toMatch(/does not update aws_ssm_parameter\.app_public_base_url\[0\] in place/);
    expect(values()).toBe(REHEARSING_VALUES);
  });

  // Defect caught: the undo would bring back only some of the alarms, or run
  // in the middle of a rehearsal, skipping its return.
  it('takes the notice down again, every alarm back, never mid-rehearsal', () => {
    pass2Setup({ values: WINDOWED_VALUES, plan: loweredPlan({ updates: [NOTICE_FUNCTION] }) });
    const r = runPass2([...WINDOW, '--undo', '--yes']);
    expect(r.status, r.stderr).toBe(0);
    expect(values()).toBe(CUSTOM_VALUES.replace('enable_cutover_notice         = false', 'enable_cutover_notice = false'));

    pass2Setup({ values: WINDOWED_VALUES, plan: loweredPlan({ creates: ALARMS.slice(1) }) });
    writeFileSync(calls, '', 'utf-8');
    const short = runPass2([...WINDOW, '--undo', '--yes']);
    expect(short.status).not.toBe(0);
    expect(short.report).toMatch(/does not create aws_route53_health_check\.site_ready\[0\]/);

    pass2Setup({ values: REHEARSING_VALUES, plan: loweredPlan() });
    writeFileSync(calls, '', 'utf-8');
    expectRefusedUntouched(runPass2([...WINDOW, '--undo', '--yes']), 'mid-rehearsal', REHEARSING_VALUES, /its return \(--stage window\) comes before/);
  });

  // Defect caught: a window whose write landed could never be finished, or a
  // dry run that planned.
  it('finishes a write that landed, and changes nothing on a dry run', () => {
    pass2Setup({ values: WINDOWED_VALUES, plan: windowPlan({ updates: [] }) });
    const r = runPass2([...WINDOW, '--yes'], { STUB_CURRENT_PLAN_RC: '2' });
    expect(r.status, r.stderr).toBe(0);
    expect(callLog()).toMatch(/^apply --target production$/m);

    pass2Setup({ values: CUSTOM_VALUES, plan: windowPlan() });
    writeFileSync(calls, '', 'utf-8');
    const dry = runPass2([...WINDOW, '--dry-run']);
    expect(dry.status, dry.stderr).toBe(0);
    expect(values()).toBe(CUSTOM_VALUES);
    expect(callLog()).not.toMatch(/^terraform plan/m);
  });
});

describe('production-cutover.sh rehearsal', () => {
  // Defect caught: the rehearsal started anywhere but the window: after the
  // record switch it would be the launch itself, and from outside the window
  // the host would never come back to preview.
  it('starts only from the window state, beside a run it lets through', () => {
    const cases: Array<[string, string, RegExp]> = [
      ['notice down', CUSTOM_VALUES, /starts from the window state/],
      ['alias on', WINDOWED_VALUES.replace('enable_apex_alias_records     = false', 'enable_apex_alias_records     = true'), /enable_apex_alias_records is true, not false/],
      ['preview off', WINDOWED_VALUES.replace('enable_preview_record = true', 'enable_preview_record = false'), /enable_preview_record is false, not true/],
    ];
    for (const [name, content, why] of cases) {
      pass2Setup({ values: content, plan: loweredPlan() });
      writeFileSync(calls, '', 'utf-8');
      expectRefusedUntouched(runPass2([...REHEARSAL, '--yes']), name, content, why);
    }
    pass2Setup({ values: WINDOWED_VALUES, plan: loweredPlan() });
    writeFileSync(calls, '', 'utf-8');
    const ok = runPass2([...REHEARSAL, '--yes']);
    expect(ok.status, ok.stderr).toBe(0);
    expect(values()).toBe(REHEARSING_VALUES);
    expect(varFile()).toBe('enable_cutover_notice = false\nrehearse_launch_base_address = true\n');
    expect(ok.report).toMatch(/launch rehearsal in production: applied/);
  });

  // Defect caught: a rehearsal plan that leaves the host on preview (form
  // posts on www refused), brings back only some alarms, or carries more.
  it('refuses any plan that is not exactly the rehearsal', () => {
    const cases: Array<[string, PlanShape, RegExp]> = [
      ['base address not moved', { updates: [NOTICE_FUNCTION] }, /does not update aws_ssm_parameter\.app_public_base_url\[0\] in place/],
      ['an alarm missing', { creates: ALARMS.slice(0, 2) }, /does not create aws_cloudwatch_metric_alarm\.cloudfront_5xx\[0\]/],
      ['destroys a record', { deletes: ['aws_route53_record.preview_a[0]'] }, /would destroy aws_route53_record\.preview_a\[0\]/],
    ];
    for (const [name, shape, why] of cases) {
      pass2Setup({ values: WINDOWED_VALUES, plan: loweredPlan(shape) });
      writeFileSync(calls, '', 'utf-8');
      const r = runPass2([...REHEARSAL, '--yes']);
      expect(r.status, name).not.toBe(0);
      expect(r.report, name).toMatch(why);
      expect(values(), name).toBe(WINDOWED_VALUES);
    }
  });

  // Defect caught: a rehearsal whose write landed could never be finished.
  it('finishes a write that landed', () => {
    pass2Setup({ values: REHEARSING_VALUES, plan: loweredPlan({ updates: [] }) });
    const r = runPass2([...REHEARSAL, '--yes'], { STUB_CURRENT_PLAN_RC: '2' });
    expect(r.status, r.stderr).toBe(0);
    expect(callLog()).toMatch(/^apply --target production$/m);
    expect(values()).toBe(REHEARSING_VALUES);
  });
});
