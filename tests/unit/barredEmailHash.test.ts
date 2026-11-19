/**
 * The keyed hash registration checks an address against once an expulsion has
 * barred it. The same address must hash the same however it is typed, and the
 * hash must not be a plain digest of the address.
 */
import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { barredEmailHash } from '../../src/lib/barredEmailHash';

describe('barredEmailHash', () => {
  // Defect caught: an expelled member registers again by typing their address
  // with a capital letter or a stray space.
  it('hashes an address the same whatever its case and surrounding space', () => {
    expect(barredEmailHash('  Expelled.Person@Example.COM ')).toBe(barredEmailHash('expelled.person@example.com'));
    expect(barredEmailHash('expelled.person@example.com')).not.toBe(barredEmailHash('other.person@example.com'));
  });

  // Defect caught: the stored value is an unkeyed digest, so anyone holding a
  // copy of the table can test guessed addresses against it.
  it('is keyed, not a plain digest of the address', () => {
    const address = 'expelled.person@example.com';
    expect(barredEmailHash(address)).not.toBe(createHash('sha256').update(address).digest('hex'));
  });
});
