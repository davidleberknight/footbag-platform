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

    for (const file of walkHbs(VIEWS_DIR)) {
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
});
