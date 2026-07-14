/**
 * Persona-catalog staging smoke.
 *
 * Asserts that the canonical persona catalog (src/testkit/canonicalPersonas.ts)
 * actually reached the staging DB via ./deploy_to_aws.sh --seed-test-personas,
 * that every seeded persona member carries a fresh argon2id password hash
 * (never the plaintext literal), and that re-running --seed-test-personas
 * produces no duplicate audit rows (the skip-existing-slug idempotency contract
 * in src/testkit/personaSeedRunner.ts).
 *
 * The persona catalog is code and always seeds, so the expected count is derived
 * from CANONICAL_PERSONAS directly.
 *
 * Transport: scripts/verify-test-personas.sh runs a sudo'd docker compose
 * exec on the staging host over ssh, non-interactively: it reads the sudo
 * password from the operator credential file the deploy scripts use and
 * carries it only as the first line of the ssh stdin stream into
 * `sudo -S -p ""` — never on any argv, never echoed, never logged. Stdout of
 * the script is the single JSON line emitted by the in-container node query.
 *
 * Gating: RUN_STAGING_SMOKE=1 (set by scripts/test-smoke.sh).
 *
 * Failure modes (each surfaces a distinct cause):
 *   - personasSeeded < CANONICAL_PERSONAS.length: the catalog did not reach
 *     staging. Suspect: the deploy pipeline's SEED_TEST_PERSONAS signal
 *     transport (scripts/deploy-rebuild.sh / scripts/deploy-code.sh and their
 *     remote halves) broke the hand-off, or the operator ran ./deploy_to_aws.sh
 *     without --seed-test-personas.
 *   - passwordHashesArgon2 !== personasSeeded: a seeded row has a non-argon2
 *     password_hash. (A string starting with '$argon2id$' cannot also equal the
 *     plaintext literal, so this positive check subsumes a plaintext-leak
 *     assertion; the single-source secret invariant forbids duplicating the
 *     literal here in any case.)
 *   - auditRowsSeeded !== personasSeeded: idempotency broken. A re-run inserted
 *     duplicate audit rows; the existsBySlug skip in personaSeedRunner.ts was
 *     bypassed.
 *   - tierGrantsSeeded !== expectedTierGrants: the tier-grant ledger row was
 *     not written for each tier1+ persona (tier0 personas carry no grant).
 *
 * Excluded from `npm test` via the test:smoke runner's path filtering; dev and
 * CI never trigger this path.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { CANONICAL_PERSONAS } from '../../src/testkit/canonicalPersonas';

// Personas are seeded on staging only (the seeder is allowlisted to the
// staging target), so this suite is meaningful only against staging: a
// production-targeted smoke run skips it rather than failing on a surface
// that must not exist there.
const RUN =
  process.env.RUN_STAGING_SMOKE === '1' &&
  (process.env.SMOKE_TARGET_ENV ?? 'staging') !== 'production';

// Blocked personas (a future feature not built yet) are never seeded, so the
// expected counts cover only the backed catalog.
const BACKED_PERSONAS = CANONICAL_PERSONAS.filter((p) => !p.blockedBy);
const expectedPersonaCount = BACKED_PERSONAS.length;
const expectedTierGrants = BACKED_PERSONAS.filter((p) => p.tier !== 'tier0').length;

interface VerifyResult {
  personasSeeded: number;
  auditRowsSeeded: number;
  tierGrantsSeeded: number;
  passwordHashesArgon2: number;
  staleHashSlugs?: Array<{ slug: string; hashPrefix: string }>;
}

describe.skipIf(!RUN)(
  'staging persona seed: catalog landed, hashes fresh, audit idempotent',
  () => {
    let result: VerifyResult;

    beforeAll(() => {
      const stdout = execFileSync('scripts/verify-test-personas.sh', [], {
        stdio: ['ignore', 'pipe', 'inherit'],
        timeout: 120_000,
        encoding: 'utf8',
      });
      const lastLine = stdout
        .trim()
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => l.length > 0)
        .pop();
      if (!lastLine) {
        throw new Error('verify-test-personas.sh produced no stdout');
      }
      result = JSON.parse(lastLine) as VerifyResult;
    }, 180_000);

    it('staging DB carries the full canonical persona catalog', () => {
      expect(result.personasSeeded).toBeGreaterThanOrEqual(expectedPersonaCount);
    });

    it('every seeded persona has a fresh argon2id password_hash (never the plaintext literal)', () => {
      // On mismatch, name the offending personas and their hash scheme so the
      // failure is diagnosable without a second round trip. A stale row is
      // healed by the seed runner's in-place re-hash on the next deploy that
      // runs --seed-test-personas; if it persists, the seed step did not run.
      const stale = result.staleHashSlugs ?? [];
      expect(
        result.passwordHashesArgon2,
        stale.length
          ? `stale-hash personas: ${stale.map((s) => `${s.slug}(${s.hashPrefix})`).join(', ')}`
          : undefined,
      ).toBe(result.personasSeeded);
    });

    it('re-running the seed is idempotent (one audit row per seeded persona)', () => {
      expect(result.auditRowsSeeded).toBe(result.personasSeeded);
    });

    it('each tier1+ persona carries a dev_persona_seed tier-grant ledger row', () => {
      expect(result.tierGrantsSeeded).toBeGreaterThanOrEqual(expectedTierGrants);
    });
  },
);
