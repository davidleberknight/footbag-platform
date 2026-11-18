/**
 * The entry-size label beside a division on the event page. Mixed doubles is
 * the doubles entry size with mixed gender eligibility, not an entry size of
 * its own, so the label reads both parts.
 */
import { describe, it, expect } from 'vitest';
import { toTeamTypeLabel } from '../../src/services/eventService';

describe('toTeamTypeLabel', () => {
  it('labels a mixed doubles division from its gender eligibility', () => {
    // Otherwise every mixed doubles division would show as plain doubles.
    expect(toTeamTypeLabel('doubles', 'mixed')).toBe('Mixed Doubles');
  });

  it('labels open, women\'s and historical doubles divisions as doubles', () => {
    // A women's or unstructured historical doubles division must not read as mixed.
    for (const gender of ['open', 'women', null]) {
      expect(toTeamTypeLabel('doubles', gender), `gender ${gender}`).toBe('Doubles');
    }
  });

  it('gives a singles division no label', () => {
    // A label on singles would clutter every division list on the page.
    expect(toTeamTypeLabel('singles', 'open')).toBeNull();
  });
});
