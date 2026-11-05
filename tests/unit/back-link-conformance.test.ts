/**
 * Back-link conformance: a page's back link is a breadcrumb one level deep,
 * shaped by its service as `navigation.contextLinks` and drawn only by the
 * shared back-link partial.
 *
 * Two checks keep it one control site-wide. Every template that draws the
 * page's context links does so through the partial, so no page renders a back
 * link as a button, as muted text or in its own spacing. And every label a
 * service or controller authors reads "Back to <the parent page>" in Title
 * Case, the casing rule imported rather than restated.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { REPO_ROOT, scanSource } from '../fixtures/sourceTree';
import { toTitleCase } from '../../src/lib/titleCase';

const PARTIAL = 'src/views/partials/back-link.hbs';

// A context-link array literal in service or controller source, and each label in it.
const CONTEXT_LINKS = /contextLinks:\s*(?:[^[\n]*\?\s*undefined\s*:\s*)?\[([\s\S]*?)\]/g;
const LABEL = /label:\s*(?:(['"])([^'"\\\n]*)\1|`([^`\\\n]*)`)/g;

function read(rel: string): string {
  return readFileSync(path.join(REPO_ROOT, rel), 'utf8');
}

describe('back-link conformance', () => {
  it('only the shared partial draws a page\'s context links', () => {
    // A template looping the links itself is how the back link came to be drawn
    // five ways: as a button, as muted text, and in hand-written spacing.
    const drawers = scanSource('navigation.contextLinks', { roots: ['src/views'], exts: ['.hbs'] });
    expect(drawers).toContain(PARTIAL);
    // Administrative tooling keeps its own controls: the link design decision exempts it.
    const publicDrawers = drawers.filter((f) => f !== PARTIAL && !f.startsWith('src/views/admin/'));
    expect(publicDrawers).toEqual([]);
  });

  it('every authored back label reads "Back to ..." in Title Case', () => {
    const files = scanSource('contextLinks:', { roots: ['src/services', 'src/controllers'], exts: ['.ts'] });
    const offenders: string[] = [];
    let scanned = 0;
    for (const file of files) {
      const source = read(file);
      for (const block of source.matchAll(CONTEXT_LINKS)) {
        for (const m of block[1].matchAll(LABEL)) {
          const text = (m[2] ?? m[3]).trim();
          scanned += 1;
          // A label naming no parent sends the reader somewhere they cannot predict.
          if (!text.startsWith('Back to ')) offenders.push(`${file}: "${text}" does not start "Back to "`);
          // An interpolated value keeps its owner's casing, so only static labels are re-cased.
          if (!text.includes('${') && toTitleCase(text) !== text) {
            offenders.push(`${file}: "${text}" -> "${toTitleCase(text)}"`);
          }
        }
      }
    }
    expect(offenders, offenders.join('\n')).toEqual([]);
    // A scanner that silently stopped matching would pass everything above.
    expect(scanned, 'context-link label scanner found almost nothing').toBeGreaterThan(20);
  });
});
