/**
 * Central password hashing. Every password hash in the codebase routes through
 * here so cost is decided in exactly one place.
 *
 * Strong in every real process: argon2id at the cost pinned in the tool-version
 * list (64 MiB, 3 passes, parallelism 4, a 32-byte hash), passed explicitly so a
 * library upgrade cannot change the cost silently. A cheap profile is
 * used only under the test runner, gated by `config.useCheapPasswordHash`
 * (which env.ts refuses to enable outside Vitest). The cheap profile exists so
 * the test suite does not run ~20 forks of memory-hard argon2 in parallel,
 * which oversubscribes RAM and threads and makes unrelated suites' boot hooks
 * time out.
 *
 * Verification is intentionally NOT wrapped: argon2.verify reads the cost
 * parameters out of the encoded hash, so it needs no profile and works across
 * hashes produced under either profile.
 */
import argon2 from 'argon2';
import { config } from '../config/env';

// Test-only reduced cost. Far below the memory-hard default (64 MiB, 3 passes,
// parallelism 4); still argon2id, still a valid `$argon2id$...` hash that
// argon2.verify round-trips. Never reached in a real process.
const CHEAP_OPTS: argon2.Options = { memoryCost: 8192, timeCost: 2, parallelism: 1 };

// The production cost, equal to the ARGON2_* pins in the tool-version list and
// to the library defaults every stored hash was made under, so no stored hash
// changes. Changing any of these means raising CURRENT_PASSWORD_HASH_VERSION.
const STRONG_OPTS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 65536,
  timeCost: 3,
  parallelism: 4,
  hashLength: 32,
};

/**
 * The hashing scheme every new hash is made under, stored beside each hash as
 * `password_hash_version`. Raise it whenever the algorithm or its cost
 * parameters change: a stored hash under a lower number is re-derived at the
 * member's next successful sign-in, the one moment the plaintext is in hand.
 */
export const CURRENT_PASSWORD_HASH_VERSION = 1;

/**
 * Hash a plaintext password. Strong cost in production/dev/staging; cheap cost
 * only under the Vitest-gated test switch.
 */
export function hashPassword(plaintext: string): Promise<string> {
  return argon2.hash(plaintext, config.useCheapPasswordHash ? CHEAP_OPTS : STRONG_OPTS);
}
