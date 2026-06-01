/**
 * Central password hashing. Every password hash in the codebase routes through
 * here so cost is decided in exactly one place.
 *
 * Strong (argon2 library defaults) in every real process. A cheap profile is
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

/**
 * Hash a plaintext password. Strong cost in production/dev/staging; cheap cost
 * only under the Vitest-gated test switch. Passing no options on the strong
 * path keeps production output byte-for-byte identical to the prior direct
 * `argon2.hash(password)` calls.
 */
export function hashPassword(plaintext: string): Promise<string> {
  return config.useCheapPasswordHash
    ? argon2.hash(plaintext, CHEAP_OPTS)
    : argon2.hash(plaintext);
}
