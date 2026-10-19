/**
 * Templates never assemble a dictionary-filter or hashtag-gallery URL from a
 * slug. A family filter (`/freestyle/tricks?family=<slug>`) and a media gallery
 * link (`/media/browse?context=<slug>`) are service-shaped hrefs the template
 * only renders, so the service fixes the destination and its encoding in one
 * place and no template can drift to a different form of the same link.
 */
import { describe, it, expect } from 'vitest';
import { scanSource } from '../fixtures/sourceTree';

describe('templates render service-shaped filter and gallery hrefs', () => {
  // Defect caught: a template builds `?family={{slug}}` or `?context={{slug}}`
  // itself, so the link skips the service's encoding and can point somewhere
  // other than the destination the service shapes for the same family or tag.
  it('no template interpolates a slug into a family-filter or gallery-context query', () => {
    for (const needle of ['family={{', 'context={{']) {
      const hits = scanSource(needle, { roots: ['src/views'], exts: ['.hbs'] });
      expect(hits, `templates assembling "${needle}"`).toEqual([]);
    }
  });
});
