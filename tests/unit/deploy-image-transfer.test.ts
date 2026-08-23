/**
 * Image transfer to a deploy target must not abort on a writer SIGPIPE.
 *
 * `docker save | ssh docker load` under `set -o pipefail` reports the writer's
 * exit status when the writer dies, and the writer dies of SIGPIPE whenever the
 * reader finishes first. On a host that already holds most layers, `docker load`
 * deduplicates and exits while `docker save` is still streaming, so a deploy
 * that has in fact loaded every image aborts with 141. The reader's status is
 * the authority: a truncated stream makes `docker load` fail, and the remote
 * halves verify layer DiffIDs besides.
 *
 * The first case is the demonstrated failure: it reproduces the abort against
 * the pipeline shape the deploy scripts used to carry, then shows the helper
 * surviving the same conditions.
 */
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, chmodSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { SPAWN_GUARD } from '../fixtures/spawnGuard';

const HELPER = path.resolve(__dirname, '../../scripts/lib/image-transfer.sh');
const DEPLOY_CODE = path.resolve(__dirname, '../../scripts/deploy-code.sh');
const DEPLOY_REBUILD = path.resolve(__dirname, '../../scripts/deploy-rebuild.sh');

/**
 * A stub `docker` that streams far more than a pipe buffer holds, and a stub
 * `ssh` that reads a little and exits with the given status. Together they
 * recreate the reader-finishes-first race deterministically.
 */
function stubDir(readerExit: number): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'footbag-test-image-transfer-'));
  writeFileSync(
    path.join(dir, 'docker'),
    '#!/usr/bin/env bash\n[[ "$1" == "save" ]] || exit 0\nhead -c 20000000 /dev/zero\n',
  );
  writeFileSync(
    path.join(dir, 'ssh'),
    `#!/usr/bin/env bash\nhead -c 64 >/dev/null\nexit ${readerExit}\n`,
  );
  chmodSync(path.join(dir, 'docker'), 0o755);
  chmodSync(path.join(dir, 'ssh'), 0o755);
  return dir;
}

/** Run a bash snippet with the stubs on PATH, returning its exit status. */
function runWithStubs(snippet: string, readerExit: number): number {
  const dir = stubDir(readerExit);
  const script = `
set -euo pipefail
export PATH="${dir}:$PATH"
SUDO_PASS=unused
REMOTE=host.invalid
SSH_OPTS=(-o BatchMode=yes)
${snippet}
`;
  try {
    execFileSync('bash', ['-c', script], { stdio: 'ignore', ...SPAWN_GUARD });
    return 0;
  } catch (err) {
    return (err as { status?: number }).status ?? -1;
  }
}

const INLINE_PIPELINE = `
{ printf '%s\\n' "$SUDO_PASS"; docker save docker-web docker-worker docker-image; } \\
  | ssh "\${SSH_OPTS[@]}" "$REMOTE" 'docker load'
`;

const VIA_HELPER = `
source "${HELPER}"
send_images_to_host
`;

describe('image transfer to a deploy target', () => {
  it('the bare pipeline aborts on a writer SIGPIPE even though the load succeeded', () => {
    // The defect being fixed. If this stops reproducing, the case below no
    // longer proves anything and both need revisiting.
    expect(runWithStubs(INLINE_PIPELINE, 0)).toBe(141);
  });

  it('the helper succeeds when the reader finishes first', () => {
    expect(runWithStubs(VIA_HELPER, 0)).toBe(0);
  });

  it('the helper still fails when the reader itself fails', () => {
    // The fix must not be a blanket suppression: a real load failure has to
    // stop the deploy.
    expect(runWithStubs(VIA_HELPER, 1)).toBe(1);
  });

  it('leaves pipefail on for everything after the transfer', () => {
    const status = runWithStubs(`${VIA_HELPER}\nfalse | true\n`, 0);
    expect(status).not.toBe(0);
  });

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
    expect(runWithStubs(withHead, 0)).toBe(141);
    expect(runWithStubs(withSed, 0)).toBe(0);
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
      // Join line continuations so a redirect on the next line counts.
      const joined = text.replace(/\\\n\s*/g, ' ');
      const offenders = joined
        .split('\n')
        .filter((line) => !/^\s*#/.test(line))
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
