/**
 * Integration tests for the workstation-side AWS deploy bash chain.
 *
 * Coverage:
 *   - deploy_to_aws.sh wrapper preflight: --help short-circuit, missing
 *     credential file, missing SSH alias.
 *   - scripts/reset-local-db.sh preflight: missing canonical_input CSVs.
 *   - scripts/deploy-local-data.sh member-intake dispatch: --all-data previews
 *     by default, applies only with --apply-members; the AWS deploy path applies
 *     the intake on any --all-data deploy (the full migration load), and against
 *     production that load rides the typed DB-replace confirmation.
 *   - legacy_data/run_pipeline.sh: identity-lock CSV missing path.
 *   - freestyle/loaders/20_link_footbag_org_sources.py:
 *     graceful skip when scraped_footbag_moves.csv is absent.
 *
 * Strategy: spawn each script as a subprocess against a controlled env and
 * assert exit code + stderr/stdout content. No AWS contact; no host SSH.
 */
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'child_process';

import { SPAWN_GUARD } from '../fixtures/spawnGuard';
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
    ...SPAWN_GUARD,
  });
}

const HAS_DOCKER =
  spawnSync('command', ['-v', 'docker'], { shell: true, ...SPAWN_GUARD }).status === 0;

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

  it('--soup-to-nuts enables the persona seed', () => {
    const r = run('bash', ['scripts/deploy-to-aws.sh', '--soup-to-nuts', '-ny'], {
      input: 'fake-pw\n',
    });
    expect(r.status).toBe(0);
    const combined = (r.stderr ?? '') + (r.stdout ?? '');
    // The persona catalog is code, so it always seeds under a staging rebuild.
    expect(combined).toMatch(/seed personas:\s+yes/);
  });

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
    'production --all-data (full migration load) trips the DB-replace confirmation (no TTY → refuses)',
    () => {
      // --all-data replaces the on-host database and applies the real member
      // intake, so against footbag-production it must ride the same typed
      // confirmation as any other DB-touching deploy. The test environment has
      // no TTY, so the gate refuses before any host contact.
      const tmpFile = path.join(os.tmpdir(), `op-prod-alldata-${Date.now()}.txt`);
      fs.writeFileSync(tmpFile, 'fake-password\n', { mode: 0o600 });
      try {
        const r = run('bash', ['deploy_to_aws.sh', '--all-data'], {
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
      // (rare, by design) skip the interactive prompt. What is under test is
      // the gate decision alone, proven by the absence of the "requires
      // interactive confirmation" message and the presence of the bypass line.
      //
      // Driven as a dry run because the flag being exercised is the one that
      // disarms the production database-replace confirmation. Without it the
      // only thing left between this test and a real production DB replace is
      // whichever preflight happens to fail on the machine running the suite,
      // which is not a safety property at all: on a workstation with the
      // deploy alias configured and no process holding the local database,
      // every preflight passes and the deploy proceeds for real.
      const tmpFile = path.join(os.tmpdir(), `op-prod-ack-${Date.now()}.txt`);
      fs.writeFileSync(tmpFile, 'fake-password\n', { mode: 0o600 });
      try {
        const r = run('bash', ['deploy_to_aws.sh', '--from-csv', '-n'], {
          env: {
            AWS_OPERATOR_FILE: tmpFile,
            DEPLOY_TARGET: 'footbag-production',
            FOOTBAG_PROD_DB_REPLACE_ACK: '1',
          },
        });
        const combined = (r.stderr ?? '') + (r.stdout ?? '');
        expect(combined).toMatch(/skipping interactive confirmation/);
        expect(combined).not.toMatch(/requires interactive confirmation/);
      } finally {
        fs.unlinkSync(tmpFile);
      }
    },
  );

  it.skipIf(!HAS_DOCKER)(
    'code-only against production never trips the database-replace gate',
    () => {
      // The gate fires on modes that replace the host database; a code-only
      // deploy touches no data and must pass straight through it.
      //
      // Asserted in dry-run so the check stays inside the wrapper's own
      // decision logic. Driving a real deploy to observe the same thing makes
      // the result depend on whether the target host happens to be reachable
      // from the machine running the suite, which is a property of the machine
      // rather than of the code.
      const tmpFile = path.join(os.tmpdir(), `op-prod-k-${Date.now()}.txt`);
      fs.writeFileSync(tmpFile, 'fake-password\n', { mode: 0o600 });
      try {
        const r = run('bash', ['deploy_to_aws.sh', '-kny'], {
          env: {
            AWS_OPERATOR_FILE: tmpFile,
            DEPLOY_TARGET: 'footbag-production',
            // A code-only deploy compares the deployed schema against
            // database/schema.sql, and reads the deployed one by opening a
            // real SSH session to the target. A test must never contact a
            // live host, so the wrapper's own skip switch turns that probe
            // off. On a workstation whose ~/.ssh/config resolves the alias,
            // omitting this reaches the running production server.
            FOOTBAG_SKIP_SCHEMA_DRIFT_CHECK: '1',
          },
        });
        const combined = (r.stderr ?? '') + (r.stdout ?? '');
        // The gate runs before the wrapper resolves the deploy alias, so this
        // holds on any machine, with or without a 'footbag-production' stanza
        // in ~/.ssh/config. The deploy plan printed further downstream is
        // deliberately not asserted here: reaching it requires a configured
        // alias, which is a property of the machine rather than of the code.
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

// ── deploy-local-data.sh member-intake dispatch ──────────────────────────────
//
// Contract: the member load writes real member data (emails, dates of birth),
// so it is opt-in. --all-data alone previews the intake (the runner gets
// --load --dry-run); only --all-data --apply-members runs the real load (the
// runner gets --load --apply). The AWS deploy path passes the opt-in on any
// --all-data deploy (the full migration load).

describe('scripts/deploy-local-data.sh member-intake dispatch', () => {
  // Minimal repo scaffold so --all-data passes its preflights and reaches the
  // member-intake dispatch under --dry-run: the gitignored membership roster,
  // a prior intermediate member CSV (so no dump is needed), and the committed
  // canonical_input CSVs the embedded --from-csv build checks for. --dry-run
  // makes every run_or_print step print instead of execute, so the assertion
  // reads which runner invocation WOULD run.
  function scaffoldAllDataRoot(): string {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'footbag-test-deploy-local-'));
    fs.mkdirSync(path.join(tmpRoot, 'scripts'), { recursive: true });
    fs.copyFileSync(
      path.join(REPO_ROOT, 'scripts/deploy-local-data.sh'),
      path.join(tmpRoot, 'scripts/deploy-local-data.sh'),
    );
    const ci = path.join(tmpRoot, 'legacy_data/event_results/canonical_input');
    fs.mkdirSync(ci, { recursive: true });
    for (const f of [
      'events',
      'event_disciplines',
      'event_results',
      'event_result_participants',
      'persons',
    ]) {
      fs.writeFileSync(path.join(ci, `${f}.csv`), 'header\n');
    }
    const membership = path.join(tmpRoot, 'legacy_data/membership/inputs');
    fs.mkdirSync(membership, { recursive: true });
    fs.writeFileSync(path.join(membership, 'membership_input_normalized.csv'), 'header\n');
    const mds = path.join(tmpRoot, 'legacy_data/member_data_scripts/out');
    fs.mkdirSync(mds, { recursive: true });
    fs.writeFileSync(path.join(mds, 'legacy_members_final.csv'), 'header\n');
    return tmpRoot;
  }

  it('--all-data without --apply-members previews the member load (runner gets --load --dry-run)', () => {
    const tmpRoot = scaffoldAllDataRoot();
    try {
      const r = run('bash', ['scripts/deploy-local-data.sh', '--all-data', '--dry-run'], {
        cwd: tmpRoot,
      });
      expect(r.status).toBe(0);
      const combined = (r.stderr ?? '') + (r.stdout ?? '');
      expect(combined).toMatch(/run_legacy_members\.sh --load --dry-run/);
      expect(combined).not.toMatch(/run_legacy_members\.sh --load --apply/);
      expect(combined).toMatch(/member data was NOT loaded/);
    } finally {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    }
  });

  it('--all-data --apply-members runs the real member load (runner gets --load --apply)', () => {
    const tmpRoot = scaffoldAllDataRoot();
    try {
      const r = run(
        'bash',
        ['scripts/deploy-local-data.sh', '--all-data', '--apply-members', '--dry-run'],
        { cwd: tmpRoot },
      );
      expect(r.status).toBe(0);
      const combined = (r.stderr ?? '') + (r.stdout ?? '');
      expect(combined).toMatch(/run_legacy_members\.sh --load --apply/);
      expect(combined).not.toMatch(/run_legacy_members\.sh --load --dry-run/);
    } finally {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    }
  });

  it('--apply-members outside --all-data exits 1 (no other mode carries the member intake)', () => {
    const r = run('bash', ['scripts/deploy-local-data.sh', '--from-csv', '--apply-members'], {});
    expect(r.status).toBe(1);
    const combined = (r.stderr ?? '') + (r.stdout ?? '');
    expect(combined).toMatch(/--apply-members is only meaningful with --all-data/);
  });

  it('--all-data --cutover-clubs exports CLUBS_SEED=no so the dev clubs seed skips', () => {
    const tmpRoot = scaffoldAllDataRoot();
    try {
      const r = run(
        'bash',
        ['scripts/deploy-local-data.sh', '--all-data', '--cutover-clubs', '--dry-run'],
        { cwd: tmpRoot },
      );
      expect(r.status).toBe(0);
      const combined = (r.stderr ?? '') + (r.stdout ?? '');
      expect(combined).toMatch(/CLUBS_SEED=no/);
    } finally {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    }
  });

  it('--all-data without --cutover-clubs keeps the dev clubs seed on', () => {
    const tmpRoot = scaffoldAllDataRoot();
    try {
      const r = run('bash', ['scripts/deploy-local-data.sh', '--all-data', '--dry-run'], {
        cwd: tmpRoot,
      });
      expect(r.status).toBe(0);
      const combined = (r.stderr ?? '') + (r.stdout ?? '');
      expect(combined).not.toMatch(/CLUBS_SEED=no/);
    } finally {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    }
  });

  it('--cutover-clubs outside --all-data exits 1 (the cutover build is the --all-data path)', () => {
    const r = run('bash', ['scripts/deploy-local-data.sh', '--from-csv', '--cutover-clubs'], {});
    expect(r.status).toBe(1);
    const combined = (r.stderr ?? '') + (r.stdout ?? '');
    expect(combined).toMatch(/--cutover-clubs is only meaningful with --all-data/);
  });

  it('deploy-to-aws.sh --all-data dispatches deploy-local-data.sh WITH --apply-members (staging)', () => {
    const r = run('bash', ['scripts/deploy-to-aws.sh', '--all-data', '-ny'], {
      input: 'fake-pw\n',
      env: { DEPLOY_TARGET: 'footbag-staging' },
    });
    expect(r.status).toBe(0);
    const combined = (r.stderr ?? '') + (r.stdout ?? '');
    expect(combined).toMatch(/deploy-local-data\.sh --all-data --apply-members/);
  });

  it('deploy-to-aws.sh --all-data dispatches deploy-local-data.sh WITH --apply-members (production)', () => {
    // --all-data is the full migration load: the member intake is applied and
    // shipped to whichever target the deploy targets. The destructive production
    // database replace itself rides the wrapper's typed confirmation (covered in
    // the deploy_to_aws.sh wrapper suite), so a production member load is the
    // deliberate go-live cutover.
    const r = run('bash', ['scripts/deploy-to-aws.sh', '--all-data', '-ny'], {
      input: 'fake-pw\n',
      env: { DEPLOY_TARGET: 'footbag-production' },
    });
    expect(r.status).toBe(0);
    const combined = (r.stderr ?? '') + (r.stdout ?? '');
    expect(combined).toMatch(/deploy-local-data\.sh --all-data --apply-members/);
  });

  it('run_dev.sh --all-data passes --apply-members to deploy-local-data.sh (static guard)', () => {
    const content = fs.readFileSync(path.join(REPO_ROOT, 'run_dev.sh'), 'utf8');
    expect(content).toMatch(/deploy-local-data\.sh --all-data --apply-members/);
  });
});

// ── reset-local-db.sh preflight ───────────────────────────────────────────────

describe('scripts/reset-local-db.sh preflight', () => {
  it('exits 1 with "MISSING:" + "Recommendation:" when the committed canonical_input is absent', () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'reset-local-db-'));
    try {
      // Minimal scaffold: the script, its cutover-guard dependency (a hard
      // dependency by design: the guard refuses to reset a post-cutover
      // database, so a copy without it must fail rather than skip the check),
      // and the schema. With canonical_input absent, the script falls through
      // to the preflight error path.
      fs.mkdirSync(path.join(tmpRoot, 'scripts/internal'), { recursive: true });
      fs.mkdirSync(path.join(tmpRoot, 'scripts/lib'), { recursive: true });
      fs.mkdirSync(path.join(tmpRoot, 'database'), { recursive: true });
      for (const rel of [
        'scripts/reset-local-db.sh',
        'scripts/internal/assert-db-pre-cutover.sh',
        'scripts/lib/db_cutover_guard.py',
      ]) {
        fs.copyFileSync(path.join(REPO_ROOT, rel), path.join(tmpRoot, rel));
      }
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

// ── no prompt in the wrapper defaults to the destructive answer ──────────────
//
// Permanent contract: no keystroke in the deploy wrapper can select a database
// replacement. A bare invocation states no intent about the database, so on
// schema drift it refuses and names the two explicit commands instead of
// offering a default. Every remaining prompt in the file defaults to no. The
// drift path itself needs a reachable host, so it cannot be executed in CI; what
// is checked here is that no yes-defaulting prompt exists to be reached.

describe('deploy wrapper has no yes-defaulting prompt (static-text)', () => {
  const wrapper = fs.readFileSync(path.join(REPO_ROOT, 'deploy_to_aws.sh'), 'utf8');

  it('offers no [Y/n] prompt anywhere', () => {
    expect(wrapper).not.toMatch(/\[Y\/n\]/);
  });

  it('never re-executes itself as a database rebuild', () => {
    expect(wrapper).not.toMatch(/exec bash "\$0" --from-csv/);
  });

  it('refuses a bare deploy on schema drift and names both explicit choices', () => {
    expect(wrapper).toMatch(/schema drift detected and this deploy states no intent/);
    expect(wrapper).toMatch(/deploy_to_aws\.sh -k\s+ship code only/);
    expect(wrapper).toMatch(/deploy_to_aws\.sh --from-csv rebuild and REPLACE/);
  });
});

// ── deploy provenance, both paths (static text scan) ─────────────────────────
//
// Permanent contract: every deploy records what it shipped to
// /srv/footbag/deployed-from, so "what is running" is a question with an answer
// afterwards rather than an inference. This used to hold on the code-only path
// only, which left the gap on the rebuild path, the one deploy that replaces the
// database and therefore the one after which the question is hardest to answer
// any other way.

describe('deploy provenance is recorded by both deploy paths (static-text)', () => {
  it.each([
    'scripts/deploy-code.sh',
    'scripts/deploy-rebuild.sh',
  ])('%s composes and forwards DEPLOY_PROVENANCE', (relPath) => {
    const content = fs.readFileSync(path.join(REPO_ROOT, relPath), 'utf8');
    expect(content).toMatch(/DEPLOY_PROVENANCE="commit=\$DEPLOY_COMMIT dirty=\$DEPLOY_DIRTY_COUNT/);
    expect(content).toMatch(/printf 'DEPLOY_PROVENANCE=%q\\n'/);
  });

  it.each([
    'scripts/internal/deploy-code-remote.sh',
    'scripts/internal/deploy-rebuild-remote.sh',
  ])('%s writes it to the host, last and world-readable', (relPath) => {
    const content = fs.readFileSync(path.join(REPO_ROOT, relPath), 'utf8');
    expect(content).toMatch(/mv "\$provenance_tmp" \/srv\/footbag\/deployed-from/);
    expect(content).toMatch(/chmod 644 "\$provenance_tmp"/);
  });
});

// ── wrapper-side production gate (static text scan) ──────────────────────────
//
// The remote-half refusal above is the backstop, and it fires late: by the time
// it runs, the release has been promoted and the host env file rewritten, so a
// production deploy from a workstation holding a non-empty
// .local/initial-admins.txt aborts with the declared state and the running state
// disagreeing. Permanent contract: both wrappers stop reading the file at all
// when the target is production, so the value is never sent and the backstop is
// never reached in normal operation.

describe('deploy wrappers do not read the dev admin allowlist for production (static-text)', () => {
  it.each([
    'scripts/deploy-rebuild.sh',
    'scripts/deploy-code.sh',
  ])('%s clears the allowlist path when the target is production', (relPath) => {
    const content = fs.readFileSync(path.join(REPO_ROOT, relPath), 'utf8');
    expect(content).toMatch(
      /if\s*\[\[\s*"\$REMOTE"\s*==\s*"footbag-production"\s*\]\];\s*then\s*\n\s*LOCAL_ADMIN_FILE=""/,
    );
    // The read itself must be conditional on the path still being set, or
    // clearing it above achieves nothing.
    expect(content).toMatch(/\[\[\s*-n\s*"\$LOCAL_ADMIN_FILE"\s*&&\s*-f\s*"\$LOCAL_ADMIN_FILE"\s*\]\]/);
  });
});

// ── stub webhook signing secret (static-text) ────────────────────────────────

describe('deploy-rebuild-remote.sh stub webhook signing secret', () => {
  // The stub adapter's built-in signing secret is committed source, so every
  // host that runs the stub gets its own generated value instead. Seeding it
  // must stay idempotent: regenerating it would start rejecting deliveries
  // already configured against the old one.
  it('seeds a generated STRIPE_WEBHOOK_SECRET_STUB once, only on non-production hosts', () => {
    const content = fs.readFileSync(
      path.join(REPO_ROOT, 'scripts/internal/deploy-rebuild-remote.sh'),
      'utf8',
    );
    expect(content).toMatch(/if\s*!\s*grep -q '\^STRIPE_WEBHOOK_SECRET_STUB=' "\$ENV_PATH"; then/);
    expect(content).toMatch(/whsec_stub_%s\\n' "\$\(openssl rand -hex 24\)"/);

    // The seed lives inside the same non-production block that seeds the stub
    // adapter itself; a production host is operator-configured.
    const guard = content.indexOf('if [[ "$FOOTBAG_ENV_VAL" != "production" ]]; then');
    const seed = content.indexOf('STRIPE_WEBHOOK_SECRET_STUB=whsec_stub_');
    expect(guard).toBeGreaterThan(-1);
    expect(seed).toBeGreaterThan(guard);
    expect(content.slice(guard, seed)).not.toMatch(/^fi$/m);
  });
});

// ── log level from Parameter Store (static-text) ─────────────────────────────

describe('deploy-rebuild-remote.sh log-level sync', () => {
  // The log level decides which lines reach CloudWatch, so the declared value
  // has to be the value that runs. Sourcing it from Parameter Store at deploy
  // time is what makes a change to the declaration take effect, instead of the
  // host keeping whatever a past operator typed into its env file.
  const content = fs.readFileSync(
    path.join(REPO_ROOT, 'scripts/internal/deploy-rebuild-remote.sh'),
    'utf8',
  );

  it('fetches the log level from the environment app parameter, undecrypted', () => {
    expect(content).toMatch(
      /ssm_log_level_param="\/footbag\/\$\{FOOTBAG_ENV_VAL\}\/app\/log_level"/,
    );
    const fetchBlock = content.slice(
      content.indexOf('LOG_LEVEL_VAL=$('),
      content.indexOf('if [[ ! "$LOG_LEVEL_VAL"'),
    );
    expect(fetchBlock).toMatch(/aws ssm get-parameter/);
    expect(fetchBlock).toMatch(/--name "\$ssm_log_level_param"/);
    // A String parameter: asking for decryption of one that is not encrypted is
    // a different request shape and a different IAM requirement.
    expect(fetchBlock).not.toMatch(/--with-decryption/);
  });

  it('refuses a value the runtime would not understand', () => {
    expect(content).toMatch(/\^\(error\|warn\|info\|debug\)\$/);
  });

  it('writes the value into the host env file through the restricted-temp swap', () => {
    const writeBlock = content.slice(
      content.indexOf("grep -v '^LOG_LEVEL=' \"$ENV_PATH\""),
    );
    expect(writeBlock).toMatch(/printf 'LOG_LEVEL=%s\\n' "\$LOG_LEVEL_VAL" >> "\$env_tmp"/);
    expect(writeBlock).toMatch(/mv "\$env_tmp" "\$ENV_PATH"/);
    expect(writeBlock).toMatch(/chmod 600 "\$ENV_PATH"/);
  });

  it('no longer demands a hand-written log level on the host', () => {
    expect(content).not.toMatch(/require_env LOG_LEVEL/);
  });
});

describe('deploy-code-remote.sh log-level sync', () => {
  // The code-only half must carry the same sync: without it, a code-only
  // deploy after an SSM log-level change leaves the host at a stale level,
  // and production's warn floor decides whether the metric filters see
  // anything at all.
  const content = fs.readFileSync(
    path.join(REPO_ROOT, 'scripts/internal/deploy-code-remote.sh'),
    'utf8',
  );

  it('fetches the log level from the environment app parameter, undecrypted', () => {
    expect(content).toMatch(
      /ssm_log_level_param="\/footbag\/\$\{FOOTBAG_ENV_VAL\}\/app\/log_level"/,
    );
    const fetchBlock = content.slice(
      content.indexOf('LOG_LEVEL_VAL=$('),
      content.indexOf('if [[ ! "$LOG_LEVEL_VAL"'),
    );
    expect(fetchBlock).toMatch(/aws ssm get-parameter/);
    expect(fetchBlock).toMatch(/--name "\$ssm_log_level_param"/);
    expect(fetchBlock).not.toMatch(/--with-decryption/);
  });

  it('refuses a value the runtime would not understand', () => {
    expect(content).toMatch(/\^\(error\|warn\|info\|debug\)\$/);
  });

  it('writes the value into the host env file through the restricted-temp swap', () => {
    const writeBlock = content.slice(
      content.indexOf("grep -v '^LOG_LEVEL=' \"$ENV_PATH\""),
    );
    expect(writeBlock).toMatch(/printf 'LOG_LEVEL=%s\\n' "\$LOG_LEVEL_VAL" >> "\$env_tmp"/);
    expect(writeBlock).toMatch(/mv "\$env_tmp" "\$ENV_PATH"/);
    expect(writeBlock).toMatch(/chmod 600 "\$ENV_PATH"/);
  });
});

describe('Stripe webhook-secret sync from Parameter Store (both remote halves)', () => {
  // The webhook signing secrets reach the host env only through the deploy
  // sync, never by hand-paste. A placeholder value clears the env line; a
  // stub-prefixed value on production is refused outright.
  const halves = [
    'scripts/internal/deploy-rebuild-remote.sh',
    'scripts/internal/deploy-code-remote.sh',
  ].map((p) => ({
    file: p,
    content: fs.readFileSync(path.join(REPO_ROOT, p), 'utf8'),
  }));

  it.each(halves)('$file syncs both webhook secrets on production only', ({ content }) => {
    expect(content).toMatch(/sync_stripe_webhook_secret STRIPE_WEBHOOK_SECRET stripe_webhook_secret/);
    expect(content).toMatch(
      /sync_stripe_webhook_secret STRIPE_WEBHOOK_SECRET_PREVIOUS stripe_webhook_secret_previous/,
    );
    // The sync lives inside the production-only derivation block.
    const gate = content.indexOf('if [[ "$FOOTBAG_ENV_VAL" == "production" ]]; then');
    const sync = content.indexOf('sync_stripe_webhook_secret()');
    expect(gate).toBeGreaterThan(-1);
    expect(sync).toBeGreaterThan(gate);
  });

  it.each(halves)('$file refuses a stub-prefixed secret and clears a placeholder', ({ content }) => {
    expect(content).toMatch(/whsec_stub\* \]\]/);
    expect(content).toMatch(/TODO-\* \]\]; then value=""/);
  });

  // A failed Parameter Store read and a placeholder value are different facts.
  // Treating them alike leaves a stale signing secret on a host the same deploy
  // is arming, and reports success. Every other parameter read in these scripts
  // aborts on a failed call; this one must too, while the placeholder keeps its
  // deliberate leave-alone behaviour.
  it.each(halves)('$file aborts on a failed read rather than continuing', ({ content }) => {
    expect(content).toMatch(/if ! value=\$\(/);
    expect(content).toMatch(/ERROR: could not read \$param from Parameter Store/);
    expect(content).not.toMatch(/\) \|\| value=""/);
    // The placeholder branch must no longer claim to cover an unreadable value.
    expect(content).not.toMatch(/still the placeholder or unreadable/);
  });
});

describe('production database-replacement ack threading', () => {
  // The typed REPLACE PRODUCTION DB confirmation lives in the wrapper; the
  // leaf refuses a production run without the threaded ack, so a direct leaf
  // invocation with piped stdin cannot bypass the confirmation.
  it('the wrapper exports the ack only after the confirmation path', () => {
    const wrapper = fs.readFileSync(path.join(REPO_ROOT, 'deploy_to_aws.sh'), 'utf8');
    expect(wrapper).toMatch(/export FOOTBAG_PROD_DB_REPLACE_ACK=1/);
  });

  it('the leaf refuses FOOTBAG_ENV=production without the ack', () => {
    const leaf = fs.readFileSync(
      path.join(REPO_ROOT, 'scripts/deploy-rebuild.sh'),
      'utf8',
    );
    expect(leaf).toMatch(
      /"\$FOOTBAG_ENV" == "production" && "\$\{FOOTBAG_PROD_DB_REPLACE_ACK:-\}" != "1"/,
    );
    expect(leaf).toMatch(/production database replacement requires the deploy_to_aws\.sh confirmation/);
  });
});

describe('deploy-rebuild-remote.sh guard handshake', () => {
  // The destructive remote half must never run without the guard chain the
  // caller prepends into the same shell stream; the production-live guard
  // sets the handshake as its last act.
  it('the guard sets the handshake after its checks', () => {
    const guard = fs.readFileSync(
      path.join(REPO_ROOT, 'scripts/internal/deploy-rebuild-production-live-guard.sh'),
      'utf8',
    );
    expect(guard.trimEnd()).toMatch(/PROD_LIVE_GUARD_RAN=1$/);
  });

  it('a direct invocation of the remote half refuses before touching anything', () => {
    const res = spawnSync(
      'bash',
      [path.join(REPO_ROOT, 'scripts/internal/deploy-rebuild-remote.sh')],
      { encoding: 'utf8', env: { ...process.env, PROD_LIVE_GUARD_RAN: '' }, ...SPAWN_GUARD },
    );
    expect(res.status).toBe(1);
    expect(res.stderr).toContain('the deploy guards did not run in this shell');
  });
});

describe('arming-switch sync and production adapter derivation (both remote halves)', () => {
  // The arming switches declare whether a real-world side (payments, email)
  // is armed; every deploy makes the declared SSM value the running value,
  // and on production derives the adapters from it (armed -> live,
  // dark -> stub) so the host can never disagree with the declared state.
  // Both deploy halves carry the sync so an arming change rides either mode.
  const halves = [
    'scripts/internal/deploy-rebuild-remote.sh',
    'scripts/internal/deploy-code-remote.sh',
  ].map((p) => ({
    file: p,
    content: fs.readFileSync(path.join(REPO_ROOT, p), 'utf8'),
  }));

  it('fetches both switches from the environment app parameters, undecrypted and required', () => {
    for (const { file, content } of halves) {
      expect(content, file).toMatch(
        /ssm_payments_armed_param="\/footbag\/\$\{FOOTBAG_ENV_VAL\}\/app\/payments_armed"/,
      );
      expect(content, file).toMatch(
        /ssm_email_send_armed_param="\/footbag\/\$\{FOOTBAG_ENV_VAL\}\/app\/email_send_armed"/,
      );
      const paymentsBlock = content.slice(
        content.indexOf('PAYMENTS_ARMED_VAL=$('),
        content.indexOf('if [[ ! "$PAYMENTS_ARMED_VAL"'),
      );
      expect(paymentsBlock, file).toMatch(/aws ssm get-parameter/);
      expect(paymentsBlock, file).not.toMatch(/--with-decryption/);
      // Required-parameter shape: a fetch failure is a hard error pointing at
      // terraform apply, never a silent skip.
      expect(paymentsBlock, file).toMatch(/exit 1/);
    }
  });

  it('refuses a switch value the runtime would not understand', () => {
    for (const { file, content } of halves) {
      const matches = content.match(/\^\(armed\|dark\)\$/g) ?? [];
      expect(matches.length, file).toBeGreaterThanOrEqual(2);
    }
  });

  it('writes both switches into the host env file through the restricted-temp swap', () => {
    for (const { file, content } of halves) {
      expect(content, file).toMatch(/printf 'PAYMENTS_ARMED=%s\\n' "\$PAYMENTS_ARMED_VAL" >> "\$env_tmp"/);
      expect(content, file).toMatch(/printf 'EMAIL_SEND_ARMED=%s\\n' "\$EMAIL_SEND_ARMED_VAL" >> "\$env_tmp"/);
    }
  });

  it('derives the production adapters from the switches, production only', () => {
    for (const { file, content } of halves) {
      const deriveBlock = content.slice(
        content.indexOf('SES_ADAPTER_DERIVED='),
        content.indexOf('printf \'PAYMENT_ADAPTER=%s\\n\' "$PAYMENT_ADAPTER_DERIVED"'),
      );
      expect(deriveBlock.length, file).toBeGreaterThan(0);
      const gate = content.slice(0, content.indexOf('SES_ADAPTER_DERIVED='));
      expect(gate, file).toMatch(/FOOTBAG_ENV_VAL" == "production"/);
      expect(content, file).toMatch(/\[\[ "\$EMAIL_SEND_ARMED_VAL" == "armed" \]\] && SES_ADAPTER_DERIVED='live'/);
      expect(content, file).toMatch(/\[\[ "\$PAYMENTS_ARMED_VAL" == "armed" \]\] && PAYMENT_ADAPTER_DERIVED='live'/);
    }
  });

  it('seeds a host-unique stub webhook secret on a dark production payment side', () => {
    for (const { file, content } of halves) {
      const darkSeed = content.slice(content.indexOf("PAYMENT_ADAPTER_DERIVED\" == \"stub\""));
      expect(darkSeed, file).toMatch(/STRIPE_WEBHOOK_SECRET_STUB=whsec_stub_/);
      expect(darkSeed, file).toMatch(/openssl rand -hex 24/);
    }
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
    // The skip message points the operator at the scrape script that populates the CSV.
    expect(combined).toMatch(/18_scrape_footbag_org_moves/);
  });
});

describe('schema-drift guards can actually fire, and gate only what they should', () => {
  const wrapperSrc = fs.readFileSync(path.join(REPO_ROOT, 'deploy_to_aws.sh'), 'utf-8');

  it('the local drift check gates only the mode that ships a database it did not build', () => {
    // --from-csv, --soup-to-nuts, --db-only and --all-data all drop the file and
    // reapply schema.sql, so drift in the current file is what they are about to
    // fix. Gating them refused a deploy for not having done the thing it was
    // about to do, and sent the operator to run the rebuild by hand first.
    const gate = wrapperSrc.slice(wrapperSrc.indexOf('# Schema-drift preflight'));
    const condition = gate.slice(0, gate.indexOf('then'));
    expect(condition).toMatch(/MODE_REUSE == 1/);
    expect(condition).not.toMatch(/DB_REBUILD_INVOLVED/);
  });

  it('the local drift remedy never sends a maintainer to the CI-only loader', () => {
    // reset-local-db.sh is forbidden on a workstation holding the real
    // legacy_data tree; recommending it there is worse than not warning at all.
    const gate = wrapperSrc.slice(wrapperSrc.indexOf('database/footbag.db schema is out of sync'));
    const branch = gate.slice(0, gate.indexOf('exit 1'));
    expect(branch).not.toMatch(/reset-local-db\.sh/);
    expect(branch).toMatch(/deploy_to_aws\.sh --from-csv/);
    expect(branch).toMatch(/deploy-local-data\.sh --from-csv/);
  });

  it('the host drift check reads the database through the container, not the host', () => {
    // /srv/footbag/env is root:root 0600 and the database is 0600 owned by
    // another account, so the previous plain-ssh read exited before reading
    // anything and the check reported "could not read" on every deploy. A guard
    // that cannot fire is worse than none: its silence reads as agreement.
    const check = wrapperSrc.slice(wrapperSrc.indexOf('# Code-only schema-sync'));
    const block = check.slice(0, check.indexOf('_expected_fp'));
    expect(block).not.toMatch(/grep -E "\^FOOTBAG_DB_PATH=" \/srv\/footbag\/env/);
    expect(check).toMatch(/docker exec -i "\$c" node/);
    expect(check).toMatch(/host-db-fingerprint\.js/);
  });

  it('the fingerprint body exists and reports failures rather than an empty result', () => {
    // An empty fingerprint compared against a real one reads as total drift; an
    // empty one on both sides would read as agreement. Neither may happen
    // silently, so every failure path exits non-zero with a reason.
    const js = fs.readFileSync(
      path.join(REPO_ROOT, 'scripts/internal/host-db-fingerprint.js'),
      'utf-8',
    );
    expect(js).toMatch(/FOOTBAG_DB_PATH is not set/);
    expect(js).toMatch(/better-sqlite3 unavailable/);
    expect(js).toMatch(/reported no tables/);
    expect(js).toMatch(/process\.exit\(9\)/);
    // Tables and columns only: indexes and triggers cannot cause the
    // missing-column crash this guards against.
    expect(js).toMatch(/m\.type = 'table'/);
  });
});

describe('the local image build satisfies every hard-required compose variable', () => {
  // `docker compose build` interpolates the whole file before it builds, so a
  // variable the base compose declares with ${VAR:?} aborts the build when
  // unset, even though none of these is ever baked into an image. Both deploy
  // halves build with the base compose only and must therefore supply every one
  // of them as a throwaway.
  //
  // This is not hypothetical: the halves supplied one of the two and missed the
  // other, so a deploy from a shell without that value in its environment failed
  // at the build step with a message about a runtime secret, which reads as a
  // misconfigured workstation rather than a missing placeholder.
  const read = (p: string) => fs.readFileSync(path.join(REPO_ROOT, p), 'utf-8');

  const required = [
    ...new Set(
      [...read('docker/docker-compose.yml').matchAll(/\$\{([A-Z_]+):\?/g)].map((m) => m[1]),
    ),
  ].sort();

  it('finds the hard-required set in the base compose', () => {
    expect(required.length, 'no ${VAR:?} found; the extractor has drifted').toBeGreaterThan(0);
  });

  it.each([
    'scripts/deploy-code.sh',
    'scripts/deploy-rebuild.sh',
  ])('%s supplies every one of them to the build', (file) => {
    const source = read(file);
    const buildAt = source.indexOf('docker compose \\');
    expect(buildAt, `${file} has no compose build invocation`).toBeGreaterThan(-1);
    // The assignments sit immediately before the command on the same statement.
    const preamble = source.slice(Math.max(0, buildAt - 600), buildAt);
    required.forEach((name) => {
      expect(preamble, `${file} does not set ${name} for the local build`).toContain(`${name}=`);
    });
  });
});

describe('both deploy halves sync the same Parameter Store set', () => {
  // The two halves are edited independently and had already drifted more than
  // once: the captcha reconcile existed only in the code half, the media bucket
  // only in the rebuild half, and the mail configuration-set sync only in the
  // code half. Nothing failed in any of those cases — a host simply came up
  // missing a value depending on which deploy stood it up. This pins the set of
  // parameters each half reads so the next divergence is a red test rather than
  // a host that behaves differently from its twin.
  const read = (p: string) => fs.readFileSync(path.join(REPO_ROOT, p), 'utf-8');

  function syncedParameters(file: string): string[] {
    const matches = read(file).matchAll(/\/footbag\/\$\{FOOTBAG_ENV_VAL\}\/([^"']+)/g);
    return [...new Set([...matches].map((m) => m[1]))].sort();
  }

  it('reads an identical list of parameter paths', () => {
    const code = syncedParameters('scripts/internal/deploy-code-remote.sh');
    const rebuild = syncedParameters('scripts/internal/deploy-rebuild-remote.sh');
    expect(code.length, 'the code half syncs no parameters at all').toBeGreaterThan(0);
    expect(rebuild).toEqual(code);
  });

  it('covers both link-protection switches', () => {
    const code = syncedParameters('scripts/internal/deploy-code-remote.sh');
    expect(code).toContain('app/url_screening_armed');
    expect(code).toContain('app/reachability_armed');
  });

  // The two identifiers are synced by a loop whose parameter name comes from a
  // shell variable, so the path extractor above sees one template string in both
  // halves and would stay green if one half lost an identifier or wrote it to a
  // different variable. Parse the loop's word list instead of its interpolated
  // path, or this pair is unprotected while appearing covered.
  function identifierPairs(file: string): string[] {
    const line = read(file)
      .split('\n')
      .find((l) => l.includes('for host_ident in '));
    expect(line, `${file} has no identifier sync loop`).toBeDefined();
    return (line as string)
      .replace(/^.*for host_ident in /, '')
      .replace(/;.*$/, '')
      .trim()
      .split(/\s+/)
      .sort();
  }

  it('syncs the same identifier list, parsed from the loop rather than its template', () => {
    const code = identifierPairs('scripts/internal/deploy-code-remote.sh');
    const rebuild = identifierPairs('scripts/internal/deploy-rebuild-remote.sh');
    expect(code).toEqual(rebuild);
    expect(code).toContain('media_bucket:MEDIA_STORAGE_S3_BUCKET');
    expect(code).toContain('jwt_kms_key_id:JWT_KMS_KEY_ID');
  });
});

describe('both deploy paths start from an empty upload directory', () => {
  // Both paths rsync into the same directory on the host, and an rsync is
  // incremental: it compares against whatever is already there. A path that
  // uploaded into a directory the previous deploy left behind would ship a tree
  // that is part this release and part the last one, and the mismatch surfaces
  // far downstream as a host preflight refusing for a file it believes it sent.
  // Both currently clear first. This pins that, and pins the ordering, because
  // a clear placed after the upload is worse than none at all.
  const read = (p: string) => fs.readFileSync(path.join(REPO_ROOT, p), 'utf-8');

  it.each(['scripts/deploy-code.sh', 'scripts/deploy-rebuild.sh'])(
    '%s clears the upload directory before its rsync',
    (file) => {
      const source = read(file);
      // The two spell the destination differently (a literal path, and the
      // REMOTE_RELEASE_DIR variable holding the same path), so match the clear
      // itself rather than either spelling.
      const wipeAt = source.search(/rm -rf (~\/footbag-release|"?\$REMOTE_RELEASE_DIR)/);
      const rsyncAt = source.indexOf('rsync -av --delete');
      expect(wipeAt, `${file} never clears the upload directory`).toBeGreaterThan(-1);
      expect(rsyncAt, `${file} has no upload rsync`).toBeGreaterThan(-1);
      expect(wipeAt, `${file} clears the directory after uploading into it`).toBeLessThan(rsyncAt);
    },
  );
});

describe('the removed one-shot seeds stay removed', () => {
  // Each of these was a seed that fired only when its line was absent, which
  // made the value owned by whoever last edited the host from then on. They were
  // replaced by two real owners: the committed per-environment host config for
  // the constants, and derivation from an arming switch for the two protective
  // selectors. Re-adding one would restore dual ownership silently — the seed
  // and the new owner would both write, in an order nobody declared, and nothing
  // would fail. Only this test would.
  const read = (p: string) => fs.readFileSync(path.join(REPO_ROOT, p), 'utf-8');
  const HALVES = ['scripts/internal/deploy-code-remote.sh', 'scripts/internal/deploy-rebuild-remote.sh'];
  const RETIRED = [
    'MEDIA_STORAGE_ADAPTER',
    'MEDIA_STORAGE_S3_BUCKET',
    'SECRETS_ADAPTER',
    'SAFE_BROWSING_ADAPTER',
    'HTTP_REACHABILITY_ADAPTER',
    'CAPTCHA_ADAPTER',
  ];

  it.each(HALVES)('%s seeds none of them on absence', (file) => {
    const source = read(file);
    RETIRED.forEach((name) => {
      // The seed shape is an absence test guarding a write. Deriving a value and
      // writing it unconditionally is fine and is what replaced these.
      const seedShape = new RegExp(`if ! grep -q ['"]\\^${name}=`);
      expect(source, `${file} re-introduced a one-shot seed for ${name}`).not.toMatch(seedShape);
    });
  });

  it.each(HALVES)('%s still writes the two derived selectors unconditionally', (file) => {
    const source = read(file);
    expect(source).toMatch(/printf 'SAFE_BROWSING_ADAPTER=%s\\n' "\$SAFE_BROWSING_ADAPTER_DERIVED"/);
    expect(source).toMatch(
      /printf 'HTTP_REACHABILITY_ADAPTER=%s\\n' "\$HTTP_REACHABILITY_ADAPTER_DERIVED"/,
    );
  });

  it.each(HALVES)('%s derives them outside any production-only gate', (file) => {
    // Payments and mail derive on production alone, because below it the stub
    // mandates apply whatever the switch says. These two decide in every
    // deployed environment, so a production gate around them would leave staging
    // holding whatever it happened to hold.
    const source = read(file);
    const deriveAt = source.indexOf('SAFE_BROWSING_ADAPTER_DERIVED=');
    expect(deriveAt).toBeGreaterThan(-1);
    const before = source.slice(0, deriveAt);
    const lastProdGate = before.lastIndexOf('FOOTBAG_ENV_VAL" == "production"');
    if (lastProdGate > -1) {
      // A production gate exists earlier in the file; it must have closed before
      // the derivation, otherwise the derivation sits inside it.
      expect(before.slice(lastProdGate)).toMatch(/^fi$/m);
    }
  });
});

describe('container-sizing allowlists agree across both deploys and the verifier', () => {
  // Three lists decide which committed sizing values reach a host, and they had
  // drifted: the rebuild deploy accepted eight keys where the code deploy
  // accepted eleven. A host stood up by a rebuild therefore never received
  // VIDEO_MAX_HEIGHT and encoded at full source height on an instance sized for
  // 720p, and the verifier checked the same eight and could not see it. Nothing
  // errored in any of the three.
  const readFile = (p: string) => fs.readFileSync(path.join(REPO_ROOT, p), 'utf-8');

  const EXPECTED = [
    'NGINX_MEMORY_LIMIT',
    'WEB_MEMORY_LIMIT',
    'WORKER_MEMORY_LIMIT',
    'IMAGE_MEMORY_LIMIT',
    'IMAGE_MAX_CONCURRENT',
    'VIDEO_X264_PRESET',
    'VIDEO_X264_THREADS',
    'VIDEO_X264_RC_LOOKAHEAD',
    'VIDEO_MAX_HEIGHT',
    'FFMPEG_TIMEOUT_SECONDS',
    'VIDEO_TRANSCODE_TIMEOUT_MS',
    'VIDEO_MIN_HOST_AVAILABLE_MB',
    'MEDIA_STORAGE_ADAPTER',
    'SECRETS_ADAPTER',
    'JWT_SIGNER',
    'CAPTCHA_ADAPTER',
    'TURNSTILE_SITE_KEY',
  ];

  function allowlistRegex(file: string): string {
    const line = readFile(file)
      .split('\n')
      .find((l) => l.includes("local key_re='"));
    expect(line, `${file} has no key_re allowlist`).toBeDefined();
    return line as string;
  }

  it('both deploy halves seed exactly the same key set', () => {
    expect(allowlistRegex('scripts/internal/deploy-rebuild-remote.sh').trim()).toBe(
      allowlistRegex('scripts/internal/deploy-code-remote.sh').trim(),
    );
  });

  it('the deploy allowlist names every key the committed env files can set', () => {
    const re = allowlistRegex('scripts/internal/deploy-code-remote.sh');
    EXPECTED.forEach((key) => {
      // The memory limits and x264 knobs are matched by grouped alternations,
      // so check the distinctive part of each name.
      const needle = key.replace(/^(NGINX|WEB|WORKER|IMAGE)_MEMORY_LIMIT$/, '_MEMORY_LIMIT')
        .replace(/^VIDEO_X264_(.+)$/, '$1');
      expect(re, `${key} missing from the deploy allowlist`).toContain(needle);
    });
  });

  // The committed file carries two kinds of value, checked by the verifier in
  // two different ways: sizing keys go through its sizing array, while the
  // adapter selectors get their own assertions because each has one correct
  // value rather than a shape.
  const SELECTOR_KEYS = [
    'MEDIA_STORAGE_ADAPTER',
    'SECRETS_ADAPTER',
    'JWT_SIGNER',
    'CAPTCHA_ADAPTER',
    // The public captcha site key is not a selector, but it is checked the same
    // way and for the same reason: one correct value per environment rather
    // than a shape, and a production host that lacks it does not boot.
    'TURNSTILE_SITE_KEY',
  ];
  const SIZING_ONLY = EXPECTED.filter((k) => !SELECTOR_KEYS.includes(k));

  it('the verifier checks every sizing key the deploys can seed', () => {
    const source = readFile('scripts/verify-host-env.sh');
    const block = source.slice(source.indexOf('SIZING_KEYS=('));
    const list = block.slice(0, block.indexOf(')'));
    SIZING_ONLY.forEach((key) => {
      expect(list, `${key} missing from the verifier's sizing checks`).toContain(key);
    });
  });

  it('the verifier checks every adapter selector the deploys reconcile', () => {
    const source = readFile('scripts/verify-host-env.sh');
    SELECTOR_KEYS.forEach((key) => {
      expect(source, `${key} is reconciled onto hosts but the verifier never reads it`).toContain(
        `"${key}"`,
      );
    });
  });

  it('every sizing key the committed staging env file sets is covered', () => {
    // The concrete case that exposed the drift.
    const staging = readFile('docker/env/staging.env');
    const setKeys = staging
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('#') && l.includes('='))
      .map((l) => l.split('=')[0]);
    const sizing = setKeys.filter((k) => EXPECTED.includes(k));
    expect(sizing).toContain('VIDEO_MAX_HEIGHT');
    const re = allowlistRegex('scripts/internal/deploy-rebuild-remote.sh');
    sizing.forEach((k) => {
      const needle = k.replace(/^(NGINX|WEB|WORKER|IMAGE)_MEMORY_LIMIT$/, '_MEMORY_LIMIT')
        .replace(/^VIDEO_X264_(.+)$/, '$1');
      expect(re, `${k} is set in docker/env/staging.env but a rebuild deploy drops it`).toContain(needle);
    });
  });
});

describe('both deploy halves leave a host able to survive on its own', () => {
  // These steps are what turn a bare instance into a host that keeps running:
  // a disk swap valve, the compressed-swap suppression that makes the valve
  // reachable, a unit enabled for boot, the backup units, and the log-shipping
  // driver the alarms read. Each lived in exactly one half, so which of the two
  // an operator happened to run first silently decided whether the host got
  // them. A rebuild-first host had no swap and came back empty from its first
  // reboot; a code-first host shipped no container logs at all.
  //
  // Pinned per half rather than as one shared block because the two remote
  // bodies arrive on the target shell's stdin and cannot source a library, so
  // duplication is the only mechanism available and a test is the only thing
  // that keeps the copies honest.
  const HALVES = [
    'scripts/internal/deploy-code-remote.sh',
    'scripts/internal/deploy-rebuild-remote.sh',
  ];
  const read = (p: string) => fs.readFileSync(path.join(REPO_ROOT, p), 'utf-8');

  it.each(HALVES)('%s provisions the disk swapfile', (file) => {
    const source = read(file);
    expect(source).toContain('mkswap /swapfile');
    expect(source).toContain('swapon /swapfile');
    expect(source).toContain('/swapfile none swap sw 0 0');
    expect(source).toContain('vm.swappiness=10');
  });

  it.each(HALVES)('%s suppresses the compressed in-RAM swap below production', (file) => {
    const source = read(file);
    expect(source).toContain('/etc/systemd/zram-generator.conf');
    // Suppression must stay scoped: production has the memory to spare and
    // keeps the vendor default, so an unguarded version would change a host
    // this was never measured against.
    expect(source).toMatch(/ensure_zram_disabled\(\)\s*\{\s*\n\s*if \[\[ "\$FOOTBAG_ENV" == "production" \]\]/);
  });

  it.each(HALVES)('%s enables the service for boot, not merely starts it', (file) => {
    expect(read(file)).toContain('systemctl is-enabled --quiet footbag || systemctl enable footbag');
  });

  it.each(HALVES)('%s reinstalls the backup units without enabling the timer', (file) => {
    const source = read(file);
    expect(source).toContain('ops/systemd/footbag-backup.service');
    expect(source).toContain('ops/systemd/footbag-backup.timer');
    // First-time enablement is a separate deliberate operator procedure. A
    // deploy that switched backups on would make the timer's existence depend
    // on when someone last deployed.
    expect(source).toContain('systemctl is-enabled --quiet footbag-backup.timer');
    expect(source).not.toMatch(/systemctl enable footbag-backup\.timer/);
  });

  it.each(HALVES)('%s installs the container log-shipping driver', (file) => {
    const source = read(file);
    expect(source).toContain('/etc/systemd/system/docker.service.d/awslogs.conf');
    expect(source).toContain('-logs-publisher');
    expect(source).toContain('AWS_SDK_LOAD_CONFIG=1');
  });

  it.each(HALVES)('%s does all of it before restarting the service', (file) => {
    const source = read(file);
    const restartAt = source.search(/systemctl (restart|start) footbag\b(?!-)/);
    expect(restartAt, `${file} never restarts the service`).toBeGreaterThan(-1);
    // Ordering is the half of this that a presence check cannot see. Containers
    // are budgeted against the sizing seed on the assumption the swap valve is
    // already there, and the log driver can only attach to a container at
    // creation, so a step that lands after the restart is a step that does not
    // take effect until the next deploy.
    const mustPrecede = [
      'mkswap /swapfile',
      '/etc/systemd/zram-generator.conf',
      'systemctl is-enabled --quiet footbag || systemctl enable footbag',
      '/etc/systemd/system/docker.service.d/awslogs.conf',
    ];
    mustPrecede.forEach((needle) => {
      const at = source.indexOf(needle);
      expect(at, `${file} is missing: ${needle}`).toBeGreaterThan(-1);
      expect(at, `${file} does "${needle}" after the service restart`).toBeLessThan(restartAt);
    });
  });

  it.each(HALVES)('%s sweeps its env-file temp copies on every exit path', (file) => {
    const source = read(file);
    // Each half stages dozens of full copies of the host env file through a
    // temp file and relies on the following rename to remove it. An
    // interruption between the two leaves a complete copy of the session
    // signing key, the worker channel secret and the origin-verify secret on
    // the host, which nothing else looks for or cleans up.
    expect(source).toContain('trap cleanup_env_tempfiles EXIT');
    expect(source).toContain('/srv/footbag/.env.tmp.*');
    expect(source).toContain('/srv/footbag/.deployed-from.tmp.*');
  });
});
