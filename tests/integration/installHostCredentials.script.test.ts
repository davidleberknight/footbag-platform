/**
 * scripts/install-host-credentials.sh — the refusals ahead of writing a runtime
 * credential onto a deployed host.
 *
 * This script installs the long-lived access key the application authenticates
 * with, into /root/.aws on one of the two hosts. The mutating half needs a real
 * host, a real sudo password and a real key, and is not exercised here. What is
 * pinned is everything that decides WHERE the credential goes and whether the
 * material is fit to send, because those are the judgements a wrong answer
 * carries out silently: every step after a mistargeted run succeeds against the
 * wrong host exactly as readily as against the right one.
 *
 * Chief among them is that `--target` has no default. It used to default to
 * staging, so a run meaning production with the flag forgotten would install
 * the production source-profile key onto the staging host under staging profile
 * names, having also sent the production sudo password there.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, chmodSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { SPAWN_GUARD } from '../fixtures/spawnGuard';
import { NO_AWS_CREDENTIALS } from '../fixtures/awsIsolation';

const SCRIPT = join(process.cwd(), 'scripts/install-host-credentials.sh');

let workDir: string;

beforeEach(() => {
  workDir = mkdtempSync(join(tmpdir(), 'footbag-test-hostcreds-'));
});

afterEach(() => {
  rmSync(workDir, { recursive: true, force: true });
});

/** A keys file of the shape `aws iam create-access-key` writes. */
function keysFile(mode = 0o600, body?: string): string {
  const path = join(workDir, 'keys.json');
  writeFileSync(
    path,
    body ??
      JSON.stringify({
        AccessKey: { AccessKeyId: 'AKIAFAKE', SecretAccessKey: 'secret-value-not-real' },
      }),
    'utf-8',
  );
  chmodSync(path, mode);
  return path;
}

function run(args: string[]) {
  const result = spawnSync('bash', [SCRIPT, ...args], {
    cwd: process.cwd(),
    encoding: 'utf-8',
    input: 'fixture-sudo-password\n',
    env: { ...process.env, ...NO_AWS_CREDENTIALS },
    ...SPAWN_GUARD,
  });
  return {
    status: result.status,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

/**
 * The same, with nothing on stdin. The retirement modes take no password, and a
 * run that supplied one anyway would not prove they do not ask for it.
 */
function runNoStdin(args: string[]) {
  const result = spawnSync('bash', [SCRIPT, ...args], {
    cwd: process.cwd(),
    encoding: 'utf-8',
    input: '',
    env: { ...process.env, ...NO_AWS_CREDENTIALS },
    ...SPAWN_GUARD,
  });
  return {
    status: result.status,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

describe('install-host-credentials.sh — which host it is aimed at', () => {
  it('refuses without a target, and says why there is no default', () => {
    const r = run([keysFile()]);
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/--target is required/);
    expect(r.stderr).toMatch(/no default/);
  });

  it('names the consequence rather than only the rule', () => {
    // A refusal that says "this is required" teaches nothing. This one has to
    // say what a defaulted target would have done, because the failure it
    // prevents leaves no trace: the wrong host accepts the credential happily.
    //
    // The general half now comes from the shared helper and the script adds
    // what it costs HERE. Both are asserted, because the shared half alone
    // would be the generic message this case exists to reject.
    const r = run([keysFile()]);
    expect(r.stderr).toMatch(/never inherited from ambient state/);
    expect(r.stderr).toMatch(/the password and the key both reach/);
    expect(r.stderr).toMatch(/nothing failing to say so/);
  });

  it('refuses a target that is neither environment', () => {
    const r = run(['--target', 'prod', keysFile()]);
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/must be 'staging' or 'production'/);
  });

  it('refuses --target with no value', () => {
    const r = run(['--target']);
    expect(r.status).toBe(2);
  });

  it('refuses an unknown flag rather than ignoring it', () => {
    const r = run(['--target', 'staging', '--nope', keysFile()]);
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("unknown flag '--nope'");
  });
});

describe('install-host-credentials.sh — whether the material is fit to send', () => {
  it('no longer requires a keys file, because it mints the key itself', () => {
    // The keys file used to be mandatory, which meant the ordinary path began
    // with the operator running `aws iam create-access-key` into a temp file by
    // hand and ended with them remembering to shred it. Omitting it now reaches
    // the minting path, which writes no secret to disk at all. Without a
    // terminal that path refuses at the library's own guard rather than at an
    // argument check, which is what this asserts: exit 1, not the exit 2 of a
    // usage error.
    const r = run(['--target', 'staging']);
    expect(r.status).not.toBe(2);
    expect(r.stderr).not.toMatch(/keys file is required/);
  });

  it('refuses a keys file it cannot read', () => {
    const r = run(['--target', 'staging', join(workDir, 'absent.json')]);
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/cannot read keys file/);
  });

  it('refuses a world-readable keys file, and treats the key as exposed', () => {
    // The window between issuing a key and shredding the file is when a
    // co-tenant on a shared workstation could read it, so the mode is not a
    // tidiness check: a file that was readable must be assumed to have been read.
    const r = run(['--target', 'staging', keysFile(0o644)]);
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/expected 600/);
    expect(r.stderr).toMatch(/Treat the key it holds as exposed/);
    // And it now names the better answer rather than only the repair: a run
    // that mints its own key has no temp file to get the mode wrong on.
    expect(r.stderr).toMatch(/run this script with no keys file at all/);
  });

  it('refuses --retire with no key id', () => {
    const r = run(['--target', 'staging', '--retire']);
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/--retire requires the key id/);
  });

  it('refuses --delete with no key id', () => {
    const r = run(['--target', 'staging', '--delete']);
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/--delete requires the key id/);
  });

  it('refuses to install and retire in one run', () => {
    // The window between them is the point: the old key stays active so the
    // host never stops, and the operator watches before cutting it.
    const r = run(['--target', 'staging', '--rotate', '--retire', 'AKIAOLD']);
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/separate runs/);
  });

  it('refuses a keys file alongside a retirement', () => {
    const r = run(['--target', 'staging', '--retire', 'AKIAOLD', keysFile(0o600)]);
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/separate runs/);
  });

  it('demands the sudo password on a retirement, because it asks the host to prove itself', () => {
    // This is the opposite of what it did first, and the change is the point.
    // Asking the WORKSTATION to resolve footbag-<env>-runtime proves only that
    // the operator can assume the role: a workstation profile chains from the
    // operator's own key and says nothing about /root/.aws/credentials on the
    // host. An install that never ran, or that landed on the other
    // environment's host, passed that check -- and deactivating the predecessor
    // then took the host off SSM, S3 and SES at its next call, hours later, as
    // an opaque denial. The proof has to come from the host, so the run
    // connects, so it needs the password.
    // Asserted on the guard's condition rather than on a run, because the
    // refusal fires only when stdin is a TERMINAL and a spawned test never has
    // one. The condition is the contract: only --delete is exempt.
    const script = readFileSync(SCRIPT, 'utf-8');
    expect(script).toMatch(/if \[\[ "\$ACTION" != "delete" && -t 0 \]\]; then/);
    expect(script).not.toMatch(/if \[\[ "\$ACTION" == "install" && -t 0 \]\]; then/);
  });

  it('proves the chain from the host, not from this workstation', () => {
    const script = readFileSync(SCRIPT, 'utf-8');
    const retire = script.slice(script.indexOf('    retire)'), script.indexOf('    delete)'));
    // Over the wire, reading the host's own credential files.
    expect(retire).toMatch(/AWS_SHARED_CREDENTIALS_FILE=\/root\/\.aws\/credentials/);
    expect(retire).toMatch(/assumed-role/);
    // And never through the workstation's chain helper, which is what it used
    // to do and what made the check meaningless here.
    expect(retire).not.toMatch(/aws_identity_require_chain/);
  });

  it('pins the host key before connecting on a retirement too', () => {
    // The stream carries the sudo password on line one, so a first connection
    // to a substituted host would hand it over before anything was checked.
    const script = readFileSync(SCRIPT, 'utf-8');
    const block = script.slice(script.indexOf('if [[ "$ACTION" != "install" ]]; then'));
    expect(block.slice(0, block.indexOf('    retire)'))).toMatch(/require_pinned_known_hosts/);
  });

  it('refuses a keys file that does not carry a key', () => {
    const r = run(['--target', 'staging', keysFile(0o600, '{"AccessKey":{}}')]);
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/does not contain/);
  });
});
