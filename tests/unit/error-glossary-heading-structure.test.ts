/**
 * Heading-structure conformance for the error pages and the freestyle glossary.
 *
 * Every error page's primary heading is the page's single <h1> (page.title per
 * the view-layer page contract), never an <h2> with no <h1> above it. The
 * glossary is a long, heading-dense page; its heading levels must step down by
 * at most one at a time, with no skip (e.g. an <h2> section followed directly by
 * an <h4>), which assistive-technology users rely on to navigate by heading.
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const VIEWS = path.join(process.cwd(), 'src', 'views');
const ERROR_PAGES = ['not-found', 'conflict', 'forbidden', 'unavailable', 'form-error'];

function headingLevels(html: string): number[] {
  return [...html.matchAll(/<h([1-6])\b/g)].map((m) => Number(m[1]));
}

describe('error pages carry a single top-level <h1>', () => {
  for (const name of ERROR_PAGES) {
    it(`errors/${name}.hbs has exactly one <h1> and no <h2>`, () => {
      const src = fs.readFileSync(path.join(VIEWS, 'errors', `${name}.hbs`), 'utf8');
      const levels = headingLevels(src);
      expect(levels.filter((l) => l === 1)).toHaveLength(1);
      expect(levels.filter((l) => l === 2)).toHaveLength(0);
    });
  }
});

describe('freestyle glossary heading levels never skip', () => {
  it('every heading in glossary.hbs steps down by at most one level', () => {
    const src = fs.readFileSync(path.join(VIEWS, 'freestyle', 'glossary.hbs'), 'utf8');
    const levels = headingLevels(src);
    const skips = levels
      .map((l, i) => (i > 0 && l > levels[i - 1] + 1 ? { at: i, from: levels[i - 1], to: l } : null))
      .filter(Boolean);
    expect(skips).toEqual([]);
  });
});
