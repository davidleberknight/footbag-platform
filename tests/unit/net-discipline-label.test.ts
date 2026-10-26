/**
 * Net division labels: a canonical group shows its plain label, and a raw
 * `event_disciplines` name shows without the trailing "Net" or "Footbag Net" that every
 * page in the net section makes redundant.
 */
import { describe, it, expect } from 'vitest';
import { disciplineLabel } from '../../src/services/netService';

describe('disciplineLabel', () => {
  // A visitor would read "Open Mixed Doubles Net" on a page that is only about net.
  it('drops a trailing "Net" or "Footbag Net" from a raw name, in any case', () => {
    expect(disciplineLabel('Open Mixed Doubles Net', 'mixed_doubles', 1)).toBe('Open Mixed Doubles');
    expect(disciplineLabel("Women's Open Doubles Footbag Net", null, 0)).toBe("Women's Open Doubles");
    expect(disciplineLabel('Open Doubles NET', null, 0)).toBe('Open Doubles');
  });

  // A word that merely contains "net", or "Net" mid-name, is part of the name.
  it('keeps "Net" that is not a trailing suffix', () => {
    expect(disciplineLabel('Footbag Net: Singles', 'uncategorized', 1)).toBe('Footbag Net: Singles');
    expect(disciplineLabel('Open Doubles Bonnet', null, 0)).toBe('Open Doubles Bonnet');
  });

  // Stripping a name that is only the suffix would leave an empty cell.
  it('keeps a name that is only the suffix', () => {
    expect(disciplineLabel('Footbag Net', null, 0)).toBe('Footbag Net');
    expect(disciplineLabel('Net', null, 0)).toBe('Net');
  });

  // The canonical label is what an unflagged row shows, not its raw name.
  it('uses the canonical group label when there is no conflict', () => {
    expect(disciplineLabel('Open Doubles Net', 'open_doubles', 0)).toBe('Open Doubles');
    expect(disciplineLabel('Doubles Net', 'uncategorized', 0)).toBe('Doubles');
  });
});
