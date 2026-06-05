/**
 * Static lint: every `res.redirect(` site in `src/controllers/` must declare
 * its HTTP status explicitly: "the framework's implicit 302 default
 * does not reach the wire: every redirect site sets its status explicitly."
 * The one exemption is the `/login?returnTo=...` redirect from `requireAuth`
 * middleware in `src/middleware/auth.ts`; controller code does not get the
 * implicit-302 free pass.
 *
 * Reads the controller sources from disk so the lint catches new bare
 * `res.redirect(<path>)` calls the moment they land. Allow-list is empty by
 * design: if a controller needs to issue an unstatused redirect, the design
 * needs to change, not this lint.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const CONTROLLERS_DIR = join(process.cwd(), 'src', 'controllers');

function listTsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...listTsFiles(full));
    else if (name.endsWith('.ts')) out.push(full);
  }
  return out;
}

interface BareRedirect {
  file: string;
  line: number;
  source: string;
}

function findBareRedirects(file: string): BareRedirect[] {
  const text = readFileSync(file, 'utf8');
  const lines = text.split('\n');
  const out: BareRedirect[] = [];
  // Matches `res.redirect(` followed by something that is NOT a digit
  // (which would be the explicit status code). Allow whitespace before
  // the first argument. The TypeScript signature for the bare form is
  // `redirect(url: string)`; for explicit-status it's `redirect(status: number, url: string)`.
  const re = /\bres\.redirect\(\s*(?!\d)/;
  lines.forEach((source, idx) => {
    if (re.test(source)) {
      out.push({ file, line: idx + 1, source: source.trim() });
    }
  });
  return out;
}

describe('redirect-status lint', () => {
  it('no controller emits a bare res.redirect(<path>) without an explicit status code', () => {
    const offenders: BareRedirect[] = [];
    for (const f of listTsFiles(CONTROLLERS_DIR)) {
      offenders.push(...findBareRedirects(f));
    }

    if (offenders.length > 0) {
      const report = offenders
        .map((o) => `  ${o.file}:${o.line}  ${o.source}`)
        .join('\n');
      throw new Error(
        `Found ${offenders.length} controller redirect(s) without an explicit status code.\n` +
        `Every redirect site must declare its HTTP status explicitly:\n` +
        `${report}\n` +
        `Fix: change res.redirect(<path>) to res.redirect(302|303|301, <path>) per intent.`,
      );
    }
    expect(offenders).toEqual([]);
  });
});
