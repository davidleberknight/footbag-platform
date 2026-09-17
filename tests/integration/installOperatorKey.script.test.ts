/**
 * scripts/lib/aws-credentials-file.sh and scripts/install-operator-key.sh —
 * putting the operator's key into the credentials file without damaging it.
 *
 * This was the one step of a key rotation with no script behind it: the runbook
 * said "install it into ~/.aws/credentials yourself" and an operator opened an
 * editor with a secret on the clipboard. The three ways that goes wrong all
 * fail silently at the time and loudly much later, in some unrelated tool: a
 * paste that lost characters, a session token left behind beside the new key,
 * and a write interrupted partway through a file nobody has another copy of.
 *
 * The prompting half needs a terminal and belongs to the operator, so what is
 * driven here is the library underneath it, where the file surgery lives, plus
 * the script's refusals that are reachable without a terminal.
 *
 * The values passed to the library below are function arguments, not process
 * arguments, which is the same route the script uses; nothing in either path
 * puts a secret where `ps` can read it.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import {
  mkdtempSync,
  rmSync,
  writeFileSync,
  readFileSync,
  statSync,
  readdirSync,
  symlinkSync,
  lstatSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { SPAWN_GUARD } from '../fixtures/spawnGuard';
import { NO_AWS_CREDENTIALS } from '../fixtures/awsIsolation';

const LIB = join(process.cwd(), 'scripts/lib/aws-credentials-file.sh');
const SCRIPT = join(process.cwd(), 'scripts/install-operator-key.sh');

// Shaped like the real thing so the validators are exercised, but plainly not a
// credential: the id is not 20 characters of the AKIA form and the secret is a
// repeated word.
const FAKE_ID = 'AKIAEXAMPLEEXAMPLE99';
const FAKE_SECRET = 'notasecret/notasecret/notasecret/notasec';

let workDir: string;

beforeEach(() => {
  workDir = mkdtempSync(join(tmpdir(), 'footbag-test-opkey-'));
});

afterEach(() => {
  rmSync(workDir, { recursive: true, force: true });
});

/** Sources the library and runs the given body, returning what it printed. */
function inLib(body: string) {
  const res = spawnSync('bash', ['-c', `set -euo pipefail; source "${LIB}"; ${body}`], {
    encoding: 'utf-8',
    env: { ...process.env, TMPDIR: workDir },
    ...SPAWN_GUARD,
  });
  return { status: res.status, stdout: res.stdout ?? '', stderr: res.stderr ?? '' };
}

function credFile(contents: string): string {
  const path = join(workDir, 'credentials');
  writeFileSync(path, contents, 'utf-8');
  return path;
}

describe('aws_cred_put: the file surgery', () => {
  it('replaces the two credential lines of the named profile in place', () => {
    const file = credFile(
      ['[other]', 'aws_access_key_id = AKIAOTHER', '', '[footbag-operator]', 'aws_access_key_id = AKIAOLD', 'aws_secret_access_key = oldsecret', ''].join(
        '\n',
      ),
    );
    const r = inLib(`aws_cred_put "${file}" footbag-operator "${FAKE_ID}" "${FAKE_SECRET}"`);
    expect(r.status, r.stderr).toBe(0);
    const after = readFileSync(file, 'utf-8');
    expect(after).toContain(`aws_access_key_id = ${FAKE_ID}`);
    expect(after).not.toContain('AKIAOLD');
    expect(after).not.toContain('oldsecret');
  });

  it('leaves every other profile byte for byte', () => {
    // The blast radius of this function is one section. A rewrite that
    // reformatted the rest would be invisible until some other profile stopped
    // working.
    const other = ['[other]', 'aws_access_key_id=AKIAOTHER', 'aws_secret_access_key=othersecret'].join('\n');
    const file = credFile(`${other}\n\n[footbag-operator]\naws_access_key_id = AKIAOLD\naws_secret_access_key = old\n`);
    inLib(`aws_cred_put "${file}" footbag-operator "${FAKE_ID}" "${FAKE_SECRET}"`);
    expect(readFileSync(file, 'utf-8')).toContain(other);
  });

  it('keeps the section where it sits rather than moving it to the end', () => {
    const file = credFile(
      ['[footbag-operator]', 'aws_access_key_id = AKIAOLD', 'aws_secret_access_key = old', '', '[zzz-last]', 'aws_access_key_id = AKIAZZZ', ''].join('\n'),
    );
    inLib(`aws_cred_put "${file}" footbag-operator "${FAKE_ID}" "${FAKE_SECRET}"`);
    const lines = readFileSync(file, 'utf-8').split('\n');
    expect(lines.indexOf('[footbag-operator]')).toBeLessThan(lines.indexOf('[zzz-last]'));
  });

  it('keeps non-credential settings inside the section', () => {
    // A region or an output format in there is not ours to discard.
    const file = credFile(
      ['[footbag-operator]', 'region = us-west-2', 'aws_access_key_id = AKIAOLD', 'aws_secret_access_key = old'].join('\n'),
    );
    inLib(`aws_cred_put "${file}" footbag-operator "${FAKE_ID}" "${FAKE_SECRET}"`);
    expect(readFileSync(file, 'utf-8')).toContain('region = us-west-2');
  });

  it('removes a stale session token from the section', () => {
    // Left beside a new long-lived key it takes precedence, and every call then
    // fails describing the token rather than the key.
    const file = credFile(
      ['[footbag-operator]', 'aws_access_key_id = AKIAOLD', 'aws_secret_access_key = old', 'aws_session_token = staletoken'].join('\n'),
    );
    inLib(`aws_cred_put "${file}" footbag-operator "${FAKE_ID}" "${FAKE_SECRET}"`);
    expect(readFileSync(file, 'utf-8')).not.toContain('staletoken');
  });

  it('creates the section when the file has no such profile', () => {
    const file = credFile('[other]\naws_access_key_id = AKIAOTHER\n');
    const r = inLib(`aws_cred_put "${file}" footbag-operator "${FAKE_ID}" "${FAKE_SECRET}"`);
    expect(r.status, r.stderr).toBe(0);
    const after = readFileSync(file, 'utf-8');
    expect(after).toContain('[footbag-operator]');
    expect(after).toContain('[other]');
  });

  it('creates the file, and its directory, when neither exists', () => {
    const file = join(workDir, 'nested', 'deeper', 'credentials');
    const r = inLib(`aws_cred_put "${file}" footbag-operator "${FAKE_ID}" "${FAKE_SECRET}"`);
    expect(r.status, r.stderr).toBe(0);
    expect(readFileSync(file, 'utf-8')).toContain(FAKE_ID);
  });

  it('leaves the file owner-only', () => {
    const file = credFile('[footbag-operator]\naws_access_key_id = AKIAOLD\naws_secret_access_key = old\n');
    inLib(`aws_cred_put "${file}" footbag-operator "${FAKE_ID}" "${FAKE_SECRET}"`);
    expect(statSync(file).mode & 0o777).toBe(0o600);
  });

  it('leaves no temp file beside the target', () => {
    const file = credFile('[footbag-operator]\naws_access_key_id = AKIAOLD\naws_secret_access_key = old\n');
    inLib(`aws_cred_put "${file}" footbag-operator "${FAKE_ID}" "${FAKE_SECRET}"`);
    expect(readdirSync(workDir).filter((f) => f.startsWith('.aws-credentials'))).toEqual([]);
  });

  it('writes through a symlink instead of replacing it with a file', () => {
    // `[[ -f ]]` follows a symlink, so the atomic rename would have replaced the
    // LINK with a regular file. The target would keep the old key, and
    // re-creating the link later would reinstate a credential that was supposed
    // to have been retired — with nothing connecting that to this run.
    const real = join(workDir, 'real-credentials');
    writeFileSync(real, '[footbag-operator]\naws_access_key_id = AKIAOLD\naws_secret_access_key = old\n', 'utf-8');
    const link = join(workDir, 'linked-credentials');
    symlinkSync(real, link);

    const r = inLib(`aws_cred_put "${link}" footbag-operator "${FAKE_ID}" "${FAKE_SECRET}"`);
    expect(r.status, r.stderr).toBe(0);
    expect(lstatSync(link).isSymbolicLink(), 'the link must survive').toBe(true);
    expect(readFileSync(real, 'utf-8')).toContain(FAKE_ID);
    expect(readFileSync(real, 'utf-8')).not.toContain('AKIAOLD');
  });

  it('refuses a target that is not a regular file, rather than clobbering it', () => {
    const r = inLib(
      `aws_cred_put "${workDir}" footbag-operator "${FAKE_ID}" "${FAKE_SECRET}" || echo "REFUSED: $AWS_CRED_ERROR"`,
    );
    expect(r.stdout).toMatch(/REFUSED: .*not a regular file/);
  });
});

describe('the secret does not escape', () => {
  // Asserted rather than reasoned about. Each of these is a place a secret has
  // historically leaked out of a script like this one: into the output a
  // wrapper captures, into a file nobody remembers, or into a process argument
  // that every account on the machine can read with ps.

  it('never appears in anything the write prints', () => {
    const file = credFile('[footbag-operator]\naws_access_key_id = AKIAOLD\naws_secret_access_key = old\n');
    const r = inLib(`aws_cred_put "${file}" footbag-operator "${FAKE_ID}" "${FAKE_SECRET}"`);
    expect(r.stdout).not.toContain(FAKE_SECRET);
    expect(r.stderr).not.toContain(FAKE_SECRET);
  });

  it('never appears in anything a FAILED write prints', () => {
    // The error path is where a value gets echoed back "to help", and it is the
    // path least likely to be read closely afterwards.
    const r = inLib(
      `aws_cred_put "${workDir}" footbag-operator "${FAKE_ID}" "${FAKE_SECRET}" || echo "failed: $AWS_CRED_ERROR"`,
    );
    expect(r.stdout).not.toContain(FAKE_SECRET);
    expect(r.stderr).not.toContain(FAKE_SECRET);
  });

  it('is left in the target file and nowhere else in the directory', () => {
    const file = credFile('[footbag-operator]\naws_access_key_id = AKIAOLD\naws_secret_access_key = old\n');
    inLib(`aws_cred_put "${file}" footbag-operator "${FAKE_ID}" "${FAKE_SECRET}"`);
    const holders = readdirSync(workDir).filter((name) => {
      const body = readFileSync(join(workDir, name), 'utf-8');
      return body.includes(FAKE_SECRET);
    });
    expect(holders).toEqual(['credentials']);
  });

  it('is not readable by anyone but the owner', () => {
    const file = credFile('[footbag-operator]\naws_access_key_id = AKIAOLD\naws_secret_access_key = old\n');
    inLib(`aws_cred_put "${file}" footbag-operator "${FAKE_ID}" "${FAKE_SECRET}"`);
    expect(statSync(file).mode & 0o077).toBe(0);
  });

  it('is destroyed rather than unlinked when the write does not complete', () => {
    // An unlink leaves the blocks readable until they are reused. The cleanup
    // routes through the shared destroy helper, which shreds first.
    const lib = readFileSync(LIB, 'utf-8');
    expect(lib).toMatch(/secret_file_destroy/);
    expect(lib).not.toMatch(/trap "rm -f/);
  });

  it('does not survive an interrupt taken between the write and the rename', () => {
    // The window this covers is real and narrow: the temp file holds the secret
    // from the moment it is written until the rename promotes it. The function's
    // own cleanup runs when the function returns, and an interrupt is the one
    // way out that never returns, so on its own it leaves the credential on
    // disk. What closes the window is the file being registered, so the trap the
    // caller already owns can sweep it.
    //
    // Parked by standing in for the chmod that sits inside that window, so the
    // interrupt lands where an operator's Ctrl-C would rather than at a moment
    // chosen for being easy to hit.
    const file = credFile('[footbag-operator]\naws_access_key_id = AKIAOLD\naws_secret_access_key = old\n');
    const harness = join(workDir, 'interrupt.sh');
    writeFileSync(
      harness,
      [
        'set -euo pipefail',
        `source ${JSON.stringify(LIB)}`,
        // INT and TERM only: with no EXIT trap installed, nothing but the
        // interrupt path can account for the file being gone.
        'trap secret_file_sweep INT TERM',
        'chmod() { kill -INT $$; exit 130; }',
        `aws_cred_put ${JSON.stringify(file)} footbag-operator ${JSON.stringify(FAKE_ID)} ${JSON.stringify(FAKE_SECRET)}`,
      ].join('\n') + '\n',
      'utf-8',
    );
    const res = spawnSync('bash', [harness], {
      encoding: 'utf-8',
      env: { ...process.env, TMPDIR: workDir },
      ...SPAWN_GUARD,
    });
    expect(res.status).toBe(130);

    const leftovers = readdirSync(workDir).filter((name) => name.startsWith('.aws-credentials.'));
    expect(leftovers).toEqual([]);
    // And nothing in the directory still holds the secret. The rename never
    // happened, so the credentials file is untouched and carries the old key;
    // the harness itself is the test's own file and passes the value in.
    const holders = readdirSync(workDir)
      .filter((name) => name !== 'interrupt.sh')
      .filter((name) => readFileSync(join(workDir, name), 'utf-8').includes(FAKE_SECRET));
    expect(holders).toEqual([]);
  });

  it('gives the run a trap that covers the interrupt, not only the ordinary exits', () => {
    // The library registers; this is the half that sweeps. Run rather than read,
    // because a handler that names the helper and never reaches it reads the
    // same as one that works.
    const script = readFileSync(SCRIPT, 'utf-8');
    const start = script.indexOf('probe_cleanup() {');
    const end = script.indexOf('trap probe_cleanup EXIT INT TERM');
    expect(start, 'the probe cleanup was not found in the script').toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);

    const registered = join(workDir, 'registered-secret');
    const harness = join(workDir, 'cleanup.sh');
    writeFileSync(
      harness,
      [
        'set -euo pipefail',
        `source ${JSON.stringify(LIB)}`,
        'PROBE=""',
        script.slice(start, end),
        `printf '%s' ${JSON.stringify(FAKE_SECRET)} > ${JSON.stringify(registered)}`,
        `secret_file_register ${JSON.stringify(registered)}`,
        'probe_cleanup',
      ].join('\n') + '\n',
      'utf-8',
    );
    const res = spawnSync('bash', [harness], {
      encoding: 'utf-8',
      env: { ...process.env, TMPDIR: workDir },
      ...SPAWN_GUARD,
    });
    expect(res.status).toBe(0);
    expect(readdirSync(workDir)).not.toContain('registered-secret');
    // And the signals it is installed against include the interrupt.
    expect(script).toMatch(/trap probe_cleanup EXIT INT TERM/);
  });

  it('reads the typed secret silently, from the terminal, not from stdin', () => {
    const script = readFileSync(SCRIPT, 'utf-8');
    // -s so it is not echoed to a shoulder or a scrollback buffer, and
    // < /dev/tty so a redirected stdin cannot supply it.
    expect(script).toMatch(/read -rs SAK < \/dev\/tty/);
    // And the run refuses outright when stdin is not a terminal, so nobody can
    // pipe one in and have it consumed as an answer.
    expect(script).toMatch(/terminal_present --with-stdin/);
  });

  it('never passes the secret to an external command as an argument', () => {
    // argv is world-readable through ps. The secret reaches the library as a
    // shell function argument, which is internal to the process, and reaches
    // the file through printf, which is a builtin and forks nothing.
    const script = readFileSync(SCRIPT, 'utf-8');
    const uses = script
      .split('\n')
      .filter((line) => /\$SAK|\$\{SAK\}/.test(line))
      .filter((line) => !line.trim().startsWith('#'));
    // Every use is one of: the shape check, the equality check against the id,
    // the probe file written by a builtin, the library call, and the wipe.
    const allowed =
      /aws_cred_secret_looks_valid|aws_cred_put|SAK=|\[\[ "\$AKID" == "\$SAK" \]\]|printf 'aws_secret_access_key/;
    const unexpected = uses.filter((line) => !allowed.test(line));
    expect(unexpected, unexpected.join('\n')).toEqual([]);
  });

  it('clears every ambient credential source before the pre-write probe', () => {
    // The SDK reads AWS_ACCESS_KEY_ID and friends BEFORE any profile, so
    // clearing only the profile variables leaves the probe authenticating as
    // whatever the operator's shell exports. It then resolves to the right
    // user, pronounces an unproved paste good, and the write lands -- with the
    // post-write check catching it only after the working key is already gone.
    const script = readFileSync(SCRIPT, 'utf-8');
    const probe = script.slice(script.indexOf('PROBE_ARN='), script.indexOf('case "$PROBE_ARN"'));
    for (const v of [
      'AWS_PROFILE',
      'AWS_DEFAULT_PROFILE',
      'AWS_ACCESS_KEY_ID',
      'AWS_SECRET_ACCESS_KEY',
      'AWS_SESSION_TOKEN',
    ]) {
      expect(probe, `${v} must be unset for the probe`).toMatch(new RegExp(`-u ${v}\\b`));
    }
  });

  it('wipes the secret from memory once it is written', () => {
    const script = readFileSync(SCRIPT, 'utf-8');
    const afterWrite = script.slice(script.indexOf('aws_cred_put "$CRED_FILE"'));
    expect(afterWrite).toMatch(/^SAK=""$/m);
  });
});

describe('aws_cred_current_key_id', () => {
  it('reads the id of the named profile and not of its neighbours', () => {
    const file = credFile(
      ['[other]', 'aws_access_key_id = AKIAOTHER', '[footbag-operator]', 'aws_access_key_id = AKIAMINE'].join('\n'),
    );
    const r = inLib(`aws_cred_current_key_id "${file}" footbag-operator`);
    expect(r.stdout).toBe('AKIAMINE');
  });

  it('is empty when the profile has no key, rather than failing', () => {
    const file = credFile('[other]\naws_access_key_id = AKIAOTHER\n');
    const r = inLib(`echo "[$(aws_cred_current_key_id "${file}" footbag-operator)]"`);
    expect(r.stdout.trim()).toBe('[]');
  });
});

describe('the shape checks that catch a truncated paste', () => {
  it.each([
    ['a long-lived key id', FAKE_ID, 0],
    ['a truncated id', 'AKIAEXAMPLE', 1],
    ['a temporary session id', 'ASIAEXAMPLEEXAMPLE99', 1],
    ['an id with a lower-case tail', 'AKIAexampleexample99', 1],
    ['nothing at all', '', 1],
  ])('key id: %s', (_label, value, expected) => {
    const r = inLib(`aws_cred_key_id_looks_valid "${value}" && echo ok || echo no`);
    expect(r.stdout.trim()).toBe(expected === 0 ? 'ok' : 'no');
  });

  it.each([
    ['a full secret', FAKE_SECRET, 0],
    ['one character short', FAKE_SECRET.slice(0, -1), 1],
    ['one character long', `${FAKE_SECRET}x`, 1],
    ['nothing at all', '', 1],
  ])('secret: %s', (_label, value, expected) => {
    const r = inLib(`aws_cred_secret_looks_valid "${value}" && echo ok || echo no`);
    expect(r.stdout.trim()).toBe(expected === 0 ? 'ok' : 'no');
  });
});

describe('install-operator-key.sh — what it refuses without a terminal', () => {
  function run(args: string[] = []) {
    const res = spawnSync('bash', [SCRIPT, ...args], {
      encoding: 'utf-8',
      input: '',
      env: {
        ...process.env,
        ...NO_AWS_CREDENTIALS,
        AWS_SHARED_CREDENTIALS_FILE: join(workDir, 'credentials'),
        INSTALL_OPERATOR_KEY_AWS_BIN: '/bin/false',
      },
      ...SPAWN_GUARD,
    });
    return { status: res.status, stdout: res.stdout ?? '', stderr: res.stderr ?? '' };
  }

  it('refuses an unknown argument rather than ignoring it', () => {
    const r = run(['--nope']);
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("unknown argument '--nope'");
  });

  it('refuses to prompt for a secret with no terminal, and reads nothing', () => {
    // The '!' prefix and every CI runner land here. A script that read a typed
    // secret from a pipe would take whatever the pipe held.
    const r = run();
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/no terminal/);
    expect(r.stderr).toMatch(/nothing has been changed/i);
  });

  it('does not create or touch the credentials file on that refusal', () => {
    run();
    expect(readdirSync(workDir)).toEqual([]);
  });

  it('prints its refusals as help, so they are known before the run', () => {
    const r = run(['--help']);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('Take the secret from anywhere but your keyboard');
    expect(r.stdout).toContain('Retire the key it replaces');
  });
});

// The chained runtime profiles live in the config file, which is a different
// file from the credentials one and uses a different section spelling. It was
// the operator's to hand-edit, and the installer then proved a chain it had left
// somebody else to assemble: get the order wrong and the run writes the key
// correctly and exits 1, which reads as a failed run that in fact worked.
describe('the chained runtime profiles are written, not left to be hand-edited', () => {
  const configPath = () => join(workDir, 'config');

  it('appends a profile that is not there, at mode 600', () => {
    const r = inLib(
      `aws_config_add_role_profile "${configPath()}" footbag-staging-runtime `
      + `arn:aws:iam::1:role/staging footbag-operator us-east-1; echo "rc=$?"`,
    );
    expect(r.stdout).toContain('rc=0');
    const written = readFileSync(configPath(), 'utf-8');
    // The config file's section spelling carries the `profile ` prefix, which
    // the credentials file's does not. A stanza copied across without it
    // resolves as nothing at all.
    expect(written).toContain('[profile footbag-staging-runtime]');
    expect(written).toMatch(/role_arn\s+= arn:aws:iam::1:role\/staging/);
    expect(written).toMatch(/source_profile\s+= footbag-operator/);
    expect(statSync(configPath()).mode & 0o777).toBe(0o600);
  });

  it('leaves an existing profile of the same name exactly as it is', () => {
    // Additive rather than replacing, and the opposite of how the credentials
    // section is handled. A config section may carry an mfa_serial or a session
    // duration somebody set deliberately, and this script cannot tell that from
    // a mistake, so it reports rather than discards.
    writeFileSync(
      configPath(),
      '[profile footbag-staging-runtime]\nrole_arn = arn:aws:iam::1:role/MINE\nmfa_serial = arn:aws:iam::1:mfa/me\n',
      'utf-8',
    );
    // `|| echo` rather than a bare call: "already present" is a non-zero return
    // and a normal outcome, so under `set -e` a bare call aborts here, which is
    // the same trap the caller has to avoid.
    const r = inLib(
      `aws_config_add_role_profile "${configPath()}" footbag-staging-runtime `
      + `arn:aws:iam::1:role/OTHER footbag-operator us-east-1 || echo "rc=$?"`,
    );
    expect(r.stdout).toContain('rc=2');
    const after = readFileSync(configPath(), 'utf-8');
    expect(after).toContain('arn:aws:iam::1:role/MINE');
    expect(after).not.toContain('OTHER');
    expect(after).toContain('mfa_serial');
  });

  it('keeps every other profile byte for byte, and does not glue onto a file with no final newline', () => {
    // A file whose last line has no newline would otherwise have the section
    // header appended to it, and the result parses as neither line.
    writeFileSync(configPath(), '[profile keepme]\nregion = eu-west-1\nno final newline', 'utf-8');
    const r = inLib(
      `aws_config_add_role_profile "${configPath()}" footbag-production-runtime `
      + `arn:aws:iam::1:role/prod footbag-operator us-east-1; echo "rc=$?"`,
    );
    expect(r.stdout).toContain('rc=0');
    const after = readFileSync(configPath(), 'utf-8');
    expect(after).toContain('[profile keepme]');
    expect(after).toContain('region = eu-west-1');
    expect(after).toMatch(/no final newline\n\[profile footbag-production-runtime\]/);
  });

  it('refuses a path that exists and is not a regular file, rather than writing through it', () => {
    const r = inLib(
      `aws_config_add_role_profile "${workDir}" footbag-staging-runtime `
      + `arn:aws:iam::1:role/staging footbag-operator us-east-1 || echo "rc=$?"; `
      + `echo "err=$AWS_CRED_ERROR"`,
    );
    expect(r.stdout).toContain('rc=1');
    expect(r.stdout).toMatch(/err=.*not a regular file/);
  });
});
