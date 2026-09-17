/**
 * scripts/install-known-hosts.sh — building the pinned host-key file.
 *
 * The pin is what stops a deploy handing its sudo password to a substituted
 * host, because that password is line one of the SSH stream and a
 * trust-on-first-connect would send it before anything about the host had been
 * checked. It used to be assembled by hand out of an error message: two keys
 * from one API call, an address from a Terraform output, then four lines
 * covering two algorithms across two ports with the bracketed form on the
 * non-default one, checked by eye.
 *
 * Every one of those fails quietly. A wrapped paste yields a line ssh-keygen
 * does not find, a missing bracketed form covers one port and not the other, and
 * a stale address survives an instance replacement. The symptom in each case is
 * a refused connection that reads like a firewall fault.
 *
 * What is pinned here is the decision surface, driven through the AWS and
 * Terraform seams so no test reaches either:
 *
 *   - the target is required and is never defaulted;
 *   - both ports are written for every algorithm;
 *   - another environment's lines survive a run for this one;
 *   - a run that cannot reach its sources refuses rather than writing a partial
 *     pin;
 *   - --check reports and changes nothing.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync, chmodSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { SPAWN_GUARD } from '../fixtures/spawnGuard';

const SCRIPT = join(process.cwd(), 'scripts/install-known-hosts.sh');

const STAGING_IP = '203.0.113.10';
const OTHER_ENV_LINE = '198.51.100.7 ssh-ed25519 AAAAOTHERENVKEY';

let workDir: string;
let pinPath: string;
let awsStub: string;
let tfStub: string;
let identityStub: string;

/**
 * The run settles and PROVES its AWS identity before it reads anything, so a
 * suite about what the pin file ends up containing has to answer that question
 * too. The shape is what `--query Arn --output text` returns: the bare ARN.
 */
function writeIdentityStub(): void {
  writeFileSync(
    identityStub,
    "#!/usr/bin/env bash\nprintf '%s\\n' 'arn:aws:iam::000000000000:user/footbag-operator'\nexit 0\n",
    'utf-8',
  );
  chmodSync(identityStub, 0o755);
}

/**
 * Two algorithms, as the Lightsail API returns them: algorithm and key on one
 * tab-separated row each, which is the shape the script asks for and the shape
 * that keeps an algorithm attached to its own key.
 */
function writeAwsStub(rows = 'ssh-rsa\tAAAARSAKEY\nssh-ed25519\tAAAAED25519KEY\n'): void {
  writeFileSync(
    awsStub,
    `#!/usr/bin/env bash\nprintf '%b' ${JSON.stringify(rows)}\nexit 0\n`,
    'utf-8',
  );
  chmodSync(awsStub, 0o755);
}

function writeAwsStubFailing(): void {
  writeFileSync(awsStub, '#!/usr/bin/env bash\necho "AccessDenied" >&2\nexit 255\n', 'utf-8');
  chmodSync(awsStub, 0o755);
}

function writeTfStub(ip = STAGING_IP): void {
  writeFileSync(
    tfStub,
    `#!/usr/bin/env bash\nfor a in "$@"; do if [ "$a" = "output" ]; then printf '%s' ${JSON.stringify(ip)}; exit 0; fi; done\nexit 0\n`,
    'utf-8',
  );
  chmodSync(tfStub, 0o755);
}

function writeTfStubFailing(): void {
  writeFileSync(
    tfStub,
    '#!/usr/bin/env bash\necho "Error: no state file" >&2\nexit 1\n',
    'utf-8',
  );
  chmodSync(tfStub, 0o755);
}

function run(args: string[]) {
  const res = spawnSync('bash', [SCRIPT, ...args], {
    encoding: 'utf-8',
    env: {
      ...process.env,
      FOOTBAG_KNOWN_HOSTS: pinPath,
      INSTALL_KNOWN_HOSTS_AWS_BIN: awsStub,
      TF_OUTPUT_BIN: tfStub,
      AWS_PROFILE_BIN: awsStub,
      AWS_IDENTITY_BIN: identityStub,
      AWS_PROFILE: 'stub-profile',
    },
    ...SPAWN_GUARD,
  });
  return { status: res.status, stdout: res.stdout ?? '', stderr: res.stderr ?? '' };
}

beforeEach(() => {
  workDir = mkdtempSync(join(tmpdir(), 'footbag-test-pin-'));
  mkdirSync(join(workDir, 'AWS'), { recursive: true });
  pinPath = join(workDir, 'AWS', 'footbag_known_hosts');
  awsStub = join(workDir, 'aws-stub.sh');
  tfStub = join(workDir, 'tf-stub.sh');
  identityStub = join(workDir, 'identity-stub.sh');
  writeAwsStub();
  writeTfStub();
  writeIdentityStub();
});

afterEach(() => {
  rmSync(workDir, { recursive: true, force: true });
});

describe('install-known-hosts.sh — what it refuses', () => {
  it('requires a target rather than defaulting to one', () => {
    // Which host a pin describes is never inherited from ambient state: a pin
    // written for the wrong environment verifies the wrong host.
    const r = run([]);
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/--target is required \('staging' or 'production'\)/);
    expect(r.stderr).toMatch(/deliberately no default/);
  });

  it('refuses a target that is neither environment', () => {
    const r = run(['--target', 'prod']);
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/must be 'staging' or 'production'/);
  });

  it('refuses an unknown argument rather than ignoring it', () => {
    const r = run(['--nope']);
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("unknown argument '--nope'");
  });

  it('writes nothing when the address cannot be read', () => {
    // The address comes from Terraform and from nowhere else, deliberately, so a
    // tree that cannot answer is a stop rather than a fallback to something
    // written down. A stale address survives an instance replacement and fails
    // as a refused connection.
    writeTfStubFailing();
    const r = run(['--target', 'staging']);
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/could not read the staging host address/);
    expect(existsSync(pinPath)).toBe(false);
  });

  it('names the reason the Terraform read failed, rather than printing a blank line', () => {
    // The library records why in a variable that a command substitution would
    // discard, because the subshell it runs in takes the variable with it. The
    // first draft of this script did exactly that and refused with an empty
    // explanation.
    writeTfStubFailing();
    const r = run(['--target', 'staging']);
    expect(r.stderr).toMatch(/could not read the staging host address[\s\S]*\S/);
    expect(r.stderr).not.toMatch(/address from Terraform\.\n\s*\n/);
  });

  it('writes nothing when the host keys cannot be read', () => {
    writeAwsStubFailing();
    const r = run(['--target', 'staging']);
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/could not read host keys/);
    expect(existsSync(pinPath)).toBe(false);
  });
});

describe('install-known-hosts.sh — what it writes', () => {
  it('covers every algorithm on both ports', () => {
    // sshd listens on 22 and 2222, and OpenSSH matches a non-default port only
    // in the bracketed form, so a pin written for one port verifies nothing on
    // the other.
    const r = run(['--target', 'staging']);
    expect(r.status, r.stderr).toBe(0);
    const pin = readFileSync(pinPath, 'utf-8');
    expect(pin).toContain(`${STAGING_IP} ssh-rsa AAAARSAKEY`);
    expect(pin).toContain(`${STAGING_IP} ssh-ed25519 AAAAED25519KEY`);
    expect(pin).toContain(`[${STAGING_IP}]:2222 ssh-rsa AAAARSAKEY`);
    expect(pin).toContain(`[${STAGING_IP}]:2222 ssh-ed25519 AAAAED25519KEY`);
  });

  it('keeps another environment lines rather than replacing the file', () => {
    // The file holds every host an operator reaches. Rewriting it wholesale is
    // how production's pin disappears during a staging run, and the loss shows
    // up only at the next production deploy.
    writeFileSync(pinPath, `${OTHER_ENV_LINE}\n`, 'utf-8');
    const r = run(['--target', 'staging']);
    expect(r.status, r.stderr).toBe(0);
    const pin = readFileSync(pinPath, 'utf-8');
    expect(pin).toContain(OTHER_ENV_LINE);
    expect(pin).toContain(`[${STAGING_IP}]:2222 ssh-ed25519 AAAAED25519KEY`);
  });

  it('replaces this host own stale lines instead of accumulating them', () => {
    // An instance rebuild gives the same address new keys. Appending would leave
    // the old key authorised alongside the new one, which is the pin verifying a
    // host it should now refuse.
    writeFileSync(pinPath, `${STAGING_IP} ssh-ed25519 AAAASTALEKEY\n`, 'utf-8');
    const r = run(['--target', 'staging']);
    expect(r.status, r.stderr).toBe(0);
    const pin = readFileSync(pinPath, 'utf-8');
    expect(pin).not.toContain('AAAASTALEKEY');
    expect(pin).toContain('AAAAED25519KEY');
  });

  it('is idempotent: a second run leaves the same four lines', () => {
    run(['--target', 'staging']);
    const first = readFileSync(pinPath, 'utf-8');
    const r = run(['--target', 'staging']);
    expect(r.status, r.stderr).toBe(0);
    expect(readFileSync(pinPath, 'utf-8')).toBe(first);
  });
});

describe('install-known-hosts.sh — the read-only report', () => {
  it('reports a missing pin as needing work, and writes nothing', () => {
    const r = run(['--target', 'staging', '--check']);
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/missing or stale/);
    expect(existsSync(pinPath)).toBe(false);
  });

  it('reports a current pin as current', () => {
    run(['--target', 'staging']);
    const r = run(['--target', 'staging', '--check']);
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/Pinned and current/);
  });
});
