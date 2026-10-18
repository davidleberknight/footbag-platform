/**
 * The rendered-style check's page list names only real views and real viewers,
 * and its stress rows are as long as the longest real content. A listed URL for
 * a view that was renamed would measure nothing while the coverage check read it
 * as covered; an exemption for a deleted view hides nothing but rots; a stress
 * row shorter than real data proves nothing about the layouts it exists to test.
 */
import { describe, it, expect } from 'vitest';
import {
  EXEMPT, REACH, STRESS, STRESS_CLUB_NAME, STRESS_CLUB_URL, STRESS_LENGTHS,
  STRESS_TRICK_NAME, STRESS_TRICK_NOTATION, STRESS_TRICK_SLUG, VIEWERS,
  listPageTemplates, urlShape, walkSkips,
} from '../fixtures/pageLists';

const templates = new Set(listPageTemplates());
const viewers = new Set(VIEWERS.map((v) => v.name));

describe('rendered-style page list', () => {
  it('lists page views only, never a partial or the layout', () => {
    // Measuring a partial alone would judge a fragment with no page around it.
    expect(templates.size).toBeGreaterThan(50);
    expect([...templates].filter((t) => t.startsWith('partials/') || t.startsWith('layouts/'))).toEqual([]);
    expect(templates.has('legal/index')).toBe(true);
  });

  it('names a real view and a real viewer in every listed and exempted entry', () => {
    // An entry for a view that no longer exists reads as coverage while measuring nothing.
    const bad = [
      ...[...REACH, ...STRESS].filter((r) => !templates.has(r.template) || !viewers.has(r.viewer)).map((r) => `${r.template} as ${r.viewer}`),
      ...Object.keys(EXEMPT).filter((t) => !templates.has(t)),
    ];
    expect(bad).toEqual([]);
    expect(REACH.filter((r) => r.template in EXEMPT).map((r) => r.template), 'a view both listed and exempted').toEqual([]);
    expect(Object.entries(EXEMPT).filter(([, why]) => why.trim().length < 15).map(([t]) => t), 'an exemption without a real reason').toEqual([]);
  });

  it('builds every stress value to the length of the longest real one', () => {
    // A stress row shorter than real data fits any layout, so the check would pass without testing the long case.
    expect({
      clubUrl: STRESS_CLUB_URL.length,
      clubName: STRESS_CLUB_NAME.length,
      trickSlug: STRESS_TRICK_SLUG.length,
      trickName: STRESS_TRICK_NAME.length,
      notation: STRESS_TRICK_NOTATION.length,
    }).toEqual(STRESS_LENGTHS);
  });

  it('groups identifier URLs together and keeps route words apart', () => {
    // Grouping route words would stop the walk before it finds sibling views; not grouping slugs would fetch every profile.
    expect(urlShape('/members/t1_paid')).toBe(urlShape('/members/club_leader'));
    expect(urlShape('/events/2026-crawl-open')).toBe('/events/*');
    expect(urlShape('/freestyle/tricks')).not.toBe(urlShape('/freestyle/glossary'));
    expect(urlShape('/admin/email-templates')).not.toBe(urlShape('/admin/honor-grants'));
    expect(urlShape('/clubs?country=US')).toBe('/clubs?country');
  });

  it('never walks a link that changes who the walk is, or a file that is not a page', () => {
    // A walk that followed the persona switch or logout would measure later pages as someone else.
    expect(['/dev/switch?as=t1_paid', '/logout', '/media-store/a.jpg', '/css/style.css?v=1'].filter((p) => !walkSkips(p))).toEqual([]);
    expect(walkSkips('/members/t1_paid')).toBe(false);
  });
});
