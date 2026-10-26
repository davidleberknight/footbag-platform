/**
 * A sub-heading is a plain heading, never a second section heading.
 *
 * The site has one section-heading system: the `.section-heading` class on, or
 * wrapped around, a section's `<h2>`. A heading below that level inside a
 * section is a plain `<h3>` (or lower), so every page keeps one heading rhythm.
 * Giving a sub-heading the section-heading class, or wrapping it in a second
 * `.section-heading` block, pulls in the section's flex row and gaps; the
 * stylesheet then grows a rule to undo them, and the same page ends up with
 * sub-headings spaced two ways.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import { REPO_ROOT, scanSource } from '../fixtures/sourceTree';

const templates = scanSource('section-heading', { roots: ['src/views'], exts: ['.hbs'] });
const sources = templates.map((rel) => ({ rel, text: readFileSync(path.join(REPO_ROOT, rel), 'utf8') }));

const CLASSED_SUB_HEADING = /<h([3-6])\b[^>]*class="[^"]*\bsection-heading\b[^"]*"/g;
const WRAPPER_FIRST_HEADING = /<(?!h\d)([a-z]+)\b[^>]*class="[^"]*\bsection-heading\b[^"]*"[^>]*>\s*<h([1-6])\b/g;

function lineOf(text: string, index: number): number {
  return text.slice(0, index).split('\n').length;
}

describe('sub-headings inside a section', () => {
  it('never carry the section-heading class', () => {
    const offenders: string[] = [];
    for (const { rel, text } of sources) {
      for (const m of text.matchAll(CLASSED_SUB_HEADING)) offenders.push(`${rel}:${lineOf(text, m.index!)} <h${m[1]}>`);
    }
    // A sub-heading with the class is spaced as a section heading, unlike its plain siblings.
    expect(offenders, offenders.join('\n')).toEqual([]);
  });

  it('wrap only an h2 in a section-heading block', () => {
    const wrapped: string[] = [];
    const offenders: string[] = [];
    for (const { rel, text } of sources) {
      for (const m of text.matchAll(WRAPPER_FIRST_HEADING)) {
        wrapped.push(m[2]);
        if (m[2] !== '2') offenders.push(`${rel}:${lineOf(text, m.index!)} wraps <h${m[2]}>`);
      }
    }
    // The scan has to see the site's real section headings, or an empty match would pass.
    expect(wrapped.filter((level) => level === '2').length, 'section-heading wrappers around an h2 are found').toBeGreaterThan(0);
    // A second section-heading block inside a section is a second heading system on one page.
    expect(offenders, offenders.join('\n')).toEqual([]);
  });
});
