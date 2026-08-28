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
 * The nickname classes the TypeScript side names.
 *
 * Read from the source rather than imported, because importing the service pulls
 * in a database connection this test has no need of, and because the point is to
 * compare two written expressions rather than to exercise one of them.
 */
function typescriptNicknameClasses(): string[] {
  const src = readFileSync(SERVICE, 'utf8');
  const m = src.match(/const NICKNAME_ALIAS_TYPES\s*=\s*\[([^\]]*)\]/);
  expect(m, 'the application no longer names its nickname classes in one place').not.toBeNull();
  return [...m![1].matchAll(/'([a-z]+)'/g)].map(x => x[1]);
}

/** The same judgement as the loader expresses it, in its exception test. */
function pythonNicknameClasses(): string[] {
  const src = readFileSync(LOADER, 'utf8');
  // Both the per-row exception check and the closing report compare display
  // against membership of one class; either spelling yields the class name.
  const inline = src.match(/\(adisplay == 1\) != \(atype == "([a-z]+)"\)/);
  const report = src.match(/\(alias_display = 1\) <> \(alias_type = '([a-z]+)'\)/);
  expect(inline, 'the loader no longer decides exceptions from the class').not.toBeNull();
  expect(report, 'the loader no longer reports exceptions from the class').not.toBeNull();
  expect(inline![1], 'the loader disagrees with itself between its check and its report')
    .toBe(report![1]);
  return [inline![1]];
}

describe('the class-to-publication default, in both languages', () => {
  it('names the same classes as publishable', () => {
    expect(pythonNicknameClasses().sort()).toEqual(typescriptNicknameClasses().sort());
  });

  it('agrees on every class the column stores, not only the publishable one', () => {
    // Stated over the whole vocabulary so adding a ninth class cannot pass by
    // being absent from both lists for different reasons.
    const ts = new Set(typescriptNicknameClasses());
    const py = new Set(pythonNicknameClasses());
    for (const cls of CLASSES) {
      expect(ts.has(cls), `the two disagree about ${cls}`).toBe(py.has(cls));
    }
  });
});
