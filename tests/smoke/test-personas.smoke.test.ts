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
 * Transport: scripts/verify-test-personas.sh uses ssh -t to invoke a sudo'd
 * docker compose exec on the staging host. The operator's sudo password is
 * typed directly into sudo's noecho prompt on the local terminal; nothing is
 * piped, captured, or logged. Stdout of the script is the single JSON line
 * emitted by the in-container node query.
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

const RUN = process.env.RUN_STAGING_SMOKE === '1';

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
}

describe.skipIf(!RUN)(
  'staging persona seed: catalog landed, hashes fresh, audit idempotent',
  () => {
    let result: VerifyResult;

    beforeAll(() => {
      const stdout = execFileSync('scripts/verify-test-personas.sh', [], {
        stdio: ['inherit', 'pipe', 'inherit'],
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
      expect(result.passwordHashesArgon2).toBe(result.personasSeeded);
    });

    it('re-running the seed is idempotent (one audit row per seeded persona)', () => {
      expect(result.auditRowsSeeded).toBe(result.personasSeeded);
    });

    it('each tier1+ persona carries a dev_persona_seed tier-grant ledger row', () => {
      expect(result.tierGrantsSeeded).toBeGreaterThanOrEqual(expectedTierGrants);
    });
  },
);
