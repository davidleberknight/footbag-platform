import { describe, it, expect } from 'vitest';
import { shapeFreestyleRecord, slugToHashtag } from '../../src/services/freestyleRecordShaping';
import type { FreestyleRecordRow } from '../../src/db/db';

function makeRow(overrides: Partial<FreestyleRecordRow> = {}): FreestyleRecordRow {
  return {
    id:                 'rec-1',
    record_type:        'consecutive_completions',
    person_id:          null,
    holder_name:        'Test Player',
    holder_member_slug: null,
    trick_name:         'Mirage',
    sort_name:          'Mirage',
    adds_count:         2,
    value_numeric:      10,
    achieved_date:      '2015-06-01',
    date_precision:     'day',
    confidence:         'medium',
    video_url:          null,
    video_timecode:     null,
    notes:              null,
    superseded_by:      null,
    ...overrides,
  };
}

describe('shapeFreestyleRecord', () => {
  it('passes through a normal post-1970 ISO date', () => {
    const vm = shapeFreestyleRecord(makeRow({ achieved_date: '2015-06-01' }));
    expect(vm.achievedDate).toBe('2015-06-01');
    expect(vm.dateApproximate).toBe(false);
  });

  it('treats Excel-epoch 1905 placeholder dates as unknown', () => {
    const vm = shapeFreestyleRecord(makeRow({ achieved_date: '1905-07-03' }));
    expect(vm.achievedDate).toBeNull();
    expect(vm.dateApproximate).toBe(false);
  });

  it('treats any pre-1970 year as unknown (footbag did not exist before 1970)', () => {
    const vm = shapeFreestyleRecord(makeRow({ achieved_date: '1969-12-31' }));
    expect(vm.achievedDate).toBeNull();
  });

  it('preserves null achieved_date as null', () => {
    const vm = shapeFreestyleRecord(makeRow({ achieved_date: null }));
    expect(vm.achievedDate).toBeNull();
    expect(vm.dateApproximate).toBe(false);
  });

  it('marks non-day precision as approximate when the date is real', () => {
    const vm = shapeFreestyleRecord(makeRow({ achieved_date: '2015-06-01', date_precision: 'month' }));
    expect(vm.dateApproximate).toBe(true);
  });

  it('does not mark a placeholder date as approximate (it is unknown, not fuzzy)', () => {
    const vm = shapeFreestyleRecord(makeRow({ achieved_date: '1905-07-03', date_precision: 'month' }));
    expect(vm.achievedDate).toBeNull();
    expect(vm.dateApproximate).toBe(false);
  });
});

describe('slugToHashtag', () => {
  it('returns "#mirage" for "mirage"', () => {
    expect(slugToHashtag('mirage')).toBe('#mirage');
  });

  it('converts hyphens to underscores for compound slugs', () => {
    expect(slugToHashtag('double-legover')).toBe('#double_legover');
    expect(slugToHashtag('atom-smasher')).toBe('#atom_smasher');
  });

  it('lowercases mixed-case input', () => {
    expect(slugToHashtag('Atom-Smasher')).toBe('#atom_smasher');
  });

  it('handles multi-hyphen slugs', () => {
    expect(slugToHashtag('reverse-around-the-world')).toBe('#reverse_around_the_world');
  });
});
