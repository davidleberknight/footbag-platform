/**
 * Net placement labels: a team's finishing place reads as an English ordinal on
 * the team detail page's competition history.
 */
import { describe, it, expect } from 'vitest';
import { placementLabel } from '../../src/services/netService';

describe('placementLabel', () => {
  // A visitor would read "21th", "22th" or "23th" for a place past the podium.
  it('takes its suffix from the last digit past the teens', () => {
    const expected: Record<number, string> = {
      1: '1st', 2: '2nd', 3: '3rd', 4: '4th', 10: '10th',
      21: '21st', 22: '22nd', 23: '23rd', 24: '24th', 101: '101st', 102: '102nd',
    };
    for (const [n, label] of Object.entries(expected)) {
      expect(placementLabel(Number(n)), `place ${n}`).toBe(label);
    }
  });

  // A visitor would read "11st", "12nd" or "13rd" if the teens followed the last digit.
  it('gives every teen "th", in any hundred', () => {
    for (const n of [11, 12, 13, 111, 112, 113]) {
      expect(placementLabel(n), `place ${n}`).toBe(`${n}th`);
    }
  });
});
