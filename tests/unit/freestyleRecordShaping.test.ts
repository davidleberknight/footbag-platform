import { describe, it, expect } from 'vitest';
import {
  shapeFreestyleRecord,
  slugToHashtag,
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
    curator_review_note: null,
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

  // Defect caught: a date known to the month or year shows a day nobody recorded,
  // or carries the approximate marker that belongs only to an estimated date.
  it('cuts a month or year date to its precision and marks only an approximate date', () => {
    const month = shapeFreestyleRecord(makeRow({ achieved_date: '2015-06-01', date_precision: 'month' }));
    expect(month).toMatchObject({ achievedDate: '2015-06', dateApproximate: false });
    const year = shapeFreestyleRecord(makeRow({ achieved_date: '2015-01-01', date_precision: 'year' }));
    expect(year).toMatchObject({ achievedDate: '2015', dateApproximate: false });
    const approx = shapeFreestyleRecord(makeRow({ achieved_date: '2015-06-14', date_precision: 'approximate' }));
    expect(approx).toMatchObject({ achievedDate: '2015-06-14', dateApproximate: true });
  });

  it('does not mark a placeholder date as approximate (it is unknown, not fuzzy)', () => {
    const vm = shapeFreestyleRecord(makeRow({ achieved_date: '1905-07-03', date_precision: 'month' }));
    expect(vm.achievedDate).toBeNull();
    expect(vm.dateApproximate).toBe(false);
  });

  // video_url is curator/CSV-writable and lands in an href. Only a video link
  // on YouTube, Vimeo, TikTok or Instagram survives; everything else maps to
  // null so the template hides it.
  it('preserves a video link on an allowed platform, http or https', () => {
    expect(shapeFreestyleRecord(makeRow({ video_url: 'https://youtu.be/dQw4w9WgXcQ' })).videoUrl)
      .toBe('https://youtu.be/dQw4w9WgXcQ');
    expect(shapeFreestyleRecord(makeRow({ video_url: 'http://youtube.com/watch?v=8WQ_bzl2I80' })).videoUrl)
      .toBe('http://youtube.com/watch?v=8WQ_bzl2I80');
    expect(shapeFreestyleRecord(makeRow({ video_url: 'https://www.instagram.com/p/DGlbm3quyxE/?img_index=3' })).videoUrl)
      .toBe('https://www.instagram.com/p/DGlbm3quyxE/?img_index=3');
  });

  // Defect caught: a record row carrying an off-platform link (a stale row,
  // or a curator save restored without the editor's check) shows it anyway.
  it('drops a video link on any other host', () => {
    for (const bad of ['http://example.com/v', 'https://www.facebook.com/watch/?v=1234567890']) {
      expect(shapeFreestyleRecord(makeRow({ video_url: bad })).videoUrl, bad).toBeNull();
    }
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

  // With a resolver, a record whose trick resolves nowhere active must not link
  // (no 404 badge), and one that resolves through an alias links to the canonical
  // slug rather than taking a redirect hop. With no resolver it links
  // unconditionally (caller knows the trick resolves).
  it('resolution-aware: suppresses the trick href for a slug that resolves nowhere active', () => {
    const resolve = (s: string) => (['mirage', 'gyro-symposium-swirl'].includes(s) ? s : null);
    expect(shapeFreestyleRecord(makeRow({ trick_name: 'Mirage' }), resolve).trickHref)
      .toBe('/freestyle/tricks/mirage');
    expect(shapeFreestyleRecord(makeRow({ trick_name: 'Enterrage' }), resolve).trickHref)
      .toBeNull();
    expect(shapeFreestyleRecord(makeRow({ trick_name: 'Enterrage' })).trickHref)
      .toBe('/freestyle/tricks/enterrage');
  });

  it('resolution-aware: links an alias-named record to its canonical trick', () => {
    const resolve = (s: string) => (s === 'infinity_variant' ? 'winged' : null);
    expect(shapeFreestyleRecord(makeRow({ trick_name: 'Infinity Variant' }), resolve).trickHref)
      .toBe('/freestyle/tricks/winged');
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

describe('record curator-review status', () => {
  it('carries no review note and links normally for an ordinary record', () => {
    const vm = shapeFreestyleRecord(makeRow({ trick_name: 'Mirage' }), s => (s === 'mirage' ? s : null));
    expect(vm.reviewNote).toBeNull();
    expect(vm.trickHref).toBe('/freestyle/tricks/mirage');
  });

  // Defect caught: a record under review linking a visitor to a speculative trick.
  it('flags a review record and suppresses its link even when the slug resolves', () => {
    // 'double_dyno' resolves here, yet the review record must not link.
    const note = 'Its canonical identity is not yet settled.';
    const vm = shapeFreestyleRecord(
      makeRow({ trick_name: 'Double Dyno', curator_review_note: note }),
      s => (s === 'double_dyno' ? s : null),
    );
    expect(vm.reviewNote).toBe(note);
    expect(vm.trickHref).toBeNull();
  });

  // Defect caught: a cleared note left as blank text hiding a record's trick link.
  it('treats a blank review note as no review', () => {
    const vm = shapeFreestyleRecord(
      makeRow({ trick_name: 'Mirage', curator_review_note: '   ' }),
      s => (s === 'mirage' ? s : null),
    );
    expect(vm.reviewNote).toBeNull();
    expect(vm.trickHref).toBe('/freestyle/tricks/mirage');
  });
});
