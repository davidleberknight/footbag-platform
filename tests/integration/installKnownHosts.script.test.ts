/**
 * scripts/install-known-hosts.sh — building the pinned host-key file.
 *
 * The pin is what stops a deploy handing its sudo password to a substituted
 * host, because that password is line one of the SSH stream and a
 * trust-on-first-connect would send it before anything about the host had been
 * checked. Assembling it takes two keys from one API call, an address from a
 * Terraform output, then four lines covering two algorithms across two ports
 * with the bracketed form on the non-default one.
 *
 * Done by hand, every one of those fails quietly. A wrapped paste yields a line ssh-keygen
 * does not find, a missing bracketed form covers one port and not the other, and
 * a stale address survives an instance replacement. The symptom in each case is
 * a refused connection that reads like a firewall fault.
 *
 * The one API call that returns host keys also mints a root-capable
 * certificate, and the production break-glass alarm fires on every such call.
 * So a routine run must not make it: --check never mints, an install over a
 * pin already proven current mints nothing, and only a missing, stale or
 * unproven pin is rebuilt, with one mint carrying the script's application id.
 *
 * What is pinned here is the decision surface, driven through the AWS and
 * Terraform seams so no test reaches either:
 *
 *   - the target is required and is never defaulted;
 *   - both ports are written for every algorithm, with the instance record;
 *   - another environment's lines and record survive a run for this one;
 *   - a run that cannot reach its sources refuses rather than writing a partial
 *     pin;
 *   - --check reports, changes nothing and mints nothing;
 *   - the minted response, which carries a private key, is never printed and
 *     never left on disk, an interrupt included.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync, chmodSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { SPAWN_GUARD } from '../fixtures/spawnGuard';

const SCRIPT = join(process.cwd(), 'scripts/install-known-hosts.sh');

const STAGING_IP = '203.0.113.10';
const OTHER_ENV_LINE = '198.51.100.7 ssh-ed25519 AAAAOTHERENVKEY';
const ARN = 'arn:aws:lightsail:us-east-1:041904915126:Instance/0f1e2d3c-4b5a-6978-8796-a5b4c3d2e1f0';
const REBUILT_ARN = 'arn:aws:lightsail:us-east-1:041904915126:Instance/99999999-8888-7777-6666-555555555555';
const CREATED = '2026-09-01T10:00:00.123000+00:00';
const PROD_RECORD = 'footbag-production footbag-production-web arn:aws:lightsail:us-east-1:041904915126:Instance/11111111-2222-3333-4444-555555555555 2026-08-01T10:00:00+00:00';
/** The private key the stand-in mint returns, which no output and no file may carry. */
const SENTINEL = 'FIXTURE-MINTED-PRIVATE-KEY-SENTINEL';

let workDir: string;
let tmp: string;
let pinPath: string;
let recordPath: string;
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
    "#!/usr/bin/env bash\nprintf '%s\\n' 'arn:aws:iam::041904915126:user/footbag-operator'\nexit 0\n",
    'utf-8',
  );
  chmodSync(identityStub, 0o755);
}

/**
 * Lightsail, answering from files under the work directory. GetInstance gives
 * the ARN and creation time as its `--query ... --output text` shape does. The
 * minting call logs the application id it carried and answers in the real
 * response's shape, a private key and certificate beside the host keys, from
 * "hostkeys-<instance>" or "hostkeys"; "mint-fails" refuses it, and
 * "term-after-mint" interrupts the script once the response is on disk.
 * "history" is what `configure get cli_history` prints; absent, the setting is
 * absent.
 */
function writeAwsStub(): void {
  writeFileSync(
    awsStub,
    [
      '#!/usr/bin/env bash',
      `S=${JSON.stringify(workDir)}`,
      'arg() { local k="$1"; shift; while [[ $# -gt 0 ]]; do [[ "$1" == "$k" ]] && { printf "%s" "$2"; return; }; shift; done; }',
      'case "$1 $2" in',
      '  "configure get") [[ -e "$S/history" ]] && { cat "$S/history"; exit 0; }; exit 1 ;;',
      '  "lightsail get-instance")',
      '    [[ -e "$S/get-instance-fails" ]] && { echo "AccessDeniedException: not authorized" >&2; exit 254; }',
      '    printf "%s\\t%s\\n" "$(cat "$S/arn")" "$(cat "$S/created")" ;;',
      '  "lightsail get-instance-access-details")',
      '    n="$(arg --instance-name "$@")"',
      '    echo "${AWS_SDK_UA_APP_ID:-none} $n" >> "$S/mints.log"',
      '    [[ -e "$S/mint-fails" ]] && { echo "AccessDeniedException" >&2; exit 255; }',
      '    f="$S/hostkeys-$n"; [[ -e "$f" ]] || f="$S/hostkeys"',
      `    jq -Rn '[inputs | select(length > 0) | split("\\t") | {algorithm: .[0], publicKey: .[1]}] | {accessDetails: {privateKey: "${SENTINEL}", certKey: "ssh-rsa-cert-v01@openssh.com fixture", username: "ec2-user", hostKeys: .}}' < "$f"`,
      '    if [[ -e "$S/term-after-mint" ]]; then',
      '      kill -TERM "$(ps -o ppid= -p "$PPID" | tr -d " ")"',
      '    fi ;;',
      '  *) echo "unexpected aws call: $*" >&2; exit 64 ;;',
      'esac',
    ].join('\n') + '\n',
    'utf-8',
  );
  chmodSync(awsStub, 0o755);
}

function setKeys(rows = 'ssh-rsa\tAAAARSAKEY\nssh-ed25519\tAAAAED25519KEY\n', file = 'hostkeys'): void {
  writeFileSync(join(workDir, file), rows, 'utf-8');
}

function writeTfStub(ip = STAGING_IP, instance = 'footbag-staging-web'): void {
  writeFileSync(
    tfStub,
    [
      '#!/usr/bin/env bash',
      `case "$*" in *lightsail_instance_name*) printf '%s' ${JSON.stringify(instance)}; exit 0 ;; esac`,
      `for a in "$@"; do if [ "$a" = "output" ]; then printf '%s' ${JSON.stringify(ip)}; exit 0; fi; done`,
      'exit 0',
    ].join('\n') + '\n',
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

function run(args: string[], extra: NodeJS.ProcessEnv = {}) {
  const res = spawnSync('bash', [SCRIPT, ...args], {
    encoding: 'utf-8',
    env: {
      ...process.env,
      TMPDIR: tmp,
      FOOTBAG_KNOWN_HOSTS: pinPath,
      INSTALL_KNOWN_HOSTS_AWS_BIN: awsStub,
      TF_OUTPUT_BIN: tfStub,
      AWS_PROFILE_BIN: identityStub,
      AWS_IDENTITY_BIN: identityStub,
      AWS_PROFILE: 'stub-profile',
      ...extra,
    },
    ...SPAWN_GUARD,
  });
  return { status: res.status, stdout: res.stdout ?? '', stderr: res.stderr ?? '' };
}

const mints = () => {
  const f = join(workDir, 'mints.log');
  return existsSync(f) ? readFileSync(f, 'utf-8').split('\n').filter(Boolean) : [];
};
const record = () => (existsSync(recordPath) ? readFileSync(recordPath, 'utf-8') : '');
const STAGING_RECORD = `footbag-staging footbag-staging-web ${ARN} ${CREATED}`;

beforeEach(() => {
  workDir = mkdtempSync(join(tmpdir(), 'footbag-test-pin-'));
  mkdirSync(join(workDir, 'AWS'), { recursive: true });
  tmp = join(workDir, 'tmp');
  mkdirSync(tmp);
  pinPath = join(workDir, 'AWS', 'footbag_known_hosts');
  recordPath = `${pinPath}.instances`;
  awsStub = join(workDir, 'aws-stub.sh');
  tfStub = join(workDir, 'tf-stub.sh');
  identityStub = join(workDir, 'identity-stub.sh');
  writeFileSync(join(workDir, 'arn'), ARN);
  writeFileSync(join(workDir, 'created'), CREATED);
  setKeys();
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
    expect(mints()).toEqual([]);
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
    writeFileSync(join(workDir, 'mint-fails'), '');
    const r = run(['--target', 'staging']);
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/could not read host keys/);
    expect(existsSync(pinPath)).toBe(false);
    expect(existsSync(recordPath)).toBe(false);
  });

  it('stops, minting nothing, when the instance cannot be described', () => {
    // Defect caught: a denied GetInstance read as "not current" and answered
    // with a mint, so every failed check fires the break-glass alarm.
    writeFileSync(join(workDir, 'get-instance-fails'), '');
    const r = run(['--target', 'staging']);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('AccessDeniedException');
    expect(mints()).toEqual([]);
    expect(existsSync(pinPath)).toBe(false);
  });

  it('refuses to mint while the AWS CLI history would keep the response, beside a run with it off', () => {
    // Defect caught: the minted private key copied into the CLI's history
    // database, which nothing shreds.
    writeFileSync(join(workDir, 'history'), 'enabled\n');
    const on = run(['--target', 'staging']);
    expect(on.status).toBe(1);
    expect(on.stderr).toContain('cli_history disabled');
    expect(mints()).toEqual([]);
    expect(existsSync(pinPath)).toBe(false);
    writeFileSync(join(workDir, 'history'), 'disabled\n');
    const off = run(['--target', 'staging']);
    expect(off.status, off.stderr).toBe(0);
    expect(mints()).toHaveLength(1);
  });
});

describe('install-known-hosts.sh — what it writes', () => {
  it('covers every algorithm on both ports, and records the instance they were read from', () => {
    // sshd listens on 22 and 2222, and OpenSSH matches a non-default port only
    // in the bracketed form, so a pin written for one port verifies nothing on
    // the other. Without the record, the next check cannot tell this host from
    // a rebuilt one without minting again.
    const r = run(['--target', 'staging']);
    expect(r.status, r.stderr).toBe(0);
    const pin = readFileSync(pinPath, 'utf-8');
    expect(pin).toContain(`${STAGING_IP} ssh-rsa AAAARSAKEY`);
    expect(pin).toContain(`${STAGING_IP} ssh-ed25519 AAAAED25519KEY`);
    expect(pin).toContain(`[${STAGING_IP}]:2222 ssh-rsa AAAARSAKEY`);
    expect(pin).toContain(`[${STAGING_IP}]:2222 ssh-ed25519 AAAAED25519KEY`);
    expect(record()).toBe(`${STAGING_RECORD}\n`);
    expect(statSync(recordPath).mode & 0o777).toBe(0o600);
  });

  it('shows the fingerprint of the key it pinned, with no warning', () => {
    // The operator is asked to compare the printed fingerprint against the
    // host's, so it is drawn from a real key the stand-in host reports.
    // Defect caught: the written lines carry the environment's tag, which
    // ssh-keygen lists in place of the address, so a listing filtered by the
    // address shows nothing and the comparison cannot be made.
    const keyFile = join(workDir, 'host_ed25519');
    const gen = spawnSync('ssh-keygen', ['-q', '-t', 'ed25519', '-N', '', '-C', 'host', '-f', keyFile], { encoding: 'utf-8', ...SPAWN_GUARD });
    expect(gen.status, gen.stderr).toBe(0);
    const body = readFileSync(`${keyFile}.pub`, 'utf-8').split(' ')[1];
    setKeys(`ssh-ed25519\t${body}\n`);
    const listed = spawnSync('ssh-keygen', ['-lf', `${keyFile}.pub`], { encoding: 'utf-8', ...SPAWN_GUARD });
    const fingerprint = listed.stdout.split(' ')[1];
    expect(fingerprint).toMatch(/^SHA256:/);

    const r = run(['--target', 'staging']);
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toContain(fingerprint);
    expect(r.stderr).toContain('No errors or warnings.');
  });

  it('mints once, attributed to this script, and leaves the private key nowhere', () => {
    // Defect caught: a mint the listing cannot attribute to a known script, so
    // a routine install reads as an unexplained break-glass; or the response's
    // private key printed or left on disk.
    const r = run(['--target', 'staging']);
    expect(r.status, r.stderr).toBe(0);
    expect(mints()).toEqual(['footbag-install-known-hosts footbag-staging-web']);
    expect(r.stdout + r.stderr).not.toContain(SENTINEL);
    expect(readdirSync(tmp)).toEqual([]);
    expect(readFileSync(pinPath, 'utf-8')).not.toContain(SENTINEL);
  });

  it('shreds the response when interrupted with it on disk', () => {
    // Defect caught: an interrupt between the mint and the read leaving a
    // root-capable private key in a temporary file.
    writeFileSync(join(workDir, 'term-after-mint'), '');
    const r = run(['--target', 'staging']);
    expect(r.status).toBe(143);
    expect(mints()).toHaveLength(1);
    expect(readdirSync(tmp)).toEqual([]);
  });

  // Defect caught: after a restore from snapshot the host runs as a new
  // instance under a new name, and keys read by the original name are the
  // stopped old host's, so every later connection to the restored host refuses.
  it('pins the keys of the instance Terraform names, which a restore renames', () => {
    const restored = 'footbag-staging-web-r202610260000';
    writeTfStub(STAGING_IP, restored);
    setKeys('ssh-ed25519\tAAAARESTOREDKEY\n', `hostkeys-${restored}`);
    setKeys('ssh-ed25519\tAAAAOLDHOSTKEY\n');
    const r = run(['--target', 'staging']);
    expect(r.status, r.stderr).toBe(0);
    const pin = readFileSync(pinPath, 'utf-8');
    expect(pin).toContain(`${STAGING_IP} ssh-ed25519 AAAARESTOREDKEY`);
    expect(pin).not.toContain('AAAAOLDHOSTKEY');
    expect(record()).toContain(`footbag-staging ${restored} `);
  });

  it('keeps another environment\'s lines and record rather than replacing the files', () => {
    // The file holds every host an operator reaches. Rewriting it wholesale is
    // how production's pin disappears during a staging run, and the loss shows
    // up only at the next production deploy.
    writeFileSync(pinPath, `${OTHER_ENV_LINE}\n`, 'utf-8');
    writeFileSync(recordPath, `${PROD_RECORD}\n`, { mode: 0o600 });
    const r = run(['--target', 'staging']);
    expect(r.status, r.stderr).toBe(0);
    const pin = readFileSync(pinPath, 'utf-8');
    expect(pin).toContain(OTHER_ENV_LINE);
    expect(pin).toContain(`[${STAGING_IP}]:2222 ssh-ed25519 AAAAED25519KEY`);
    expect(record()).toBe(`${PROD_RECORD}\n${STAGING_RECORD}\n`);
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

  it('leaves a current pin alone on a second run, and mints nothing', () => {
    // Defect caught: every routine install (bootstrap, workstation setup)
    // minting again over a pin that is already right, firing the alarm on
    // ordinary work.
    run(['--target', 'staging']);
    const first = readFileSync(pinPath, 'utf-8');
    const firstRecord = record();
    const r = run(['--target', 'staging']);
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toMatch(/Already current, nothing minted/);
    expect(mints()).toHaveLength(1);
    expect(readFileSync(pinPath, 'utf-8')).toBe(first);
    expect(record()).toBe(firstRecord);
  });

  it('rebuilds the pin for a host rebuilt under the same name, with one mint', () => {
    // Defect caught: a rebuilt host, its keys new, passing as current because
    // its name and address did not change, so every connection then refuses it.
    run(['--target', 'staging']);
    writeFileSync(join(workDir, 'arn'), REBUILT_ARN);
    setKeys('ssh-ed25519\tAAAAREBUILTKEY\n');
    const r = run(['--target', 'staging']);
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toContain('rebuilt or replaced');
    expect(mints()).toHaveLength(2);
    const pin = readFileSync(pinPath, 'utf-8');
    expect(pin).toContain(`${STAGING_IP} ssh-ed25519 AAAAREBUILTKEY footbag-staging`);
    expect(pin).not.toContain('AAAARSAKEY');
    expect(record()).toBe(`footbag-staging footbag-staging-web ${REBUILT_ARN} ${CREATED}\n`);
  });
});

describe('install-known-hosts.sh — a rebuild that moved the host', () => {
  const PREV_IP = '198.51.100.20';
  const PREV_LINES = `${PREV_IP} ssh-ed25519 AAAAPREVKEY\n[${PREV_IP}]:2222 ssh-ed25519 AAAAPREVKEY\n`;

  /** `ssh -G` reporting that the alias still names the previous address. */
  function aliasNames(host: string): NodeJS.ProcessEnv {
    const bin = join(workDir, 'alias-bin');
    mkdirSync(bin, { recursive: true });
    writeFileSync(join(bin, 'ssh'), [
      '#!/usr/bin/env bash',
      `[[ "$1" == "-G" ]] && { printf 'user footbag\\nhostname %s\\n' ${JSON.stringify(host)}; exit 0; }`,
      'exit 255',
    ].join('\n'));
    chmodSync(join(bin, 'ssh'), 0o755);
    return { PATH: `${bin}:${process.env.PATH ?? ''}` };
  }

  it('drops the lines for the address the alias named before, and keeps the other environment\'s', () => {
    // Defect caught: a rebuild leaves the old address pinned, so if that
    // address is ever reassigned the pin verifies whoever holds it next.
    writeFileSync(pinPath, `${OTHER_ENV_LINE}\n${PREV_LINES}`, 'utf-8');
    const r = run(['--target', 'staging'], aliasNames(PREV_IP));
    expect(r.status, r.stderr).toBe(0);
    const pin = readFileSync(pinPath, 'utf-8');
    expect(pin).not.toContain(PREV_IP);
    expect(pin).toContain(OTHER_ENV_LINE);
    expect(pin).toContain(`[${STAGING_IP}]:2222 ssh-ed25519 AAAAED25519KEY footbag-staging`);
  });

  it('never drops a line the other environment\'s run wrote, whatever address it names', () => {
    const otherTagged = `${PREV_IP} ssh-ed25519 AAAAPRODKEY footbag-production`;
    writeFileSync(pinPath, `${otherTagged}\n`, 'utf-8');
    const r = run(['--target', 'staging'], aliasNames(PREV_IP));
    expect(r.status, r.stderr).toBe(0);
    expect(readFileSync(pinPath, 'utf-8')).toContain(otherTagged);
  });

  it('drops a line this environment wrote at an address it no longer has, with no alias hint', () => {
    writeFileSync(pinPath, `${PREV_IP} ssh-ed25519 AAAAPREVKEY footbag-staging\n${OTHER_ENV_LINE}\n`, 'utf-8');
    const r = run(['--target', 'staging'], aliasNames(STAGING_IP));
    expect(r.status, r.stderr).toBe(0);
    const pin = readFileSync(pinPath, 'utf-8');
    expect(pin).not.toContain('AAAAPREVKEY');
    expect(pin).toContain(OTHER_ENV_LINE);
  });

  it('reports the leftover lines as stale under --check without minting, and current once they are gone', () => {
    run(['--target', 'staging']);
    writeFileSync(pinPath, readFileSync(pinPath, 'utf-8') + PREV_LINES, 'utf-8');
    const stale = run(['--target', 'staging', '--check'], aliasNames(PREV_IP));
    expect(stale.status).toBe(1);
    expect(stale.stderr).toMatch(/2 line\(s\) still pin footbag-staging-web/);
    expect(mints()).toHaveLength(1);
    run(['--target', 'staging'], aliasNames(PREV_IP));
    const current = run(['--target', 'staging', '--check'], aliasNames(PREV_IP));
    expect(current.status, current.stderr).toBe(0);
  });
});

describe('install-known-hosts.sh — the read-only report', () => {
  it('reports a missing pin as not proven current, writing and minting nothing', () => {
    const r = run(['--target', 'staging', '--check']);
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/Not proven current/);
    expect(existsSync(pinPath)).toBe(false);
    expect(mints()).toEqual([]);
  });

  it('reports a current pin as current, minting nothing', () => {
    // Defect caught: --check, which bootstrap --status and workstation setup run
    // on every pass, firing the production break-glass alarm.
    run(['--target', 'staging']);
    const r = run(['--target', 'staging', '--check']);
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toMatch(/Pinned and current/);
    expect(mints()).toHaveLength(1);
  });

  it('calls a pin with no instance record not proven current, and minting nothing says how to fix it', () => {
    // A pin written before the record existed carries the right lines and no
    // proof of which instance they came from. Defect caught: such a pin read as
    // current, or --check minting to find out.
    writeFileSync(pinPath, [
      `${STAGING_IP} ssh-rsa AAAARSAKEY`, `[${STAGING_IP}]:2222 ssh-rsa AAAARSAKEY`,
      `${STAGING_IP} ssh-ed25519 AAAAED25519KEY`, `[${STAGING_IP}]:2222 ssh-ed25519 AAAAED25519KEY`,
    ].join('\n') + '\n', 'utf-8');
    const r = run(['--target', 'staging', '--check']);
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/not proven current/);
    expect(r.stderr).toMatch(/Re-run without --check/);
    expect(mints()).toEqual([]);
    expect(existsSync(recordPath)).toBe(false);
  });

  it('reports a rebuilt host as stale, minting nothing', () => {
    // Defect caught: a rebuilt host passing --check, so bootstrap and setup
    // report the pin fine until the next deploy refuses the host.
    run(['--target', 'staging']);
    writeFileSync(join(workDir, 'arn'), REBUILT_ARN);
    const r = run(['--target', 'staging', '--check']);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('rebuilt or replaced');
    expect(mints()).toHaveLength(1);
  });
});

describe('install-known-hosts.sh — the closing report', () => {
  /** The part of stderr from the closing report's heading on. */
  const closingReport = (stderr: string) => {
    const at = stderr.indexOf('==== Closing report: install-known-hosts.sh ====');
    return at < 0 ? '' : stderr.slice(at);
  };

  it('ends a stale --check with one report listing the reason as an error, and a current one with none', () => {
    // Defect caught: the reason a pin is not current printed mid-stream and lost
    // above a long run's output, or a report that lists no error while the run
    // exits non-zero, which an operator reads as a pass.
    const stale = run(['--target', 'staging', '--check']);
    expect(stale.status).toBe(1);
    const staleReport = closingReport(stale.stderr);
    expect(staleReport).toMatch(/Errors \(\d+\):\n\s+- the staging pin is not proven current: there is no pin file/);

    run(['--target', 'staging']);
    const current = run(['--target', 'staging', '--check']);
    expect(current.status, current.stderr).toBe(0);
    const currentReport = closingReport(current.stderr);
    expect(currentReport).toContain('No errors or warnings.');
    expect(currentReport).toMatch(/the staging pin is current for footbag-staging-web at 203\.0\.113\.10/);
  });

  it('lists an install as proven only once it has written, verified and read back the pin', () => {
    // Defect caught: an install that claims the pin it never verified.
    const r = run(['--target', 'staging']);
    expect(r.status, r.stderr).toBe(0);
    expect(closingReport(r.stderr)).toMatch(/wrote 4 lines for footbag-staging-web at 203\.0\.113\.10 on ports 22 and 2222, verified/);

  });

  it('lists a refused mint as the error and claims nothing written', () => {
    // Defect caught: a failed key read reported without its cause in the
    // closing report, or listed beside a claim that the pin was written.
    writeFileSync(join(workDir, 'mint-fails'), '');
    const r = run(['--target', 'staging']);
    expect(r.status).toBe(1);
    const report = closingReport(r.stderr);
    expect(report).toMatch(/Errors \(\d+\):\n\s+- could not read footbag-staging-web's host keys from Lightsail/);
    expect(report).not.toMatch(/wrote \d+ lines/);
    expect(existsSync(pinPath)).toBe(false);
  });

  it("hands its errors to the run that started it, still exiting non-zero for that run to branch on", () => {
    // A caller on the same library (bootstrap-host.sh, restore-host.sh) names a
    // file of its own; the child appends there instead of printing a second
    // report. Defect caught: the child's reason missing from the one report the
    // operator reads, or a nested failure exiting 0 so the caller carries on.
    const callerFile = join(workDir, 'caller-report');
    writeFileSync(callerFile, '');
    const r = run(['--target', 'staging', '--check'], { FOOTBAG_CR_REPORT_TO: callerFile });
    expect(r.status).toBe(1);
    expect(closingReport(r.stderr)).toBe('');
    expect(readFileSync(callerFile, 'utf-8')).toMatch(/^ERROR\tinstall-known-hosts\.sh: the staging pin is not proven current: /m);
  });
});
