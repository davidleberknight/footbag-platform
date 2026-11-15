/**
 * The rules every freestyle operator meets, and the rules for a modifier's place
 * in the browse-by-modifier view, shared by the editors and the rebuild seeder:
 * one operator per slug, a name and a definition, a kind from the fixed list, and
 * an operators-page group the page defines that always travels with a whole-number
 * position; a browse group the view defines, never the catch-all by name.
 */
import { describe, it, expect } from 'vitest';
import {
  operatorProblems,
  modifierBrowseProblems,
  type OperatorRuleInput,
} from '../../src/services/freestyleOperatorRules';

const op = (slug: string, o: Partial<OperatorRuleInput> = {}): OperatorRuleInput => ({
  slug, name: 'Name', kind: 'body', definition: 'What it is.', pageGroup: null, pageOrder: null, ...o,
});
const fieldsOf = (ops: OperatorRuleInput[]) => operatorProblems(ops).map((p) => `${p.slug}:${p.field}`);

describe('operatorProblems', () => {
  // Defect caught: a sound set of operators is refused, so the seeder stops every rebuild.
  it('finds nothing in sound operators, listed and unlisted', () => {
    expect(operatorProblems([
      op('paradox', { kind: 'core', pageGroup: 'entry-side-relationship', pageOrder: 10 }),
      op('double', { kind: 'quantifier' }),
    ])).toEqual([]);
  });

  // Defect caught: two operators at one page address.
  it('refuses a repeated slug and a slug that cannot be an address', () => {
    expect(fieldsOf([op('gyro'), op('gyro')])).toEqual(['gyro:slug']);
    expect(fieldsOf([op('Gyro')])).toEqual(['Gyro:slug']);
    expect(fieldsOf([op('gy-ro')])).toEqual(['gy-ro:slug']);
  });

  // Defect caught: an operator the pages cannot name or say anything about.
  it('refuses a blank name and a blank definition', () => {
    expect(fieldsOf([op('a', { name: ' ' })])).toEqual(['a:name']);
    expect(fieldsOf([op('b', { definition: '' })])).toEqual(['b:definition']);
  });

  // Defect caught: an operator filed under a kind or a page group no page knows.
  it('refuses an unknown kind and an unknown page group', () => {
    expect(fieldsOf([op('a', { kind: 'flying' })])).toEqual(['a:kind']);
    expect(fieldsOf([op('b', { pageGroup: 'no-such-group', pageOrder: 10 })])).toEqual(['b:pageGroup']);
  });

  // Defect caught: an operator listed with no place in its group, or placed in no group.
  it('refuses a group with no position, and a position with no group', () => {
    expect(fieldsOf([op('a', { pageGroup: 'body-rotation', pageOrder: null })])).toEqual(['a:pageGroup']);
    expect(fieldsOf([op('b', { pageOrder: 10 })])).toEqual(['b:pageGroup']);
    expect(fieldsOf([op('c', { pageGroup: 'body-rotation', pageOrder: 1.5 })])).toEqual(['c:pageGroup']);
  });
});

describe('modifierBrowseProblems', () => {
  // Defect caught: a sound placement refused, or no placement refused.
  it('accepts a group the view defines, and no group at all', () => {
    expect(modifierBrowseProblems({ group: 'rotational-body', order: 10 })).toEqual([]);
    expect(modifierBrowseProblems({ group: null, order: null })).toEqual([]);
  });

  // Defect caught: a modifier filed under a group the view never shows.
  it('refuses an unknown group, the catch-all named directly, and a fractional position', () => {
    expect(modifierBrowseProblems({ group: 'no-such-group', order: null })).toHaveLength(1);
    expect(modifierBrowseProblems({ group: 'other', order: null })).toHaveLength(1);
    expect(modifierBrowseProblems({ group: null, order: 1.5 })).toHaveLength(1);
  });
});
