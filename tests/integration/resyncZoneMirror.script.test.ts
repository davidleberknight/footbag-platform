/**
 * scripts/resync-zone-mirror.sh -- apply the record changes that bring the
 * Route 53 copy of footbag.org back in line with a fresh capture, then prove it.
 *
 * The run's verdict is the mirror check's verdict, so the suite drives the whole
 * run end to end against stand-ins: a terraform stub for the output reads and the
 * plan, and dig and listing stubs for the check. The apply itself needs a typed
 * word on a terminal, which no test has; the cases that reach the check do so on
 * a plan with nothing to apply, which is also the re-run after a stop between
 * the two steps.
 *
 * What must never happen: a check that runs after a refused apply and reads as
 * though the copy was re-synced; a run that passes without checking; a report
 * that lands somewhere other than the evidence directory or overwrites an earlier
 * one; or the check pointed at a server the zone does not name.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { writeFileSync, readFileSync, readdirSync, chmodSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

import { SPAWN_GUARD } from '../fixtures/spawnGuard';
import { awsIdentityStubEnv } from '../fixtures/awsIdentityStub';
import { createScratchDir, removeScratch } from '../fixtures/scratchDir';

const SCRIPT = join(process.cwd(), 'scripts/resync-zone-mirror.sh');

const CAPTURE = [
  'footbag.org.\t720\tIN\tSOA\tdns1.example.net. hostmaster.example.net. 1 2 3 4 5',
  'footbag.org.\t720\tIN\tNS\tdns1.example.net.',
  'footbag.org.\t720\tIN\tA\t198.51.100.10',
  'www.footbag.org.\t720\tIN\tCNAME\tfootbag.org.',
  '',
].join('\n');

/** The record sets the mirror holds, as the listing answers: name then type. */
const LISTING = ['footbag.org.\tSOA', 'footbag.org.\tNS', 'footbag.org.\tA', 'www.footbag.org.\tA'].join(
  '\n',
);

/** A dig stand-in answering authoritatively; the apex address is the argument. */
function digBody(apexAddress: string): string {
  return `
echo "dig $*" >> "\${DIG_LOG}"
name="\${@: -2:1}"; type="\${@: -1}"
echo ";; ->>HEADER<<- opcode: QUERY, status: NOERROR, id: 1"
echo ";; flags: qr aa rd; QUERY: 1, ANSWER: 1, AUTHORITY: 0"
case "\$name \$type" in
  "footbag.org. SOA") echo -e "footbag.org.\\t900\\tIN\\tSOA\\tns-1.example.net. a.example.net. 1 2 3 4 5" ;;
  "footbag.org. A") echo -e "footbag.org.\\t60\\tIN\\tA\\t${apexAddress}" ;;
  "www.footbag.org. A") echo -e "www.footbag.org.\\t60\\tIN\\tA\\t${apexAddress}" ;;
  "footbag.org. CAA") echo -e "footbag.org.\\t300\\tIN\\tCAA\\t0 issue \\"amazon.com\\"\\nfootbag.org.\\t300\\tIN\\tCAA\\t0 issuewild \\";\\"" ;;
  *) echo "" ;;
esac`;
}

interface Change {
  type: string;
  address: string;
  actions: string[];
}

let dir: string;
let evidence: string;
let capture: string;
let tfLog: string;
let digLog: string;

beforeEach(() => {
  dir = createScratchDir('resynczone');
  evidence = join(dir, 'evidence');
  mkdirSync(evidence);
  capture = join(dir, 'footbag.org.capture.zone');
  writeFileSync(capture, CAPTURE, 'utf-8');
  tfLog = join(dir, 'terraform.log');
  digLog = join(dir, 'dig.log');
});

afterEach(() => {
  removeScratch(dir);
});

function stub(name: string, body: string): string {
  const path = join(dir, name);
  writeFileSync(path, `#!/usr/bin/env bash\n${body}\n`, 'utf-8');
  chmodSync(path, 0o755);
  return path;
}

/**
 * One terraform stand-in serving both the output reads and the apply wrapper's
 * plan, show and apply, logging every call.
 */
function terraformStub(opts: { plan?: Change[]; zoneIdFails?: boolean } = {}): string {
  const planJson = JSON.stringify({
    variables: {},
    resource_changes: (opts.plan ?? []).map((c) => ({
      address: c.address,
      type: c.type,
      change: { actions: c.actions, before: null, after: null, after_unknown: {} },
    })),
  });
  return stub(
    'terraform',
    [
      `echo "terraform $*" >> "${tfLog}"`,
      'case " $* " in',
      '  *" output -raw route53_zone_id "*)',
      opts.zoneIdFails
        ? '    echo "Error: No outputs found. The state file either has no outputs defined" >&2; exit 1 ;;'
        : "    printf '%s' Z0TEST; exit 0 ;;",
      '  *" output -json route53_name_servers "*)',
      `    printf '%s' '["ns-1.example.net","ns-2.example.net"]'; exit 0 ;;`,
      '  *" show "*)',
      `    cat <<'PLANJSON'`,
      planJson,
      'PLANJSON',
      '    exit 0 ;;',
      'esac',
      'for arg in "$@"; do',
      '  case "$arg" in',
      '    -out=*) printf "saved-plan-body" > "${arg#-out=}" ;;',
      '  esac',
      'done',
      'exit 0',
    ].join('\n'),
  );
}

function run(
  args: string[],
  opts: { plan?: Change[]; zoneIdFails?: boolean; apexAddress?: string; evidenceDir?: string } = {},
) {
  const tf = terraformStub(opts);
  const dig = stub('dig', digBody(opts.apexAddress ?? '198.51.100.10'));
  const aws = stub('aws', `cat <<'EOF'\n${LISTING}\nEOF`);
  const r = spawnSync('bash', [SCRIPT, ...args], {
    encoding: 'utf-8',
    env: {
      ...process.env,
      ...awsIdentityStubEnv(dir),
      TF_OUTPUT_BIN: tf,
      TERRAFORM_APPLY_BIN: tf,
      FOOTBAG_DIG_BIN: dig,
      FOOTBAG_AWS_BIN: aws,
      DIG_LOG: digLog,
      RESYNC_ZONE_MIRROR_EVIDENCE_DIR: opts.evidenceDir ?? evidence,
    },
    ...SPAWN_GUARD,
  });
  return { exitCode: r.status ?? -1, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}

const read = (path: string) => (existsSync(path) ? readFileSync(path, 'utf-8') : '');
const reports = () => readdirSync(evidence).filter((f) => f.startsWith('mirror-comparison.'));
const VALID = () => ['--target', 'production', '--capture', capture];

describe('resync-zone-mirror.sh: arguments and preconditions', () => {
  it('refuses to run without a target, rather than assuming production', () => {
    const r = run(['--capture', capture]);
    expect(r.exitCode).toBe(2);
    expect(r.stderr).toMatch(/--target is required/);
    expect(read(tfLog)).toBe('');
  });

  it('refuses any target but production, the only tree holding the zone', () => {
    const r = run(['--target', 'staging', '--capture', capture]);
    expect(r.exitCode).toBe(2);
    expect(r.stderr).toMatch(/must be production/);
    expect(read(tfLog)).toBe('');
  });

  it('refuses to choose a capture for the operator, and refuses one it cannot read', () => {
    const missingFlag = run(['--target', 'production']);
    expect(missingFlag.exitCode).toBe(2);
    expect(missingFlag.stderr).toMatch(/--capture is required/);

    const missingFile = run(['--target', 'production', '--capture', join(dir, 'absent.zone')]);
    expect(missingFile.exitCode).toBe(1);
    expect(missingFile.stderr).toMatch(/not a readable file/);
    expect(read(tfLog)).toBe('');
  });

  it('refuses before planning when there is no evidence directory to write the report into', () => {
    const r = run(VALID(), { evidenceDir: join(dir, 'no-such-dir') });
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toMatch(/no evidence directory/);
    expect(read(tfLog)).not.toMatch(/ plan /);
  });

  it('stops before planning when the zone id cannot be read, and shows terraform its own words', () => {
    const r = run(VALID(), { zoneIdFails: true });
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toMatch(/could not read route53_zone_id/);
    expect(r.stderr).toMatch(/No outputs found/);
    expect(read(tfLog)).not.toMatch(/ plan /);
    expect(read(digLog)).toBe('');
  });

  it('states the steps on a dry run and reads, plans and checks nothing', () => {
    const r = run([...VALID(), '--dry-run']);
    expect(r.exitCode, r.stderr).toBe(0);
    expect(r.stdout).toMatch(/--dns-records-only/);
    expect(read(tfLog)).toBe('');
    expect(read(digLog)).toBe('');
    expect(reports()).toEqual([]);
  });
});

describe('resync-zone-mirror.sh: the apply gates the check', () => {
  it('stops on a plan carrying anything but record edits, applying nothing and checking nothing', () => {
    const r = run(VALID(), {
      plan: [
        { type: 'aws_route53_record', address: 'aws_route53_record.spf', actions: ['update'] },
        { type: 'aws_cloudwatch_metric_alarm', address: 'aws_cloudwatch_metric_alarm.break_glass', actions: ['create'] },
      ],
    });
    expect(r.exitCode).not.toBe(0);
    expect(r.stderr).toMatch(/aws_cloudwatch_metric_alarm\.break_glass/);
    expect(r.stderr).toMatch(/The check has not run/);
    expect(read(tfLog)).not.toMatch(/ apply \//);
    expect(read(digLog)).toBe('');
    expect(reports()).toEqual([]);
  });
});

describe('resync-zone-mirror.sh: the check is the verdict', () => {
  it('passes when nothing is left to apply and the copy answers what the capture holds', () => {
    const r = run(VALID());
    expect(r.exitCode, r.stdout + r.stderr).toBe(0);
    expect(r.stdout).toMatch(/already match the values file/);
    expect(r.stdout).toMatch(/PASS/);
    // The check asked the zone's own first name server, read from the outputs.
    expect(read(digLog)).toMatch(/@ns-1\.example\.net /);
    const written = reports();
    expect(written).toHaveLength(1);
    expect(written[0]).toMatch(/^mirror-comparison\.\d{4}-\d{2}-\d{2}T\d{6}Z\.txt$/);
    expect(read(join(evidence, written[0]))).toMatch(/identical: \d+/);
  });

  it('fails when a name answers differently, and still leaves the report as evidence', () => {
    const r = run(VALID(), { apexAddress: '203.0.113.99' });
    expect(r.exitCode).not.toBe(0);
    expect(r.stderr).toMatch(/does not answer what the capture holds/);
    expect(r.stdout).not.toMatch(/PASS/);
    expect(reports()).toHaveLength(1);
  });

  it('never overwrites an earlier report from the same day', () => {
    const earlier = join(evidence, `mirror-comparison.${new Date().toISOString().slice(0, 10)}.txt`);
    writeFileSync(earlier, 'the stale comparison', 'utf-8');
    const r = run(VALID());
    expect(r.exitCode, r.stdout + r.stderr).toBe(0);
    expect(read(earlier)).toBe('the stale comparison');
    expect(reports()).toHaveLength(2);
  });
});
