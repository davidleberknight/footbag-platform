/**
 * The four basic single-dex toe tricks — mirage, illusion, pickup, legover — are
 * defined by two switches: the direction the dexterity travels, and which foot
 * catches. Their operational notation reads each side marker against the
 * previous side-bearing component, so two opposite markers return the bag to the
 * setting foot (mirage and illusion), while an opposite dex followed by a same
 * catch stays on the dexing foot (pickup and legover). Mirage and illusion
 * differ only by dex direction, as do pickup and legover; mirage and pickup
 * share a direction but differ by catching foot, as do illusion and legover.
 *
 * This pins the relational-token semantics against the shipped notation, checks
 * the corrected catch prose on the settled tricks (the four atoms plus the two
 * unambiguous mirage/illusion-terminal compounds, flail and double illusion),
 * confirms that the verified pixie/fairy/leg-over compounds keep their correct
 * opposite-of-the-setting-foot catches, and holds the four compounds whose
 * catch-foot reading is still pending so they cannot be silently rewritten. It
 * does not reject the phrase "opposite toe" corpus-wide: that phrase is correct
 * for tricks whose catch genuinely lands opposite the setting foot.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8');

const START = read('src/views/freestyle/start.hbs');
const CORE = read('src/content/freestyleCoreAtomEducational.ts');
const GLOSSARY = read('src/content/freestyleGlossaryFamilyCards.ts');
const RED_CORR = read('freestyle/inputs/curated/tricks/red_corrections_2026_04_20.csv');
const LANDING = read('src/content/freestyleLandingContent.ts');

const OPP_TOE = /opposite[- ](toe|foot)/i;

// The `new` value of a red_corrections execution_summary row (prose carries no
// embedded double quotes).
function execSummary(slug: string): string {
  const m = RED_CORR.match(new RegExp(`^${slug},execution_summary,,"([^"]*)"`, 'm'));
  if (!m) throw new Error(`no execution_summary found for ${slug}`);
  return m[1];
}

// ── Relational-token semantics ──────────────────────────────────────────────

type Foot = 'setting' | 'dexing';

// Each side marker flips (OP) or keeps (SAME) the side relative to the previous
// side-bearing component. The chain starts at the setting foot.
function resolveCatchFoot(markers: ('OP' | 'SAME')[]): Foot {
  let onSettingSide = true; // origin: the setting foot
  for (const m of markers) if (m === 'OP') onSettingSide = !onSettingSide;
  return onSettingSide ? 'setting' : 'dexing';
}

function notationFor(slug: string): string {
  const re = new RegExp(`slug:\\s*'${slug}'[\\s\\S]*?operationalNotation:\\s*'([^']+)'`);
  const m = LANDING.match(re);
  if (!m) throw new Error(`no operationalNotation found for ${slug}`);
  return m[1];
}
const sideMarkers = (n: string) => (n.match(/\b(OP|SAME)\b/g) ?? []) as ('OP' | 'SAME')[];
const dexDirection = (n: string) => (n.match(/\b(IN|OUT)\b/)?.[1] ?? '') as 'IN' | 'OUT' | '';

const CANONICAL_NOTATION: Record<string, string> = {
  mirage: 'SET > OP IN [DEX] > OP TOE [DEL]',
  illusion: 'SET > OP OUT [DEX] > OP TOE [DEL]',
  pickup: 'SET > OP IN [DEX] > SAME TOE [DEL]',
  legover: 'SET > OP OUT [DEX] > SAME TOE [DEL]',
};
const EXPECTED: Record<string, { dir: 'IN' | 'OUT'; catch: Foot }> = {
  mirage: { dir: 'IN', catch: 'setting' },
  illusion: { dir: 'OUT', catch: 'setting' },
  pickup: { dir: 'IN', catch: 'dexing' },
  legover: { dir: 'OUT', catch: 'dexing' },
};

describe('the four basic toe-dexterity notation strings are unchanged', () => {
  for (const [slug, expected] of Object.entries(CANONICAL_NOTATION)) {
    it(`${slug} keeps its canonical notation`, () => {
      expect(notationFor(slug)).toBe(expected);
    });
  }
});

describe('relational-token semantics resolve the catch foot', () => {
  it('OP after OP returns to the setting foot (the origin)', () => {
    expect(resolveCatchFoot(['OP', 'OP'])).toBe('setting');
  });
  it('SAME after OP stays on the dexing foot', () => {
    expect(resolveCatchFoot(['OP', 'SAME'])).toBe('dexing');
  });
  for (const [slug, expected] of Object.entries(EXPECTED)) {
    it(`${slug} dexes ${expected.dir} and is caught by the ${expected.catch} foot`, () => {
      const notation = notationFor(slug);
      expect(dexDirection(notation)).toBe(expected.dir);
      expect(resolveCatchFoot(sideMarkers(notation))).toBe(expected.catch);
    });
  }
  it('IN pairs mirage with pickup; OUT pairs illusion with legover', () => {
    expect(dexDirection(notationFor('mirage'))).toBe(dexDirection(notationFor('pickup')));
    expect(dexDirection(notationFor('illusion'))).toBe(dexDirection(notationFor('legover')));
    expect(dexDirection(notationFor('mirage'))).not.toBe(dexDirection(notationFor('illusion')));
  });
});

// ── Settled catch prose ─────────────────────────────────────────────────────

describe('the beginner paragraph and grid state the ruled relationships', () => {
  it('the beginner Mirage paragraph returns the bag to the setting toe and keeps the dexing leg out of the catch', () => {
    expect(START).toMatch(/catch the bag[\s\S]*?back on the same toe\s+that made the set/i);
    expect(START).toMatch(/circling leg performs the dexterity but does not[\s\S]*?make the catch/i);
    expect(START).not.toMatch(OPP_TOE);
  });
  it('the four-atom grid uses unambiguous physical labels', () => {
    expect(CORE).toMatch(/returns to the setting foot/i);
    expect(CORE).toMatch(/caught by the dexing foot/i);
  });
});

// mirage, illusion, flail, and double illusion resolve to the setting toe.
describe('setting-toe tricks are caught back on the setting toe', () => {
  for (const slug of ['mirage', 'illusion', 'flail', 'double_illusion']) {
    it(`${slug} execution summary says setting toe and not the opposite toe`, () => {
      const text = execSummary(slug);
      expect(text).toMatch(/setting toe/i);
      expect(text).not.toMatch(OPP_TOE);
    });
  }
});

// pickup and legover are caught by the dexing foot, and never described as
// returning to the setting foot.
describe('dexing-foot tricks are caught by the leg that dexed', () => {
  it('pickup catches on the toe of the leg that dexed', () => {
    const text = execSummary('pickup');
    expect(text).toMatch(/that same leg, the one that dexed/i);
    expect(text).not.toMatch(/on the (toe of the )?setting (toe|foot)/i);
  });
  it('legover catches on the dexing leg, explicitly not the setting foot', () => {
    const text = execSummary('legover');
    expect(text).toMatch(/dexing leg/i);
    expect(text).not.toMatch(/catch on the toe of the setting foot/i);
  });
  it('the glossary legover and pickup cards name the dexing foot as the catcher', () => {
    expect(GLOSSARY).toMatch(/a legover is one outward dexterity caught by the dexing foot/i);
    expect(GLOSSARY).toMatch(/a pickup is one inward dexterity caught by the dexing foot/i);
  });
});

// ── Verified-correct compounds: opposite-of-setting-foot catch is right ──────

describe('compounds that genuinely catch opposite the setting foot keep that wording', () => {
  for (const slug of ['pixie', 'double_pixie', 'double_fairy', 'double_switch_over']) {
    it(`${slug} keeps its correct opposite-toe catch`, () => {
      expect(execSummary(slug)).toMatch(OPP_TOE);
    });
  }
});

// ── Held compounds: catch-foot reading pending, must not be silently changed ──

// This allowlist is the four compounds whose catch-foot reading is unresolved.
// Their catch prose must stay exactly as it is until each is ruled: a global
// sweep that rewrote them to "setting toe" would fail these assertions, so they
// cannot be silently changed without also, deliberately, updating this list.
const HELD = ['pixie_mirage', 'fairy_mirage', 'quantum_mirage', 'pixie_same_side_illusion'];

describe('the four held compounds are the bounded allowlist and are unchanged until ruled', () => {
  it('holds exactly these four compounds', () => {
    expect(HELD).toHaveLength(4);
  });
  for (const slug of HELD) {
    it(`${slug} still carries its current opposite-toe catch prose (change only by ruling)`, () => {
      expect(execSummary(slug)).toMatch(OPP_TOE);
    });
  }
});

// ── Unrelated overclaim guard (Mirage is one of several simple first dexes) ──

const OVERCLAIM_SOURCES = ['src/views/freestyle/start.hbs', 'src/content/freestyleGlossaryFamilyCards.ts'];

describe('Mirage teaching copy does not overclaim its position', () => {
  for (const rel of OVERCLAIM_SOURCES) {
    const text = read(rel);
    it(`${rel} does not call Mirage uniquely the simplest complete dexterity`, () => {
      expect(text).not.toMatch(/(?<!one of )the simplest complete dexterity/i);
    });
    it(`${rel} does not call Mirage the first dexterity a player learns`, () => {
      expect(text).not.toMatch(/(?<!one of )the first dexterit(y|ies) a player learns/i);
    });
  }
  it('the glossary family card uses the approved non-exclusive phrasing', () => {
    expect(GLOSSARY).toContain('one of the simplest complete dexterity movements');
    expect(GLOSSARY).toContain('one of the first dexterities a player learns');
  });
});
