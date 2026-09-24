/**
 * scripts/authorize-operator-address.sh — the SSH allow-list, owned rather than
 * described.
 *
 * An address reaches a host only when the values file Terraform builds the
 * firewall from and the firewall itself agree. What is pinned here is that the
 * script asks both, edits exactly the one entry, and proves the outcome against
 * the live firewall on every SSH port rather than against the file it wrote.
 * A read it cannot trust is unknown, and unknown is never reported as done: on
 * a departure, a failed read reported as "absent" is an access that looks ended
 * and is not.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import {
  writeFileSync,
  readFileSync,
  chmodSync,
  existsSync,
  lstatSync,
  symlinkSync,
  rmSync,
} from 'node:fs';
import { join } from 'node:path';

import { SPAWN_GUARD } from '../fixtures/spawnGuard';
import { NO_AWS_CREDENTIALS } from '../fixtures/awsIsolation';
import { createScratchDir } from '../fixtures/scratchDir';

const SCRIPT = join(process.cwd(), 'scripts/authorize-operator-address.sh');

const ACCOUNT = '111122223333';
const OPERATOR_ARN = `arn:aws:iam::${ACCOUNT}:user/footbag-operator`;
const DEV_TESTER_ARN = `arn:aws:sts::${ACCOUNT}:assumed-role/FootbagDevTester/jane_doe`;
const EXISTING = '198.51.100.4/32';
const NEW_ADDRESS = '203.0.113.7/32';

// The fixtures carry the trailing attribution comment the real values files
// carry, because that comment is load-bearing: the file's policy is that every
// entry names whose it is and that an unattributable entry is removed rather
// than kept.
const TFVARS_BEFORE = [
  'aws_account_id = "111122223333"',
  '',
  'operator_cidrs = [',
  `  "${EXISTING}",  # dave_doe; home (2degrees, NZ)`,
  ']',
  '',
  'ses_sender_identity = "noreply@example.org"',
  '',
].join('\n');

// The other shape a real values file arrives in: the whole list on the
// assignment line, which is what the production file uses.
const TFVARS_SINGLE_LINE = [
  'aws_account_id = "111122223333"',
  '',
  `operator_cidrs = ["${EXISTING}"]`,
  '',
  'ses_sender_identity = "noreply@example.org"',
  '',
].join('\n');

const ATTRIBUTION = 'jane_doe; office';

let workDir: string;
let tfvarsTarget: string;
let tfvarsLink: string;
let appliedMarker: string;

beforeEach(() => {
  workDir = createScratchDir('authorize-address');
  tfvarsTarget = join(workDir, 'private-staging.tfvars');
  tfvarsLink = join(workDir, 'terraform.tfvars');
  appliedMarker = join(workDir, 'apply-ran');
  writeFileSync(tfvarsTarget, TFVARS_BEFORE, 'utf-8');
  symlinkSync(tfvarsTarget, tfvarsLink);
});

afterEach(() => {
  rmSync(workDir, { recursive: true, force: true });
});

type LiveRead = 'ok' | 'fails' | 'empty' | 'garbage' | 'no-2222-rule' | 'fails-after-apply';

interface Estate {
  /** Ranges the live firewall admits on both SSH ports before the apply. */
  before?: string[];
  /** The same after an apply; defaults to `before`. */
  after?: string[];
  /** Ranges on port 2222 after the apply, when it differs from port 22. */
  after2222?: string[];
  callerArn?: string;
  live?: LiveRead;
}

/**
 * One stub answering the profile list, the caller, and the live port states.
 *
 * The port states come in the shape Lightsail returns them: one rule per port,
 * the operator ranges on 22 and 2222, and the Lightsail access alias on 22 as a
 * named list rather than a range. They are read from the filesystem so a call
 * made after the apply is answered by what the apply did.
 */
function awsStub(estate: Estate = {}): string {
  const { before = [EXISTING], after, after2222, callerArn = OPERATOR_ARN, live = 'ok' } = estate;
  const afterSet = after ?? before;
  const path = join(workDir, 'aws-stub.sh');
  const states = (on22: string[], on2222: string[]) =>
    JSON.stringify({
      portStates: [
        { fromPort: 80, toPort: 80, protocol: 'tcp', state: 'open', cidrs: ['192.0.2.0/24'], cidrListAliases: [] },
        ...(live === 'no-2222-rule'
          ? []
          : [{ fromPort: 2222, toPort: 2222, protocol: 'tcp', state: 'open', cidrs: on2222, cidrListAliases: [] }]),
        { fromPort: 22, toPort: 22, protocol: 'tcp', state: 'open', cidrs: on22, cidrListAliases: ['lightsail-connect'] },
      ],
    });
  const liveAnswer = (on22: string[], on2222: string[], afterApply = false) => {
    switch (live === 'fails-after-apply' ? (afterApply ? 'fails' : 'ok') : live) {
      case 'fails':
        return ['  echo "An error occurred (AccessDeniedException) when calling the GetInstancePortStates operation" >&2', '  exit 254'];
      case 'empty':
        return ['  exit 0'];
      case 'garbage':
        return ["  printf '%s\\n' 'not json'", '  exit 0'];
      default:
        return [`  printf '%s\\n' ${JSON.stringify(states(on22, on2222))}`, '  exit 0'];
    }
  };
  writeFileSync(
    path,
    [
      '#!/usr/bin/env bash',
      'if [[ "$1" == "configure" && "$2" == "list-profiles" ]]; then',
      "  printf '%s\\n' footbag-operator",
      '  exit 0',
      'fi',
      'if [[ "$1" == "sts" && "$2" == "get-caller-identity" ]]; then',
      `  printf '%s\\n' ${JSON.stringify(callerArn)}`,
      '  exit 0',
      'fi',
      'if [[ "$1" == "lightsail" && "$2" == "get-instance-port-states" ]]; then',
      `  if [[ -e ${JSON.stringify(appliedMarker)} ]]; then`,
      ...liveAnswer(afterSet, after2222 ?? afterSet, true),
      '  fi',
      ...liveAnswer(before, before),
      'fi',
      'exit 64',
    ].join('\n'),
    'utf-8',
  );
  chmodSync(path, 0o755);
  return path;
}

function applyStub(exitCode = 0): string {
  const path = join(workDir, 'apply-stub.sh');
  writeFileSync(
    path,
    ['#!/usr/bin/env bash', `printf '%s\\n' "$*" > ${JSON.stringify(appliedMarker)}`, `exit ${exitCode}`].join(
      '\n',
    ),
    'utf-8',
  );
  chmodSync(path, 0o755);
  return path;
}

/** Stands in for `terraform fmt -`, which the test runner does not install. */
function terraformStub(exitCode = 0): string {
  const path = join(workDir, 'terraform-stub.sh');
  writeFileSync(path, ['#!/usr/bin/env bash', 'cat >/dev/null', `exit ${exitCode}`].join('\n'), 'utf-8');
  chmodSync(path, 0o755);
  return path;
}

interface RunOptions extends Estate {
  args?: string[];
  applyExit?: number;
  terraformExit?: number;
  tfvars?: string;
  /** Replaces the whole values file. */
  fileBody?: string;
}

const ADD = ['--target', 'staging', '--address', NEW_ADDRESS, '--for', ATTRIBUTION, '--yes'];
const removeArgs = (address: string) => ['--target', 'staging', '--address', address, '--remove', '--yes'];

function run(options: RunOptions = {}) {
  const { args = ADD, applyExit = 0, terraformExit = 0, tfvars = tfvarsLink, fileBody, ...estate } = options;
  if (fileBody !== undefined) writeFileSync(tfvarsTarget, fileBody, 'utf-8');
  const stub = awsStub(estate);
  const res = spawnSync('bash', [SCRIPT, ...args], {
    cwd: process.cwd(),
    encoding: 'utf-8',
    input: '',
    env: {
      ...process.env,
      ...NO_AWS_CREDENTIALS,
      AWS_PROFILE_BIN: stub,
      AUTHORIZE_ADDRESS_AWS_BIN: stub,
      AUTHORIZE_ADDRESS_APPLY_CMD: applyStub(applyExit),
      AUTHORIZE_ADDRESS_TERRAFORM_BIN: terraformStub(terraformExit),
      TFVARS_OVERRIDE: tfvars,
      HOME: workDir,
    },
    ...SPAWN_GUARD,
  });
  return { status: res.status, stdout: res.stdout ?? '', stderr: res.stderr ?? '' };
}

const applyRan = () => existsSync(appliedMarker);
const values = () => readFileSync(tfvarsTarget, 'utf-8');
const listOf = (entries: string[]) =>
  TFVARS_BEFORE.replace(
    `  "${EXISTING}",  # dave_doe; home (2degrees, NZ)\n`,
    entries.map((e) => `${e}\n`).join(''),
  );

describe('authorize-operator-address refuses what it must not do', () => {
  it('refuses a caller that is neither footbag-operator nor a FootbagDevTester session', () => {
    const r = run({ callerArn: `arn:aws:sts::${ACCOUNT}:assumed-role/SomeOtherRole/x` });
    expect(r.status).toBe(1);
    expect(applyRan()).toBe(false);
    expect(values()).toBe(TFVARS_BEFORE);
  });

  it('accepts a FootbagDevTester session on staging, which may change staging\'s firewall', () => {
    const r = run({ callerArn: DEV_TESTER_ARN, before: [EXISTING], after: [EXISTING, NEW_ADDRESS] });
    expect(r.status, r.stderr).toBe(0);
    expect(values()).toContain(`"${NEW_ADDRESS}"`);
  });

  it('refuses --yes on production, where the apply asks at the terminal anyway', () => {
    const r = run({ args: ['--target', 'production', '--address', NEW_ADDRESS, '--for', ATTRIBUTION, '--yes'] });
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/--yes does not carry a production change/);
    expect(values()).toBe(TFVARS_BEFORE);
  });

  it('refuses a missing environment rather than inheriting one', () => {
    const r = run({ args: ['--address', NEW_ADDRESS, '--yes'] });
    expect(r.status).toBe(2);
  });

  it('refuses when the values file carries no list to change', () => {
    writeFileSync(tfvarsTarget, 'aws_account_id = "111122223333"\n', 'utf-8');
    const r = run();
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/rather than letting this script invent it/);
    expect(applyRan()).toBe(false);
  });

  it('refuses a values path inside this repository that git does not ignore', () => {
    const tracked = join(process.cwd(), 'terraform/staging/variables.tf');
    const before = readFileSync(tracked, 'utf-8');
    const r = run({ tfvars: tracked });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/git does not ignore it/);
    expect(readFileSync(tracked, 'utf-8')).toBe(before);
  });

  it('refuses to empty the list, which would admit nobody', () => {
    const r = run({ args: removeArgs(EXISTING), before: [EXISTING] });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/admits nobody on the SSH ports/);
    expect(applyRan()).toBe(false);
  });

  it('exits 2 on an unknown flag', () => {
    const r = run({ args: ['--target', 'staging', '--address', NEW_ADDRESS, '--force'] });
    expect(r.status).toBe(2);
  });

  it('refuses a flag value that is another flag, rather than swallowing it', () => {
    // `--for --yes` would attribute the address to "--yes" and drop the
    // confirmation the operator meant to give.
    const r = run({ args: ['--target', 'staging', '--address', NEW_ADDRESS, '--for', '--yes'] });
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/--for needs a value/);
  });

  it('refuses to add an entry nobody can attribute', () => {
    const r = run({ args: ['--target', 'staging', '--address', NEW_ADDRESS, '--yes'] });
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/--for names whose address this is/);
    expect(applyRan()).toBe(false);
    expect(values()).toBe(TFVARS_BEFORE);
  });

  it.each([
    ['a line break that would put the rest on a line of its own', 'x\n  "0.0.0.0/0",'],
    ['a closing bracket, which a list parser takes for the end of the list', 'x [home]'],
    ['a double quote, which would open an entry inside the comment', 'x "home"'],
  ])('refuses an attribution carrying %s', (_why, attribution) => {
    const r = run({ args: ['--target', 'staging', '--address', NEW_ADDRESS, '--for', attribution, '--yes'] });
    expect(r.status).toBe(2);
    expect(values()).toBe(TFVARS_BEFORE);
    expect(applyRan()).toBe(false);
  });
});

describe('authorize-operator-address accepts only a canonical IPv4 range', () => {
  it.each([
    ['an octet above 255', '999.1.1.1/32'],
    ['a prefix above 32', '1.2.3.4/99'],
    ['every address there is', '0.0.0.0/0'],
    ['a leading zero, which bash arithmetic reads as octal', '010.0.0.1/32'],
    ['bits set past the prefix, which the firewall stores as the range', '203.0.113.7/24'],
    ['something that is not an address', 'not-an-address'],
  ])('refuses %s before reaching AWS', (_why, address) => {
    const r = run({ args: ['--target', 'staging', '--address', address, '--for', ATTRIBUTION, '--yes'] });
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/wider than you meant/);
    expect(values()).toBe(TFVARS_BEFORE);
  });

  it('takes a bare address as that one host', () => {
    const r = run({
      args: ['--target', 'staging', '--address', '203.0.113.7', '--for', ATTRIBUTION, '--yes'],
      before: [EXISTING],
      after: [EXISTING, NEW_ADDRESS],
    });
    expect(r.status, r.stderr).toBe(0);
    expect(values()).toContain('"203.0.113.7/32"');
  });
});

describe('authorize-operator-address treats an unreadable firewall as unknown, never as an answer', () => {
  it.each([
    ['the read failing', 'fails' as const],
    ['the read answering nothing', 'empty' as const],
    ['the read answering something unparseable', 'garbage' as const],
    ['a port with no rule at all', 'no-2222-rule' as const],
  ])('refuses a removal on %s, rather than reporting the address already absent', (_why, live) => {
    const r = run({ args: removeArgs(EXISTING), fileBody: listOf([`  "${EXISTING}", # dave_doe; home`, `  "${NEW_ADDRESS}", # jane_doe; office`]), live });
    expect(r.status).toBe(1);
    expect(r.stdout).not.toMatch(/Already absent/);
    expect(r.stderr).toMatch(/could not be read/);
    expect(applyRan()).toBe(false);
  });

  it('refuses an add on a failed read too', () => {
    const r = run({ live: 'fails' });
    expect(r.status).toBe(1);
    expect(applyRan()).toBe(false);
    expect(values()).toBe(TFVARS_BEFORE);
  });
});

describe('authorize-operator-address asks the file and the firewall, and repairs whichever disagrees', () => {
  it('does nothing when the file carries the address and the firewall admits it', () => {
    const r = run({ fileBody: listOf([`  "${EXISTING}", # dave_doe; home`, `  "${NEW_ADDRESS}", # jane_doe; office`]), before: [EXISTING, NEW_ADDRESS] });
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toMatch(/Already authorized/);
    expect(applyRan()).toBe(false);
  });

  it('writes the entry when the firewall admits it but the file does not, so the next apply cannot undo it', () => {
    // A console change is not declared, and any later apply, run by anybody
    // for any reason, removes it.
    const r = run({ before: [EXISTING, NEW_ADDRESS], after: [EXISTING, NEW_ADDRESS] });
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).not.toMatch(/Already authorized/);
    expect(values()).toContain(`"${NEW_ADDRESS}"`);
    expect(applyRan()).toBe(true);
  });

  it('applies without editing when the file carries the address but the firewall does not', () => {
    const body = listOf([`  "${EXISTING}", # dave_doe; home`, `  "${NEW_ADDRESS}", # jane_doe; office`]);
    const r = run({ fileBody: body, before: [EXISTING], after: [EXISTING, NEW_ADDRESS] });
    expect(r.status, r.stderr).toBe(0);
    expect(values()).toBe(body);
    expect(applyRan()).toBe(true);
    // Never written twice: the entry already there is the one entry.
    expect(values().split(`"${NEW_ADDRESS}"`).length - 1).toBe(1);
  });

  it('adds its own entry even where somebody else\'s wider range already admits it', () => {
    // An address that reaches the host only through another person's range
    // stops reaching it when that person leaves, and names nobody meanwhile.
    const r = run({ before: ['203.0.113.0/24'], after: ['203.0.113.0/24', NEW_ADDRESS] });
    expect(r.status, r.stderr).toBe(0);
    expect(values()).toContain(`"${NEW_ADDRESS}"`);
  });

  it('does not call a range admitted because one address inside it is', () => {
    const r = run({
      args: ['--target', 'staging', '--address', '203.0.113.0/24', '--for', ATTRIBUTION, '--yes'],
      before: ['203.0.113.0/32'],
      after: ['203.0.113.0/32', '203.0.113.0/24'],
    });
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).not.toMatch(/Already authorized/);
    expect(values()).toContain('"203.0.113.0/24"');
  });

  it('prunes the file on a removal the firewall has already carried out', () => {
    // The dangerous direction: an entry left in the file puts a departed
    // operator back on the firewall at the next apply.
    const body = listOf([`  "${EXISTING}", # dave_doe; home`, `  "${NEW_ADDRESS}", # jane_doe; office`]);
    const r = run({ args: removeArgs(NEW_ADDRESS), fileBody: body, before: [EXISTING], after: [EXISTING] });
    expect(r.status, r.stderr).toBe(0);
    expect(values()).not.toContain(`"${NEW_ADDRESS}"`);
    expect(applyRan()).toBe(true);
  });

  it('reports already absent only when neither the file nor the firewall carries it', () => {
    const r = run({ args: removeArgs(NEW_ADDRESS), before: [EXISTING] });
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toMatch(/Already absent/);
    expect(applyRan()).toBe(false);
  });

  it('fails a removal when another range still admits the address, and names whose it is', () => {
    const body = listOf([`  "203.0.113.0/24", # sam_roe; office`, `  "${EXISTING}", # dave_doe; home`]);
    const r = run({ args: removeArgs(NEW_ADDRESS), fileBody: body, before: ['203.0.113.0/24', EXISTING] });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/203\.0\.113\.0\/24/);
    expect(r.stderr).toMatch(/sam_roe; office/);
    expect(r.stderr).toMatch(/access has NOT ended/);
  });
});

describe('authorize-operator-address edits exactly one entry', () => {
  it('adds the address, applies, and proves it on every SSH port', () => {
    const r = run({ before: [EXISTING], after: [EXISTING, NEW_ADDRESS] });
    expect(r.status, r.stderr).toBe(0);
    expect(values()).toContain(`"${NEW_ADDRESS}"`);
    expect(readFileSync(appliedMarker, 'utf-8')).toContain('--target staging');
    expect(r.stdout).toMatch(/is admitted on ports 22 2222/);
  });

  it('keeps each existing entry attached to the name it carried', () => {
    run({ before: [EXISTING], after: [EXISTING, NEW_ADDRESS] });
    expect(values()).toContain(`  "${EXISTING}",  # dave_doe; home (2degrees, NZ)`);
  });

  it('attributes the entry it adds', () => {
    run({ before: [EXISTING], after: [EXISTING, NEW_ADDRESS] });
    expect(values()).toMatch(new RegExp(`"${NEW_ADDRESS.replace('/', '\\/')}", # ${ATTRIBUTION}`));
  });

  it('opens out the production shape, where the whole list is on the assignment line', () => {
    const r = run({ fileBody: TFVARS_SINGLE_LINE, before: [EXISTING], after: [EXISTING, NEW_ADDRESS] });
    expect(r.status, r.stderr).toBe(0);
    expect(values()).toContain(`"${EXISTING}"`);
    expect(values()).toContain(`"${NEW_ADDRESS}"`);
    expect(values()).toContain('ses_sender_identity = "noreply@example.org"');
  });

  it('keeps every entry when several share the assignment line', () => {
    const OTHER = '192.0.2.50/32';
    const r = run({
      fileBody: TFVARS_SINGLE_LINE.replace(`["${EXISTING}"]`, `["${EXISTING}", "${OTHER}"]`),
      before: [EXISTING],
      after: [EXISTING, NEW_ADDRESS],
    });
    expect(r.status, r.stderr).toBe(0);
    expect(values()).toContain(`"${EXISTING}"`);
    expect(values()).toContain(`"${OTHER}"`);
    expect(values()).toContain(`"${NEW_ADDRESS}"`);
  });

  it('leaves every line outside the list byte for byte as it was', () => {
    run({ before: [EXISTING], after: [EXISTING, NEW_ADDRESS] });
    expect(values().startsWith('aws_account_id = "111122223333"\n\noperator_cidrs = [\n')).toBe(true);
    expect(values().endsWith(']\n\nses_sender_identity = "noreply@example.org"\n')).toBe(true);
  });

  it('writes through the symlink so the link into the private checkout survives', () => {
    run({ before: [EXISTING], after: [EXISTING, NEW_ADDRESS] });
    expect(lstatSync(tfvarsLink).isSymbolicLink()).toBe(true);
    expect(readFileSync(tfvarsTarget, 'utf-8')).toContain(`"${NEW_ADDRESS}"`);
  });

  it('removes one entry and proves it is gone from every SSH port', () => {
    const body = listOf([`  "${EXISTING}", # dave_doe; home`, `  "${NEW_ADDRESS}", # jane_doe; office`]);
    const r = run({ args: removeArgs(EXISTING), fileBody: body, before: [EXISTING, NEW_ADDRESS], after: [NEW_ADDRESS] });
    expect(r.status, r.stderr).toBe(0);
    expect(values()).not.toContain(`"${EXISTING}"`);
    expect(values()).toContain(`  "${NEW_ADDRESS}", # jane_doe; office`);
    expect(r.stdout).toMatch(/no longer admitted on ports 22 2222/);
  });

  it('removes an entry the file writes without a prefix length', () => {
    const body = listOf([`  "${EXISTING}", # dave_doe; home`, `  "203.0.113.7", # jane_doe; office`]);
    const r = run({ args: removeArgs(NEW_ADDRESS), fileBody: body, before: [EXISTING, NEW_ADDRESS], after: [EXISTING] });
    expect(r.status, r.stderr).toBe(0);
    expect(values()).not.toContain('203.0.113.7');
  });

  it('refuses an address the file carries twice rather than guessing which is meant', () => {
    const body = listOf([`  "${EXISTING}", # dave_doe; home`, `  "${NEW_ADDRESS}", # jane_doe; office`, `  "${NEW_ADDRESS}", # jane_doe; spare`]);
    const r = run({ args: removeArgs(NEW_ADDRESS), fileBody: body, before: [EXISTING, NEW_ADDRESS] });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/appears 2 times/);
    expect(values()).toBe(body);
  });
});

describe('authorize-operator-address refuses a list it cannot read with certainty', () => {
  const refusal = (body: string, args = removeArgs(NEW_ADDRESS)) => {
    const r = run({ args, fileBody: body, before: [EXISTING, NEW_ADDRESS] });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/cannot be read with certainty|shares line|one line under one comment/);
    expect(values()).toBe(body);
    expect(applyRan()).toBe(false);
    return r;
  };

  it('refuses a bracket inside a comment, which would otherwise end the list early', () => {
    refusal(listOf([`  "${EXISTING}", # dave_doe [home]`, `  "${NEW_ADDRESS}", # jane_doe; office`]));
  });

  it('refuses a // comment, which could hold a retired address that would come back live', () => {
    refusal(listOf([`  "${EXISTING}", # dave_doe; home`, '  // "9.9.9.9/32", retired', `  "${NEW_ADDRESS}", # jane_doe; office`]));
  });

  it('refuses a /* comment for the same reason', () => {
    refusal(listOf([`  "${EXISTING}", # dave_doe; home`, '  /* "8.8.8.8/32" */', `  "${NEW_ADDRESS}", # jane_doe; office`]));
  });

  it('refuses a carriage return', () => {
    refusal(listOf([`  "${EXISTING}", # dave_doe; home\r`, `  "${NEW_ADDRESS}", # jane_doe; office`]));
  });

  it('refuses to take one entry off a line whose comment names several', () => {
    const r = refusal(
      TFVARS_SINGLE_LINE.replace(`["${EXISTING}"]`, `["${EXISTING}", "${NEW_ADDRESS}"] # dave_doe home, jane_doe office`),
    );
    expect(r.stderr).toMatch(/shares line/);
  });

  it('refuses to open out a one-line list whose single comment covers several entries', () => {
    const r = refusal(
      TFVARS_SINGLE_LINE.replace(`["${EXISTING}"]`, `["${EXISTING}", "192.0.2.50/32"] # dave_doe and sam_roe`),
      ADD,
    );
    expect(r.stderr).toMatch(/one line under one comment/);
  });

  it('keeps a comment on a line of its own where it was', () => {
    const body = listOf(['  # retired: 192.0.2.9/32, left 2026', `  "${EXISTING}", # dave_doe; home`]);
    const r = run({ fileBody: body, before: [EXISTING], after: [EXISTING, NEW_ADDRESS] });
    expect(r.status, r.stderr).toBe(0);
    expect(values()).toContain('  # retired: 192.0.2.9/32, left 2026');
  });

  it('refuses when the rewritten file is not valid HCL', () => {
    const r = run({ terraformExit: 1, before: [EXISTING], after: [EXISTING, NEW_ADDRESS] });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/not valid HCL/);
    expect(values()).toBe(TFVARS_BEFORE);
    expect(applyRan()).toBe(false);
  });

  it('names an existing entry that carries no attribution, and does not remove it', () => {
    const r = run({ fileBody: TFVARS_SINGLE_LINE, before: [EXISTING], after: [EXISTING, NEW_ADDRESS] });
    expect(r.stderr).toMatch(/198\.51\.100\.4\/32 on line 3 names nobody/);
    expect(values()).toContain(`"${EXISTING}"`);
  });
});

describe('authorize-operator-address proves the outcome rather than the apply', () => {
  it('fails when the apply succeeded but the firewall does not carry the change', () => {
    const r = run({ before: [EXISTING], after: [EXISTING] });
    expect(r.status).toBe(1);
    expect(applyRan()).toBe(true);
    expect(r.stderr).toMatch(/does not admit/);
    expect(r.stderr).toMatch(/still cannot reach the host/);
  });

  it('fails when port 2222, which the deploy uses, does not carry the change', () => {
    const r = run({ before: [EXISTING], after: [EXISTING, NEW_ADDRESS], after2222: [EXISTING] });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/does not admit .* on every SSH port/);
  });

  it('fails a removal the firewall did not actually carry out', () => {
    const body = listOf([`  "${EXISTING}", # dave_doe; home`, `  "${NEW_ADDRESS}", # jane_doe; office`]);
    const r = run({ args: removeArgs(EXISTING), fileBody: body, before: [EXISTING, NEW_ADDRESS], after: [EXISTING, NEW_ADDRESS] });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/access has NOT ended/);
  });

  it('fails a removal that took on port 22 but not on 2222', () => {
    const body = listOf([`  "${EXISTING}", # dave_doe; home`, `  "${NEW_ADDRESS}", # jane_doe; office`]);
    const r = run({ args: removeArgs(EXISTING), fileBody: body, before: [EXISTING, NEW_ADDRESS], after: [NEW_ADDRESS], after2222: [EXISTING, NEW_ADDRESS] });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/access has NOT ended/);
  });

  it('fails the proof when the read after the apply fails, rather than calling it removed', () => {
    // The first read answers and every read once the apply has run fails,
    // which is what a throttled call or an expiring session does. A proof that
    // read the failure as "not admitted" would report a departure complete.
    const body = listOf([`  "${EXISTING}", # dave_doe; home`, `  "${NEW_ADDRESS}", # jane_doe; office`]);
    const r = run({
      args: removeArgs(EXISTING),
      fileBody: body,
      before: [EXISTING, NEW_ADDRESS],
      after: [NEW_ADDRESS],
      live: 'fails-after-apply',
    });
    expect(r.status).toBe(1);
    expect(applyRan()).toBe(true);
    expect(r.stdout).not.toMatch(/no longer admitted/);
    expect(r.stderr).toMatch(/could not be read/);
  });

  it('reports a failed apply as unfinished rather than unproven', () => {
    const r = run({ applyExit: 3, before: [EXISTING], after: [EXISTING, NEW_ADDRESS] });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/did not complete/);
  });
});

describe('authorize-operator-address says when a seam is in use', () => {
  it('names each replaced input on stderr, because a stubbed run proves nothing', () => {
    const r = run({ before: [EXISTING], after: [EXISTING, NEW_ADDRESS] });
    expect(r.stderr).toMatch(/AWS binary is stubbed/);
    expect(r.stderr).toMatch(/the apply is replaced/);
    expect(r.stderr).toMatch(/terraform syntax check is replaced/);
    expect(r.stderr).toMatch(/the values file is replaced/);
  });
});

describe('authorize-operator-address checks every port the operator list opens', () => {
  it('reads exactly the ports whose firewall rule takes the operator list, in both trees', () => {
    // A port added to the Terraform without being added here would be opened to
    // the list and never checked, which is the gap port 2222 once was.
    const script = readFileSync(SCRIPT, 'utf-8');
    const declared = script.match(/^SSH_PORTS=\(([^)]*)\)/m);
    expect(declared, 'SSH_PORTS is not declared').not.toBeNull();
    const ports = declared![1].trim().split(/\s+/).map(Number).sort((a, b) => a - b);
    for (const tree of ['staging', 'production']) {
      const tf = readFileSync(join(process.cwd(), `terraform/${tree}/lightsail.tf`), 'utf-8');
      const blocks = tf.match(/port_info\s*\{[\s\S]*?\n\s*\}/g) ?? [];
      const operatorPorts = blocks
        .filter((b) => /cidrs\s*=\s*var\.operator_cidrs/.test(b))
        .map((b) => Number(b.match(/from_port\s*=\s*(\d+)/)?.[1]))
        .sort((a, b) => a - b);
      expect(operatorPorts, `${tree} ports taking operator_cidrs`).toEqual(ports);
    }
  });
});
