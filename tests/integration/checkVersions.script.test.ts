/**
 * Proving the machine's tools match the pins, and the pins agree.
 *
 * The contract: every tool row compares the version found with the version the
 * list, .nvmrc or .python-version pins; one that differs reads MISMATCH and the
 * run fails, beside a run where every row matches and it passes; the pins that
 * must agree with each other (the sqlite pin and the engine the app bundles,
 * the ffmpeg pin and the image) are rows too; and the advisory scan runs the
 * pinned scanner image, only when asked.
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

/** Every workstation tool answering at its pinned version. */
function pinnedTools(): void {
  stub('sqlite3', `${pin('SQLITE_VERSION')} 2026-01-09 stub`);
  stub('jq', `jq-${pin('JQ_VERSION')}`);
  stub('age', `v${pin('AGE_VERSION')}`);
  stub('node', `v${NODE}`);
  stub(`python${PY.replace(/\.\d+$/, '')}`, PY);
  stub('terraform', `Terraform v${pin('TERRAFORM_VERSION')}`);
  // The engine reports the version part of the apt pin (epoch:version-revision).
  stub('docker', pin('DOCKER_ENGINE_WORKSTATION').replace(/^\d+:/, '').replace(/-.*$/, ''));
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
    for (const tool of ['sqlite3', 'jq', 'age', 'node', 'python', 'terraform', 'docker', 'sqlite engine (app)', 'ffmpeg (Dockerfile)']) {
      const line = r.out.split('\n').find((l) => l.startsWith(tool + ' '));
      expect(line, tool).toMatch(/\sok$/);
    }
  });

  it('fails, naming the row, when one tool is at another version', () => {
    // Defect caught: a workstation on apt's older jq passes the check, so a
    // patch is declared proven on a machine that never ran the pinned version.
    stub('jq', 'jq-1.6');
    const r = check(['--quick']);
    expect(r.status).toBe(1);
    expect(r.out.split('\n').find((l) => l.startsWith('jq '))).toMatch(/\s1\.6\s+MISMATCH$/);
    expect(r.out.split('\n').find((l) => l.startsWith('sqlite3 '))).toMatch(/\sok$/);
  });

  it('fails, naming the row, when the docker engine is at another version', () => {
    // Defect caught: a workstation on another Docker engine passes the check, so
    // local container runs are trusted as the pinned environment when they are not.
    stub('docker', '28.0.0');
    const r = check(['--quick']);
    expect(r.status).toBe(1);
    expect(r.out.split('\n').find((l) => l.startsWith('docker '))).toMatch(/\s28\.0\.0\s+MISMATCH$/);
  });

  it('runs the pinned scanner image only when asked, and refuses an image without the scan', () => {
    // Defect caught: the advisory scan runs a floating scanner tag, or runs at
    // all without the maintainer asking for it.
    const log = join(dir, 'docker.log');
    writeFileSync(join(dir, 'docker'), `#!/usr/bin/env bash\necho "$*" >> ${JSON.stringify(log)}\n`);
    chmodSync(join(dir, 'docker'), 0o755);
    const env = { FOOTBAG_CHECK_VERSIONS_DOCKER: join(dir, 'docker') };
    expect(check(['--quick'], env).status).toBe(0);
    expect(() => readFileSync(log, 'utf-8')).toThrow();

    const r = check(['--quick', '--advisories', '--image', 'footbag-web:test'], env);
    expect(r.status, r.out).toBe(0);
    const calls = readFileSync(log, 'utf-8');
    expect(calls).toContain(`${pin('TRIVY_IMAGE')} fs --scanners vuln`);
    expect(calls).toContain(`${pin('TRIVY_IMAGE')} image --exit-code 0 footbag-web:test`);
    // Defect caught: the hosts' operating-system packages are never scanned,
    // or are scanned at a release the hosts do not run.
    expect(calls).toContain(`${pin('TRIVY_IMAGE')} image --exit-code 0 ${pin('AMAZONLINUX_IMAGE')}`);

    expect(check(['--quick', '--image', 'footbag-web:test'], env).status).toBe(2);
  });
});

describe('asking the built images from the inside', () => {
  /** A docker stand-in: builds succeed, and each image answers at the given versions. */
  function images(answers: { node?: string; ffmpeg?: string }): NodeJS.ProcessEnv {
    const docker = join(dir, 'docker');
    writeFileSync(docker, [
      '#!/usr/bin/env bash',
      'case "$*" in',
      '  compose*build*) exit 0 ;;',
      `  *"--entrypoint node"*) echo "v${answers.node ?? NODE}" ;;`,
      // The installed-package list's real shape, captured 2026-11-01 from
      // `apk info -v` in the pinned node:22-alpine base after `apk add
      // ffmpeg=8.1.3-r0`: the bare package line among its library packages.
      `  *"apk info -v"*) v="${answers.ffmpeg ?? pin('FFMPEG_VERSION')}"; printf '%s\\n' "ffmpeg-$v" "ffmpeg-libavcodec-$v" "ffmpeg-libavformat-$v" "ffmpeg-libswscale-$v" ;;`,
      'esac',
    ].join('\n'));
    chmodSync(docker, 0o755);
    const vitest = join(dir, 'vitest');
    writeFileSync(vitest, '#!/usr/bin/env bash\nexit 0\n');
    chmodSync(vitest, 0o755);
    return { FOOTBAG_CHECK_VERSIONS_DOCKER: docker, FOOTBAG_CHECK_VERSIONS_VITEST: vitest };
  }

  const line = (out: string, tool: string): string | undefined =>
    out.split('\n').find((l) => l.startsWith(tool + ' '));

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
