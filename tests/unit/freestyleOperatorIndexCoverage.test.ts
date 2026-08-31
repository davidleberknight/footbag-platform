/**
 * Where each tracked modifier group is documented, and which have no home yet.
 *
 * Four groups were reported as lacking a documenting reference surface. Two of
 * them do have one, and finding that is most of what this file records.
 *
 * Weaving and zulu are documented by the Set Encyclopedia, not the operators
 * reference. They are ducking sets by ruling: the launch incorporates the ducking
 * movement, everything after the duck is the base trick unchanged, and each takes
 * the ADD of its matching ducking compound rather than a new one. Being a set is
 * why they are absent from the operator axes, and that absence is a decision with
 * its own test elsewhere, not a gap. A modifier registry row typed 'body' is what
 * makes them look undocumented from the browse side; the doctrine and the set
 * entries are the authority on what they are.
 *
 * Backside and splicing genuinely have no home, for the same underlying reason in
 * two different shapes: a reference surface states what kind of movement a thing
 * is, and for each of these that is a held question. Backside is a settled body
 * modifier carrying +1 whose structural axis is unruled; splicing's contribution
 * is not independently verified. Placing either would answer a question nobody
 * has answered, on a public page.
 *
 * So this pins two homes that exist, two absences that are positions rather than
 * oversights, and the register entries that say why, so a later sweep does not
 * "fix" any of the four.
 */
import { describe, it, expect } from 'vitest';
import { OPERATOR_INDEX_SLUGS } from '../../src/content/freestyleOperatorIndex';
import { findCanonicalSetBySlug } from '../../src/content/freestyleCanonicalSets';

describe('the two ducking sets are documented, and not as operators', () => {
  for (const slug of ['weaving', 'zulu']) {
    it(`${slug} has a Set Encyclopedia entry`, () => {
      const set = findCanonicalSetBySlug(slug);
      expect(set, `${slug} canonical set`).toBeDefined();
      expect(set!.hashtag).toBe(`#set_${slug}`);
    });

    it(`${slug} is deliberately absent from the operator axes`, () => {
      // A set and an operator are different kinds of object, and the same concept
      // is never presented as both on two surfaces.
      expect(OPERATOR_INDEX_SLUGS.has(slug)).toBe(false);
    });

    it(`${slug} names the other as its sibling ducking set`, () => {
      const other = slug === 'weaving' ? 'zulu' : 'weaving';
      const related = findCanonicalSetBySlug(slug)!.relatedSystems.map(r => r.slug);
      expect(related).toContain(other);
    });
  }
});

describe('a group whose classification is a held question has no home yet', () => {
  for (const slug of ['backside', 'splicing']) {
    it(`${slug} is on no operator axis`, () => {
      expect(OPERATOR_INDEX_SLUGS.has(slug)).toBe(false);
    });

    it(`${slug} has no Set Encyclopedia entry`, () => {
      expect(findCanonicalSetBySlug(slug)).toBeFalsy();
    });
  }

  it('leaves each with no home on either surface, rather than a partial one', () => {
    // Both absences together. A group documented on one surface and not the other
    // would be the platform half-answering the question it is holding.
    for (const slug of ['backside', 'splicing']) {
      const placed = OPERATOR_INDEX_SLUGS.has(slug) || Boolean(findCanonicalSetBySlug(slug));
      expect(placed, `${slug} placed on a reference surface`).toBe(false);
    }
  });
});
