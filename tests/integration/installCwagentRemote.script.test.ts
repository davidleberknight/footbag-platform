/**
 * The root-side half of the CloudWatch agent install, interrupted partway.
 *
 * Every file this half writes goes through one privileged writer: content into
 * a restricted temp file, then promoted with `install`. One of those files holds
 * the agent's AWS secret key, so a temp file left behind is a live credential
 * sitting in the host's temp directory. A fresh install also downloads the agent
 * package into a temp directory. An interrupt has to leave neither behind, and
 * has to stop the run: a privileged install that carries on after the operator
 * interrupted it goes on to write the secret key and restart the agent.
 *
 * Driven against stand-ins for the host tools, with the temp directory pointed
 * at scratch so what is left behind can be seen. The stand-in `install` reports
 * that it has been reached and then waits on a pipe the test controls, so the
 * interrupt lands while a temp file exists, decided by that event rather than by
 * a delay.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawn, spawnSync } from 'node:child_process';
import {
  writeFileSync, mkdirSync, rmSync, chmodSync, readdirSync, readFileSync, existsSync,
} from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { SPAWN_GUARD } from '../fixtures/spawnGuard';
import { createScratchDir } from '../fixtures/scratchDir';

const REMOTE_HALF = resolve(__dirname, '..', '..', 'scripts', 'internal', 'install-cwagent-remote.sh');

let work: string;
let binDir: string;
let hostTmp: string;
let fifo: string;
let installLog: string;

function stub(name: string, body: string[]): void {
  const p = join(binDir, name);
  writeFileSync(p, ['#!/usr/bin/env bash', ...body].join('\n'));
  chmodSync(p, 0o755);
}

beforeEach(() => {
  work = createScratchDir('cwagent-remote');
  binDir = join(work, 'bin');
  hostTmp = join(work, 'host-tmp');
  fifo = join(work, 'release');
  installLog = join(work, 'install-calls.log');
  mkdirSync(binDir);
  mkdirSync(hostTmp);
  spawnSync('mkfifo', [fifo], SPAWN_GUARD);

  stub('findmnt', ['echo xfs']);
  // No instance metadata here, and the package download writes a placeholder.
  stub('curl', [
    'out=""',
    'while [[ $# -gt 0 ]]; do [[ "$1" == -o ]] && out="$2"; shift; done',
    '[[ -n "$out" ]] && { echo package > "$out"; exit 0; }',
    'exit 1',
  ]);
  // Not yet installed, so the run takes the fresh-install path that creates the
  // package directory.
  stub('rpm', ['exit 1']);
  stub('dnf', ['exit 0']);
  stub('logrotate', ['exit 0']);
  stub('systemctl', ['exit 1']);
  // The first file promotion announces itself and waits for the test; later ones
  // record their destination and return.
  stub('install', [
    '[[ "$1" == -d ]] && exit 0',
    `printf '%s\\n' "\${@: -1}" >> ${JSON.stringify(installLog)}`,
    `[[ -e ${JSON.stringify(`${fifo}.released`)} ]] && exit 0`,
    'echo "PROMOTION-REACHED"',
    `read -r _ < ${JSON.stringify(fifo)}`,
    `: > ${JSON.stringify(`${fifo}.released`)}`,
  ]);
});

afterEach(() => {
  rmSync(work, { recursive: true, force: true });
});

describe('install-cwagent-remote.sh: an interrupt during a privileged write', () => {
  // TERM is an operator's kill; HUP is the ssh session dropping, which is how a
  // remote half is most often interrupted.
  it.each(['SIGTERM', 'SIGHUP'] as const)('on %s, stops the run and leaves neither the temp file nor the package directory behind', async (signal) => {
    const child = spawn('bash', [REMOTE_HALF], {
      env: {
        ...process.env,
        PATH: `${binDir}:${process.env.PATH ?? ''}`,
        TMPDIR: hostTmp,
        CWAGENT_AKID: 'stub-key-id',
        CWAGENT_SAK: 'stub-secret-not-real',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    const exited = new Promise<number | null>((done) => child.on('close', (code) => done(code)));

    await new Promise<void>((reached) => {
      child.stdout.on('data', (chunk: Buffer) => {
        stdout += chunk.toString();
        if (stdout.includes('PROMOTION-REACHED')) reached();
      });
    });

    // At this moment the writer's temp file and the downloaded package's
    // directory both exist, so an empty directory afterwards is the cleanup's
    // doing and not an artefact of nothing having been created.
    expect(readdirSync(hostTmp)).toHaveLength(2);

    // The signal goes to the run alone, as an operator's kill would, and the
    // promotion it interrupted is then allowed to return.
    child.kill(signal);
    await writeFile(fifo, 'go\n');
    const code = await exited;

    expect(code).not.toBe(0);
    expect(readdirSync(hostTmp)).toEqual([]);
    // Nothing after the interrupted write ran: the secret key was never written.
    expect(stdout).not.toContain('=== Step 3');
    const promoted = existsSync(installLog) ? readFileSync(installLog, 'utf8') : '';
    expect(promoted).not.toContain('/etc/amazon-cloudwatch-agent.aws/credentials');
  });

  it('leaves nothing behind on an ordinary exit after every file has been written', () => {
    // No pause this time. The run writes all its files, then stops where the
    // stand-in service manager reports the agent not running. A writer that
    // registered or cleared its own handler would have discarded the one that
    // removes the package directory, and that loss shows on every run, not
    // only on an interrupt.
    writeFileSync(`${fifo}.released`, '');
    stub('systemctl', ['[[ "$1" == is-active ]] && exit 1', 'exit 0']);
    const res = spawnSync('bash', [REMOTE_HALF], {
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: `${binDir}:${process.env.PATH ?? ''}`,
        TMPDIR: hostTmp,
        CWAGENT_AKID: 'stub-key-id',
        CWAGENT_SAK: 'stub-secret-not-real',
      },
      ...SPAWN_GUARD,
    });
    expect(res.status).toBe(1);
    expect(res.stderr).toContain('not running after the restart');
    expect(readFileSync(installLog, 'utf8')).toContain('/etc/amazon-cloudwatch-agent.aws/credentials');
    expect(readdirSync(hostTmp)).toEqual([]);
  });
});
