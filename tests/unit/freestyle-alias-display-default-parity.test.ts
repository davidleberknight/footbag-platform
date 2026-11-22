/**
 * The rule saying what an alias's class implies about publication, written twice.
 *
 * The running application decides it in TypeScript; the curated-override loader
 * decides the same thing in Python, where it chooses which rows are exceptions
 * and therefore which must carry a reason. They cannot share an implementation,
 * and a configuration layer holding one line would be worse than two lines. So
 * the two expressions are pinned equivalent here instead.
 *
 * If they ever drift, the loader and the editor disagree about which rows are
 * exceptions: a row the loader treats as ordinary would be one the editor
 * refuses to save without a reason, or worse, an exception the loader stops
 * requiring a reason for.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const REPO_ROOT = join(__dirname, '..', '..');
const SERVICE = join(REPO_ROOT, 'src', 'services', 'freestyleCurationService.ts');
const LOADER = join(REPO_ROOT, 'freestyle', 'loaders', '21b_apply_alias_overrides.py');

/** Every class the column stores, so the comparison covers the whole vocabulary. */
const CLASSES = ['common', 'historical', 'technical', 'structural',
  'positional', 'typo', 'suppressed', 'ambiguous'];

/**
 * The shown-by-default classes the TypeScript side names.
 *
 * Read from the source rather than imported, because importing the service pulls
 * in a database connection this test has no need of, and because the point is to
 * compare two written expressions rather than to exercise one of them.
 */
function typescriptShownClasses(): string[] {
  const src = readFileSync(SERVICE, 'utf8');
  const m = src.match(/const SHOWN_ALIAS_TYPES\s*=\s*\[([^\]]*)\]/);
  expect(m, 'the application no longer names its shown classes in one place').not.toBeNull();
  return [...m![1].matchAll(/'([a-z]+)'/g)].map(x => x[1]);
}

/** The same judgement as the loader expresses it. */
function pythonShownClasses(): string[] {
  const src = readFileSync(LOADER, 'utf8');
  const m = src.match(/^SHOWN_ALIAS_TYPES\s*=\s*\(([^)]*)\)/m);
  expect(m, 'the loader no longer names its shown classes in one place').not.toBeNull();
  // Both the per-row exception check and the closing report must decide from
  // that one list, or the loader disagrees with itself.
  expect(src, 'the loader no longer decides exceptions from the list')
    .toMatch(/\(adisplay == 1\) != \(atype in SHOWN_ALIAS_TYPES\)/);
  expect(src, 'the loader no longer reports exceptions from the list')
    .toMatch(/<> \(alias_type IN \(\{shown\}\)\)[\s\S]{0,80}SHOWN_ALIAS_TYPES\)/);
  return [...m![1].matchAll(/"([a-z]+)"/g)].map(x => x[1]);
}

describe('the class-to-publication default, in both languages', () => {
  it('names the same classes as shown by default', () => {
    expect(pythonShownClasses().sort()).toEqual(typescriptShownClasses().sort());
  });

  it('shows community and structural names and nothing else', () => {
    // Defect caught: a structural name of a trick hidden from its page by
    // default, or a search-only class (abbreviation, old term, misspelling)
    // printed there.
    expect(typescriptShownClasses().sort()).toEqual(['common', 'structural']);
  });

  it('agrees on every class the column stores, not only the shown ones', () => {
    // Stated over the whole vocabulary so adding a ninth class cannot pass by
    // being absent from both lists for different reasons.
    const ts = new Set(typescriptShownClasses());
    const py = new Set(pythonShownClasses());
    for (const cls of CLASSES) {
      expect(ts.has(cls), `the two disagree about ${cls}`).toBe(py.has(cls));
    }
  });
});
