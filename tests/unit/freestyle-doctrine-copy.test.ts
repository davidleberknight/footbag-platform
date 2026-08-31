/**
 * Freestyle doctrine copy states the settled notation doctrine on its
 * authoritative teaching surfaces, and does not reintroduce the specific false
 * constructions the audit corrected.
 *
 * This suite inspects the exact token definitions, Freestyle Concepts entries, reusable
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

import { CANONICAL_SETS } from '../../src/content/freestyleCanonicalSets';
import {
  COMPOSITIONAL_SET_FAMILIES,
  COMPOSITIONAL_AUDIT_ENTRIES,
} from '../../src/content/freestyleCompositionalSets';
import {
  OPERATOR_REFERENCE_ENTRIES,
  TIER1_OPERATOR_DEFINITIONS,
} from '../../src/content/freestyleOperatorReference';
import { CORE_ATOM_EDUCATIONAL_BY_SLUG } from '../../src/content/freestyleCoreAtomEducational';
import { CORE_TRICK_SPEC } from '../../src/content/freestyleLandingContent';

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
  const concepts = read('src/views/freestyle/concepts.hbs');

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

  it('the set-notation side prose and Freestyle Concepts Sides block are component-relative', () => {
    expect(lineWith(moves, 'SAME or OP')).toMatch(/most recent side-bearing component/);
    expect(lineWith(moves, 'SAME or OP')).not.toMatch(/same side as the plant foot/);
    expect(concepts).toMatch(/most recent side-bearing component/);
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
  const concepts = read('src/views/freestyle/concepts.hbs');
  const edu = read('src/services/symbolicModifierEducation.ts');

  it('the Freestyle Concepts XBD entry is independent of SAME/OP, not plant-foot opposite-side', () => {
    expect(concepts).toMatch(/records a cross-body configuration or traversal across the body's centreline/);
    expect(concepts).toMatch(/independent of the component's SAME\/OP relation; both SAME and OP components can be cross-body/);
    expect(concepts).not.toMatch(/opposite-side surface from the plant foot/);
  });

  it('XBD teaching copy does not share a centreline-crossing definition with paradox', () => {
    expect(edu).not.toMatch(/shares the centreline-crossing idea with paradox/);
    expect(edu).toMatch(/independent of SAME\/OP/);
  });
});

describe('OP is a component-relative leg relation, separate from near/far and from X-Dex', () => {
  const concepts = read('src/views/freestyle/concepts.hbs');
  const dd = lineWith(concepts,'separate positional and naming axis');

  it('describes OP as a component-relative leg relation', () => {
    expect(dd).toMatch(/component-relative leg relation/);
    expect(dd).toMatch(/opposite leg from the most recent side-bearing component/);
  });

  it('keeps near/far as a separate axis and drops the far/opposite synonym equation', () => {
    expect(dd).toMatch(/separate positional and naming axis/);
    expect(dd).toMatch(/not synonyms for/i);
    expect(dd).not.toMatch(/far \/ opposite/i);
    expect(dd).not.toMatch(/far dex/i);
  });

  it('states OP alone is not scored and X-Dex is a separate +1 only where marked', () => {
    expect(dd).toMatch(/does not by itself add difficulty/);
    expect(dd).toMatch(/X-Dex<\/a> is a separate \+1/);
    expect(dd).toMatch(/only where the operational notation carries <code>\[XDEX\]<\/code>/);
  });
});

describe('[PDX] is a paradox-relationship marker, not a direction or a fixed formula', () => {
  const opRender = read('src/services/operationalNotationRendering.ts');
  const notation = read('src/services/notationRendering.ts');
  const svc = read('src/services/freestyleService.ts');
  const concepts = read('src/views/freestyle/concepts.hbs');

  it('no PDX token surface calls it a direction', () => {
    for (const f of [opRender, notation, svc, concepts]) {
      expect(f).not.toMatch(/paradox-direction/);
    }
  });

  it('the Freestyle Concepts PDX entry frames CLIP > OP IN [DEX] as an example, not the definition', () => {
    expect(concepts).toMatch(/marks the paradox relationship on a dexterity/);
    expect(concepts).toMatch(/is not an IN\/OUT direction/);
    expect(concepts).toMatch(/common entry example, not the definition/);
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

describe('glossary side section, clipper, XBD labels, and side-variant cards', () => {
  const concepts = read('src/views/freestyle/concepts.hbs');
  const opRender = read('src/services/operationalNotationRendering.ts');
  const svc = read('src/services/freestyleService.ts');
  const related = read('src/services/freestyleRelatedTricks.ts');
  const variantCard = read('src/views/partials/trick-relative-side.hbs');

  it('the Freestyle Concepts side definitions are component-relative and not implied by the entry surface', () => {
    expect(concepts).not.toMatch(/implied for clipper-led tricks/);
    expect(concepts).not.toMatch(/implied for toe-led tricks/);
    expect(concepts).toMatch(/acts on the same leg as the most recent side-bearing component/);
    expect(concepts).toMatch(/acts on the opposite leg from the most recent side-bearing component/);
  });

  it('the Freestyle Concepts Paradox entry is a dexterity relationship, not a third SAME/OP value', () => {
    expect(concepts).toMatch(/Paradox marks a distinct relationship on a dexterity/);
    expect(concepts).toMatch(/not a third SAME\/OP value/);
    expect(concepts).not.toMatch(/third side relationship/);
    expect(concepts).not.toMatch(/the body switches sides between dex events/);
  });

  it('the Freestyle Concepts Clipper definition does not claim an implicit SS relation', () => {
    expect(concepts).toMatch(/canonical Clipper Stall reads/);
    expect(concepts).toMatch(/SET &gt; OP CLIP \[XBD\] \[DEL\]/);
    expect(concepts).toMatch(/component-relative and is not fixed merely by the contact surface/);
    expect(concepts).not.toMatch(/Clipper stalls implicitly involve a same-side/);
  });

  it('both XBD token labels state independence from SAME/OP with no opposite-side-surface definition', () => {
    const xbdOp = lineWith(opRender, 'XBD:');
    expect(xbdOp).toMatch(/independent of SAME\/OP/);
    expect(xbdOp).not.toMatch(/opposite-side surface/);
    const xbdSvc = lineWith(svc, "token: '[XBD]'");
    expect(xbdSvc).toMatch(/independent of SAME\/OP/);
    expect(xbdSvc).not.toMatch(/opposite-side surface/);
  });

  it('the side-variant card labels are exactly "Same-side variant" and "Far variant"', () => {
    expect(related).toMatch(/'same-side': 'Same-side variant'/);
    expect(related).toMatch(/'far':\s*'Far variant'/);
    expect(related).not.toMatch(/Same-side \(near\)/);
    expect(related).not.toMatch(/Far \(opposite\)/);
  });

  it('the side-variant card intro distinguishes positional-name variants from operational SAME/OP', () => {
    expect(variantCard).toMatch(/positional-name variants/);
    expect(variantCard).toMatch(/do not redefine the operational SAME\/OP tokens/);
    expect(variantCard).not.toMatch(/Same-side \(near\) and far \(opposite\)/);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Settled set classification, held consistent across the projections that
// carry it.
//
// A ruled classification lives in one authoritative place and is restated by
// hand in several others: a token label, a compositional card, an audit row, a
// teaching card, a Concepts example. Each restatement is a place the ruling can
// fail to arrive, and every case below is one that actually did.
//
// Expected values are derived from the authorities rather than repeated here,
// so a future ruling that moves a set moves these assertions with it. The two
// literal lists that remain are documented where they sit, and each is written
// to fail when the thing it records is fixed, so neither outlives its cause.
// ─────────────────────────────────────────────────────────────────────────

/** Sets the platform has ruled on, as opposed to names it merely records from
 *  an outside compilation. A source-only entry carries no platform claim, so
 *  none of the checks below applies to one. */
const PLATFORM_RULED_SETS = new Set(
  CANONICAL_SETS.filter((s) => s.source !== 'holden-only').map((s) => s.slug),
);

const SOURCE_ONLY_SETS = new Set(
  CANONICAL_SETS.filter((s) => s.source === 'holden-only').map((s) => s.slug),
);

/** Display name to set slug: drops a parenthetical gloss ("Terraging (Double
 *  Pixie)") and takes the first name of a paired title ("Rooting / Rooted"). */
const setSlugFor = (displayName: string): string =>
  displayName
    .split('/')[0]!
    .replace(/\(.*?\)/g, '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');

/** A canonical positional claim: a side VALUE. Naming the side axis itself
 *  ("separates them by terminal side") is not a claim about which side, and
 *  neither is ordinary prose that happens to contain the word "same".
 *  The positional phrases are matched in any case; the bare notation markers
 *  only in the upper case they are always written in, so "the same chassis"
 *  reads as English rather than as a claim about which leg. */
const namesASide = (text: string): boolean =>
  /\bop[- ]side\b|\bopposite[- ]side\b|\bsame[- ]side\b/i.test(text)
  || /\b(?:SAME|OP)\b/.test(text);

/** Word-token tooltip labels, read as text because the map is module-private. */
const tokenLabels = (): Map<string, string> => {
  const src = read('src/services/notationRendering.ts');
  const out = new Map<string, string>();
  for (const m of src.matchAll(/^\s*([A-Z][A-Z0-9_]*):\s*'((?:[^'\\]|\\.)*)',/gm)) {
    out.set(m[1]!.toLowerCase(), m[2]!);
  }
  return out;
};

describe('a set the platform has ruled on is not labelled an ordinary operator', () => {
  // Sets that also act as modifiers are labelled "set modifier", which is the
  // ruled dual role and stays legal. What is not legal is filing a ruled set
  // under the body or rotation operators, which is how blazing came to be called
  // a body modifier after being ruled a set in its own right.
  const ORDINARY_OPERATOR = /\b(body|rotation) modifier\b/;

  it('no ruled set is filed under the body or rotation operators', () => {
    const offenders = [...tokenLabels()]
      .filter(([token]) => PLATFORM_RULED_SETS.has(token))
      .filter(([, label]) => ORDINARY_OPERATOR.test(label))
      .map(([token, label]) => `${token}: ${label}`);
    expect(offenders).toEqual([]);
  });

  it('where a ruled set is called a modifier at all, it is called a set modifier', () => {
    // The dual role is real and its wording is the signal: "set modifier" says
    // the token launches and can also be applied, which is what was ruled. Any
    // other modifier wording on a ruled set is the drift this block catches.
    // Derived from the labels themselves, so the roster of dual-role sets never
    // has to be restated here.
    const wrong = [...tokenLabels()]
      .filter(([token]) => PLATFORM_RULED_SETS.has(token))
      .filter(([, label]) => /modifier/.test(label))
      .filter(([, label]) => !/set modifier/.test(label))
      .map(([token, label]) => `${token}: ${label}`);
    expect(wrong).toEqual([]);
  });

  it('the difficulty-weight table classes a ruled set as a set, not as a body operator', () => {
    // The table carries one row per ADD-bearing operator with a class cell, and
    // already uses "set" for stepping, whirling and atomic. A ruled set classed
    // as body copy contradicts its own set page, which is how weaving and zulu
    // came to read as body operators on the page that teaches scoring.
    // Located by its own header rather than by position: the page carries
    // several tables in the same wrapper, and one of them lists tricks whose
    // class cell means something else entirely.
    const concepts = read('src/views/freestyle/concepts.hbs');
    const HEAD = '<thead><tr><th>Modifier</th><th>ADD</th><th>Class</th></tr></thead>';
    expect(concepts.split(HEAD).length, 'the weight-table header is not unique').toBe(2);
    const table = concepts.split(HEAD)[1]!.split('</table>')[0]!;
    const rows = [...table.matchAll(/<tr><td>([a-z_]+)<\/td><td>[^<]*<\/td><td>([^<]*)<\/td><\/tr>/g)];
    // A parse that finds nothing would pass this check while asserting nothing,
    // so the row count is part of the assertion rather than an assumption.
    expect(rows.length, 'the weight table did not parse').toBeGreaterThan(10);
    const offenders = rows
      .filter((m) => PLATFORM_RULED_SETS.has(m[1]!))
      .filter((m) => !/set/.test(m[2]!))
      .map((m) => `${m[1]}: ${m[2]}`);
    expect(offenders).toEqual([]);
  });

  it('the ducking sets are labelled as sets, with the duck named as what scores', () => {
    // Weaving and zulu are ducking sets: their launch incorporates the duck
    // rather than adding it to an existing trick, and the difficulty is the
    // duck's rather than a second charge of their own. Neither writes a token of
    // its own in any notation, so a label here is teaching copy about the set.
    const labels = tokenLabels();
    const present = ['weaving', 'zulu'].filter((t) => labels.has(t));
    const wrong = present.filter((t) => !/set/.test(labels.get(t) ?? ''));
    expect(wrong).toEqual([]);
  });
});

describe('a set the platform has ruled on is not filed as source-only', () => {
  // The compositional surface keeps a bucket meaning "an outside compilation
  // lists this name and the platform has no separate treatment of it". A set
  // carrying a platform ruling contradicts that bucket by definition, which is
  // how flailing and blazing came to sit there after being ruled.
  it('no audit row files a ruled set as source-only', () => {
    const offenders = COMPOSITIONAL_AUDIT_ENTRIES
      .filter((e) => PLATFORM_RULED_SETS.has(setSlugFor(e.holdenName)))
      .filter((e) => e.status === 'holden-only')
      .map((e) => e.holdenName);
    expect(offenders).toEqual([]);
  });

  it('no card files a ruled set as source-only', () => {
    const offenders = COMPOSITIONAL_SET_FAMILIES
      .flatMap((f) => f.members)
      .filter((m) => PLATFORM_RULED_SETS.has(setSlugFor(m.name)))
      .filter((m) => m.statusHint === 'holden-only')
      .map((m) => m.name);
    expect(offenders).toEqual([]);
  });

  it('a ruled set carries a platform reading rather than an empty one', () => {
    const empty = ['Flailing', 'Blazing']
      .map((name) => COMPOSITIONAL_AUDIT_ENTRIES.find((e) => e.holdenName === name))
      .filter((row) => !row?.platformReading)
      .map((row) => row?.holdenName ?? 'missing row');
    expect(empty).toEqual([]);
  });

  it('names the platform only records are still allowed to stay source-only', () => {
    // The rule runs one way. A compilation name with no platform ruling belongs
    // in that bucket, and nothing here should push it out.
    const sourceOnly = COMPOSITIONAL_AUDIT_ENTRIES
      .filter((e) => SOURCE_ONLY_SETS.has(setSlugFor(e.holdenName)))
      .filter((e) => e.status === 'holden-only');
    expect(sourceOnly.length).toBeGreaterThan(5);
  });
});

describe('butterfly teaching copy matches the side its notation carries', () => {
  const card = CORE_ATOM_EDUCATIONAL_BY_SLUG.get('butterfly')!;
  const spec = CORE_TRICK_SPEC.find((s) => s.slug === 'butterfly')!;

  it('the pinned notation is the opposite-side form', () => {
    expect(spec.operationalNotation).toMatch(/OP OUT/);
  });

  it('the card teaches the opposite-side execution as the base', () => {
    expect(card.line).toMatch(/opposite-side out-dex/);
  });

  it('the card does not offer both sides as coequal unnamed base forms', () => {
    expect(card.line).not.toMatch(/same-side or opposite-side/);
    expect(card.line).not.toMatch(/in both a same-side and an opposite-side variant/);
  });

  it('the card keeps the same-side execution as a named variant', () => {
    expect(card.line).toMatch(/Butterfly Same Side/);
  });
});

describe('the modifier-versus-trick lesson uses operators, not sets', () => {
  const modifierBlock = (): string => {
    const concepts = read('src/views/freestyle/concepts.hbs');
    return concepts.split('<dt>Modifier</dt>')[1]!.split('</dd>')[0]!;
  };
  const examples = (): string[] => {
    const listed = /its own \(([^)]*)\)/.exec(modifierBlock());
    if (listed === null) throw new Error('no modifier example list in the Concepts entry');
    return listed[1]!.split(',').map((e) => e.trim()).filter(Boolean);
  };
  const operatorSlugs = new Set([
    ...OPERATOR_REFERENCE_ENTRIES.map((e) => e.slug),
    ...TIER1_OPERATOR_DEFINITIONS.map((e) => e.slug),
  ]);

  it('every example is an entry in the operator registry', () => {
    expect(examples().filter((e) => !operatorSlugs.has(setSlugFor(e)))).toEqual([]);
  });

  it('no example is a set the platform has ruled on', () => {
    expect(examples().filter((e) => PLATFORM_RULED_SETS.has(setSlugFor(e)))).toEqual([]);
  });

  it('the one-line tell contrasts a registry operator with its bare trick form', () => {
    const tell = /tell: <strong>([^<]*)<\/strong>/.exec(modifierBlock());
    expect(tell, 'modifier tell').not.toBeNull();
    const subject = setSlugFor(tell![1]!.split(' is a modifier')[0]!);
    expect([subject, operatorSlugs.has(subject), PLATFORM_RULED_SETS.has(subject)])
      .toEqual([subject, true, false]);
  });
});

describe('an unresolved side relationship stays unresolved in the platform voice', () => {
  // Blazing is ruled a distinct set on the whirling chassis, and which side its
  // opening dex takes is explicitly not ruled. A source may state a side and the
  // platform may quote it; what the platform may not do is adopt one. So the
  // source-attributed fields are exempt by construction and the platform's own
  // prose is not.
  //
  // One token, because one token is what is open. Remove the entry when the side
  // question is answered.
  const UNRESOLVED_SIDE_TOKENS = ['blazing'];
  const setEntry = (slug: string) => CANONICAL_SETS.find((s) => s.slug === slug)!;

  it('the set page states the movement without choosing a side', () => {
    const offenders = UNRESOLVED_SIDE_TOKENS
      .filter((slug) => namesASide(setEntry(slug).movementExplanation));
    expect(offenders).toEqual([]);
  });

  it('the token label states the movement without choosing a side', () => {
    const labels = tokenLabels();
    const offenders = UNRESOLVED_SIDE_TOKENS
      .filter((slug) => namesASide(labels.get(slug) ?? ''));
    expect(offenders).toEqual([]);
  });

  it('the compositional platform reading, note and card choose no side', () => {
    const platformVoice = UNRESOLVED_SIDE_TOKENS.flatMap((slug) => {
      const name = setEntry(slug).displayName;
      const row = COMPOSITIONAL_AUDIT_ENTRIES.find((e) => e.holdenName === name)!;
      const card = COMPOSITIONAL_SET_FAMILIES.flatMap((f) => f.members)
        .find((m) => m.name === name)!;
      return [row.platformReading ?? '', row.note ?? '', card.structuralNote ?? ''];
    });
    expect(platformVoice.filter((text) => namesASide(text))).toEqual([]);
  });

  it('the set-education prose neither collapses the set nor chooses a side', () => {
    const edu = read('src/services/symbolicSetEducation.ts');
    const blazingLines = edu.split('\n').filter((l) => /blazing/i.test(l));
    const offenders = blazingLines.filter((l) =>
      /\bnot an independent set\b/.test(l)
      || /\bop[- ]side\b|\bopposite[- ]side[- ]terminal\b/i.test(l));
    expect(offenders).toEqual([]);
  });

  it('the source keeps its own side claim, quoted rather than adopted', () => {
    // Deleting the compilation's reading would destroy the evidence the audit
    // table exists to show. It stays, attributed.
    const blazing = setEntry('blazing');
    const row = COMPOSITIONAL_AUDIT_ENTRIES.find((e) => e.holdenName === 'Blazing')!;
    expect(blazing.formula).toMatch(/op side component/);
    expect(row.holdenReading).toMatch(/op side component/);
    const unattributed = blazing.equivalenceNotes
      .filter((n) => namesASide(n.reading) && !/Holden/.test(n.citation))
      .map((n) => n.reading);
    expect(unattributed).toEqual([]);
  });

  it('the cross-reference labels between the pair name no side', () => {
    // The two sets point at each other from their related-systems lists, and a
    // label there is the platform describing the pair in its own voice. Naming a
    // side in one states the relation the ruling left open, so neither may.
    // Sibling pairs whose sides ARE settled keep theirs; this is scoped to the
    // pair with the open question.
    const offenders = CANONICAL_SETS
      .filter((s) => s.slug === 'blazing' || s.slug === 'whirling')
      .flatMap((s) => s.relatedSystems.map((r) => ({ from: s.slug, to: r.slug, label: r.label })))
      .filter((r) => r.to === 'blazing' || r.to === 'whirling')
      .filter((r) => namesASide(r.label))
      .map((r) => `${r.from} -> ${r.to}: ${r.label}`);
    expect(offenders).toEqual([]);
  });

  it('neither set is cross-referenced as a variant or alias of the other', () => {
    // The ruling holds them apart as distinct named sets precisely because the
    // relation that would rank one under the other is unruled.
    const offenders = CANONICAL_SETS
      .filter((s) => s.slug === 'blazing' || s.slug === 'whirling')
      .flatMap((s) => s.relatedSystems.map((r) => ({ from: s.slug, to: r.slug, label: r.label })))
      .filter((r) => r.to === 'blazing' || r.to === 'whirling')
      .filter((r) => /\bvariant\b|\balias\b/i.test(r.label))
      .map((r) => `${r.from} -> ${r.to}: ${r.label}`);
    expect(offenders).toEqual([]);
  });
});

describe('a stall is a trick and an anchor state, not one instead of the other', () => {
  const toeStall = CORE_ATOM_EDUCATIONAL_BY_SLUG.get('toe_stall');

  it('says a toe stall is both', () => {
    expect(toeStall, 'the toe stall card').toBeDefined();
    expect(toeStall!.reveal).toMatch(/both a trick and an anchor state/i);
  });

  it('does not deny that it is a trick', () => {
    // The dictionary catalogues Toe Stall as an entry scoring 1 ADD. Teaching
    // copy saying it is not really a trick contradicted that, and a reader
    // meeting both had no way to reconcile them.
    for (const card of CORE_ATOM_EDUCATIONAL_BY_SLUG.values()) {
      expect(card.reveal, `${card.slug} reveal`).not.toMatch(/not really a trick/i);
      expect(card.line, `${card.slug} line`).not.toMatch(/not really a trick/i);
      expect(card.relates, `${card.slug} relates`).not.toMatch(/not really a trick/i);
    }
  });

  it('keeps the anchor framing that made the claim worth making', () => {
    // The correction is to the denial, not to the teaching around it: the trip
    // out and back is why a bare stall scores less than the dex reaching it.
    expect(toeStall!.reveal).toMatch(/anchor/i);
    expect(toeStall!.reveal).toMatch(/the difficulty is in the trip, not the landing/i);
    expect(toeStall!.reveal).toMatch(/not every trick is stall-to-stall/i);
  });
});
