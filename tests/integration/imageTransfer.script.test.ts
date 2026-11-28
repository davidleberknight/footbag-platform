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
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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
    for (const img of ['docker-web', 'docker-worker', 'docker-image']) {
      expect(calls, img).toMatch(new RegExp(`--entrypoint sh ${img} -c .* sh /app/dist/testkit`));
    }
  });

  // Defect caught: a production image shipped with the test kit because the
  // build's variable did not reach the build.
  it('refuses an image that holds the test kit, by name', () => {
    const r = check({ 'docker-worker': 1 });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('docker-worker holds the test kit in /app/dist/testkit');
  });

  // Defect caught: an image that could not be read taken as clean.
  it('refuses when an image cannot be read', () => {
    const r = check({ 'docker-web': 125 });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('could not read docker-web');
  });
});

/**
 * The test the check runs inside each image, run here against folders on disk
 * shaped as the Dockerfiles leave them: the web image's production strip
 * recreates dist/testkit with exactly two no-op stubs, the worker's and the
 * image processor's remove it outright, and a staging build keeps the real kit.
 */
describe('what counts as a stripped test kit', () => {
  const STUB_ROUTES = 'module.exports = { devRouter: null };\n';
  const STUB_OUTBOX = 'module.exports = { getDevOutboxCaptureClient: function () { return {}; } };\n';
  function testDir(files: Record<string, string> | null): number | null {
    const d = join(dir, 'testkit');
    if (files) {
      mkdirSync(d, { recursive: true });
      for (const [name, body] of Object.entries(files)) writeFileSync(join(d, name), body);
    }
    const r = spawnSync('bash', ['-c', `source ${JSON.stringify(LIB)}\nsh -c "$TESTKIT_STRIPPED_TEST" sh ${JSON.stringify(d)}`], {
      encoding: 'utf8', ...SPAWN_GUARD,
    });
    return r.status;
  }

  // Defect caught: the check asked only whether dist/testkit exists, which it
  // always does in a correctly stripped web image, so every production deploy
  // was refused.
  it('passes the web image\'s stripped folder of two no-op stubs', () => {
    expect(testDir({ 'devRoutes.js': STUB_ROUTES, 'devOutboxCaptureClient.js': STUB_OUTBOX })).toBe(0);
  });

  it('passes an image with no test kit folder at all, as the worker and image processor have', () => {
    expect(testDir(null)).toBe(0);
  });

  // Defect caught: a staging-shaped build reaching production, carrying the
  // persona harness that can sign in as any test member.
  it('refuses the real kit: any file beyond the two stubs', () => {
    expect(testDir({
      'devRoutes.js': STUB_ROUTES, 'devOutboxCaptureClient.js': STUB_OUTBOX, 'personaRowBuilders.js': 'x',
    })).toBe(1);
  });

  it('refuses a real router under the stub\'s name', () => {
    expect(testDir({ 'devRoutes.js': 'module.exports = { devRouter: require("express").Router() };\n', 'devOutboxCaptureClient.js': STUB_OUTBOX })).toBe(1);
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
