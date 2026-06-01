import argon2 from 'argon2';

/**
 * Cheap argon2 hash for test fixtures that pre-seed a member's password_hash.
 *
 * Deliberately has NO dependency on src/config: importing the production
 * hashPassword helper eagerly loads (and freezes) the app config, which in a
 * test file runs before the file's top-level setTestEnv() and pins the wrong
 * DB path. This helper imports only argon2, so test files can import it at the
 * top without that ordering hazard.
 *
 * The exact cost is not load-bearing — argon2.verify reads cost from the hash —
 * only that it stays argon2id and cheap, mirroring the cheap profile in
 * src/lib/passwordHash.ts so the suite is not memory-hard across ~20 forks.
 */
const CHEAP_OPTS: argon2.Options = { memoryCost: 8192, timeCost: 2, parallelism: 1 };

export function hashTestPassword(plaintext: string): Promise<string> {
  return argon2.hash(plaintext, CHEAP_OPTS);
}
