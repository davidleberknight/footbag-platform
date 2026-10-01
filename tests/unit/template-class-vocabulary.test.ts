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
 * Every template under src/views is in scope, including every freestyle
 * surface: the whole site shares one class vocabulary.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import * as path from 'node:path';

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const VIEWS_DIR = path.join(REPO_ROOT, 'src', 'views');
const STYLESHEET = path.join(REPO_ROOT, 'src', 'public', 'css', 'style.css');
const BASELINE = path.join(REPO_ROOT, 'tests', 'unit', 'template-class-baseline.txt');

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
  it('every literal class token in a template has a rule in style.css', () => {
    const defined = definedClassNames();
    const violations: string[] = [];
    const templates = walkHbs(VIEWS_DIR);
    // A scan that finds no templates, or no defined classes, passes having
    // checked nothing.
    expect(templates.length, `no .hbs files found under ${VIEWS_DIR}`).toBeGreaterThan(50);
    expect(defined.size, 'no class rules parsed from style.css').toBeGreaterThan(50);

    for (const file of templates) {
      const rel = relPath(file);
      const undefinedTokens = new Set(
        literalClassTokens(readFileSync(file, 'utf8')).filter((t) => !defined.has(t)),
      );
      for (const tok of undefinedTokens) {
        violations.push(`${rel}: class "${tok}" has no rule in src/public/css/style.css`);
      }
    }

    expect(violations, violations.join('\n')).toEqual([]);
  });

  // A class minted for one page passes the check above as soon as it is
  // defined, which is how a section grows a parallel design language. The
  // baseline makes every new class a reviewed change, and fails on an entry no
  // template uses, so the per-section vocabulary can only shrink.
  it('every literal class token is in the committed baseline, and every baseline entry is used', () => {
    const baseline = new Set(
      readFileSync(BASELINE, 'utf8')
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line !== '' && !line.startsWith('#')),
    );
    expect(baseline.size, `no entries parsed from ${relPath(BASELINE)}`).toBeGreaterThan(50);

    const used = new Set<string>();
    const unlisted: string[] = [];
    for (const file of walkHbs(VIEWS_DIR)) {
      for (const tok of new Set(literalClassTokens(readFileSync(file, 'utf8')))) {
        used.add(tok);
        if (!baseline.has(tok)) {
          unlisted.push(
            `${relPath(file)}: class "${tok}" is new; use an existing class, or add it to the shared standard and to ${relPath(BASELINE)} in the same reviewed change`,
          );
        }
      }
    }
    const stale = [...baseline]
      .filter((tok) => !used.has(tok))
      .map((tok) => `${relPath(BASELINE)}: "${tok}" is no longer used by any template; delete the entry`);

    const violations = [...unlisted, ...stale];
    expect(violations, violations.join('\n')).toEqual([]);
  });
});
