/**
 * The aliases whose publication state is set against their class on purpose.
 *
 * A community name and a genuine structural name are shown by default; every
 * other class is search-only. Two kinds of override depart from that. Four
 * community nicknames are hidden, each ruled individually: two a reader can
 * reconstruct from the canonical name, one held pending doctrine, one naming a
 * narrower move than the trick it points at. And a structural name whose display
 * would settle an open question early is held hidden pending a ruling; it keeps
 * its class and says which question holds it, so lifting the hold lets the class
 * decide again.
 *
 * They are pinned here because a later change that quietly brought them into
 * line with their classes would look like tidying and would silently reverse
 * these decisions. Anything moving them has to say so.
 *
 * The reasons are asserted as present, not as exact text. Rewording a ruling is
 * a curator's business; leaving one unexplained is not.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getAboutNamingNote } from '../../freestyle/inputs/curator_content/freestyleAboutDerivatives';

const REPO_ROOT = join(__dirname, '..', '..');
const OVERRIDES = join(REPO_ROOT, 'freestyle', 'inputs', 'base_dictionary', 'alias_overrides.csv');

/** The publication state a class implies when nobody has ruled otherwise. */
const SHOWN_CLASSES = ['common', 'structural'];
const defaultDisplayFor = (aliasType: string): number => (SHOWN_CLASSES.includes(aliasType) ? 1 : 0);
/** The reason a shown-class name carries while its question is open. */
const PENDING = 'Pending ruling:';
/** The reason a structural name carries when a curator ruling keeps it hidden. */
const RULED_HIDDEN = 'Hidden by ruling:';

interface Override {
  aliasSlug: string;
  action: string;
  aliasType: string;
  aliasDisplay: number;
  note: string;
}

/**
 * The curated overrides, parsed far enough for this file's purpose.
 *
 * The note is a quoted free-text field carrying commas, so the split has to
 * respect quoting: a naive comma split would truncate every reason and make the
 * "carries a reason" assertions pass on fragments.
 */
function overrides(): Override[] {
  const text = readFileSync(OVERRIDES, 'utf8');
  const rows: Override[] = [];
  for (const line of text.split('\n').slice(1)) {
    if (!line.trim()) continue;
    const cells: string[] = [];
    let cur = '';
    let quoted = false;
    for (let i = 0; i < line.length; i += 1) {
      const ch = line[i];
      if (ch === '"') { quoted = !quoted; continue; }
      if (ch === ',' && !quoted) { cells.push(cur); cur = ''; continue; }
      cur += ch;
    }
    cells.push(cur);
    const [aliasSlug, action, aliasType, aliasDisplay, ...rest] = cells;
    rows.push({
      aliasSlug, action, aliasType,
      aliasDisplay: Number(aliasDisplay),
      note: rest.join(',').trim(),
    });
  }
  return rows;
}

const retypes = () => overrides().filter(o => o.action === 'retype');
const diverging = () => retypes().filter(o => o.aliasDisplay !== defaultDisplayFor(o.aliasType));

/** The individually ruled exceptions, and the shape of each ruling. */
const RULED = [
  { slug: 'big_applesauce',           type: 'common',     display: 0 },
  { slug: 'frigidosis',               type: 'common',     display: 0 },
  { slug: 'infinity',                 type: 'common',     display: 0 },
  { slug: 'whirlwalk',                type: 'common',     display: 0 },
];

/** Structural names held hidden while the question that bears on them is open. */
const pendingHolds = () => diverging().filter(o => o.note.startsWith(PENDING));
/** Structural names a curator ruling keeps hidden for good, each saying why. */
const ruledHidden = () => diverging().filter(o => o.note.startsWith(RULED_HIDDEN));

describe('the curated overrides that diverge from their class', () => {
  it('are exactly the ruled exceptions and the names held pending or by a ruling', () => {
    const held = [...pendingHolds(), ...ruledHidden()].map(o => o.aliasSlug);
    expect(diverging().map(o => o.aliasSlug).sort())
      .toEqual([...RULED.map(r => r.slug), ...held].sort());
  });

  // Defect caught: a name resting on Red's list alone shown as a public
  // alternate name, against the ruling that the list is not naming evidence.
  it('keeps the Red-only structural names hidden by ruling, each still a structural name', () => {
    const hidden = ruledHidden();
    expect(hidden.map(o => o.aliasSlug).sort()).toEqual([
      'atomic_double_leg_over', 'furious_barfly', 'furious_paradox_mirage',
      'pixie_double_leg_over', 'pixie_ducking_double_leg_over', 'spinning_symposium_whirl',
      'stepping_barrage', 'stepping_double_leg_over', 'stepping_illusion', 'surging_ducking_blender',
    ].sort());
    for (const o of hidden) {
      expect(o.aliasType, o.aliasSlug).toBe('structural');
      expect(o.aliasDisplay, o.aliasSlug).toBe(0);
    }
  });

  // Defect caught: a name hidden while it waits on a question, filed as anything
  // but a structural name, so lifting the hold would not let the class show it.
  it('holds only structural names pending, each hidden and saying which question holds it', () => {
    const holds = pendingHolds();
    expect(holds.length).toBeGreaterThan(0);
    for (const o of holds) {
      expect(o.aliasType, `${o.aliasSlug} is held under a search-only class`).toBe('structural');
      expect(o.aliasDisplay, `${o.aliasSlug} is held but shown`).toBe(0);
      expect(o.note.length, `${o.aliasSlug} names no question`).toBeGreaterThan(PENDING.length + 10);
    }
  });

  // Defect caught: a genuine structural name hidden from its trick's page with
  // no recorded reason, which is how the old default hid almost all of them.
  it('hides no structural name without a pending or settled ruling', () => {
    const silent = diverging().filter(o => o.aliasType === 'structural'
      && !o.note.startsWith(PENDING) && !o.note.startsWith(RULED_HIDDEN));
    expect(silent.map(o => o.aliasSlug)).toEqual([]);
  });

  it.each(RULED)('keeps $slug as ruled', ({ slug, type, display }) => {
    const row = retypes().find(o => o.aliasSlug === slug);
    expect(row, `${slug} has lost its curated override`).toBeDefined();
    expect(row!.aliasType, `${slug} was reclassified`).toBe(type);
    expect(row!.aliasDisplay, `${slug} changed publication state`).toBe(display);
  });

  it.each(RULED)('records why $slug diverges', ({ slug }) => {
    // An unexplained exception is the failure the editor requirement exists to
    // prevent; these predate it and must not become the counterexample.
    const row = retypes().find(o => o.aliasSlug === slug);
    expect((row?.note ?? '').length, `${slug} carries no reason`).toBeGreaterThan(20);
  });

  it('leaves every other override agreeing with its class', () => {
    const held = new Set([...pendingHolds(), ...ruledHidden()].map(o => o.aliasSlug));
    const rest = retypes().filter(o => !RULED.some(r => r.slug === o.aliasSlug) && !held.has(o.aliasSlug));
    const disagreeing = rest.filter(o => o.aliasDisplay !== defaultDisplayFor(o.aliasType));
    expect(disagreeing.map(o => o.aliasSlug)).toEqual([]);
  });
});

describe('the name that points at a narrower move than its trick', () => {
  it('stays a community nickname and stays unpublished', () => {
    // Infinity names the clipper-set form of Butterfly rather than Butterfly at
    // large, so publishing it beside Butterfly would assert an equivalence that
    // is not one. Whether its class should change is a separate doctrine
    // question and is deliberately not settled by this file.
    const row = retypes().find(o => o.aliasSlug === 'infinity');
    expect(row!.aliasType).toBe('common');
    expect(row!.aliasDisplay).toBe(0);
  });

  it('is explained to readers on the trick it points at, since the alias line cannot', () => {
    // The ruling's other half. Hiding the alias is only defensible because the
    // page says what the name means instead; if this prose goes, the hiding
    // becomes an unexplained omission.
    const note = getAboutNamingNote('butterfly') ?? '';
    expect(note).toContain('Infinity');
    expect(note).toContain('clipper-set butterfly');
  });
});
