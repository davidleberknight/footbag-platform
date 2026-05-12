/**
 * Permanent contract: every runtime Dockerfile defaults to stripping the
 * dist/dev-admin-shortcuts/ subtree unless the builder explicitly opts in
 * via `INCLUDE_DEV_ADMIN_SHORTCUTS=1`. Production builds set the arg to 0
 * (deploy-rebuild.sh + docker-compose.prod.yml overrides), so the prod
 * image never carries the dev-admin shortcuts code path.
 *
 * Defense-in-depth gate. Other layers:
 *   - src/dev-admin-shortcuts/seedConfig.ts: module-import throw under
 *     FOOTBAG_ENV=production.
 *   - src/dev-admin-shortcuts/runtime.ts: per-call short-circuit when
 *     footbagEnv is not 'development' or 'staging'.
 *   - src/config/env.ts: boot-time fail-fast on FOOTBAG_DEV_* env vars in
 *     non-development environments.
 *   - scripts/internal/deploy-{rebuild,code}-remote.sh: refuse to write
 *     FOOTBAG_DEV_INITIAL_ADMIN_EMAILS to /srv/footbag/env on production hosts.
 *   - deploy_to_aws.sh: --seed-dev-admins allowlisted to
 *     DEPLOY_TARGET=footbag-staging only.
 *   - This test: regression guard on the Dockerfile RUN step that physically
 *     removes the dev-admin code from the prod image.
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

describe.each(DOCKERFILES)('%s: dev-admin-shortcuts strip contract', (relPath) => {
  const content = readFileSync(path.join(REPO_ROOT, relPath), 'utf8');

  it('declares ARG INCLUDE_DEV_ADMIN_SHORTCUTS with default 0', () => {
    expect(content).toMatch(/^ARG\s+INCLUDE_DEV_ADMIN_SHORTCUTS\s*=\s*0\s*$/m);
  });

  it('removes dist/dev-admin-shortcuts when INCLUDE_DEV_ADMIN_SHORTCUTS != 1', () => {
    expect(content).toMatch(
      /RUN\s+if\s+\[\s*"\$INCLUDE_DEV_ADMIN_SHORTCUTS"\s*!=\s*"1"\s*\]/,
    );
    expect(content).toMatch(/rm\s+-rf[^\n]*dist\/dev-admin-shortcuts/);
  });
});
