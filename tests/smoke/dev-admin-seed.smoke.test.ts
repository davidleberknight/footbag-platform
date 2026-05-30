/**
 * R3: dev-admin-seed staging smoke.
 *
 * Asserts that the maintainer seed declared in .local/staging-admin-seed.json
 * actually reached the staging DB via ./deploy_to_aws.sh --seed-dev-admins,
 * that the stored password is a fresh argon2id hash (never the plaintext
 * literal), and that re-running --seed-dev-admins produces no duplicate
 * audit rows (idempotency contract from src/dev-bootstrap/seed.ts).
 *
 * Transport: scripts/verify-dev-admin-seed.sh uses ssh -t to invoke a
 * sudo'd docker compose exec on the staging host. The operator's sudo
 * password is typed directly into sudo's noecho prompt on the local
 * terminal; nothing is piped, captured, or logged. Stdout of the script
 * is the single JSON line emitted by the in-container node query.
 *
 * Gating:
 *   - RUN_STAGING_SMOKE=1 (set by scripts/test-smoke.sh).
 *   - .local/staging-admin-seed.json must exist on the workstation.
 *     If absent, the operator never opted into a staging seed; nothing
 *     to verify.
 *
 * Failure modes (each surfaces a distinct cause):
 *   - membersSeeded < expectedSeedCount: the seed JSON exists locally but
 *     did not reach staging. Suspect: the deploy pipeline's env-var
 *     transport (scripts/deploy-rebuild.sh or scripts/deploy-code.sh)
 *     broke the FOOTBAG_DEV_ADMIN_SEED_JSON hand-off, or the operator
 *     ran ./deploy_to_aws.sh without --seed-dev-admins.
 *   - passwordHashesArgon2 !== membersSeeded: a seeded row has a non-
 *     argon2 password_hash; the seed script's argon2.hash call was
 *     bypassed somewhere. (A string that startsWith '$argon2id$' cannot
 *     also equal the plaintext literal, so the positive check subsumes
 *     a separate plaintext-leak assertion; the project's single-source
 *     secret invariant forbids duplicating the literal here in any case.)
 *   - auditRowsSeeded !== membersSeeded: idempotency broken. Re-running
 *     --seed-dev-admins inserted duplicate audit rows; the existing-marker
 *     guard in src/dev-bootstrap/seed.ts:210 was bypassed.
 *
 * Excluded from `npm test` via the test:smoke runner's path filtering;
 * dev and CI never trigger this path.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

const RUN = process.env.RUN_STAGING_SMOKE === '1';
const SEED_FILE = '.local/staging-admin-seed.json';
const seedFileExists = existsSync(SEED_FILE);

interface VerifyResult {
  membersSeeded: number;
  membersSeededAdmin: number;
  tierGrantsSeeded: number;
  auditRowsSeeded: number;
  passwordHashesArgon2: number;
}

function stripJsoncComments(raw: string): string {
  let out = '';
  let inString = false;
  let escape = false;
  for (let i = 0; i < raw.length; i += 1) {
    const ch = raw[i];
    if (inString) {
      out += ch;
      if (escape) escape = false;
      else if (ch === '\\') escape = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      out += ch;
      continue;
    }
    if (ch === '/' && raw[i + 1] === '/') {
      while (i < raw.length && raw[i] !== '\n') i += 1;
      if (i < raw.length) out += raw[i];
      continue;
    }
    out += ch;
  }
  return out;
}

describe.skipIf(!RUN || !seedFileExists)(
  'staging dev-admin-seed: members landed, hashes fresh, audit idempotent',
  () => {
    let result: VerifyResult;
    let expectedSeedCount: number;

    beforeAll(() => {
      const raw = readFileSync(SEED_FILE, 'utf8');
      const parsed = JSON.parse(stripJsoncComments(raw)) as unknown;
      if (!Array.isArray(parsed)) {
        throw new Error(`${SEED_FILE}: top-level must be an array`);
      }
      expectedSeedCount = parsed.length;

      const stdout = execFileSync('scripts/verify-dev-admin-seed.sh', [], {
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
        throw new Error('verify-dev-admin-seed.sh produced no stdout');
      }
      result = JSON.parse(lastLine) as VerifyResult;
    }, 180_000);

    it('staging DB carries seeded members with is_admin=1 and the dev-admin-seed marker', () => {
      expect(result.membersSeeded).toBeGreaterThanOrEqual(expectedSeedCount);
      expect(result.membersSeededAdmin).toBe(result.membersSeeded);
      expect(result.tierGrantsSeeded).toBe(result.membersSeeded);
    });

    it('seeded password_hash is a fresh argon2id (never the plaintext literal)', () => {
      expect(result.passwordHashesArgon2).toBe(result.membersSeeded);
    });

    it('re-running the seed is idempotent (one audit row per seeded member)', () => {
      expect(result.auditRowsSeeded).toBe(result.membersSeeded);
    });
  },
);
