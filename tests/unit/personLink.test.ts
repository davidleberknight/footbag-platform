import { describe, it, expect } from 'vitest';
import { personHref } from '../../src/services/personLink';

describe('personHref', () => {
  it('returns member URL when slug is present', () => {
    expect(personHref('alice_smith', 'person-123')).toBe('/members/alice_smith');
  });

  it('returns member URL when slug is present but person ID is null', () => {
    expect(personHref('bob', null)).toBe('/members/bob');
  });

  it('returns history URL when slug is null', () => {
    expect(personHref(null, 'person-123')).toBe('/history/person-123');
  });

  it('returns history URL when slug is undefined', () => {
    expect(personHref(undefined, 'person-123')).toBe('/history/person-123');
  });

  it('returns history URL when slug is empty string (falsy)', () => {
    expect(personHref('', 'person-123')).toBe('/history/person-123');
  });

  it('returns null when both are null', () => {
    expect(personHref(null, null)).toBeNull();
  });

  it('returns null when both are undefined', () => {
    expect(personHref(undefined, undefined)).toBeNull();
  });

  it('returns member URL when slug is present and person ID is undefined', () => {
    expect(personHref('alice', undefined)).toBe('/members/alice');
  });
});
