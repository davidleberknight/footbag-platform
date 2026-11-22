/**
 * Every published Difficulty breakdown adds up, to the ADD the dictionary stores.
 *
 * A trick page shows its curator breakdown beside the row's own ADD, so a
 * breakdown whose terms fall short shows a reader arithmetic that does not
 * reach the total printed next to it. Each term is either a value in
 * parentheses ("paradox(+1)", "whirl(3)") or a bracket token ("[DEX]"), worth
 * one; the terms on the left of "=" must sum to the stated total, and the
 * stated total must be the trick's stored ADD.
 *
 * Asserted against the dictionary snapshot fixture, which mirrors the built
 * dictionary, so the two sides are independently maintained declarations.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { RESOLVED_ADD_FORMULAS } from '../../freestyle/inputs/curator_content/freestyleResolvedFormulas';

const snapshot = JSON.parse(readFileSync(
  join(process.cwd(), 'tests/fixtures/freestyleDictionarySnapshot.json'), 'utf8',
)) as { tricks: Array<{ slug: string; adds: string | null }> };
const storedAdd = new Map(snapshot.tricks.map(t => [t.slug, Number(t.adds)]));

/** The terms' sum and the stated total of one breakdown. */
function arithmetic(derivation: string): { sum: number; total: number } {
  const [lhs, rhs = ''] = derivation.split('=');
  const valued = [...lhs.matchAll(/\(\+?(\d+)\)/g)].reduce((a, m) => a + Number(m[1]), 0);
  const tokens = lhs.match(/\[[A-Z]+\]/g)?.length ?? 0;
  return { sum: valued + tokens, total: Number(/(\d+)\s*ADD/.exec(rhs)?.[1]) };
}

describe('the published Difficulty breakdowns', () => {
  // Defect caught: a breakdown whose terms do not reach the total printed
  // beside it, as the leading-dexterity tricks did before their lead was named.
  it('each sums to its stated total, and that total is the stored ADD', () => {
    const wrong = RESOLVED_ADD_FORMULAS.flatMap(f => {
      const { sum, total } = arithmetic(f.derivation);
      const stored = storedAdd.get(f.slug);
      return sum === total && total === stored ? [] : [`${f.slug}: terms ${sum}, stated ${total}, stored ${stored}`];
    });
    expect(wrong).toEqual([]);
  });

  // Defect caught: the scored lead in front of a symposium chassis credited to
  // miraging, which carries no registry weight, or left out of the breakdown.
  it('writes the unnamed lead of the five symposium-chassis tricks as a leading dexterity', () => {
    const expected: Record<string, number> = {
      armageddon: 6, mofly: 6, paratoxic: 6, big_apple_sauce: 8, spinning_miraging_symposium_torque: 7,
    };
    for (const [slug, add] of Object.entries(expected)) {
      const f = RESOLVED_ADD_FORMULAS.find(x => x.slug === slug);
      expect(f, slug).toBeDefined();
      expect(f!.derivation, slug).toContain('leading dexterity(+1)');
      expect(f!.derivation, slug).not.toMatch(/miraging/i);
      expect(arithmetic(f!.derivation).total, slug).toBe(add);
    }
  });

  // Defect caught: a trailing swirl dexterity left out of the breakdown, or
  // scored differently from the Double Over Down Swirl it mirrors.
  it('credits the trailing swirl as an out dex, as Double Over Down Swirl does', () => {
    for (const slug of ['double_over_down_swirl', 'pixie_quantum_double_over_down_swirl']) {
      const f = RESOLVED_ADD_FORMULAS.find(x => x.slug === slug);
      expect(f?.derivation, slug).toContain('out dex(1)');
    }
  });
});
