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
  }, 15000);
});
