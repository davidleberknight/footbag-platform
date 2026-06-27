/**
 * Integration tests for the workstation-side AWS deploy bash chain.
 *
 * Coverage:
 *   - deploy_to_aws.sh wrapper preflight: --help short-circuit, missing
 *     credential file, missing SSH alias.
 *   - scripts/reset-local-db.sh preflight: missing canonical_input CSVs.
 *   - legacy_data/run_pipeline.sh: identity-lock CSV missing path.
 *   - freestyle/loaders/20_link_footbag_org_sources.py:
 *     graceful skip when scraped_footbag_moves.csv is absent.
 *
 * Strategy: spawn each script as a subprocess against a controlled env and
 * assert exit code + stderr/stdout content. No AWS contact; no host SSH.
 */
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

const REPO_ROOT = path.resolve(__dirname, '..', '..');

function run(
  cmd: string,
  args: string[],
  opts: { cwd?: string; env?: Record<string, string>; input?: string } = {},
) {
  return spawnSync(cmd, args, {
    cwd: opts.cwd ?? REPO_ROOT,
    env: { ...process.env, ...(opts.env ?? {}) },
    input: opts.input,
    encoding: 'utf-8',
  });
}

const HAS_DOCKER = spawnSync('command', ['-v', 'docker'], { shell: true }).status === 0;

// The dev-admin seed reads a gitignored, per-maintainer file. A workstation
// that happens to carry a populated one would enable the seed under
// --soup-to-nuts, so guard the best-effort-skip assertion on its absence
// (CI and clean checkouts never have it).
const HAS_STAGING_ADMIN_SEED = fs.existsSync(
  path.join(REPO_ROOT, '.local', 'staging-admin-seed.json'),
);

// ── deploy_to_aws.sh wrapper ──────────────────────────────────────────────────

describe('deploy_to_aws.sh wrapper', () => {
  it('--help exits 0 without checking AWS credentials or tools', () => {
    const r = run('bash', ['deploy_to_aws.sh', '--help'], {
      env: { AWS_OPERATOR_FILE: '/nonexistent/never/exists' },
    });
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/Usage:/i);
  });

  it('-h exits 0 (short flag)', () => {
    const r = run('bash', ['deploy_to_aws.sh', '-h']);
    expect(r.status).toBe(0);
  });

  it('--help mentions the long forms of the new flag set', () => {
    const r = run('bash', ['deploy_to_aws.sh', '--help']);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('--reuse-local-db');
    expect(r.stdout).toContain('--keep-staging-db');
    expect(r.stdout).toContain('--yes');
    expect(r.stdout).toContain('--no-s3-wipe');
    expect(r.stdout).toContain('--dry-run');
  });

  it('-r and -k are mutually exclusive (exits 1)', () => {
    const r = run('bash', ['scripts/deploy-to-aws.sh', '-r', '-k'], {
      input: 'fake-pw\n',
    });
    expect(r.status).toBe(1);
    const combined = (r.stderr ?? '') + (r.stdout ?? '');
    expect(combined).toMatch(/conflicts with prior mode/);
  });

  it('unknown flag exits 1', () => {
    const r = run('bash', ['scripts/deploy-to-aws.sh', '--bogus-flag'], {
      input: 'fake-pw\n',
    });
    expect(r.status).toBe(1);
    const combined = (r.stderr ?? '') + (r.stdout ?? '');
    expect(combined).toMatch(/unknown flag/);
  });

  it('bare default -ny (dry-run + yes) is code-only and routes to deploy-code.sh', () => {
    const r = run('bash', ['scripts/deploy-to-aws.sh', '-ny'], {
      input: 'fake-pw\n',
    });
    expect(r.status).toBe(0);
    const combined = (r.stderr ?? '') + (r.stdout ?? '');
    expect(combined).toMatch(/Deploy plan/);
    expect(combined).toMatch(/mode:\s+default/);
    expect(combined).toMatch(/rebuild local DB:\s+no/);
    expect(combined).toMatch(/replace staging:\s+no/);
    expect(combined).toMatch(/deploy-code\.sh/);
  });

  it('--from-csv -ny rebuilds + replaces and dispatches via deploy-local-data.sh', () => {
    const r = run('bash', ['scripts/deploy-to-aws.sh', '--from-csv', '-ny'], {
      input: 'fake-pw\n',
    });
    expect(r.status).toBe(0);
    const combined = (r.stderr ?? '') + (r.stdout ?? '');
    expect(combined).toMatch(/Deploy plan/);
    expect(combined).toMatch(/rebuild local DB:\s+yes/);
    expect(combined).toMatch(/replace staging:\s+yes/);
    expect(combined).toMatch(/deploy-local-data\.sh --from-csv/);
  });

  it('-rny (reuse-local-db) skips the rebuild and threads SKIP_DB_REBUILD=yes', () => {
    const r = run('bash', ['scripts/deploy-to-aws.sh', '-rny'], {
      input: 'fake-pw\n',
    });
    expect(r.status).toBe(0);
    const combined = (r.stderr ?? '') + (r.stdout ?? '');
    expect(combined).toMatch(/mode:\s+reuse/);
    expect(combined).toMatch(/rebuild local DB:\s+no/);
    expect(combined).toMatch(/SKIP_DB_REBUILD=yes/);
  });

  it('-kny (keep-staging-db) routes to deploy-code.sh with no DB ops', () => {
    const r = run('bash', ['scripts/deploy-to-aws.sh', '-kny'], {
      input: 'fake-pw\n',
    });
    expect(r.status).toBe(0);
    const combined = (r.stderr ?? '') + (r.stdout ?? '');
    expect(combined).toMatch(/mode:\s+keep/);
    expect(combined).toMatch(/replace staging:\s+no/);
    expect(combined).toMatch(/deploy-code\.sh/);
  });

  it('-Wny (no-s3-wipe) sets KEEP_MEDIA=yes', () => {
    const r = run('bash', ['scripts/deploy-to-aws.sh', '-Wny'], {
      input: 'fake-pw\n',
    });
    expect(r.status).toBe(0);
    const combined = (r.stderr ?? '') + (r.stdout ?? '');
    expect(combined).toMatch(/clean S3 sync:\s+no/);
    expect(combined).toMatch(/KEEP_MEDIA=yes/);
  });

  it.skipIf(HAS_STAGING_ADMIN_SEED)(
    '--soup-to-nuts skips the dev-admin seed when .local/staging-admin-seed.json is absent (best-effort); personas stay on',
    () => {
      const r = run('bash', ['scripts/deploy-to-aws.sh', '--soup-to-nuts', '-ny'], {
        input: 'fake-pw\n',
      });
      expect(r.status).toBe(0);
      const combined = (r.stderr ?? '') + (r.stdout ?? '');
      // Persona catalog is code, so it always seeds; the dev-admin seed needs a
      // populated per-maintainer file and must not abort a soup-to-nuts deploy
      // when that file has no entries.
      expect(combined).toMatch(/seed personas:\s+yes/);
      expect(combined).toMatch(/seed dev admins:\s+no/);
      expect(combined).toMatch(/skipping dev-admin seed/);
    },
  );

  it.skipIf(!HAS_DOCKER)(
    '-k with missing AWS_OPERATOR_FILE exits 1 with generic Recommendation (no path leak)',
    () => {
      const r = run('bash', ['deploy_to_aws.sh', '-k'], {
        env: {
          AWS_OPERATOR_FILE: '/nonexistent/never/exists',
          DEPLOY_TARGET: 'footbag-staging',
        },
      });
      expect(r.status).toBe(1);
      // Either we hit the credential-file check or an earlier ssh-alias /
      // tool check — both produce a Recommendation: line. Path must not leak.
      const combined = (r.stderr ?? '') + (r.stdout ?? '');
      expect(combined).toMatch(/Recommendation:/);
      expect(combined).not.toMatch(/\/nonexistent\/never\/exists/);
    },
  );

  it.skipIf(!HAS_DOCKER)(
    'production DB-replace requires the explicit confirmation phrase (no TTY → refuses)',
    () => {
      // A DB-rebuild deploy (--from-csv; bare is now code-only) against
      // footbag-production must not proceed without the operator typing the
      // confirmation phrase. Test environment has no TTY, so the gate
      // refuses with a clear "no TTY available" recommendation.
      const tmpFile = path.join(os.tmpdir(), `op-prod-${Date.now()}.txt`);
      fs.writeFileSync(tmpFile, 'fake-password\n', { mode: 0o600 });
      try {
        const r = run('bash', ['deploy_to_aws.sh', '--from-csv'], {
          env: {
            AWS_OPERATOR_FILE: tmpFile,
            DEPLOY_TARGET: 'footbag-production',
          },
        });
        expect(r.status).toBe(1);
        const combined = (r.stderr ?? '') + (r.stdout ?? '');
        expect(combined).toMatch(/PRODUCTION DB-TOUCHING DEPLOY/);
        expect(combined).toMatch(/requires interactive confirmation/);
      } finally {
        fs.unlinkSync(tmpFile);
      }
    },
  );

  it.skipIf(!HAS_DOCKER)(
    'production DB-replace with FOOTBAG_PROD_DB_REPLACE_ACK=1 bypasses the prompt and proceeds past the gate',
    () => {
      // The FOOTBAG_PROD_DB_REPLACE_ACK=1 escape hatch lets scripted deploys
      // (rare, by design) skip the interactive prompt. The deploy will still
      // fail downstream on the SSH alias / docker preflight, but the prod
      // gate itself is past — proven by the absence of the "requires
      // interactive confirmation" message and presence of the "Confirmed"
      // log line OR a downstream preflight failure.
      const tmpFile = path.join(os.tmpdir(), `op-prod-ack-${Date.now()}.txt`);
      fs.writeFileSync(tmpFile, 'fake-password\n', { mode: 0o600 });
      try {
        const r = run('bash', ['deploy_to_aws.sh', '--from-csv'], {
          env: {
            AWS_OPERATOR_FILE: tmpFile,
            DEPLOY_TARGET: 'footbag-production',
            FOOTBAG_PROD_DB_REPLACE_ACK: '1',
          },
        });
        // Exit 1 from a downstream preflight (SSH alias resolution against a
        // non-configured 'footbag-production' alias on test runners).
        expect(r.status).toBe(1);
        const combined = (r.stderr ?? '') + (r.stdout ?? '');
        expect(combined).toMatch(/skipping interactive confirmation/);
        expect(combined).not.toMatch(/requires interactive confirmation/);
      } finally {
        fs.unlinkSync(tmpFile);
      }
    },
  );

  it.skipIf(!HAS_DOCKER)(
    '-k against footbag-production skips the DB-replace gate (code-only never touches DB)',
    () => {
      // -k mode does not touch the DB, so the production hard-confirm gate
      // does not fire. The deploy proceeds past the gate and fails later
      // on SSH alias resolution (no footbag-production alias on test runners).
      const tmpFile = path.join(os.tmpdir(), `op-prod-k-${Date.now()}.txt`);
      fs.writeFileSync(tmpFile, 'fake-password\n', { mode: 0o600 });
      try {
        const r = run('bash', ['deploy_to_aws.sh', '-k'], {
          env: {
            AWS_OPERATOR_FILE: tmpFile,
            DEPLOY_TARGET: 'footbag-production',
          },
        });
        // Exits 1 from the SSH alias / docker preflight, not from the gate.
        expect(r.status).toBe(1);
        const combined = (r.stderr ?? '') + (r.stdout ?? '');
        expect(combined).not.toMatch(/PRODUCTION DB-TOUCHING DEPLOY/);
      } finally {
        fs.unlinkSync(tmpFile);
      }
    },
  );

  it.skipIf(!HAS_DOCKER)(
    '-k with non-allowlisted DEPLOY_TARGET exits 1 at the allowlist gate',
    () => {
      // After F.1 prod-plumbing, DEPLOY_TARGET is allowlisted to exactly
      // 'footbag-staging' or 'footbag-production'. Any other value is
      // refused at the entry-point allowlist check, before the SSH-alias
      // resolve preflight ever runs. Substring patterns and typos cannot
      // sneak through.
      const tmpFile = path.join(os.tmpdir(), `op-${Date.now()}.txt`);
      fs.writeFileSync(tmpFile, 'fake-password\n', { mode: 0o600 });
      try {
        const r = run('bash', ['deploy_to_aws.sh', '-k'], {
          env: {
            AWS_OPERATOR_FILE: tmpFile,
            DEPLOY_TARGET: 'this-alias-definitely-does-not-exist-zzz',
          },
        });
        expect(r.status).toBe(1);
        const combined = (r.stderr ?? '') + (r.stdout ?? '');
        expect(combined).toMatch(/DEPLOY_TARGET must be 'footbag-staging' or 'footbag-production'/);
        expect(combined).toMatch(/Recommendation:/);
      } finally {
        fs.unlinkSync(tmpFile);
      }
    },
  );
});

// ── reset-local-db.sh preflight ───────────────────────────────────────────────

describe('scripts/reset-local-db.sh preflight + fixture auto-stage', () => {
  it('exits 1 with "MISSING:" + "Recommendation:" when canonical_input is absent and no fixture stager is present', () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'reset-local-db-'));
    try {
      // Minimal scaffold: copy only the script + schema, and provide no fixture
      // stager. With canonical_input absent and nothing to auto-stage from, the
      // script falls through to the preflight error path.
      fs.mkdirSync(path.join(tmpRoot, 'scripts'), { recursive: true });
      fs.mkdirSync(path.join(tmpRoot, 'database'), { recursive: true });
      fs.copyFileSync(
        path.join(REPO_ROOT, 'scripts/reset-local-db.sh'),
        path.join(tmpRoot, 'scripts/reset-local-db.sh'),
      );
      fs.writeFileSync(path.join(tmpRoot, 'database/schema.sql'), '-- empty\n');

      // CURATOR_SEED=no skips the ffmpeg precondition; this test exercises the
      // canonical_input preflight, which runs before any curator seeding and
      // needs no transcoder, so the assertion holds on hosts without ffmpeg.
      const r = run('bash', ['scripts/reset-local-db.sh'], {
        cwd: tmpRoot,
        env: { CURATOR_SEED: 'no' },
      });
      expect(r.status).toBe(1);
      const combined = (r.stderr ?? '') + (r.stdout ?? '');
      expect(combined).toMatch(/MISSING:/);
      expect(combined).toMatch(/Recommendation:/);
      expect(combined).toMatch(/soup-to-nuts|from-csv/);
    } finally {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    }
  });

  it('auto-invokes the fixture stager when canonical_input is absent but the stager is present', () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'reset-local-db-stage-'));
    try {
      // Scaffold the script plus a stub stager. The stub announces itself and
      // exits non-zero, so the script aborts right after invoking it — enough to
      // prove the auto-stage wiring fires when canonical_input is absent, without
      // running the full multi-loader build.
      fs.mkdirSync(path.join(tmpRoot, 'scripts/ci'), { recursive: true });
      fs.mkdirSync(path.join(tmpRoot, 'database'), { recursive: true });
      fs.copyFileSync(
        path.join(REPO_ROOT, 'scripts/reset-local-db.sh'),
        path.join(tmpRoot, 'scripts/reset-local-db.sh'),
      );
      fs.writeFileSync(path.join(tmpRoot, 'database/schema.sql'), '-- empty\n');
      fs.writeFileSync(
        path.join(tmpRoot, 'scripts/ci/stage_loader_smoke_fixtures.sh'),
        '#!/usr/bin/env bash\necho STUB_STAGER_INVOKED\nexit 1\n',
      );

      // CURATOR_SEED=no skips the ffmpeg precondition; this test exercises the
      // fixture-stager auto-invoke, which runs before any curator seeding and
      // needs no transcoder, so the assertion holds on hosts without ffmpeg.
      const r = run('bash', ['scripts/reset-local-db.sh'], {
        cwd: tmpRoot,
        env: { CURATOR_SEED: 'no' },
      });
      const combined = (r.stderr ?? '') + (r.stdout ?? '');
      expect(combined).toMatch(/STUB_STAGER_INVOKED/);
      expect(r.status).not.toBe(0);
    } finally {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    }
  });
});

// ── run_pipeline.sh identity-lock preflight ───────────────────────────────────

describe('legacy_data/run_pipeline.sh identity-lock preflight', () => {
  it('canonical_only mode exits 1 with identity-lock guidance when v53 CSV missing', () => {
    // Run from a tmpdir with a minimal venv stub so the pipeline aborts at the
    // identity-lock guard rather than at venv setup.
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'run-pipeline-'));
    try {
      fs.mkdirSync(path.join(tmpRoot, '.venv', 'bin'), { recursive: true });
      // The pipeline installs requirements via `.venv/bin/pip` and then sources
      // `.venv/bin/activate` before any Python step, because every stage runs
      // inside the venv. A real venv always ships both; the stub mirrors that.
      // 'activate' is sourced, so an empty file suffices; 'pip' is executed, so
      // it needs a no-op executable — without it the script aborts (command not
      // found) before reaching the identity-lock guard this test exercises.
      fs.writeFileSync(path.join(tmpRoot, '.venv', 'bin', 'activate'), '');
      fs.writeFileSync(path.join(tmpRoot, '.venv', 'bin', 'pip'), '#!/bin/sh\nexit 0\n', {
        mode: 0o755,
      });
      fs.copyFileSync(
        path.join(REPO_ROOT, 'legacy_data/run_pipeline.sh'),
        path.join(tmpRoot, 'run_pipeline.sh'),
      );
      // Stub `python` so the alias-registry preflight (early in the script)
      // doesn't fail before we reach the identity-lock guard. We don't actually
      // get that far in canonical_only mode either, since canonical_only enters
      // run_v0_backbone immediately. Place a no-op script earlier in PATH.
      const stubBin = path.join(tmpRoot, 'stub-bin');
      fs.mkdirSync(stubBin, { recursive: true });
      const stubPy = path.join(stubBin, 'python');
      fs.writeFileSync(stubPy, '#!/bin/sh\nexit 0\n', { mode: 0o755 });

      const r = run('bash', ['run_pipeline.sh', 'canonical_only'], {
        cwd: tmpRoot,
        env: { PATH: `${stubBin}:${process.env.PATH ?? ''}` },
      });
      expect(r.status).toBe(1);
      const combined = (r.stderr ?? '') + (r.stdout ?? '');
      expect(combined).toMatch(/identity-lock|Persons_Truth_Final/i);
      expect(combined).toMatch(/Recommendation:/);
    } finally {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    }
  });
});

// ── remote-half script source guards (static text scan) ──────────────────────
//
// Permanent contract: scripts/internal/deploy-{rebuild,code}-remote.sh refuse
// to write FOOTBAG_DEV_INITIAL_ADMIN_EMAILS into /srv/footbag/env when
// FOOTBAG_ENV is not 'development' or 'staging'. env.ts trips the same boot-
// fail-fast at container start, but the script-level guard is the first line
// of defense and prevents the value from ever landing on disk on a production
// host. Loss of the guard would let a workstation with a non-empty
// .local/initial-admins.txt accidentally seed admin emails on production.

describe('remote-half script production refusal guards (static-text)', () => {
  it.each([
    'scripts/internal/deploy-rebuild-remote.sh',
    'scripts/internal/deploy-code-remote.sh',
  ])('%s contains the FOOTBAG_DEV_INITIAL_ADMIN_EMAILS production-refusal guard', (relPath) => {
    const content = fs.readFileSync(path.join(REPO_ROOT, relPath), 'utf8');
    // The guard refuses any non-development, non-staging FOOTBAG_ENV when
    // the value is non-empty. Match the literal error-message text and the
    // exit so a partial removal still trips the test.
    expect(content).toMatch(/FOOTBAG_DEV_INITIAL_ADMIN_EMAILS is dev\/staging-only/);
    expect(content).toMatch(
      /\[\[\s*-n\s*"\$FOOTBAG_DEV_INITIAL_ADMIN_EMAILS"\s*&&\s*"\$FOOTBAG_ENV"\s*!=\s*"development"\s*&&\s*"\$FOOTBAG_ENV"\s*!=\s*"staging"\s*\]\]/,
    );
  });
});

// ── script 20 graceful skip ───────────────────────────────────────────────────

describe('legacy_data script 20 graceful skip', () => {
  it('exits 0 with skip message when scraped CSV is absent', () => {
    const r = run('python3', [
      'freestyle/loaders/20_link_footbag_org_sources.py',
      '--scraped-csv',
      '/tmp/definitely-does-not-exist-scraped.csv',
      '--db',
      '/tmp/never-touched.db',
    ]);
    expect(r.status).toBe(0);
    const combined = (r.stderr ?? '') + (r.stdout ?? '');
    expect(combined).toMatch(/skip:/);
    expect(combined).toMatch(/script 18/);
  });
});
