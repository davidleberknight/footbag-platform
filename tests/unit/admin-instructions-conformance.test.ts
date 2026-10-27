/**
 * Every administrator page opens with the shared instructions block, so an
 * administrator always learns what a screen does, why, how to use it, and what
 * it does that they would not guess, before they act on it.
 *
 * This scan proves each admin template includes the partial; the admin gate
 * sweep in the authorization matrix proves the page services fill it.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const ADMIN_VIEWS_DIR = path.resolve(__dirname, '..', '..', 'src', 'views', 'admin');

function adminTemplates(): string[] {
  return readdirSync(ADMIN_VIEWS_DIR, { recursive: true })
    .filter((p): p is string => typeof p === 'string' && p.endsWith('.hbs'))
    .sort();
}

describe('admin instructions block', () => {
  it('is included by every administrator template', () => {
    // Defect caught: a new admin page ships with no instructions, so an
    // administrator meets an unexplained screen and its consequences unwarned.
    const templates = adminTemplates();
    expect(templates.length).toBeGreaterThan(50);
    const missing = templates.filter(
      (rel) => !readFileSync(path.join(ADMIN_VIEWS_DIR, rel), 'utf8').includes('{{> admin-instructions}}'),
    );
    expect(missing, 'admin templates without the instructions block').toEqual([]);
  });
});
