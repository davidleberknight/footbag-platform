/**
 * Sending the built Docker images to a deploy target, and the shell pitfalls
 * the deploy scripts around it must avoid.
 *
 * The helper saves the Docker images to an archive, rsyncs it onto the copy the
 * previous deploy left on the host so only changed layers travel, and then
 * loads it there. The host's running Docker images must be untouched unless the
 * archive fully arrived, the sudo password must reach only the load session's
 * stdin, and a host without room for the archive is refused before anything is
 * sent.
 */
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, chmodSync, readFileSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { SPAWN_GUARD } from '../fixtures/spawnGuard';

const HELPER = path.resolve(__dirname, '../../scripts/lib/image-transfer.sh');
const DEPLOY_CODE = path.resolve(__dirname, '../../scripts/deploy-code.sh');
const DEPLOY_REBUILD = path.resolve(__dirname, '../../scripts/deploy-rebuild.sh');

const REMOTE_HOME = '/home/footbag';
const ARCHIVE = `${REMOTE_HOME}/footbag-docker-images.tar`;
const PASSWORD = 'fixture-sudo-password';
// One MiB archive. The real one is about 600 MB (the three Docker images'
// layers per `docker history`), but the free-space check compares the host's
// free space against twice the archive's size, so the boundary cases below pin
// that ratio exactly at any scale.
const ARCHIVE_BYTES = 1024 * 1024;
const NEED_KB = (ARCHIVE_BYTES * 2) / 1024;

interface TransferRun {
  status: number;
  stderr: string;
  /** One line per stub call: `<tool> <argv...>`. */
  calls: string[];
  /** What each ssh session received on stdin, in call order. */
  sshStdin: string[];
  /** Files left in the workstation temp directory afterwards. */
  leftover: string[];
}

/**
 * Stubs for docker, ssh and rsync that log their argv, and a run of the
 * helper against them. `avail` is the free space, in 1024-byte blocks, the
 * stub `df` on the host reports; null makes the read fail.
 */
function transfer(opts: {
  avail?: number | null;
  saveExit?: number;
  rsyncExit?: number;
  loadExit?: number;
  remoteHome?: string;
} = {}): TransferRun {
  const dir = mkdtempSync(path.join(tmpdir(), 'footbag-test-image-transfer-'));
  const bin = path.join(dir, 'bin');
  const work = path.join(dir, 'tmp');
  const log = path.join(dir, 'calls.log');
  const stdinDir = path.join(dir, 'stdin');
  for (const d of [bin, work, stdinDir]) mkdirSync(d, { recursive: true });
  const avail = opts.avail === undefined ? NEED_KB * 10 : opts.avail;
  const stub = (name: string, body: string[]) => {
    writeFileSync(path.join(bin, name), ['#!/usr/bin/env bash', `echo "${name} $*" >> ${JSON.stringify(log)}`, ...body, ''].join('\n'));
    chmodSync(path.join(bin, name), 0o755);
  };
  stub('docker', [
    `[[ "$1" == save && "$2" == -o ]] || exit 0`,
    `head -c ${ARCHIVE_BYTES} /dev/zero > "$3"`,
    `exit ${opts.saveExit ?? 0}`,
  ]);
  stub('ssh', [
    `n=$(ls ${JSON.stringify(stdinDir)} | wc -l)`,
    `cat > ${JSON.stringify(stdinDir)}/$(printf %03d "$n")`,
    'cmd="${@: -1}"',
    'case "$cmd" in',
    avail === null
      ? '  "df -Pk "*) echo "df: cannot read" >&2; exit 1 ;;'
      : `  "df -Pk "*) printf 'Filesystem 1024-blocks Used Available Capacity Mounted on\\n/dev/root 20000000 100 ${avail} 1%% /\\n' ;;`,
    `  *"docker load -i "*) exit ${opts.loadExit ?? 0} ;;`,
    'esac',
  ]);
  // The source is the next-to-last argument; a real rsync fails on a missing
  // one, and so does this stand-in.
  stub('rsync', ['src="${@: -2:1}"', '[[ -s "$src" ]] || { echo "rsync: missing $src" >&2; exit 23; }', `exit ${opts.rsyncExit ?? 0}`]);
  const script = `
set -euo pipefail
export PATH="${bin}:$PATH"
export TMPDIR="${work}"
SUDO_PASS=${PASSWORD}
REMOTE=footbag-staging
REMOTE_HOME=${JSON.stringify(opts.remoteHome ?? REMOTE_HOME)}
SSH_OPTS=(-o BatchMode=yes)
source "${HELPER}"
send_images_to_host
`;
  let status = 0;
  let stderr = '';
  try {
    execFileSync('bash', ['-c', script], { stdio: ['ignore', 'ignore', 'pipe'], ...SPAWN_GUARD });
  } catch (err) {
    const e = err as { status?: number; stderr?: Buffer };
    status = e.status ?? -1;
    stderr = e.stderr?.toString() ?? '';
  }
  const calls = existsSync(log) ? readFileSync(log, 'utf8').trim().split('\n').filter(Boolean) : [];
  const sshStdin = readdirSync(stdinDir).sort().map((f) => readFileSync(path.join(stdinDir, f), 'utf8'));
  return { status, stderr, calls, sshStdin, leftover: readdirSync(work) };
}

/**
 * Empty every single-quoted argument in a shell script, newlines included, so
 * one command reads as one line. An inline `node -e '…'` program otherwise
 * spreads its command across a dozen lines and a redirect after the closing
 * quote looks like it belongs to a different statement.
 *
 * The state tracking is what makes it safe: a `'` inside double quotes is an
 * apostrophe, not a quote, and pairing on it would empty a span that runs to
 * the next unrelated quote and swallow whole commands.
 */
function blankSingleQuotedSpans(src: string): string {
  let out = '';
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    if (inSingle) {
      if (ch === "'") inSingle = false;
      if (ch === "'") out += ch;
      continue;
    }
    if (inDouble && ch === '\\' && i + 1 < src.length) {
      out += ch + src[i + 1];
      i += 1;
      continue;
    }
    if (ch === '"') inDouble = !inDouble;
    else if (ch === "'" && !inDouble) inSingle = true;
    out += ch;
  }
  return out;
}

/** Run a bash snippet under the deploy scripts' strict mode, returning its exit status. */
function runStrict(snippet: string): number {
  try {
    execFileSync('bash', ['-c', `set -euo pipefail\n${snippet}\n`], { stdio: 'ignore', ...SPAWN_GUARD });
    return 0;
  } catch (err) {
    return (err as { status?: number }).status ?? -1;
  }
}

const loads = (calls: string[]) => calls.filter((c) => c.startsWith('ssh ') && c.includes('docker load -i'));
const rsyncs = (calls: string[]) => calls.filter((c) => c.startsWith('rsync '));

describe('sending the Docker images to a deploy target', () => {
  // Defect caught: the archive going somewhere the next deploy does not look,
  // so every deploy re-sends every layer, or the host loading a different file
  // from the one that was sent.
  it('rsyncs the saved archive to its fixed home on the host, then loads that same file', () => {
    const r = transfer();
    expect(r.status, r.stderr).toBe(0);
    expect(rsyncs(r.calls)).toHaveLength(1);
    expect(rsyncs(r.calls)[0]).toMatch(new RegExp(` footbag-staging:${ARCHIVE}$`));
    expect(rsyncs(r.calls)[0]).toContain('--partial');
    // The archive sits in the deploy account's home between deploys, readable
    // by that account only.
    expect(rsyncs(r.calls)[0]).toContain('--chmod=F600');
    // A Docker image left out of the archive is never updated on the host.
    const save = r.calls.find((c) => c.startsWith('docker save -o '));
    expect(save?.split(' ').slice(4).sort()).toEqual(['docker-image', 'docker-web', 'docker-worker']);
    expect(loads(r.calls)).toHaveLength(1);
    expect(loads(r.calls)[0]).toContain(`docker load -i '${ARCHIVE}'`);
    expect(r.calls.indexOf(loads(r.calls)[0])).toBeGreaterThan(r.calls.indexOf(rsyncs(r.calls)[0]));
  });

  // Defect caught: the sudo password readable by any process on either machine
  // through an argument list, or sent to a session that is not the privileged one.
  it('sends the sudo password only on the load session\'s stdin', () => {
    const r = transfer();
    expect(r.status, r.stderr).toBe(0);
    for (const call of r.calls) expect(call).not.toContain(PASSWORD);
    const loadIndex = r.calls.filter((c) => c.startsWith('ssh ')).findIndex((c) => c.includes('docker load -i'));
    r.sshStdin.forEach((input, i) => {
      if (i === loadIndex) expect(input).toBe(`${PASSWORD}\n`);
      else expect(input).not.toContain(PASSWORD);
    });
  });

  // Defect caught: a dropped connection followed by a load of a half-sent
  // archive, replacing the host's working Docker images with broken ones.
  it('loads nothing when the transfer fails, and says the release is unchanged', () => {
    const r = transfer({ rsyncExit: 12 });
    expect(r.status).not.toBe(0);
    expect(loads(r.calls)).toEqual([]);
    expect(r.stderr).toContain('its running release is unchanged');
  });

  // Defect caught: a host disk filling during the load after the old Docker
  // images were pruned, leaving nothing to run. The boundary is exactly twice
  // the archive: one byte-block short is refused, exactly enough goes ahead.
  it('refuses before sending anything when the host lacks room for twice the archive', () => {
    const short = transfer({ avail: NEED_KB - 1 });
    expect(short.status).not.toBe(0);
    expect(rsyncs(short.calls)).toEqual([]);
    expect(loads(short.calls)).toEqual([]);
    expect(short.stderr).toContain('Nothing was sent');
    const enough = transfer({ avail: NEED_KB });
    expect(enough.status, enough.stderr).toBe(0);
    expect(rsyncs(enough.calls)).toHaveLength(1);
  });

  // Defect caught: a failed free-space read treated as plenty of room.
  it('refuses before sending anything when the host\'s free space cannot be read', () => {
    const r = transfer({ avail: null });
    expect(r.status).not.toBe(0);
    expect(rsyncs(r.calls)).toEqual([]);
    expect(r.stderr).toContain('could not read the free disk space');
  });

  // Defect caught: a load failure reported as success, so the deploy restarts
  // the stack on Docker images that never arrived.
  it('fails with the load\'s own status when docker load fails', () => {
    expect(transfer({ loadExit: 3 }).status).toBe(3);
  });

  // Defect caught: a half-written local archive sent to the host.
  it('contacts the host not at all when docker save fails', () => {
    const r = transfer({ saveExit: 1 });
    expect(r.status).not.toBe(0);
    expect(r.calls.filter((c) => !c.startsWith('docker '))).toEqual([]);
  });

  // Defect caught: an archive path built from an unresolved or relative home,
  // which puts the archive somewhere the next deploy cannot find.
  it('refuses when the deploy account\'s home on the host is not an absolute path', () => {
    const r = transfer({ remoteHome: 'home/footbag' });
    expect(r.status).not.toBe(0);
    expect(r.calls).toEqual([]);
  });

  // Defect caught: a 600 MB archive left in the workstation's temp directory on
  // every deploy, whether it succeeded or failed.
  it('leaves no local archive behind, on success or on any failure', () => {
    const runs = {
      success: transfer(),
      'save failed': transfer({ saveExit: 1 }),
      'free space unreadable': transfer({ avail: null }),
      'too little room': transfer({ avail: 0 }),
      'transfer failed': transfer({ rsyncExit: 12 }),
    };
    for (const [name, run] of Object.entries(runs)) expect(run.leftover, name).toEqual([]);
  });
});

describe('deploy script shell pitfalls', () => {
  it('a truncating reader in the provenance pipeline does not abort the deploy', () => {
    // The deploy records up to forty dirty paths. `head -40` closes the pipe on
    // its fortieth line, which SIGPIPEs the writers; pipefail then makes the
    // whole command substitution exit 141 and set -e aborts. It stays invisible
    // until a working tree carries more than forty changed paths, which is
    // exactly when a deploy is least welcome to fail.
    // Enough lines that the writer is still producing when the reader stops:
    // a producer small enough to fit the pipe buffer finishes first and no
    // SIGPIPE is ever delivered, which is why the real bug hid behind small
    // working trees.
    const withHead = `v="$(seq 1 500000 | cut -c1- | head -40 | paste -sd, -)"`;
    const withSed = `v="$(seq 1 500000 | cut -c1- | sed -n '1,40p' | paste -sd, -)"`;
    expect(runStrict(withHead)).toBe(141);
    expect(runStrict(withSed)).toBe(0);
  });

  it('every compose exec in a remote half reads from /dev/null', () => {
    // Each remote half is delivered on the remote shell's stdin, and
    // `docker compose exec -T` forwards its own stdin into the container. An
    // unguarded one swallows the rest of the script: bash reaches end of input
    // and the deploy exits 0 having skipped everything below, which is how the
    // persona seed and the provenance record went missing while every deploy
    // reported success.
    for (const name of ['deploy-code-remote.sh', 'deploy-rebuild-remote.sh']) {
      const file = path.resolve(__dirname, '../../scripts/internal', name);
      const text = readFileSync(file, 'utf8');
      // Drop comments before anything else, so an apostrophe in prose cannot
      // pair with a quote in the code below it. Then collapse single-quoted
      // arguments, which carry newlines wherever a call passes an inline node
      // program: the redirect sits after the closing quote, so without the
      // collapse it reads as a separate line and a guarded call looks
      // unguarded. Line continuations join for the same reason.
      const code = text
        .split('\n')
        .filter((line) => !/^\s*#/.test(line))
        .join('\n');
      const joined = blankSingleQuotedSpans(code).replace(/\\\n\s*/g, ' ');
      // A quote that failed to pair swallows a call instead of reporting it, so
      // the collapsed text must still carry every call the file contains.
      const found = (joined.match(/\bexec\s+-T\b/g) ?? []).length;
      expect(found, `${name}: collapsing quotes lost a compose exec`).toBe(
        (code.match(/\bexec\s+-T\b/g) ?? []).length,
      );
      const offenders = joined
        .split('\n')
        .filter((line) => /\bexec\s+-T\b/.test(line))
        .filter((line) => !line.includes('</dev/null'));
      expect(offenders, `${name}: unguarded compose exec:\n${offenders.join('\n')}`).toEqual([]);
    }
  });

  it('neither deploy script truncates with head inside a captured pipeline', () => {
    for (const script of [DEPLOY_CODE, DEPLOY_REBUILD]) {
      const executable = readFileSync(script, 'utf8')
        .split('\n').filter((line) => !/^\s*#/.test(line)).join('\n');
      expect(executable, `${path.basename(script)} must not pipe into head inside a capture`)
        .not.toMatch(/\$\([^)]*\|\s*head\s+-\d/);
    }
  });

  // Defect caught: a deploy from an ARM workstation builds images for ARM, ships
  // them to the x86-64 hosts, replaces the running images and leaves the host
  // down when the restart cannot start them.
  describe('images built for another processor never reach a host', () => {
    function checkWith(arches: Record<string, string | null>): { status: number; stderr: string } {
      const dir = mkdtempSync(path.join(tmpdir(), 'footbag-test-image-arch-'));
      const cases = Object.entries(arches)
        .map(([image, arch]) => (arch === null ? `  ${image}) exit 1 ;;` : `  ${image}) echo ${arch} ;;`))
        .join('\n');
      writeFileSync(path.join(dir, 'docker'), `#!/usr/bin/env bash\ncase "\${@: -1}" in\n${cases}\nesac\n`);
      chmodSync(path.join(dir, 'docker'), 0o755);
      try {
        execFileSync('bash', ['-c', `set -euo pipefail; source "${HELPER}"; require_images_for_hosts`], {
          env: { ...process.env, PATH: `${dir}:${process.env.PATH}` },
          stdio: ['ignore', 'ignore', 'pipe'],
          ...SPAWN_GUARD,
        });
        return { status: 0, stderr: '' };
      } catch (err) {
        const e = err as { status?: number; stderr?: Buffer };
        return { status: e.status ?? 1, stderr: e.stderr?.toString() ?? '' };
      }
    }

    it('passes when every image is for the hosts\' processor', () => {
      expect(checkWith({ 'docker-web': 'amd64', 'docker-worker': 'amd64', 'docker-image': 'amd64' }).status).toBe(0);
    });

    it('refuses any one image built for ARM, naming it', () => {
      for (const image of ['docker-web', 'docker-worker', 'docker-image']) {
        const arches = { 'docker-web': 'amd64', 'docker-worker': 'amd64', 'docker-image': 'amd64', [image]: 'arm64' };
        const r = checkWith(arches);
        expect(r.status, image).not.toBe(0);
        expect(r.stderr, image).toContain(`${image} was built for arm64, but the hosts run amd64`);
      }
    });

    it('refuses when an image\'s processor cannot be read', () => {
      const r = checkWith({ 'docker-web': 'amd64', 'docker-worker': null, 'docker-image': 'amd64' });
      expect(r.status).not.toBe(0);
      expect(r.stderr).toContain('could not read the architecture of docker-worker');
    });

    it('both deploy paths check right after the build and before sending anything', () => {
      for (const script of [DEPLOY_CODE, DEPLOY_REBUILD]) {
        const lines = readFileSync(script, 'utf8').split('\n');
        const build = lines.findIndex((l) => /^\s+build \)$/.test(l));
        const check = lines.findIndex((l) => /^require_images_for_hosts \|\| exit 1$/.test(l));
        const send = lines.findIndex((l) => /\bsend_images_to_host\b/.test(l) && !/^\s*#/.test(l));
        expect(build, `${path.basename(script)} builds`).toBeGreaterThan(-1);
        expect(check, `${path.basename(script)} checks the images`).toBeGreaterThan(build);
        expect(send, `${path.basename(script)} sends after the check`).toBeGreaterThan(check);
      }
    });
  });

  it('both deploy paths go through the helper and keep no bare pipeline', () => {
    for (const script of [DEPLOY_CODE, DEPLOY_REBUILD]) {
      const text = readFileSync(script, 'utf8');
      const executable = text.split('\n').filter((line) => !/^\s*#/.test(line)).join('\n');
      expect(executable, `${path.basename(script)} must call the shared helper`)
        .toMatch(/\bsend_images_to_host\b/);
      expect(executable, `${path.basename(script)} must not reintroduce the bare pipeline`)
        .not.toMatch(/docker save[\s\S]{0,120}\|\s*ssh/);
    }
  });
});
