/**
 * Structural guard: no template puts an aria-label on a plain-text element.
 *
 * An aria-label names a control or a landmark that has no visible text of its
 * own. On a span, paragraph, div or similar element with no role, the
 * accessibility rules do not allow it, so screen readers ignore it or read it
 * inconsistently: the page looks labelled to its author and says nothing to the
 * listener. The automated accessibility scan reports this only as "needs
 * review", never as a failure, which is how it spread unnoticed. A plain-text
 * element carries its meaning in its visible text; an element that needs a name
 * of its own takes a role that admits one.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const VIEWS_DIR = path.join(REPO_ROOT, 'src', 'views');

/** Elements with no implicit role that admits a name. */
const PLAIN_TEXT_ELEMENTS = [
  'span', 'p', 'div', 'li', 'dd', 'dt', 'code', 'strong', 'em', 'small', 'td', 'th',
  // A header or footer inside main or an article is a generic element, not a
  // landmark, so a name on it reaches nobody.
  'header', 'footer',
];

function hbsFiles(): string[] {
  return readdirSync(VIEWS_DIR, { recursive: true })
    .filter((p): p is string => typeof p === 'string' && p.endsWith('.hbs'))
    .map((p) => path.join(VIEWS_DIR, p));
}

/** Opening tags of plain-text elements that carry an aria-label and no role. */
function plainTextAriaLabels(src: string): string[] {
  const body = src.replace(/\{\{!--[\s\S]*?--\}\}/g, ' ').replace(/\{\{![^}]*\}\}/g, ' ');
  const tag = new RegExp(`<(${PLAIN_TEXT_ELEMENTS.join('|')})\\b[^>]*>`, 'g');
  return [...body.matchAll(tag)]
    .map((m) => m[0])
    .filter((t) => /\baria-label=/.test(t) && !/\brole=/.test(t));
}

describe('template aria-label placement', () => {
  it('finds the defect it guards against', () => {
    expect(plainTextAriaLabels('<span class="x" aria-label="Also called">a</span>')).toHaveLength(1);
    expect(plainTextAriaLabels('<div class="x" role="group" aria-label="Filters">')).toEqual([]);
    expect(plainTextAriaLabels('<nav aria-label="Breadcrumb">')).toEqual([]);
  });

  it('no plain-text element in any template carries an aria-label', () => {
    const files = hbsFiles();
    expect(files.length, `no .hbs files found under ${VIEWS_DIR}`).toBeGreaterThan(50);
    const violations: string[] = [];
    for (const file of files) {
      for (const t of plainTextAriaLabels(readFileSync(file, 'utf8'))) {
        violations.push(`${path.relative(REPO_ROOT, file)}: ${t}`);
      }
    }
    expect(violations, violations.join('\n')).toEqual([]);
  });
});
