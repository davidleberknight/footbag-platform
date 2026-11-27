/**
 * The production image check in scripts/lib/image-transfer.sh: a production
 * deploy reads its built images back and refuses one that still holds the test
 * kit, the persona harness that can sign in as any test member.
 *
 * The build drops the kit only through an exported variable, so the images
 * themselves are the proof. The contract: clean images pass, an image holding
 * the kit is refused by name, an image that cannot be read is refused rather
 * than taken as clean, and both deploy builders run the check on production.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { SPAWN_GUARD } from '../fixtures/spawnGuard';
import { createScratchDir } from '../fixtures/scratchDir';

const LIB = join(process.cwd(), 'scripts/lib/image-transfer.sh');

let dir: string;
beforeEach(() => { dir = createScratchDir('image-transfer'); });
afterEach(() => rmSync(dir, { recursive: true, force: true }));

/** Runs the check against a stand-in docker whose answer is set per image. */
function check(answers: Record<string, number>) {
  const docker = join(dir, 'docker');
  const cases = Object.entries(answers).map(([img, rc]) => `  *" ${img} "*) exit ${rc} ;;`).join('\n');
  writeFileSync(docker, `#!/usr/bin/env bash\necho "$*" >> ${JSON.stringify(join(dir, 'calls'))}\ncase " $* " in\n${cases}\nesac\nexit 0\n`, { mode: 0o755 });
  return spawnSync('bash', ['-c', `set -euo pipefail\nsource ${JSON.stringify(LIB)}\nrequire_no_testkit_in_images`], {
    env: { ...process.env, DEPLOY_DOCKER_BIN: docker },
    encoding: 'utf8',
    ...SPAWN_GUARD,
  });
}

describe('require_no_testkit_in_images', () => {
  // Defect caught: a check that passes images it never read, or reads only one.
  it('passes clean images, having read each one', () => {
    const r = check({});
    expect(r.status, r.stderr).toBe(0);
    const calls = readFileSync(join(dir, 'calls'), 'utf8');
    for (const img of ['docker-web', 'docker-worker', 'docker-image']) expect(calls, img).toContain(`--entrypoint sh ${img} -c test ! -e /app/dist/testkit`);
  });

  // Defect caught: a production image shipped with the test kit because the
  // build's variable did not reach the build.
  it('refuses an image that holds the test kit, by name', () => {
    const r = check({ 'docker-worker': 1 });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('docker-worker holds /app/dist/testkit');
  });

  // Defect caught: an image that could not be read taken as clean.
  it('refuses when an image cannot be read', () => {
    const r = check({ 'docker-web': 125 });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('could not read docker-web');
  });
});

describe('the deploy builders', () => {
  // Defect caught: one of the two production build paths shipping images
  // nobody checked.
  it.each(['scripts/deploy-code.sh', 'scripts/deploy-rebuild.sh'])('%s checks its production images before sending them', (file) => {
    const source = readFileSync(join(process.cwd(), file), 'utf8');
    expect(source).toMatch(/require_images_for_hosts \|\| exit 1\nif \[\[ "\$FOOTBAG_ENV" == "production" \]\]; then\n {2}require_no_testkit_in_images \|\| exit 1\nfi/);
  });
});
