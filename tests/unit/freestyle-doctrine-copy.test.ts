/**
 * Freestyle doctrine copy states the settled notation doctrine on its
 * authoritative teaching surfaces, and does not reintroduce the specific false
 * constructions the audit corrected.
 *
 * This suite inspects the exact token definitions, glossary entries, reusable
 * operator copy, and known teaching surfaces. It asserts the required positive
 * meanings and rejects the specific false constructions; it is deliberately NOT
 * a repository-wide banned-word scan, and it proves that legitimate execution
 * prose (symposium's no-plant discipline, stepping's plant-foot relocation)
 * remains untouched.
 *
 * Doctrine asserted:
 *  - SAME/OP are component-relative (read against the most recent side-bearing
 *    component, not a fixed plant foot) and are not synonyms for near/far.
 *  - [XBD] is a cross-body configuration/traversal, independent of SAME/OP, and
 *    is not defined by sharing the centreline-crossing idea with paradox.
 *  - [PDX] marks the paradox relationship on a dexterity; it is not a direction,
 *    and CLIP > OP IN [DEX] is an entry example, not the definition.
 *  - Tapping preserves the base identity and re-authors a downstream base
 *    component's side coordinate (Tapdown: OP OUT encoded as SAME OUT).
 *  - The settled X-Dex trigger set is Atomic/Quantum/Sailing (not Frantic).
 *  - Atom Smasher scores an xdex(+1), independent of [PDX] (never "paradox-like").
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(__dirname, '../..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');
const lineWith = (text: string, needle: string): string => {
  const l = text.split('\n').find((x) => x.includes(needle));
  if (l === undefined) throw new Error(`no line containing ${JSON.stringify(needle)}`);
  return l;
};

describe('SAME/OP are component-relative and not synonyms for near/far', () => {
  const svc = read('src/services/freestyleService.ts');
  const opRender = read('src/services/operationalNotationRendering.ts');
  const core = read('src/content/freestyleGlossaryCoreConcepts.ts');
  const moves = read('src/views/freestyle/moves.hbs');
  const glossary = read('src/views/freestyle/glossary.hbs');

  it('the SS/OP short-code definitions are component-relative', () => {
    const ss = lineWith(svc, "short: 'SS'");
    const op = lineWith(svc, "short: 'OP'");
    expect(ss).toMatch(/most recent side-bearing component/);
    expect(op).toMatch(/most recent side-bearing component/);
    expect(op).toMatch(/return to the original leg/);
    // not defined by a fixed plant foot
    expect(ss).not.toMatch(/plant-?foot|non-?plant/i);
    expect(op).not.toMatch(/plant-?foot|non-?plant/i);
  });

  it('the SS/OP short-code definitions do not use near/far as synonyms', () => {
    expect(lineWith(svc, "short: 'SS'")).not.toMatch(/near/i);
    expect(lineWith(svc, "short: 'OP'")).not.toMatch(/\bfar\b/i);
  });

  it('operational SAME/OP token strings are component-relative, not plant-foot', () => {
    const same = lineWith(opRender, 'SAME:');
    const op = lineWith(opRender, 'OP:');
    expect(same).toMatch(/most recent side-bearing component/);
    expect(op).toMatch(/most recent side-bearing component/);
    expect(same).not.toMatch(/plant foot/);
    expect(op).not.toMatch(/plant foot/);
  });

  it('the core-concepts side line rejects the fixed-plant-leg definition', () => {
    expect(core).toMatch(/read against the most recent side-bearing component rather than a fixed plant leg/);
    expect(core).not.toMatch(/travels relative to your plant leg/);
  });

  it('the set-notation side prose and glossary Sides block are component-relative', () => {
    expect(lineWith(moves, 'SAME or OP')).toMatch(/most recent side-bearing component/);
    expect(lineWith(moves, 'SAME or OP')).not.toMatch(/same side as the plant foot/);
    expect(glossary).toMatch(/most recent side-bearing component/);
  });
});

describe('entry-topology surfaces distinguish SAME/OP from near/far', () => {
  const add = read('src/content/freestyleAddAnalysisContent.ts');
  const ms = read('src/content/freestyleMovementSystems.ts');

  it('the ADD-analysis entry line keeps SAME/OP and near/far separate and component-relative', () => {
    const line = lineWith(add, 'Entry and side relationship');
    expect(line).toMatch(/SAME\/OP leg relation/);
    expect(line).toMatch(/most recent side-bearing component/);
    expect(line).toMatch(/separate near\/far/);
    expect(line).not.toMatch(/relative to the plant foot/);
  });

  it('the movement-systems entry axis keeps SAME/OP and near/far separate and component-relative', () => {
    expect(ms).toMatch(/SAME\/OP leg relation, read against the/);
    expect(ms).toMatch(/most recent side-bearing component/);
    expect(ms).toMatch(/separate near\/far position/);
  });
});

describe('[XBD] is cross-body and independent of SAME/OP', () => {
  const glossary = read('src/views/freestyle/glossary.hbs');
  const edu = read('src/services/symbolicModifierEducation.ts');

  it('the glossary XBD entry is independent of SAME/OP, not plant-foot opposite-side', () => {
    expect(glossary).toMatch(/records a cross-body configuration or traversal across the body's centreline/);
    expect(glossary).toMatch(/independent of the component's SAME\/OP relation; both SAME and OP components can be cross-body/);
    expect(glossary).not.toMatch(/opposite-side surface from the plant foot/);
  });

  it('XBD teaching copy does not share a centreline-crossing definition with paradox', () => {
    expect(edu).not.toMatch(/shares the centreline-crossing idea with paradox/);
    expect(edu).toMatch(/independent of SAME\/OP/);
  });
});

describe('[PDX] is a paradox-relationship marker, not a direction or a fixed formula', () => {
  const opRender = read('src/services/operationalNotationRendering.ts');
  const notation = read('src/services/notationRendering.ts');
  const svc = read('src/services/freestyleService.ts');
  const glossary = read('src/views/freestyle/glossary.hbs');

  it('no PDX token surface calls it a direction', () => {
    for (const f of [opRender, notation, svc, glossary]) {
      expect(f).not.toMatch(/paradox-direction/);
    }
  });

  it('the glossary PDX entry frames CLIP > OP IN [DEX] as an example, not the definition', () => {
    expect(glossary).toMatch(/marks the paradox relationship on a dexterity/);
    expect(glossary).toMatch(/is not an IN\/OUT direction/);
    expect(glossary).toMatch(/common entry example, not the definition/);
  });
});

describe('Tapping preserves base identity and re-authors the base side coordinate', () => {
  const opRef = read('src/content/freestyleOperatorReference.ts');
  const edu = read('src/services/symbolicModifierEducation.ts');

  it('no tapping surface says the base runs or follows unchanged', () => {
    // Scope the check to the tapping definition/cards, which is where the audit found it.
    const tappingDef = opRef.slice(opRef.indexOf("slug: 'tapping'"), opRef.indexOf("slug: 'symposium'"));
    expect(tappingDef).not.toMatch(/runs unchanged|follows unchanged|base is unchanged/);
  });

  it('the canonical tapping definition describes coordinate re-authoring via the Tapdown example', () => {
    const tappingDef = opRef.slice(opRef.indexOf("slug: 'tapping'"), opRef.indexOf("slug: 'symposium'"));
    expect(tappingDef).toMatch(/encoded as SAME OUT/);
    expect(tappingDef).toMatch(/standalone OP OUT/);
    expect(tappingDef).toMatch(/leg relation changes; the OUT direction does not/);
  });

  it('the tapping education cards describe re-authoring, not an unchanged base', () => {
    // The three tapping education prose strings each mention re-authoring the base side coordinate.
    const tappingCards = edu.match(/[^']*re-author a downstream base component[^']*/g) ?? [];
    expect(tappingCards.length).toBeGreaterThanOrEqual(2);
    expect(edu).not.toMatch(/base dexterity then follows unchanged/);
  });
});

describe('ADD analysis: settled X-Dex triggers and Atom Smasher scoring', () => {
  const add = read('src/content/freestyleAddAnalysisContent.ts');
  const resolved = read('src/content/freestyleResolvedFormulas.ts');

  it('the settled X-Dex trigger list is Atomic/Quantum/Sailing and omits Frantic', () => {
    // The note is authored as concatenated source lines; assert the fragments.
    expect(add).toMatch(/Three settled sets can trigger it: Atomic, Quantum/);
    expect(add).toMatch(/and Sailing\. It applies to the dexterity that follows the set/);
    expect(add).not.toMatch(/frantic/i);
  });

  it('Atom Smasher scores xdex(+1), independent of paradox, never "paradox-like"', () => {
    const start = resolved.indexOf('Atomic-specific x-dex contribution');
    const anchor = resolved.indexOf("'atom_smasher'");
    expect(start).toBeGreaterThan(-1);
    expect(anchor).toBeGreaterThan(start);
    const block = resolved.slice(start, anchor + 1200);
    expect(block).toMatch(/atomic\(\+1\) \+ mirage\(2\) \+ xdex\(\+1\) = 4 ADD/);
    expect(block).toMatch(/independent of \[PDX\]/);
    expect(block).not.toMatch(/paradox-like/);
  });
});

describe('legitimate execution prose is not banned', () => {
  it('symposium no-plant discipline and stepping plant-foot relocation copy remain', () => {
    expect(read('src/content/freestyleOperatorReference.ts')).toMatch(/no-plant leg discipline/);
    expect(read('src/services/freestyleService.ts')).toMatch(/Plant foot relocates/);
  });
});
