/**
 * hashPassword cost-profile contract.
 *
 * Both profiles must produce a valid, verifiable `$argon2id$` hash; only the
 * encoded cost differs. The cheap profile keeps the test suite off memory-hard
 * hashing; the strong profile is the production parameter set. Profile is read
 * from config at module load, so each case resets modules and re-imports after
 * setting FOOTBAG_CHEAP_PASSWORD_HASH (the same pattern env-config.test.ts uses).
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import argon2 from 'argon2';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SAMPLE = 'correct horse battery staple';

describe('hashPassword', () => {
  const prior = process.env.FOOTBAG_CHEAP_PASSWORD_HASH;
  afterEach(() => {
    if (prior === undefined) delete process.env.FOOTBAG_CHEAP_PASSWORD_HASH;
    else process.env.FOOTBAG_CHEAP_PASSWORD_HASH = prior;
    vi.resetModules();
  });

  it('cheap profile: verifiable argon2id at reduced cost (m=8192)', async () => {
    process.env.FOOTBAG_CHEAP_PASSWORD_HASH = '1';
    vi.resetModules();
    const { hashPassword } = await import('../../src/lib/passwordHash');
    const hash = await hashPassword(SAMPLE);
    expect(hash.startsWith('$argon2id$')).toBe(true);
    expect(hash).toContain('m=8192');
    expect(await argon2.verify(hash, SAMPLE)).toBe(true);
    expect(await argon2.verify(hash, 'wrong-password')).toBe(false);
  });

  it('strong profile: verifiable argon2id at the production default (m=65536)', async () => {
    process.env.FOOTBAG_CHEAP_PASSWORD_HASH = '0';
    vi.resetModules();
    const { hashPassword } = await import('../../src/lib/passwordHash');
    const hash = await hashPassword(SAMPLE);
    expect(hash.startsWith('$argon2id$')).toBe(true);
    expect(hash).toContain('m=65536');
    expect(await argon2.verify(hash, SAMPLE)).toBe(true);
  });

  // Defect caught: the production hashing cost drifted from the pinned
  // ARGON2_* values (a library upgrade changing its defaults, or one edited
  // side), so new members' passwords were hashed at a cost nobody chose and the
  // re-hash-on-sign-in mechanism never ran, because the hash version did not
  // move. The expected values are read from the list, not restated here.
  it('strong profile hashes at exactly the cost the tool-version list pins', async () => {
    const pins = Object.fromEntries(
      readFileSync(join(process.cwd(), 'ops/tool-versions.env'), 'utf8')
        .split('\n')
        .filter((l) => l.startsWith('ARGON2_'))
        .map((l) => l.split('=') as [string, string]),
    );
    process.env.FOOTBAG_CHEAP_PASSWORD_HASH = '0';
    vi.resetModules();
    const { hashPassword } = await import('../../src/lib/passwordHash');

    const hash = await hashPassword(SAMPLE);
    // $<type>$v=19$m=<kib>,t=<passes>,p=<lanes>$<salt>$<hash>
    const [, type, , params, , digest] = hash.split('$');

    expect(type).toBe(pins.ARGON2_TYPE);
    expect(params).toBe(
      `m=${pins.ARGON2_MEMORY_KIB},t=${pins.ARGON2_TIME_COST},p=${pins.ARGON2_PARALLELISM}`,
    );
    expect(Buffer.from(digest, 'base64').length).toBe(Number(pins.ARGON2_HASH_LENGTH));
  });
});
