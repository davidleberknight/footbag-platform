/**
 * Permanent contract: every runtime Dockerfile defaults to stripping the
 * dist/testkit/ and dist/dev-bootstrap/ subtrees unless the builder explicitly opts in
 * via `INCLUDE_DEV_SHORTCUTS=1`. Production builds set the arg to 0
 * (deploy-rebuild.sh + docker-compose.prod.yml overrides), so the prod
 * image never carries the real dev-shortcuts code path. Because a core
 * production service statically imports dev-bootstrap/runtime, the strip
 * recreates a no-op runtime.js stub in its place so the require resolves and
 * every container still boots; a bare removal leaves a dangling import and
 * crash-loops the worker at startup.
 *
 * Defense-in-depth gate. Other layers:
 *   - src/dev-bootstrap/runtime.ts: per-call short-circuit when
 *     footbagEnv is not 'development' or 'staging'.
 *   - src/config/env.ts: boot-time fail-fast on FOOTBAG_DEV_* env vars in
 *     non-development environments.
 *   - scripts/internal/deploy-{rebuild,code}-remote.sh: refuse to write
 *     FOOTBAG_DEV_INITIAL_ADMIN_EMAILS to /srv/footbag/env on production hosts.
 *   - This test: regression guard on the Dockerfile RUN step that strips the
 *     dev/staging code and stubs the dev-bootstrap module in the prod image.
 *
 * Static-text scan (no docker invocation). CI runs vitest but not docker,
 * so a build-time check would not run in CI.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import * as path from 'node:path';

const REPO_ROOT = path.resolve(__dirname, '..', '..');

const DOCKERFILES = [
  'docker/web/Dockerfile',
  'docker/worker/Dockerfile',
  'docker/image/Dockerfile',
] as const;

describe.each(DOCKERFILES)('%s: dev-shortcuts strip contract', (relPath) => {
  const content = readFileSync(path.join(REPO_ROOT, relPath), 'utf8');

  it('declares ARG INCLUDE_DEV_SHORTCUTS with default 0', () => {
    expect(content).toMatch(/^ARG\s+INCLUDE_DEV_SHORTCUTS\s*=\s*0\s*$/m);
  });

  it('removes dist/testkit and dist/dev-bootstrap when INCLUDE_DEV_SHORTCUTS != 1', () => {
    expect(content).toMatch(
      /RUN\s+if\s+\[\s*"\$INCLUDE_DEV_SHORTCUTS"\s*!=\s*"1"\s*\]/,
    );
    expect(content).toMatch(/rm\s+-rf[^\n]*dist\/testkit/);
    expect(content).toMatch(/rm\s+-rf[^\n]*dist\/dev-bootstrap/);
  });

  it('recreates a no-op dist/dev-bootstrap/runtime.js stub so the statically-imported module still resolves', () => {
    expect(content).toMatch(/dist\/dev-bootstrap\/runtime\.js/);
    expect(content).toMatch(/applyDevStagingBootstrapAdmin/);
  });
});
