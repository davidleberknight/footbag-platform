/**
 * The gate over credential handling in the operator scripts.
 *
 * The secret-transport rule ends by saying this gate is the mechanical control
 * and everything else is enforced by code review. That makes its real coverage
 * the floor under the whole standard, and an audit found the floor well below
 * where the gate's own header claimed it was: any line could exempt itself with
 * a trailing comment naming the gate's path, `-k` was never required, several
 * spellings of a stdin-fed file writer passed, the silent password read passed,
 * a `/dev/tty` mention in a comment exempted every prompt in the file, and a
 * grep that errored reported a pass. None of that was visible from a green run.
 *
 * So every case here asserts the gate REFUSES something, inside a throwaway
 * repository, rather than asserting it passes. A gate is only worth what it
 * catches. The final case runs it against this repository, which keeps the
 * fixtures honest about the real tree.
 */
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
  readFileSync,
  readdirSync,
  chmodSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { SPAWN_GUARD } from '../fixtures/spawnGuard';

const GATE = join(process.cwd(), 'scripts/ci/check_script_credentials.sh');

interface RunResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

/**
 * Stands up a throwaway repository holding the given files and runs the gate
 * inside it. The gate resolves its root with `git rev-parse --show-toplevel`,
 * so the fixture has to be a real repository rather than a bare directory.
 */
function inFixtureRepo(files: Record<string, string>): RunResult {
  const root = mkdtempSync(join(tmpdir(), 'footbag-test-cred-gate-'));
  try {
    spawnSync('git', ['init', '-q', root], { encoding: 'utf8', ...SPAWN_GUARD });
    for (const [name, body] of Object.entries(files)) {
      const full = join(root, name);
      mkdirSync(join(full, '..'), { recursive: true });
      writeFileSync(full, body);
    }
    const res = spawnSync('bash', [GATE], { cwd: root, encoding: 'utf8', ...SPAWN_GUARD });
    return { exitCode: res.status ?? -1, stdout: res.stdout ?? '', stderr: res.stderr ?? '' };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

/** A minimal shell file under the scanned tree. */
function script(body: string): Record<string, string> {
  return { 'scripts/thing.sh': `#!/usr/bin/env bash\nset -euo pipefail\n${body}\n` };
}

describe('the credential gate: what it must refuse', () => {
  it('accepts a tree following the wire pattern', () => {
    const res = inFixtureRepo(
      script('{ printf \'%s\\n\' "$SUDO_PASS"; cat body.sh; } | ssh host \'sudo -k -S -p "" bash\''),
    );
    expect(res.exitCode, res.stderr).toBe(0);
  });

  it('refuses a password on the command line', () => {
    const res = inFixtureRepo(script('mysql --password=hunter2'));
    expect(res.exitCode).toBe(1);
    expect(res.stderr).toMatch(/must not ride CLI flags/);
  });

  it.each([
    ['a signing key', 'docker compose exec -e ARCHIVE_SIGNING_KEY="$k" web node x.js'],
    ['a session secret', 'docker compose exec -T -e SESSION_SECRET="$s" web sh'],
    ['an API key', 'docker compose exec -e SAFE_BROWSING_API_KEY=abc web sh'],
  ])('refuses a secret inlined into a container environment: %s', (_label, line) => {
    // The rule names this form: it lands in argv on both the docker client and
    // the container process.
    const res = inFixtureRepo(script(line));
    expect(res.exitCode, `expected a refusal for: ${line}`).toBe(1);
    expect(res.stderr).toMatch(/inlined into a container's environment/);
  });

  it.each([
    ['a pass-through with no value', 'docker compose exec -e SESSION_SECRET web sh'],
    ['a lookup key, which is not a credential', 'docker compose exec -T -e KEY="$email" web node'],
  ])('accepts %s', (_label, line) => {
    const res = inFixtureRepo(script(line));
    expect(res.exitCode, res.stderr).toBe(0);
  });

  it('refuses a secret interpolated into a remote command string', () => {
    const res = inFixtureRepo(script('ssh host "printf %s $STRIPE_SECRET_KEY > /tmp/x"'));
    expect(res.exitCode).toBe(1);
    expect(res.stderr).toMatch(/interpolated into a remote command string/);
  });

  it('sees the host sudo password, whose name the pattern used to miss', () => {
    // SUDO_PASS is the variable the required wire pattern uses, so it is the one
    // name every privileged remote step in this tree carries — and the secret-name
    // pattern matched SECRET, TOKEN, PASSWORD, PASSWD, CREDENTIAL and compound
    // KEY names while missing a bare PASS entirely. The gate could not see the
    // single most common credential variable in the scripts it guards.
    const res = inFixtureRepo(script('ssh host "echo $SUDO_PASS | sudo -S true"'));
    expect(res.exitCode).toBe(1);
    expect(res.stderr).toMatch(/interpolated into a remote command string/);
  });

  it('sees the host sudo password inlined into a container environment', () => {
    const res = inFixtureRepo(script('docker compose exec -T -e SUDO_PASS="$pass" web node x.js'));
    expect(res.exitCode).toBe(1);
    expect(res.stderr).toMatch(/inlined into a container's environment/);
  });

  it.each([
    ['a bypass flag, which carries no secret', 'docker compose exec -T -e BYPASS_CACHE=1 web node x.js'],
    ['a pass-through count', 'docker compose exec -T -e PASSTHROUGH=2 web node x.js'],
  ])('accepts %s, because the underscore is what makes a PASS name a credential', (_label, line) => {
    // Matching PASS as a substring rather than a component would refuse these, and
    // a gate that cries wolf gets its findings waved through — which is the reason
    // a bare KEY is excluded for the same shape of risk.
    const res = inFixtureRepo(script(line));
    expect(res.exitCode, res.stderr).toBe(0);
  });

  it('refuses credentials embedded in a URL', () => {
    const res = inFixtureRepo(script('curl https://user:pw@example.com/x'));
    expect(res.exitCode).toBe(1);
    expect(res.stderr).toMatch(/must not be embedded in URLs/);
  });

  it('refuses sudo reading stdin without -k', () => {
    // Without -k a host whose operator recently used sudo consumes nothing, and
    // the password falls through to whatever reads stdin next.
    const res = inFixtureRepo(script('ssh host \'sudo -S -p "" bash\''));
    expect(res.exitCode).toBe(1);
    expect(res.stderr).toMatch(/must pass -k/);
  });

  it.each([
    ['the canonical prefix with a writer substituted', 'ssh host \'sudo -k -S -p "" tee /srv/footbag/env\''],
    ['a piped writer', 'printf \'%s\\n\' "$P" | sudo -k -S tee /etc/thing'],
    ['the long-form stdin flag', 'sudo --stdin -k tee /etc/thing'],
    ['a combined short-flag cluster', 'sudo -kS tee /etc/thing'],
    ['dd as the writer', 'sudo -k -S dd of=/etc/thing'],
    ['a -c shell redirecting into a file', 'sudo -k -S sh -c "cat > /etc/thing"'],
    ['a write through /dev/stdin', 'sudo -k -S install -m 600 /dev/stdin /etc/thing'],
  ])('refuses sudo -S feeding a file writer: %s', (_label, line) => {
    const res = inFixtureRepo(script(line));
    expect(res.exitCode).toBe(1);
    expect(res.stderr).toMatch(/stdin-consuming file writer/);
  });

  it.each([
    ['-t', "ssh -t host 'sudo bash'"],
    ['-tt', "ssh -tt host 'sudo bash'"],
    ['a t inside a cluster', "ssh -tv host 'sudo bash'"],
    ['the long spelling', "ssh -o RequestTTY=yes host 'sudo bash'"],
  ])('refuses a remote PTY: %s', (_label, line) => {
    const res = inFixtureRepo(script(line));
    expect(res.exitCode).toBe(1);
    expect(res.stderr).toMatch(/no ssh -t in scope/);
  });

  it('refuses the silent password read in a script with no terminal guard', () => {
    // This is the most credential-shaped read there is, and the old regex only
    // fired when the first flag cluster contained an r, so it passed.
    const res = inFixtureRepo(script('read -s passphrase'));
    expect(res.exitCode).toBe(1);
    expect(res.stderr).toMatch(/no terminal guard/);
  });

  it('refuses a bare prompt read in a script with no terminal guard', () => {
    const res = inFixtureRepo(script('read answer'));
    expect(res.exitCode).toBe(1);
    expect(res.stderr).toMatch(/no terminal guard/);
  });

  it('accepts a prompt read that names the terminal as its source', () => {
    const res = inFixtureRepo(script('read -r answer < /dev/tty'));
    expect(res.exitCode, res.stderr).toBe(0);
  });

  it('accepts a prompt read in a file carrying a real terminal guard', () => {
    const res = inFixtureRepo(
      script('if [[ ! -t 0 ]]; then echo "refusing" >&2; exit 1; fi\nread -r answer'),
    );
    expect(res.exitCode, res.stderr).toBe(0);
  });

  it('is not exempted by a comment merely mentioning the terminal', () => {
    // The old file-level exemption matched the text /dev/tty anywhere in the
    // file, including inside a comment, so a file could describe a guard it did
    // not have and every prompt in it passed.
    const res = inFixtureRepo(script('# answers are read from /dev/tty elsewhere\nread -r answer'));
    expect(res.exitCode).toBe(1);
    expect(res.stderr).toMatch(/no terminal guard/);
  });

  it.each([
    ['a trailing comment naming the terminal', 'read -r answer  # compared against /dev/tty input'],
    ['a trailing comment carrying a loop word', 'read -r answer  # while the operator decides'],
    ['a variable name carrying a loop word', 'read -r answer_while'],
  ])('is not exempted by %s', (_label, line) => {
    // Only whole-comment lines were being stripped, so a trailing comment
    // survived into both halves of the check: the data-plumbing filter saw the
    // words /dev/tty and while anywhere in the path, line number and text, and
    // the file-level guard search accepted the same comment as the file's
    // terminal guard. A line could therefore exempt itself by describing a
    // guard in its own trailing comment, which is the property the gate's
    // header and the secret-transport rule both claim is closed.
    const res = inFixtureRepo(script(line));
    expect(res.exitCode, `expected a refusal for: ${line}`).toBe(1);
    expect(res.stderr).toMatch(/no terminal guard/);
  });

  it.each([
    ['a read redirected from the terminal device', 'read -r answer < /dev/tty'],
    ['a while-read loop over a file', 'while read -r line; do echo "$line"; done < /etc/hostname'],
    ['a mapfile data read', 'mapfile -t lines < /etc/hostname'],
    ['a here-string read', 'read -r a <<< "x"'],
  ])('still accepts %s, which is data plumbing rather than a prompt', (_label, line) => {
    const res = inFixtureRepo(script(line));
    expect(res.exitCode, res.stderr).toBe(0);
  });

  it('finds a terminal guard that sits near the top of a long file', () => {
    // The guard search used to be a pipe into `grep -q`. Its early exit closed
    // the pipe, the comment stripper died on SIGPIPE, and under pipefail the
    // pipeline's status became 141, so a guard followed by enough output to fill
    // a pipe buffer read as no guard at all. The real deploy leaf was refused
    // for exactly this reason.
    const filler = Array.from({ length: 40000 }, (_, i) => `echo "line ${i}"`).join('\n');
    const res = inFixtureRepo(script(`if [[ ! -t 0 ]]; then exit 1; fi\n${filler}\nread -r answer`));
    expect(res.exitCode, res.stderr).toBe(0);
  });
});

describe('every typed confirmation in the tree asks for the same word', () => {
  // One word, APPLY, for every operator confirmation. A different phrase per
  // script is its own hazard: the operator mistypes, retries, and starts reaching
  // for whatever flag skips the prompt. The environment is already named on the
  // command line and echoed back before the prompt, so making the operator retype
  // it was a second assertion of something just read rather than a check.
  //
  // This counts the prompts mechanically, because the failure mode is a new
  // script quietly inventing its own phrase.
  const SCRIPT_DIRS = [join(process.cwd(), 'scripts')];
  const shellFiles = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) return shellFiles(full);
      return entry.isFile() && entry.name.endsWith('.sh') ? [full] : [];
    });

  const files = [...SCRIPT_DIRS.flatMap(shellFiles), join(process.cwd(), 'deploy_to_aws.sh')];

  it('finds at least the confirmations this is meant to cover', () => {
    const prompts = files.flatMap((f) =>
      readFileSync(f, 'utf8')
        .split('\n')
        .filter((line) => /Type '[^']+'/.test(line)),
    );
    expect(prompts.length).toBeGreaterThanOrEqual(12);
  });

  it('asks for APPLY and nothing else', () => {
    const offenders = files.flatMap((f) =>
      readFileSync(f, 'utf8')
        .split('\n')
        .filter((line) => /Type '[^']+'/.test(line))
        // A prompt built from a variable prints whatever that variable holds, so
        // the word is asserted where the script sets it. The next case covers
        // those, which is why they are not offenders here.
        .filter((line) => !/Type '(%s|\$\{[A-Za-z_][A-Za-z0-9_]*\})'/.test(line))
        .filter((line) => !/Type 'APPLY'/.test(line))
        .filter((line) => !/Type 'yes'/.test(line))
        .map((line) => `${f.replace(process.cwd() + '/', '')}: ${line.trim()}`),
    );
    expect(offenders, offenders.join('\n')).toEqual([]);
  });

  it('sets every confirmation variable to APPLY', () => {
    const offenders = files.flatMap((f) =>
      readFileSync(f, 'utf8')
        .split('\n')
        // The variables that hold a confirmation word, by name and by carrying a
        // quoted string: a bare CONFIRMED=0 counter is not one of these.
        .filter((line) => /^(CONFIRM|PHRASE)(_[A-Z]+)*="/.test(line))
        .filter((line) => !/="APPLY"$/.test(line))
        .map((line) => `${f.replace(process.cwd() + '/', '')}: ${line.trim()}`),
    );
    expect(offenders, offenders.join('\n')).toEqual([]);
  });
});

describe('the credential gate: no weaker than the gate it replaced', () => {
  // This block is the load-bearing one. An audit found that rewriting the gate had
  // made it catch LESS in places while looking like an improvement, and nothing
  // detected that because every test asserted a new capability rather than the
  // absence of a regression. Each case below is a form the PREVIOUS implementation
  // refused, verified one fixture at a time against that implementation. They exist
  // so any future rewrite has to keep refusing them, whatever its patterns look
  // like. Adding a case here means checking it against the older gate first: a case
  // that only the current gate catches belongs in the block beneath this one, and
  // mislabelling one as a regression pin is how a floor stops being a floor.

  it.each([
    ['a prompt read with the flags combined', 'read -rp "Type yes: " answer'],
    ['a prompt read under an if', 'if read -r answer; then :; fi'],
    ['a prompt read in a case arm', 'case $1 in *) read -r answer ;; esac'],
    ['a prompt read after then', 'if true; then read -r answer; fi'],
  ])('still refuses %s', (_label, line) => {
    const res = inFixtureRepo(script(line));
    expect(res.exitCode, `expected a refusal for: ${line}`).toBe(1);
    expect(res.stderr).toMatch(/no terminal guard/);
  });

  it('still refuses sudo reached by an absolute path', () => {
    const res = inFixtureRepo(script('/usr/bin/sudo -S tee /etc/thing'));
    expect(res.exitCode).toBe(1);
  });

});

describe('the credential gate: forms only the current gate catches', () => {
  // Split out of the regression block above, where they were labelled as forms the
  // previous implementation refused. Run against that implementation, eight of its
  // cases passed: these are capabilities the rewrite ADDED, and calling them
  // regression pins overstated what the floor holds. They are worth keeping and
  // worth keeping honestly — a future rewrite that loses one of these has lost a
  // capability, not broken a floor, and the two failures read differently.

  it.each([
    ['a prompt read with a separate prompt flag', 'read -p "Continue? " answer'],
    ['a silent password read with a prompt', 'read -sp "Password: " pw'],
    ['a prompt read with a timeout flag', 'read -t 5 answer'],
    ['a prompt read with a character count', 'read -n 1 answer'],
  ])('refuses %s', (_label, line) => {
    const res = inFixtureRepo(script(line));
    expect(res.exitCode, `expected a refusal for: ${line}`).toBe(1);
    expect(res.stderr).toMatch(/no terminal guard/);
  });

  it.each([
    ['a single-quoted prompt argument', "sudo -p '' -S tee /etc/thing"],
    ['an unquoted flag argument', 'sudo -u root -S tee /etc/thing'],
  ])('refuses a stdin-fed writer with %s', (_label, line) => {
    const res = inFixtureRepo(script(line));
    expect(res.exitCode, `expected a refusal for: ${line}`).toBe(1);
  });

  it('does not accept an unrelated -k elsewhere on the line as sudo -k', () => {
    // `curl -k` is not `sudo -k`. Requiring the flag to sit in the run that
    // follows the sudo word is what distinguishes them.
    const res = inFixtureRepo(script('curl -k https://example.com | sudo -S bash'));
    expect(res.exitCode).toBe(1);
    expect(res.stderr).toMatch(/must pass -k/);
  });

  it('does not treat a shell case arm as a comment', () => {
    // A comment-stripper meant for JSDoc continuation lines was discarding every
    // one-line `*)` arm, hiding whatever sat inside it from the sudo checks.
    const res = inFixtureRepo(script('case $1 in *) sudo -S tee /etc/thing ;; esac'));
    expect(res.exitCode).toBe(1);
  });

  it('is not exempted by a timeout flag on an unrelated read', () => {
    const res = inFixtureRepo(script('read -t 1 dummy\nread -r answer'));
    expect(res.exitCode).toBe(1);
    expect(res.stderr).toMatch(/no terminal guard/);
  });

  it('is not exempted by a bare definition of the confirmation helper', () => {
    const res = inFixtureRepo(script('confirm_from_tty() { :; }\nread -r answer'));
    expect(res.exitCode).toBe(1);
    expect(res.stderr).toMatch(/no terminal guard/);
  });

  it('is not exempted by a guard word inside a string literal', () => {
    const res = inFixtureRepo(script('echo "-t 0"\nread -r answer'));
    expect(res.exitCode).toBe(1);
    expect(res.stderr).toMatch(/no terminal guard/);
  });
});

describe('the credential gate: properties that make the refusals worth having', () => {
  it('cannot be exempted by a trailing comment naming the gate itself', () => {
    // The old exclusions filtered the matched OUTPUT by content, and the output
    // line is path:lineno:content, so any line whose text mentioned an excluded
    // path was dropped. That let a violation wave itself through.
    const res = inFixtureRepo(
      script("ssh -t host 'sudo bash'  # exempt per scripts/ci/check_script_credentials.sh"),
    );
    expect(res.exitCode).toBe(1);
    expect(res.stderr).toMatch(/no ssh -t in scope/);
  });

  it('cannot be exempted by a trailing comment naming the excluded venv path', () => {
    const res = inFixtureRepo(script('mysql --password=hunter2  # scripts/.venv/ compat'));
    expect(res.exitCode).toBe(1);
    expect(res.stderr).toMatch(/must not ride CLI flags/);
  });

  it('scans the repository-root operator wrapper, not only scripts/', () => {
    // The root wrapper resolves the operator credential file and forwards it to
    // the leaf deploys, which is exactly "moving a secret across a process
    // boundary", and it was outside the gate entirely.
    const root = mkdtempSync(join(tmpdir(), 'footbag-test-cred-gate-'));
    try {
      spawnSync('git', ['init', '-q', root], { encoding: 'utf8', ...SPAWN_GUARD });
      mkdirSync(join(root, 'scripts'), { recursive: true });
      writeFileSync(join(root, 'scripts/keep.sh'), '#!/usr/bin/env bash\necho ok\n');
      writeFileSync(join(root, 'deploy_to_aws.sh'), "#!/usr/bin/env bash\nssh -t host 'sudo bash'\n");
      const res = spawnSync('bash', [GATE], { cwd: root, encoding: 'utf8', ...SPAWN_GUARD });
      expect(res.status).toBe(1);
      expect(res.stderr).toMatch(/no ssh -t in scope/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('fails closed when there is nothing to scan, rather than reporting a pass', () => {
    // A gate that reports success because it scanned nothing is worse than no
    // gate: it produces a green run that means the opposite of what it says.
    const root = mkdtempSync(join(tmpdir(), 'footbag-test-cred-gate-'));
    try {
      spawnSync('git', ['init', '-q', root], { encoding: 'utf8', ...SPAWN_GUARD });
      const res = spawnSync('bash', [GATE], { cwd: root, encoding: 'utf8', ...SPAWN_GUARD });
      expect(res.status).toBe(1);
      expect(res.stderr).toMatch(/Refusing to report a pass/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('reports how many files it scanned, so a shrinking scope is visible', () => {
    const res = spawnSync('bash', [GATE], {
      cwd: process.cwd(),
      encoding: 'utf8',
      ...SPAWN_GUARD,
    });
    expect(res.status, res.stderr).toBe(0);
    expect(res.stdout).toMatch(/pass \(\d+ files scanned\)/);
  });

  it('fails closed when part of the scan scope cannot be read', () => {
    // Discovery used to end `-print 2>/dev/null || true`, which discards both the
    // warning and the exit status, so a directory in scope that could not be read
    // was skipped in silence and the gate reported a pass over whatever remained.
    // That is the fail-open shape the gate exists to refuse, and its own header
    // claims it does not have: an unreadable FILE and a dangling symlink already
    // fail closed, so the directory case was the one hole. The printed file count
    // was the only thing standing between a shrunken scan and a green run.
    const root = mkdtempSync(join(tmpdir(), 'footbag-test-cred-gate-'));
    const hidden = join(root, 'scripts', 'sub');
    try {
      spawnSync('git', ['init', '-q', root], { encoding: 'utf8', ...SPAWN_GUARD });
      mkdirSync(hidden, { recursive: true });
      writeFileSync(
        join(root, 'scripts', 'fine.sh'),
        '#!/usr/bin/env bash\nset -euo pipefail\necho ok\n',
      );
      // An unguarded prompt the gate would refuse if it could see the file at all.
      writeFileSync(
        join(hidden, 'hidden.sh'),
        '#!/usr/bin/env bash\nset -euo pipefail\nread -r answer\n',
      );
      chmodSync(hidden, 0o000);

      const res = spawnSync('bash', [GATE], { cwd: root, encoding: 'utf8', ...SPAWN_GUARD });
      expect(res.status, `stdout: ${res.stdout}\nstderr: ${res.stderr}`).toBe(1);
      // It must say the scope was unreadable, not report a pass over what it reached.
      expect(res.stdout).not.toMatch(/pass \(/);
      expect(res.stderr).toMatch(/could not read part of the scan scope/);
    } finally {
      chmodSync(hidden, 0o700);
      rmSync(root, { recursive: true, force: true });
    }
  });
});
