/**
 * Structural guard: no Handlebars template may nest one <form> inside another.
 *
 * HTML forbids nested forms. When a template wraps a <form> inside another
 * <form>, the browser closes the OUTER form at the first </form>, silently
 * orphaning every control after it — including the submit button — so the form
 * cannot be submitted (the page "saves nothing" and stays put). This is a
 * production-only, browser-semantics failure that route/supertest tests do not
 * catch, because the server-side handler is correct and the rendered HTML still
 * contains all the tags. Regression: members/profile-edit.hbs nested the
 * legacy-anchor add/remove forms inside the profile form and orphaned Save.
 *
 * This scan is the cheap floor; scripts/ci/assert_conventions.sh mirrors it as
 * the merge gate.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const VIEWS_DIR = path.resolve(__dirname, '..', '..', 'src', 'views');

function hbsFiles(): string[] {
  return readdirSync(VIEWS_DIR, { recursive: true })
    .filter((p): p is string => typeof p === 'string' && p.endsWith('.hbs'))
    .map((p) => path.join(VIEWS_DIR, p));
}

/** Walk <form>/</form> tags in document order; report nesting depth + balance. */
function formNesting(src: string): { maxDepth: number; endDepth: number } {
  const re = /<form\b|<\/form>/g;
  let depth = 0;
  let maxDepth = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    if (m[0] === '</form>') {
      depth -= 1;
    } else {
      depth += 1;
      if (depth > maxDepth) maxDepth = depth;
    }
  }
  return { maxDepth, endDepth: depth };
}

describe('Handlebars templates — no nested <form> elements', () => {
  const files = hbsFiles();

  it('finds templates to scan', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files)('%s: form tags are non-nested and balanced', (file) => {
    const { maxDepth, endDepth } = formNesting(readFileSync(file, 'utf8'));
    expect(maxDepth).toBeLessThanOrEqual(1);
    expect(endDepth).toBe(0);
  });
});
