/**
 * Proving the machine's tools match the pins, and the pins agree.
 *
 * The contract: every tool row compares the version found with the version the
 * list, .nvmrc or .python-version pins; one that differs reads MISMATCH and the
 * run fails, beside a run where every row matches and it passes; the pins that
 * must agree with each other (the sqlite pin and the engine the app bundles,
 * the ffmpeg pin and the image, the hosts' release and the release image, the
 * host engine pin and what that release serves) are rows too; and a failure part way
 * through never ends the run early: every row is still checked and the closing
 * report names every one that failed.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { chmodSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { createScratchDir, removeScratch } from '../fixtures/scratchDir';
import { SPAWN_GUARD } from '../fixtures/spawnGuard';

const SCRIPT = join(process.cwd(), 'scripts/check-versions.sh');
const LIST = readFileSync(join(process.cwd(), 'ops/tool-versions.env'), 'utf-8');
const pin = (k: string): string => new RegExp(`^${k}=(.*)$`, 'm').exec(LIST)![1];
const NODE = readFileSync(join(process.cwd(), '.nvmrc'), 'utf-8').trim().replace(/^v/, '');
const PY = readFileSync(join(process.cwd(), '.python-version'), 'utf-8').trim();

let dir: string;
let bin: string;

function stub(name: string, out: string): void {
  writeFileSync(join(bin, name), `#!/usr/bin/env bash\necho ${JSON.stringify(out)}\n`);
  chmodSync(join(bin, name), 0o755);
}

/**
 * The workstation's own docker: the engine answers `docker version`, and the
 * Compose plugin answers `docker compose version --short`, which prints the
 * version without the leading v the pin carries (seen from Compose v5.1.0 on a
 * workstation: `5.1.0`).
 */
function workstationDocker(engine: string, compose: string): void {
  writeFileSync(join(bin, 'docker'), [
    '#!/usr/bin/env bash',
    'case "$*" in',
    `  "compose version --short") echo ${JSON.stringify(compose)} ;;`,
    `  version*) echo ${JSON.stringify(engine)} ;;`,
    '  *) exit 1 ;;',
    'esac',
  ].join('\n'));
  chmodSync(join(bin, 'docker'), 0o755);
}

// The engine reports the version part of the apt pin (epoch:version-revision).
const ENGINE = pin('DOCKER_ENGINE_WORKSTATION').replace(/^\d+:/, '').replace(/-.*$/, '');
const COMPOSE = pin('COMPOSE_VERSION').replace(/^v/, '');

/** Every workstation tool answering at its pinned version. */
function pinnedTools(): void {
  stub('sqlite3', `${pin('SQLITE_VERSION')} 2026-01-09 stub`);
  stub('jq', `jq-${pin('JQ_VERSION')}`);
  stub('age', `v${pin('AGE_VERSION')}`);
  stub('node', `v${NODE}`);
  stub(`python${PY.replace(/\.\d+$/, '')}`, PY);
  stub('terraform', `Terraform v${pin('TERRAFORM_VERSION')}`);
  workstationDocker(ENGINE, COMPOSE);
}

/** The real list with one key's line replaced, as a stand-in list. */
function listWith(key: string, value: string): NodeJS.ProcessEnv {
  const path = join(dir, 'tool-versions.env');
  writeFileSync(path, LIST.replace(new RegExp(`^${key}=.*$`, 'm'), `${key}=${value}`));
  return { FOOTBAG_TOOL_VERSIONS: path };
}

/** The closing report: everything from its heading to the end of the output. */
function report(out: string): string {
  const at = out.lastIndexOf('Closing report');
  return at < 0 ? '' : out.slice(at);
}

beforeEach(() => {
  dir = createScratchDir('check-versions');
  bin = join(dir, 'bin');
  mkdirSync(bin);
  pinnedTools();
});

afterEach(() => removeScratch(dir));

function check(args: string[], extra: NodeJS.ProcessEnv = {}) {
  const r = spawnSync('bash', [SCRIPT, ...args], {
    encoding: 'utf-8',
    env: { ...process.env, PATH: `${bin}:${process.env.PATH ?? ''}`, ...extra },
    ...SPAWN_GUARD,
  });
  return { status: r.status, out: (r.stdout ?? '') + (r.stderr ?? '') };
}

describe('check-versions.sh', () => {
  it('passes when every tool and every pair of pins agrees', () => {
    const r = check(['--quick']);
    expect(r.status, r.out).toBe(0);
    for (const tool of ['sqlite3', 'jq', 'age', 'node', 'python', 'terraform', 'docker', 'compose', 'sqlite engine (app)', 'ffmpeg (Dockerfile)', 'amazon linux (image)']) {
      const line = r.out.split('\n').find((l) => l.startsWith(tool + ' '));
      expect(line, tool).toMatch(/\sok$/);
    }
  });

  it('fails, naming the row in the closing report, when one tool is at another version', () => {
    // Defect caught: a workstation on apt's older jq passes the check, so a
    // patch is declared proven on a machine that never ran the pinned version.
    stub('jq', 'jq-1.6');
    const r = check(['--quick']);
    expect(r.status).toBe(1);
    expect(r.out.split('\n').find((l) => l.startsWith('jq '))).toMatch(/\s1\.6\s+MISMATCH$/);
    expect(r.out.split('\n').find((l) => l.startsWith('sqlite3 '))).toMatch(/\sok$/);
    // Defect caught: the mismatch scrolls past in the table and the end of the
    // run, which is what the operator reads, never names it.
    expect(report(r.out)).toContain(`jq: pinned ${pin('JQ_VERSION')}, found 1.6`);
  });

  it('fails, naming the row, when the docker engine is at another version', () => {
    // Defect caught: a workstation on another Docker engine passes the check, so
    // local container runs are trusted as the pinned environment when they are not.
    workstationDocker('28.0.0', COMPOSE);
    const r = check(['--quick']);
    expect(r.status).toBe(1);
    expect(r.out.split('\n').find((l) => l.startsWith('docker '))).toMatch(/\s28\.0\.0\s+MISMATCH$/);
  });

  it('fails, naming the row, when the Compose plugin is at another version', () => {
    // Defect caught: a workstation builds and runs the stack with another
    // Compose than the hosts install, and the check says nothing.
    workstationDocker(ENGINE, '2.29.7');
    const r = check(['--quick']);
    expect(r.status).toBe(1);
    expect(r.out.split('\n').find((l) => l.startsWith('compose '))).toMatch(/\s2\.29\.7\s+MISMATCH$/);
  });

  it('reads a Compose plugin that prints a leading v as the same version', () => {
    // Defect caught: the v is stripped on one side only, so a workstation on
    // exactly the pinned plugin reads MISMATCH and the check teaches the
    // operator to ignore it.
    workstationDocker(ENGINE, `v${COMPOSE}`);
    const r = check(['--quick']);
    expect(r.status, r.out).toBe(0);
    expect(r.out.split('\n').find((l) => l.startsWith('compose '))).toMatch(/\sok$/);
  });

  it('fails when the Amazon Linux image is not at the hosts\' pinned release', () => {
    // Defect caught: the release moves and the image the vulnerability report
    // and the release query read stays behind, so both answer for a release
    // the hosts no longer run.
    const stale = pin('AMAZONLINUX_IMAGE').replace(/:[^@]*@/, ':2023.11.20260101.0@');
    const r = check(['--quick'], listWith('AMAZONLINUX_IMAGE', stale));
    expect(r.status).toBe(1);
    expect(r.out.split('\n').find((l) => l.startsWith('amazon linux (image) ')))
      .toMatch(new RegExp(`\\s${pin('AMAZON_LINUX_RELEASE').replace(/\./g, '\\.')}\\s+2023\\.11\\.20260101\\s+MISMATCH$`));
  });
});

describe('asking the built images from the inside', () => {
  /**
   * A docker stand-in: builds succeed unless told otherwise, each image answers
   * at the given versions, and the release query answers with the given docker
   * package. Every call is logged.
   */
  function images(answers: { node?: string; ffmpeg?: string; hostDocker?: string; buildFails?: boolean; testsFail?: boolean }): NodeJS.ProcessEnv {
    const docker = join(dir, 'docker');
    writeFileSync(docker, [
      '#!/usr/bin/env bash',
      `echo "$*" >> ${JSON.stringify(join(dir, 'docker.log'))}`,
      'case "$*" in',
      answers.buildFails
        ? '  compose*build*) echo "ERROR: failed to solve: process did not complete"; exit 17 ;;'
        : '  compose*build*) exit 0 ;;',
      `  *"--entrypoint node"*) echo "v${answers.node ?? NODE}" ;;`,
      // The installed-package list's real shape, captured 2026-11-01 from
      // `apk info -v` in the pinned node:22-alpine base after `apk add
      // ffmpeg=8.1.3-r0`: the bare package line among its library packages.
      `  *"apk info -v"*) v="${answers.ffmpeg ?? pin('FFMPEG_VERSION')}"; printf '%s\\n' "ffmpeg-$v" "ffmpeg-libavcodec-$v" "ffmpeg-libavformat-$v" "ffmpeg-libswscale-$v" ;;`,
      // The query's real answer, captured 2026-11-02 from `dnf repoquery
      // --quiet --releasever=2023.12.20261021 --latest-limit=1 --qf
      // '%{version}-%{release}' docker` in the pinned amazonlinux image: one
      // line, the package's version-release, the pull progress on stderr.
      `  *"dnf repoquery"*) echo "Unable to find image locally" >&2; echo "${answers.hostDocker ?? pin('DOCKER_ENGINE_HOST')}" ;;`,
      'esac',
    ].join('\n'));
    chmodSync(docker, 0o755);
    const vitest = join(dir, 'vitest');
    writeFileSync(vitest, answers.testsFail
      ? '#!/usr/bin/env bash\necho " FAIL  tests/unit/imageToolPins.test.ts"\nexit 1\n'
      : '#!/usr/bin/env bash\nexit 0\n');
    chmodSync(vitest, 0o755);
    return { FOOTBAG_CHECK_VERSIONS_DOCKER: docker, FOOTBAG_CHECK_VERSIONS_VITEST: vitest };
  }

  const line = (out: string, tool: string): string | undefined =>
    out.split('\n').find((l) => l.startsWith(tool + ' '));

  // Defect caught: the host engine pin names a docker package the pinned
  // release does not serve, so a host stepped to that release installs another
  // engine than the one every check was proven against.
  it('asks the pinned release, inside the pinned image, which docker package it serves', () => {
    const ok = check([], images({}));
    expect(ok.status, ok.out).toBe(0);
    expect(line(ok.out, 'docker (host release)')).toMatch(/\sok$/);
    const calls = readFileSync(join(dir, 'docker.log'), 'utf-8');
    expect(calls).toContain(`run --rm ${pin('AMAZONLINUX_IMAGE')} dnf repoquery`);
    expect(calls).toContain(`--releasever=${pin('AMAZON_LINUX_RELEASE')}`);

    const bad = check([], images({ hostDocker: '25.0.14-1.amzn2023.0.1' }));
    expect(bad.status).toBe(1);
    expect(line(bad.out, 'docker (host release)')).toMatch(/\s25\.0\.14-1\.amzn2023\.0\.1\s+MISMATCH$/);
  });

  // Defect caught: a failure part way through (the images not building) is
  // printed mid-stream and the run either stops there, skipping the tests
  // after it, or finishes on a line that does not name it.
  it('carries on past an image build that failed, runs the tests, and fails naming the build', () => {
    const r = check([], images({ buildFails: true }));
    expect(r.status).toBe(1);
    expect(r.out).toContain('==> The tests where pinned things meet');
    expect(report(r.out)).toMatch(/image build: exit 17/);
    expect(report(r.out)).toMatch(/Not proven:[\s\S]*the images did not build/);
  });

  // Defect caught: a failing pinned-tool test is shown in the runner's output
  // and the check still exits zero with every row ok.
  it('fails, naming the tests, when the tests where pinned things meet fail', () => {
    const r = check([], images({ testsFail: true }));
    expect(r.status).toBe(1);
    expect(report(r.out)).toMatch(/the tests where pinned things meet: exit 1/);
  });

  // Defect caught: the check passes on what the Dockerfile asks for while the
  // built image holds something else, so a patch is declared proven on bytes
  // nobody looked at.
  it('reads Node from every image and ffmpeg from the image container', () => {
    const r = check([], images({}));
    expect(r.status, r.out).toBe(0);
    for (const img of ['docker-web', 'docker-worker', 'docker-image']) {
      expect(line(r.out, `node (${img})`), img).toMatch(/\sok$/);
    }
    expect(line(r.out, 'ffmpeg (docker-image)')).toMatch(/\sok$/);
  });

  // Defect caught: an image built on a base whose Node is not .nvmrc's, or whose
  // repository served another ffmpeg, passes the check.
  it('fails, naming the image, when what is inside differs from the pin', () => {
    const r = check([], images({ node: '22.1.0', ffmpeg: '8.1.2-r0' }));
    expect(r.status).toBe(1);
    expect(line(r.out, 'node (docker-web)')).toMatch(/\s22\.1\.0\s+MISMATCH$/);
    expect(line(r.out, 'ffmpeg (docker-image)')).toMatch(/\s8\.1\.2-r0\s+MISMATCH$/);
  });
});
