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
import { createHash } from 'node:crypto';
import { SPAWN_GUARD } from '../fixtures/spawnGuard';
import { createScratchDir } from '../fixtures/scratchDir';

const REMOTE_HALF = resolve(__dirname, '..', '..', 'scripts', 'internal', 'install-cwagent-remote.sh');

// The stand-in download writes "package\n"; the pin is that content's digest,
// so a run that verifies goes through and a run with any other digest does not.
const PINS = {
  CWAGENT_VERSION: '1.300050.0b1',
  CWAGENT_URL: 'https://example.test/amazon-cloudwatch-agent.rpm',
  CWAGENT_SHA256: createHash('sha256').update('package\n').digest('hex'),
};

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
        ...PINS,
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
        ...PINS,
      },
      ...SPAWN_GUARD,
    });
    expect(res.status).toBe(1);
    expect(res.stderr).toContain('not running after the restart');
    // The package matched its pin and went to the package manager.
    expect(res.stdout).toContain('Package matches the pinned SHA-256');
    expect(readFileSync(installLog, 'utf8')).toContain('/etc/amazon-cloudwatch-agent.aws/credentials');
    expect(readdirSync(hostTmp)).toEqual([]);
  });
});

describe('install-cwagent-remote.sh: the package is pinned and checked', () => {
  function runHalf(pins: Record<string, string>) {
    writeFileSync(`${fifo}.released`, '');
    const dnfLog = join(work, 'dnf.log');
    stub('dnf', [`echo "$*" >> ${JSON.stringify(dnfLog)}`, 'exit 0']);
    stub('curl', [
      `echo "$*" >> ${JSON.stringify(join(work, 'curl.log'))}`,
      'out=""',
      'while [[ $# -gt 0 ]]; do [[ "$1" == -o ]] && out="$2"; shift; done',
      '[[ -n "$out" ]] && { echo package > "$out"; exit 0; }',
      'exit 1',
    ]);
    const res = spawnSync('bash', [REMOTE_HALF], {
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: `${binDir}:${process.env.PATH ?? ''}`,
        TMPDIR: hostTmp,
        CWAGENT_AKID: 'stub-key-id',
        CWAGENT_SAK: 'stub-secret-not-real',
        ...pins,
      },
      ...SPAWN_GUARD,
    });
    return {
      ...res,
      dnf: existsSync(dnfLog) ? readFileSync(dnfLog, 'utf8') : '',
      curl: existsSync(join(work, 'curl.log')) ? readFileSync(join(work, 'curl.log'), 'utf8') : '',
    };
  }

  it('refuses a placeholder pin before downloading anything', () => {
    // Defect caught: a caller that skipped its own check installs an
    // unverified package as root.
    const res = runHalf({ ...PINS, CWAGENT_SHA256: 'REPLACE_WITH_SHA256_OF_amazon-cloudwatch-agent.rpm' });
    expect(res.status).toBe(1);
    expect(res.stderr).toContain('still a placeholder');
    expect(res.curl).toBe('');
    expect(res.dnf).toBe('');
  });

  it('refuses a package whose digest does not match, and installs nothing', () => {
    // Defect caught: a replaced or corrupted upload at the publisher's address
    // is installed as root on the host.
    const res = runHalf({ ...PINS, CWAGENT_SHA256: 'c'.repeat(64) });
    expect(res.status).toBe(1);
    expect(res.stderr).toContain('does not match the pinned SHA-256');
    expect(res.curl).toContain(PINS.CWAGENT_URL);
    expect(res.dnf).toBe('');
    expect(readdirSync(hostTmp)).toEqual([]);
  });

  it('fetches the pinned version\'s address, never the publisher\'s latest', () => {
    const res = runHalf(PINS);
    // The instance-metadata probes also go through curl; only the package
    // fetch is the one under test.
    const fetches = res.curl.split('\n').filter((l) => l.includes('amazon-cloudwatch-agent.rpm'));
    expect(fetches).toEqual([expect.stringContaining(PINS.CWAGENT_URL)]);
    expect(fetches.join('\n')).not.toContain('/latest/');
    expect(res.dnf).toMatch(/install -y .*amazon-cloudwatch-agent\.rpm/);
  });
});

describe('install-cwagent-remote.sh: an upgrade keeps the host\'s credentials', () => {
  function runUpgrade(creds: string | null) {
    writeFileSync(`${fifo}.released`, '');
    stub('systemctl', ['[[ "$1" == is-active ]] && exit 1', 'exit 0']);
    const credsFile = join(work, 'cwagent-credentials');
    if (creds !== null) writeFileSync(credsFile, creds);
    const res = spawnSync('bash', [REMOTE_HALF], {
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: `${binDir}:${process.env.PATH ?? ''}`,
        TMPDIR: hostTmp,
        CWAGENT_KEEP_CREDENTIALS: '1',
        CWAGENT_CREDS_FILE: credsFile,
        ...PINS,
      },
      ...SPAWN_GUARD,
    });
    return { ...res, promoted: existsSync(installLog) ? readFileSync(installLog, 'utf8') : '' };
  }

  it('installs the pinned package and leaves the credentials file unwritten', () => {
    // Defect caught: a version bump rewrote the agent's credentials, which it
    // can only do with a newly minted key.
    const res = runUpgrade('[footbag-staging-cwagent]\naws_access_key_id = AKIAEXAMPLEEXAMPLE01\n');
    expect(res.stdout).toContain('Package matches the pinned SHA-256');
    expect(res.stdout).toContain('kept as it is');
    expect(res.promoted).not.toContain('cwagent-credentials');
    expect(res.promoted).toContain('common-config.toml');
  });

  it('refuses before installing anything when the host holds no credentials for the agent', () => {
    // An agent restarted with nothing to publish with stops the host's metrics.
    const res = runUpgrade(null);
    expect(res.status).toBe(1);
    expect(res.stderr).toMatch(/holds no\s+\[footbag-staging-cwagent\] profile/);
    expect(res.stdout).not.toContain('Package matches');
  });
});
