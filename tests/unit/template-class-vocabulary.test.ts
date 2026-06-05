/**
 * Template class-vocabulary contract: every literal CSS class token used in a
 * server-rendered template has a defining selector in
 * src/public/css/style.css. An undefined class renders unstyled in production
 * while route tests still pass, so the gap is invisible to the rest of the
 * suite.
 *
 * Mechanical scope:
 *   - Only class="..." attributes are scanned. An attribute containing
 *     Handlebars interpolation ({{...}}) composes class names dynamically and
 *     is skipped; dynamic compositions are covered by the route tests that
 *     render them.
 *   - A class counts as defined when `.name` appears in any selector in
 *     style.css (compound selectors count). CSS comments are stripped first
 *     so a name mentioned only in prose does not count as defined.
 *
 * Current: freestyle views and the freestyle-owned partials below are
 * excluded because those surfaces still predate the shared class vocabulary.
 * Target: the exclusion list shrinks to empty as the freestyle surfaces are
 * brought onto the shared vocabulary; do not add non-freestyle entries.
 *
 * The exclusions are self-tightening: a companion test fails as soon as an
 * excluded file (or the freestyle views directory, or the freestyle region of
 * style.css) becomes compliant, naming the exclusion that must be removed.
 * Cleaning a freestyle surface therefore forces the matching exclusion to be
 * pruned in the same change, and the last pruning extends the font-family
 * gate in scripts/ci/assert_conventions.sh to scan the whole stylesheet.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import * as path from 'node:path';

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const VIEWS_DIR = path.join(REPO_ROOT, 'src', 'views');
const STYLESHEET = path.join(REPO_ROOT, 'src', 'public', 'css', 'style.css');

const EXCLUDED_DIRS = ['src/views/freestyle'];
const EXCLUDED_FILES = new Set([
  'src/views/partials/derivation-panel.hbs',
  'src/views/partials/dictionary-trick-card.hbs',
  'src/views/partials/freestyle-modifier-reference.hbs',
  'src/views/partials/glossary-sidebar.hbs',
  'src/views/partials/operator-board.hbs',
  'src/views/partials/trick-about.hbs',
  'src/views/partials/trick-add-analysis.hbs',
  'src/views/partials/trick-comparative-row.hbs',
  'src/views/partials/trick-equivalence-topology.hbs',
  'src/views/partials/trick-hero.hbs',
  'src/views/partials/trick-media-grid.hbs',
  'src/views/partials/trick-parallels.hbs',
  'src/views/partials/trick-pathways.hbs',
  'src/views/partials/trick-progression.hbs',
  'src/views/partials/trick-records.hbs',
  'src/views/partials/trick-structural.hbs',
  'src/views/partials/trick-transform.hbs',
]);

function walkHbs(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...walkHbs(full));
    } else if (entry.endsWith('.hbs')) {
      out.push(full);
    }
  }
  return out;
}

function relPath(full: string): string {
  return path.relative(REPO_ROOT, full).split(path.sep).join('/');
}

function definedClassNames(): Set<string> {
  const css = readFileSync(STYLESHEET, 'utf8').replace(/\/\*[\s\S]*?\*\//g, ' ');
  const names = new Set<string>();
  for (const m of css.matchAll(/\.([A-Za-z_-][A-Za-z0-9_-]*)/g)) {
    names.add(m[1]);
  }
  return names;
}

function literalClassTokens(template: string): string[] {
  const body = template
    .replace(/\{\{!--[\s\S]*?--\}\}/g, ' ')
    .replace(/\{\{![^}]*\}\}/g, ' ');
  const tokens: string[] = [];
  for (const m of body.matchAll(/class="([^"]*)"/g)) {
    const attr = m[1];
    if (attr.includes('{{')) continue;
    for (const tok of attr.split(/\s+/)) {
      if (/^[A-Za-z_-][A-Za-z0-9_-]*$/.test(tok)) tokens.push(tok);
    }
  }
  return tokens;
}

describe('template class vocabulary', () => {
  it('every literal class token in a non-excluded template has a rule in style.css', () => {
    const defined = definedClassNames();
    const violations: string[] = [];

    for (const file of walkHbs(VIEWS_DIR)) {
      const rel = relPath(file);
      if (EXCLUDED_DIRS.some((d) => rel.startsWith(`${d}/`))) continue;
      if (EXCLUDED_FILES.has(rel)) continue;

      const undefinedTokens = new Set(
        literalClassTokens(readFileSync(file, 'utf8')).filter((t) => !defined.has(t)),
      );
      for (const tok of undefinedTokens) {
        violations.push(`${rel}: class "${tok}" has no rule in src/public/css/style.css`);
      }
    }

    expect(violations, violations.join('\n')).toEqual([]);
  });

  it('every EXCLUDED_FILES entry still needs its exclusion (prune entries as files become compliant)', () => {
    const defined = definedClassNames();
    const stale: string[] = [];

    for (const rel of EXCLUDED_FILES) {
      const full = path.join(REPO_ROOT, ...rel.split('/'));
      let undefinedTokens: string[];
      try {
        undefinedTokens = literalClassTokens(readFileSync(full, 'utf8')).filter(
          (t) => !defined.has(t),
        );
      } catch {
        stale.push(`${rel}: listed in EXCLUDED_FILES but the file no longer exists`);
        continue;
      }
      if (undefinedTokens.length === 0) {
        stale.push(
          `${rel}: every class token now has a style.css rule; remove it from EXCLUDED_FILES`,
        );
      }
    }

    expect(stale, stale.join('\n')).toEqual([]);
  });

  it('the freestyle views directory still needs its exclusion (drop EXCLUDED_DIRS when compliant)', () => {
    const defined = definedClassNames();
    const dir = path.join(REPO_ROOT, 'src', 'views', 'freestyle');
    const stillGhosted = walkHbs(dir).some((file) =>
      literalClassTokens(readFileSync(file, 'utf8')).some((t) => !defined.has(t)),
    );
    expect(
      stillGhosted,
      'src/views/freestyle is fully on the shared vocabulary; remove it from EXCLUDED_DIRS',
    ).toBe(true);
  });

  it('the stylesheet freestyle region still needs the font-gate cutoff (extend the gate when compliant)', () => {
    const css = readFileSync(STYLESHEET, 'utf8');
    const lines = css.split('\n');
    const banner = lines.findIndex((l) => l === '   Freestyle records');
    expect(banner, 'freestyle section banner not found in style.css').toBeGreaterThan(-1);

    const rawFontFamily = lines
      .slice(banner)
      .some(
        (l) =>
          /font-family:/.test(l) &&
          !/font-family:\s*var\(--font-(body|mono)\)/.test(l) &&
          !/font-family:\s*inherit/.test(l),
      );
    expect(
      rawFontFamily,
      'the freestyle region of style.css no longer carries raw font-family stacks; ' +
        'remove the "Freestyle records" early-exit from the font-family check in ' +
        'scripts/ci/assert_conventions.sh so it scans the whole file',
    ).toBe(true);
  });
});
