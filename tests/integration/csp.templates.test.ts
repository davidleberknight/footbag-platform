/**
 * Regression: no Handlebars template carries an inline event-handler
 * attribute or inline `style=""` attribute. The CSP is `script-src-attr
 * 'none'` and `style-src 'self'`, so
 * inline `onsubmit`, `onclick`, etc., and inline `style=""` are silently
 * blocked by modern browsers. Confirmation dialogs on delete forms and
 * other delegated handlers must use `data-*` attributes + a script under
 * src/public/js/.
 *
 * Scans every `.hbs` file under src/views and asserts zero matches.
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

function walk(dir: string, out: string[]): void {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.isFile() && entry.name.endsWith('.hbs')) out.push(full);
  }
}

const VIEWS_DIR = path.join(process.cwd(), 'src', 'views');
const TEMPLATE_FILES: string[] = [];
walk(VIEWS_DIR, TEMPLATE_FILES);

// Inline event-handler attributes. Pattern matches the attribute introducer
// (whitespace + on + word + =). The `\b` boundaries keep us off
// substrings like `lazyOn=` (none currently exist, but defensive).
const INLINE_HANDLER_RE = /\son[a-z]+=["']/i;

// Inline style attribute. Allows style elements (<style>...</style>) which
// are a separate CSP concern; this only flags style="..." on individual
// elements.
const INLINE_STYLE_RE = /\sstyle=["']/i;

describe('CSP template scan — no inline event handlers or inline styles', () => {
  it('no .hbs template carries an inline on*= attribute', () => {
    const offenders: Array<{ file: string; line: number; text: string }> = [];
    for (const file of TEMPLATE_FILES) {
      const content = fs.readFileSync(file, 'utf8');
      content.split(/\r?\n/).forEach((line, idx) => {
        if (INLINE_HANDLER_RE.test(line)) {
          offenders.push({ file, line: idx + 1, text: line.trim() });
        }
      });
    }
    if (offenders.length > 0) {
      const rendered = offenders
        .map(o => `  ${path.relative(process.cwd(), o.file)}:${o.line}  ${o.text}`)
        .join('\n');
      throw new Error(
        `Found ${offenders.length} inline event-handler attribute(s). CSP script-src-attr 'none' blocks these silently:\n${rendered}`,
      );
    }
    expect(offenders.length).toBe(0);
  });

  it('no .hbs template carries an inline style="" attribute', () => {
    const offenders: Array<{ file: string; line: number; text: string }> = [];
    for (const file of TEMPLATE_FILES) {
      const content = fs.readFileSync(file, 'utf8');
      content.split(/\r?\n/).forEach((line, idx) => {
        if (INLINE_STYLE_RE.test(line)) {
          offenders.push({ file, line: idx + 1, text: line.trim() });
        }
      });
    }
    if (offenders.length > 0) {
      const rendered = offenders
        .map(o => `  ${path.relative(process.cwd(), o.file)}:${o.line}  ${o.text}`)
        .join('\n');
      throw new Error(
        `Found ${offenders.length} inline style="" attribute(s). CSP style-src 'self' blocks these silently. Move to a class in src/public/css/style.css:\n${rendered}`,
      );
    }
    expect(offenders.length).toBe(0);
  });
});
