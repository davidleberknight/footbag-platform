import { describe, it, expect } from 'vitest';
import {
  shapeFreestyleRecord,
  slugToHashtag,
  hashtagForRole,
  structuralRoleForCategory,
  trickSurfaceHashtag,
  modifierSurfaceHashtag,
} from '../../src/services/freestyleRecordShaping';
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

  // video_url is curator/CSV-writable and lands in an href. Only http(s)
  // absolute URLs survive; everything else maps to null so the template hides it.
  it('preserves http and https video URLs', () => {
    expect(shapeFreestyleRecord(makeRow({ video_url: 'https://youtu.be/abc' })).videoUrl)
      .toBe('https://youtu.be/abc');
    expect(shapeFreestyleRecord(makeRow({ video_url: 'http://example.com/v' })).videoUrl)
      .toBe('http://example.com/v');
  });

  it('rejects javascript:, data:, vbscript:, and protocol-relative video URLs', () => {
    for (const bad of ['javascript:alert(1)', 'data:text/html,x', 'vbscript:msgbox', '//evil.example/v']) {
      expect(shapeFreestyleRecord(makeRow({ video_url: bad })).videoUrl).toBeNull();
    }
  });

  it('preserves a null video URL', () => {
    expect(shapeFreestyleRecord(makeRow({ video_url: null })).videoUrl).toBeNull();
  });

  // "Unique <descriptor>" records are one-off competition entries, not dictionary
  // tricks: the name displays but must not link to a trick page (record-only).
  it('record-only "Unique *" names carry the name but no trick href; normal names link', () => {
    for (const name of ['Unique Fearless', 'Unique 3-Dex', 'Unique Beastly']) {
      const vm = shapeFreestyleRecord(makeRow({ trick_name: name }));
      expect(vm.trickName, name).toBe(name);
      expect(vm.trickHref, name).toBeNull();
    }
    const normal = shapeFreestyleRecord(makeRow({ trick_name: 'Gyro Symposium Swirl' }));
    expect(normal.trickHref).toBe('/freestyle/tricks/gyro_symposium_swirl');
  });

  // With a resolvable set, a record whose trick is not in the dictionary must not
  // link (no 404 badge). With no set, it links unconditionally (caller knows the
  // trick resolves).
  it('resolution-aware: suppresses the trick href for a slug absent from the resolvable set', () => {
    const resolvable = new Set(['mirage', 'gyro-symposium-swirl']);
    expect(shapeFreestyleRecord(makeRow({ trick_name: 'Mirage' }), resolvable).trickHref)
      .toBe('/freestyle/tricks/mirage');
    expect(shapeFreestyleRecord(makeRow({ trick_name: 'Enterrage' }), resolvable).trickHref)
      .toBeNull();
    expect(shapeFreestyleRecord(makeRow({ trick_name: 'Enterrage' })).trickHref)
      .toBe('/freestyle/tricks/enterrage');
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

describe('hashtagForRole', () => {
  it('renders a bare tag for the trick role and a prefix tag for the others', () => {
    expect(hashtagForRole('mirage', 'trick')).toBe('#mirage');
    expect(hashtagForRole('pixie', 'set')).toBe('#set_pixie');
    expect(hashtagForRole('spinning', 'operator')).toBe('#operator_spinning');
    expect(hashtagForRole('whirl', 'family')).toBe('#family_whirl');
  });

  it('normalizes the slug body (kebab to underscore) under every role', () => {
    expect(hashtagForRole('around-the-world', 'set')).toBe('#set_around_the_world');
    expect(hashtagForRole('Atom-Smasher', 'trick')).toBe('#atom_smasher');
  });
});

describe('structuralRoleForCategory', () => {
  it('maps freestyle_tricks.category to a role', () => {
    expect(structuralRoleForCategory('modifier')).toBe('operator');
    expect(structuralRoleForCategory('operator')).toBe('operator');
    expect(structuralRoleForCategory('set')).toBe('set');
    expect(structuralRoleForCategory('compound')).toBe('trick');
    expect(structuralRoleForCategory('dex')).toBe('trick');
    expect(structuralRoleForCategory(null)).toBe('trick');
  });
});

describe('trickSurfaceHashtag', () => {
  it('gives a real trick the bare tag', () => {
    expect(trickSurfaceHashtag('mirage', 'compound')).toBe('#mirage');
    expect(trickSurfaceHashtag('record-only-trick', null)).toBe('#record_only_trick');
  });

  it('gives a dual-role concept (pixie/fairy) the bare trick tag on a trick surface', () => {
    expect(trickSurfaceHashtag('pixie', 'set')).toBe('#pixie');
    expect(trickSurfaceHashtag('fairy', 'set')).toBe('#fairy');
  });

  it('gives a set-only concept its set tag, never a bare trick tag', () => {
    expect(trickSurfaceHashtag('atomic', 'set')).toBe('#set_atomic');
    expect(trickSurfaceHashtag('quantum', 'set')).toBe('#set_quantum');
  });

  it('gives a modifier that reaches a trick surface its operator tag', () => {
    expect(trickSurfaceHashtag('spinning', 'modifier')).toBe('#operator_spinning');
  });
});

describe('modifierSurfaceHashtag', () => {
  it('renders operators with #operator_ and sets with #set_', () => {
    expect(modifierSurfaceHashtag('spinning', 'body')).toBe('#operator_spinning');
    expect(modifierSurfaceHashtag('paradox', 'body')).toBe('#operator_paradox');
    expect(modifierSurfaceHashtag('pixie', 'set')).toBe('#set_pixie');
  });

  it('honors the curator role override over modifier_type (whirling is a set)', () => {
    expect(modifierSurfaceHashtag('whirling', 'body')).toBe('#set_whirling');
  });
});
