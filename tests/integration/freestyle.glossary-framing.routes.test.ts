/**
 * Integration tests for the additive glossary framing sections.
 *
 * GET /freestyle/glossary gains five additive, static orientation pieces that
 * synchronize the glossary with the modern platform ontology WITHOUT rewriting
 * the §Families taxonomy (that is a separate, post-ruling slice):
 *   1. the two-line trick-row contract explainer
 *   2. the six-view browse-semantics table
 *   3. the five-way ontology distinction table
 *   4. the family-hierarchy direction note (labels transitional)
 *   5. modifier-ecosystem framing
 *
 * These are static explainer content; they render independent of fixture data.
 * A minimal trick is seeded only so the page renders realistically.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';

import {
  setTestEnv,
  createTestDb,
  cleanupTestDb,
  importApp,
} from '../fixtures/testDb';
import { insertFreestyleTrick } from '../fixtures/factories';

const { dbPath } = setTestEnv('3528');

let createApp: Awaited<ReturnType<typeof importApp>>;

beforeAll(async () => {
  const db = createTestDb(dbPath);
  insertFreestyleTrick(db, { slug: 'whirl', canonical_name: 'whirl', adds: '3', base_trick: 'whirl', trick_family: 'whirl', category: 'dex', is_active: 1 });
  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

async function glossary(): Promise<string> {
  const res = await request(await createApp()).get('/freestyle/glossary');
  expect(res.status).toBe(200);
  return res.text;
}

describe('Glossary framing — Reading the dictionary section', () => {
  it('renders the "Reading the dictionary" orientation section', async () => {
    const html = await glossary();
    expect(html).toContain('id="section-reading-the-dictionary"');
    expect(html).toMatch(/<h2 class="section-heading">Reading the dictionary<\/h2>/);
  });

  it('explains the two-line trick-row contract (line 1 + line 2 slots)', async () => {
    const html = await glossary();
    const m = html.match(/<div class="glossary-row-contract">[\s\S]*?<\/div>/);
    expect(m, 'row-contract block').not.toBeNull();
    const block = m![0];
    // Line 1 slots
    expect(block).toContain('Line 1');
    expect(block).toMatch(/canonical trick name/);
    expect(block).toMatch(/#hashtag/);
    expect(block).toMatch(/interpretation \/ decomposition/);
    expect(block).toMatch(/media badge/);
    // Line 2 slots
    expect(block).toContain('Line 2');
    expect(block).toMatch(/JOB/);
    expect(block).toMatch(/ADD/);
    // The "no green chip" boundary is stated in the section.
    expect(html).toMatch(/no separate per-row ADD chip/);
  });

  it('renders a browse-semantics table covering all six views with links', async () => {
    const html = await glossary();
    for (const [label, view] of [
      ['By ADD', 'view=add'],
      ['By family', 'view=family'],
      ['By modifier', 'view=sets'],
      ['By movement system', 'view=movement-system'],
      ['Movement Neighborhoods', 'view=topology'],
      ['By dex count', 'view=dex-count'],
    ]) {
      expect(html, `browse label ${label}`).toContain(label);
      expect(html, `browse link ${view}`).toContain(`/freestyle/tricks?${view}`);
    }
    expect(html).toMatch(/Same rows, six lenses/);
  });

  it('renders the five-way ontology distinction table', async () => {
    const html = await glossary();
    for (const kind of [
      'Canonical family',
      'Modifier ecosystem',
      'Alternative surface',
      'Movement neighborhood',
      'Alias / decomposition label',
    ]) {
      expect(html, `ontology kind ${kind}`).toContain(kind);
    }
    // Explains WHY older vocabularies conflated them.
    expect(html).toMatch(/flattened families, modifiers, surfaces/);
    // Sharpens the interpretation-vs-modifier boundary.
    expect(html).toMatch(/does not make the read-as name a productive modifier/);
  });
});

describe('Glossary framing — settled family-root test note', () => {
  it('renders the settled family-root rule inside the families section', async () => {
    const html = await glossary();
    expect(html).toMatch(/family-root test is settled/);
    expect(html).toMatch(/more than 10 documented descendants/);
    expect(html).toMatch(/<strong>Minor Lineages<\/strong>/);
    expect(html).toContain('id="section-families"');
    expect(html).toContain('Family Parents');
  });
});

describe('Glossary framing — modifier-ecosystem framing', () => {
  it('frames modifiers as ecosystems, not families', async () => {
    const html = await glossary();
    expect(html).toMatch(/Modifiers form <strong>ecosystems<\/strong>/);
    expect(html).toMatch(/An ecosystem is\s+<strong>not a family<\/strong>/);
    expect(html).toMatch(/pixie appears across\s+pixie-illusion/);
  });

  it('the atomic set definition states the single-dex +1 doctrine, not the retired double-dexterity reading', async () => {
    const html = await glossary();
    // Atomic is set vocabulary, defined in the Timing & Sets chapter. Settled
    // doctrine: a single outward dex, +1, with any X-Dex as a separate event;
    // not the retired double-dexterity (+2-conflation) framing.
    const def = html.match(/id="term-set-atomic"[\s\S]*?<\/dd>/);
    expect(def, 'atomic set definition').not.toBeNull();
    expect(def![0]).toMatch(/single outward dex/i);
    expect(def![0]).toMatch(/\+1/);
    expect(def![0]).not.toContain('double-dexterity');
    expect(def![0]).not.toMatch(/double dex/i);
  });

  it('frames paradox as an entry / dex relationship cross-linked to Dexterities, not a set or body movement', async () => {
    const html = await glossary();
    // Paradox is the Entry Topologies axis; dex side relationships are owned by
    // the Dexterities chapter, which Operators cross-links rather than
    // re-teaching. The modifier-paradox deep-link anchor is preserved.
    expect(html).toMatch(/Entry Topologies/);
    expect(html).toContain('href="#section-dexterities"');
    expect(html).toContain('id="modifier-paradox"');
  });

  it('the modifier weights table lists the full +1 body family (head-movement + spin siblings)', async () => {
    const html = await glossary();
    for (const slug of ['ducking', 'weaving', 'diving', 'zulu', 'spinning', 'gyro', 'inspinning']) {
      expect(html, `weights row ${slug}`).toContain(`<tr><td>${slug}</td><td>+1</td>`);
    }
  });

  it('the modifier weights table classes paradox as a dex relationship, whirling and stepping as sets', async () => {
    const html = await glossary();
    expect(html).toContain('<tr><td>paradox</td><td>+1</td><td>dex relationship</td></tr>');
    expect(html).toContain('<tr><td>whirling</td><td>+1</td><td>set</td></tr>');
    expect(html).toContain('<tr><td>stepping</td><td>+1</td><td>set</td></tr>');
  });

  it('does not call paradox a body modifier on the glossary (it is a dex relationship)', async () => {
    const html = await glossary();
    expect(html).toContain('Paradox (dex relationship)');          // PDX abbreviation
    expect(html).not.toContain('Paradox (body modifier)');
    expect(html).not.toMatch(/<code>paradox<\/code> body modifier/); // notation-flag prose
  });
});

describe('Glossary framing — chapter navigation + non-regression', () => {
  it('navigates by the chapter stack, with no sidebar', async () => {
    const html = await glossary();
    // the sidebar rail is gone; the collapsible chapters are the navigation
    expect(html).not.toContain('glossary-sidebar');
    expect(html).toContain('id="chapter-reading-the-dictionary"');
    expect(html).toContain('id="chapter-movement-basics"');
    expect(html).toContain('id="chapter-family-encyclopedia"');
    expect(html).toContain('id="chapter-structural-analysis"');
    // the chapters still wrap their original sections (deep-link targets preserved)
    expect(html).toContain('id="section-core-concepts"');
    expect(html).toContain('id="section-families"');
    expect(html).toContain('id="section-notation"');
  });

  it('§families groups the family cards by display tier, then lineage position', async () => {
    const html = await glossary();
    expect(html).toContain('Family Parents');
    expect(html).toContain('Minor Lineages');
    // Within a tier the cards split by lineage position.
    expect(html).toContain('glossary-family-subgroup-label');
    expect(html).toContain('Root lineages');
    // The retired single-axis grid vocabulary no longer renders.
    expect(html).not.toContain('Branch and lineage families');
    expect(html).not.toContain('Root terminal families');
    expect(html).not.toContain('Branch families');
  });
});

describe('Glossary framing — Phase D pt2 steps 1-2 (additive, anchor-safe)', () => {
  it('row-contract note distinguishes aliases from interpretations and flags non-final readings', async () => {
    const html = await glossary();
    expect(html).toMatch(/is <em>not<\/em> an interpretation/);
    expect(html).toMatch(/not always settled doctrine/);
  });

  it('explains why a trick appears in several browse views at once', async () => {
    const html = await glossary();
    expect(html).toContain('The same trick appears in several of these views at once');
  });

  it('frames the family kind on two independent axes: lineage position and display tier', async () => {
    const html = await glossary();
    expect(html).toMatch(/lineage position/i);
    expect(html).toMatch(/display tier/i);
    // The stale drifter-as-descendant-lineage framing is gone (drifter is a Family Parent now).
    expect(html).not.toMatch(/such as the drifter lineage/);
  });

  it('§surfaces frames foundational vs alternative surfaces with the movement-vs-surface WHY', async () => {
    const html = await glossary();
    expect(html).toContain('Surfaces split into two roles');
    expect(html).toMatch(/<strong>movement structure<\/strong>/);
    expect(html).toMatch(/surface groupings, not canonical families/);
  });

  it('§surfaces adds an Implied-contacts subsection with the clipper / flying-clipper asymmetry', async () => {
    const html = await glossary();
    expect(html).toContain('id="implicit-contacts"');
    expect(html).toMatch(/<h3[^>]*>Implied contacts<\/h3>/);
    // spin → kick implied; clipper → stall default; flying clipper → kick default.
    expect(html).toMatch(/means a spinning <strong>kick<\/strong>/);
    expect(html).toMatch(/means a clipper <strong>stall<\/strong>/);
    expect(html).toMatch(/means a flying clipper <strong>kick<\/strong>/);
    // toe clipper + knee clipper = surface substitution, not a new lineage.
    expect(html).toMatch(/toe clipper and knee clipper/);
    expect(html).toMatch(/<strong>contact substitution<\/strong>/);
  });

  it('advanced-reference adds a "tracking is not canonization" governance note', async () => {
    const html = await glossary();
    expect(html).toContain('id="tracking-vs-canonization"');
    expect(html).toMatch(/<strong>Documentation is not canonization\.<\/strong>/);
    expect(html).toMatch(/<strong>promoted<\/strong>/);
  });

  it('advanced-reference adds the source-divergence case study (cohort vs single-trick)', async () => {
    const html = await glossary();
    expect(html).toContain('id="source-divergence"');
    // Single-trick case (Big Apple Sauce) contrasted with a systematic cohort
    // (furious / railing) whose source over-count is a convention, not an error.
    expect(html).toMatch(/Big Apple Sauce/);
    expect(html).toMatch(/<code>furious<\/code>/);
    expect(html).toMatch(/<code>railing<\/code>/);
    expect(html).toMatch(/cataloguing a number and understanding a grammar/);
  });
});

describe('Glossary framing — Phase D2 step 5 (interpretation doctrine)', () => {
  it('names the interpretation doctrine and states the descriptive-not-productive core', async () => {
    const html = await glossary();
    expect(html).toMatch(/<strong>interpretation doctrine<\/strong>/);
    expect(html).toMatch(/<em>descriptive, never a recipe<\/em>/);
  });

  it('states historical derivation is not a productive modifier, with eggbeater as the flagship', async () => {
    const html = await glossary();
    expect(html).toMatch(/a historical derivation is[\s\S]*?not a productive modifier/);
    // The boundary: you cannot "apply" a historical reading.
    expect(html).toMatch(/eggbeater-ing/);
  });

  it('uses drifter as the compositional-descent reading example', async () => {
    const html = await glossary();
    expect(html).toMatch(/<strong>compositional descent<\/strong>/);
    expect(html).toMatch(/&equiv; miraging clipper/);
  });

  it('enumerates the reading provenances (editorial / historical / compositional / parser / policy)', async () => {
    const html = await glossary();
    expect(html).toMatch(/<strong>editorial equivalence<\/strong>/);
    expect(html).toMatch(/<strong>historical derivation<\/strong>/);
    expect(html).toMatch(/<strong>structural parse<\/strong>/);
    expect(html).toMatch(/<strong>policy-dependent<\/strong>/);
  });

  it('preserves the existing four-relationship taxonomy + its legacy anchors', async () => {
    const html = await glossary();
    expect(html).toContain('id="vocabulary-relationships"');
    expect(html).toContain('id="compression-vs-alternate-derivation"');
    expect(html).toContain('id="symbolic-compression-flow"');
    // The four relationship types still render beneath the doctrine framing.
    expect(html).toContain('1. Pure aliases');
    expect(html).toContain('4. Ontology relationships');
  });
});

describe('Glossary framing — Phase D2 step 4 (modifier ecosystem doctrine)', () => {
  it('renders the lineage-vs-ecosystem test with the "can you do it on its own?" tell', async () => {
    const html = await glossary();
    expect(html).toContain('id="lineage-or-ecosystem"');
    expect(html).toMatch(/<em>can you do it on its own\?<\/em>/);
  });

  it('renders the lineage-vs-ecosystem contrast table', async () => {
    const html = await glossary();
    expect(html).toContain('Productive lineage');
    expect(html).toContain('Modifier ecosystem');
    expect(html).toContain('Own terminal mechanic');
    expect(html).toContain('broadcast across many unrelated bases');
  });

  it('names symposium and paradox as ecosystem hard cases with a transitional caveat', async () => {
    const html = await glossary();
    expect(html).toMatch(/<strong>Hard cases: symposium and paradox\.<\/strong>/);
    // Not over-hardened: the classification is flagged curator-confirmable.
    expect(html).toMatch(/curator-confirmable/);
  });
});

describe('Glossary §families — Phase D2 step 3 (parent/child/descendant-lineage rewrite)', () => {
  it('embeds the "What makes a family?" explainer with the whirl model + the two non-family failure modes', async () => {
    const html = await glossary();
    expect(html).toContain('What makes a family?');
    expect(html).toMatch(/Whirl is the model/);
    expect(html).toMatch(/Foundational Terminal Surfaces<\/strong> \(toe, clipper\)/);
    // Blurry is a composite set (≡ stepping+paradox), not a no-ending modifier
    // ecosystem, so it is not listed here (it appears as a set in the kind table).
    expect(html).toMatch(/Modifier ecosystems<\/strong> \(ducking, spinning\)/);
    expect(html).not.toMatch(/Modifier ecosystems<\/strong> \(ducking, spinning, blurry\)/);
  });

  it('teaches the family-ish kinds with a two-axis Family entry (family / atom / ecosystem / anchor)', async () => {
    const html = await glossary();
    expect(html).toContain('<dt>Family</dt>');
    expect(html).toContain('<dt>Atom / primitive</dt>');
    expect(html).toContain('<dt>Modifier ecosystem</dt>');
    expect(html).toContain('<dt>Family anchor</dt>');
    // The Family entry carries both axes (lineage position + tier) with examples.
    expect(html).toMatch(/lineage position/i);
    expect(html).toMatch(/Family Parent[\s\S]*Minor Lineage/);
    // The retired first-class / sub-family framing no longer renders.
    expect(html).not.toContain('<dt>First-class family</dt>');
    expect(html).not.toContain('<dt>Sub-family</dt>');
    expect(html).not.toMatch(/eight\s+recognized parents/);
  });

  it('carries the fuzzy-boundary humility clause', async () => {
    const html = await glossary();
    expect(html).toMatch(/<strong>Where the edges blur\.<\/strong>/);
    expect(html).toMatch(/whirl \/ swirl \/ twirl/);
    expect(html).toMatch(/a future ruling may move them/);
  });

  it('renders the first-class roster from the dictionary source, ATW excluded as a primitive', async () => {
    const html = await glossary();
    expect(html).toContain('Family Parents');
    // The ratified roster renders as ?family= links from the same source the
    // dictionary "By family" browse uses (freestylePublicFamilies.ts).
    for (const slug of ['mirage', 'whirl', 'drifter', 'butterfly_swirl']) {
      expect(html, `roster link ${slug}`).toContain(`href="/freestyle/tricks?family=${slug}"`);
    }
    // The well-documented families keep their educational cards.
    for (const id of ['term-illusion', 'term-legover', 'term-pickup']) {
      expect(html, `family card ${id}`).toContain(`id="${id}"`);
    }
    // ATW is no longer a parent card; the retired framing is gone.
    expect(html).not.toMatch(/All eight recognized parents/);
    // Every carded family carries an educational card (status line removed).
    expect(html).toMatch(/Every family below has an educational card/);
  });

  it('promotes six empirically-admitted family parents and nests derived branches under their roots', async () => {
    const html = await glossary();
    for (const slug of ['swirl', 'inside_stall', 'torque', 'blender', 'double_leg_over', 'eggbeater']) {
      expect(html, `promoted family ${slug}`).toContain(`href="/freestyle/tricks?family=${slug}"`);
    }
    // Derived branches render nested in parentheses after their root.
    expect(html).toMatch(/Osis<\/a> \([^)]*family=torque[^)]*family=blender[^)]*\)/);
    expect(html).toMatch(/Legover<\/a> \([^)]*family=double_leg_over[^)]*family=eggbeater[^)]*\)/);
    // The first-class rule states the current editorial standard (>10 descendants).
    expect(html).toMatch(/more than 10 documented descendants/);
    expect(html).not.toMatch(/at least three recursive descendant tricks/);
    expect(html).not.toMatch(/curator-selected balance/);
    // The three newly-carded families carry educational cards.
    for (const id of ['term-double_leg_over', 'term-eggbeater', 'term-inside_stall']) {
      expect(html, `card ${id}`).toContain(`id="${id}"`);
    }
  });

  it('routes a future leggy super-family to the neighborhood axis, not a parent merge', async () => {
    const html = await glossary();
    expect(html).toMatch(/leggy super-family is ever[\s\S]{0,20}recognized, it belongs on the/);
    expect(html).toMatch(/movement-neighborhood/);
  });

  it('renders the family histogram with the two surface roots leading the families', async () => {
    const html = await glossary();
    expect(html).toContain('gloss-histogram');
    // The two grandparent surfaces lead, marked as a distinct tier with a full bar.
    expect(html).toMatch(/gloss-histogram-row--surface[\s\S]{0,200}Clipper Stall[\s\S]{0,200}gloss-bar-count">328/);
    expect(html).toContain('gloss-bar-fill--w100');
    // Every first-class family appears, including the ones a reader would scan for.
    for (const [label, count] of [['Swirl', '29'], ['Torque', '22'], ['Flurry', '3']] as const) {
      expect(html, `family ${label}`).toContain(`<dt>${label}</dt>`);
      expect(html, `count ${count}`).toContain(`gloss-bar-count">${count}`);
    }
    // The paragraph reframes the roster as measured rather than curator-picked.
    expect(html).toMatch(/too broad to be families/);
  });

  it('renders the entry histogram in the timing-and-sets section', async () => {
    const html = await glossary();
    expect(html).toContain('How tricks begin');
    expect(html).toMatch(/<dt>Toe set<\/dt>[\s\S]{0,200}gloss-bar-count">207/);
    for (const label of ['Symposium', 'Pixie', 'Stepping', 'Furious']) {
      expect(html, `entry system ${label}`).toContain(`<dt>${label}</dt>`);
    }
    expect(html).toMatch(/the ending mirrors it/);
  });
});

describe('Glossary — media claim-scope (L6)', () => {
  it('renders the media claim-scope section', async () => {
    const html = await glossary();
    expect(html).toContain('id="section-media-claim-scope"');
    expect(html).toMatch(/What a video can and can/);
  });

  it('states the media-is-not-ontology firewall', async () => {
    const html = await glossary();
    expect(html).toMatch(/teaching layer/);
    expect(html).toMatch(/never overrides the dictionary/);
  });

  it('defines the three claim scopes (tutorial / demonstration / record)', async () => {
    const html = await glossary();
    for (const term of ['Tutorial', 'Demonstration', 'Record']) {
      expect(html, `claim scope ${term}`).toContain(`<dt>${term}</dt>`);
    }
  });

  it('frames media as teaching-without-resolving and links out to the galleries', async () => {
    const html = await glossary();
    expect(html).toMatch(/teaches without resolving/);
    expect(html).toContain('href="/media"');
  });

  it('is reachable from the line-1 media badge mention', async () => {
    const html = await glossary();
    expect(html).toContain('href="#section-media-claim-scope"');
  });
});

describe('Glossary — L3 folk/structural projections + equivalence mechanism', () => {
  it('renders the two-projections subsection', async () => {
    const html = await glossary();
    expect(html).toContain('id="two-projections"');
    expect(html).toMatch(/two projections of the same move/);
  });

  it('states the structure-not-strings equivalence mechanism', async () => {
    const html = await glossary();
    expect(html).toMatch(/decomposed structure/);
    expect(html).toMatch(/on <em>structure<\/em>, never on <em>strings<\/em>/);
  });

  it('uses the live-verified canonical-surface examples (both directions)', async () => {
    const html = await glossary();
    expect(html).toContain('href="/freestyle/tricks/gauntlet"');
    expect(html).toContain('href="/freestyle/tricks/gyro_ducking_symposium_torque"');
    expect(html).toMatch(/stepping-ducking-paradox-torque/);
    expect(html).toMatch(/alpine-big-apple/);
  });
});

describe('Glossary edge-case classification notes', () => {
  it('documents the swing-element exception (Pendulum / Rake) to the terminate-in-contact rule', async () => {
    const html = await glossary();
    expect(html).toContain('swing element');
    expect(html).toContain('Pendulum and Rake');
  });

  it('disambiguates the overloaded clipper terminology', async () => {
    const html = await glossary();
    expect(html).toContain('is a flying (no-stall) clipper kick');
    expect(html).toContain('clipper naming lineage');
  });

  it('notes swirl has no kick variant and grows through structural variants', async () => {
    const html = await glossary();
    expect(html).toContain('Swirl behaves differently from most dex families');
    expect(html).toContain('no recognized kick variant');
  });

  it('gathers the exceptions under one "Edge cases and special structures" heading', async () => {
    const html = await glossary();
    expect(html).toContain('id="edge-cases-special-structures"');
    expect(html).toContain('Swing-element tricks');
    // the terminate-in-contact rule keeps a pointer to the consolidated section
    expect(html).toContain('href="#edge-cases-special-structures"');
  });
});

describe('Glossary foundational frame — Tricks / Sets / Modifiers + register notes', () => {
  it('renders the Tricks/Sets/Modifiers orientation frame with the four-surface split', async () => {
    const html = await glossary();
    expect(html).toContain('id="tricks-sets-modifiers"');
    expect(html).toContain('<dt>Trick</dt>');
    expect(html).toContain('<dt>Set</dt>');
    expect(html).toContain('<dt>Modifier</dt>');
    expect(html).toContain('href="/freestyle/operators"');   // transformations surface
  });

  it('makes the set-vs-trick contrast explicit and gives the modifier tell', async () => {
    const html = await glossary();
    expect(html).toContain('initiate movement rather than terminate it');
    expect(html).toContain('Swirling is a modifier; Swirl is a trick');
  });

  it('frames Continuous-Control Lineage as an observational grouping, not a formal family', async () => {
    const html = await glossary();
    expect(html).toContain('Continuous-Control Lineage');
    expect(html).toContain('observational grouping');
    expect(html).toContain('closely related expressions');
    expect(html).toContain('href="/freestyle/tricks/eclipse"');
  });

  it('introduces the educational-approximation register with Twirl in the decomposition table', async () => {
    const html = await glossary();
    expect(html).toContain('educational approximation');
    expect(html).toContain('Swirl + Spin');
    expect(html).toContain('Reverse Swirling Osis');
  });
});

describe('Glossary family roster — three display tiers', () => {
  it('splits the roster into Family Parents, Minor Lineages, and Foundational Terminal Surfaces', async () => {
    const html = await glossary();
    expect(html).toContain('Family Parents');
    expect(html).toContain('Minor lineages');
    expect(html).toContain('Foundational terminal surfaces');
    // Foundational surfaces are named as excluded (too broad), not as families.
    expect(html).toContain('Clipper Stall');
    expect(html).toContain('Toe Stall');
  });

  it('lists demoted families under Minor Lineages with their ?family= routes intact', async () => {
    const html = await glossary();
    for (const slug of ['flurry', 'eclipse', 'barrage']) {
      expect(html, `minor lineage ${slug}`).toContain(`href="/freestyle/tricks?family=${slug}"`);
    }
  });
});

describe('Glossary family cards — lineage position and tier as independent labels', () => {
  const cardSlice = (html: string, slug: string): string => {
    const i = html.indexOf(`id="term-${slug}"`);
    return i < 0 ? '' : html.slice(i, i + 400);
  };

  it('labels each card with a separate lineage chip and tier chip', async () => {
    const html = await glossary();
    // Root lineage + Family Parent.
    expect(cardSlice(html, 'swirl')).toMatch(/Root lineage/);
    expect(cardSlice(html, 'swirl')).toMatch(/Family Parent/);
    // Branch lineage (Osis) + Family Parent.
    expect(cardSlice(html, 'torque')).toMatch(/Branch lineage \(Osis\)/);
    expect(cardSlice(html, 'torque')).toMatch(/Family Parent/);
    // Root lineage + Minor Lineage. rev_whirl is an independent reversal lineage: not a
    // Family Parent, and not a branch of whirl (direction reversal makes a distinct lineage).
    expect(cardSlice(html, 'rev_whirl')).toMatch(/Root lineage/);
    expect(cardSlice(html, 'rev_whirl')).toMatch(/Minor Lineage/);
    expect(cardSlice(html, 'rev_whirl')).not.toMatch(/Branch lineage/);
    // Root lineage + Minor Lineage.
    expect(cardSlice(html, 'eclipse')).toMatch(/Root lineage/);
    expect(cardSlice(html, 'eclipse')).toMatch(/Minor Lineage/);
    // Root lineage + Family Parent.
    expect(cardSlice(html, 'inside_stall')).toMatch(/Root lineage/);
    expect(cardSlice(html, 'inside_stall')).toMatch(/Family Parent/);
  });

  it('retires the collapsed single chip that conflated ancestry and tier', async () => {
    const html = await glossary();
    expect(html).not.toContain('descendant lineage / sub-family');
    expect(html).not.toContain('glossary-family-card-type-chip');
  });
});

describe('Glossary X-Dex term — notation-authoritative', () => {
  it('defines X-Dex as scored from the [XDEX] notation flag, not a crossed-body position', async () => {
    const html = await glossary();
    const i = html.indexOf('id="term-x-dex"');
    expect(i, 'X-Dex term present').toBeGreaterThanOrEqual(0);
    const dd = html.slice(i, i + 1600);
    // The vague pre-ruling definition is gone.
    expect(dd).not.toMatch(/crossed-body position/);
    // Notation is authoritative: X-Dex is scored where [XDEX] is written.
    expect(dd).toMatch(/\[XDEX\]/);
    expect(dd).toMatch(/source of truth/);
    // X-Dex is its own component, never folded into a modifier's weight.
    expect(dd).toMatch(/never part of a modifier's own weight/);
    // The eligible-base list survives only as an explicit historical note.
    expect(dd).toMatch(/Historically/);
    expect(dd).toMatch(/mirage, illusion, whirl, torque, and drifter/);
  });

  it('carries the beginner examples keyed to the [XDEX] flag', async () => {
    const html = await glossary();
    const i = html.indexOf('id="term-x-dex"');
    const dd = html.slice(i, i + 1600);
    expect(dd).toMatch(/Atom Smasher<\/a> carries <code>\[XDEX\]<\/code>/);
    expect(dd).toMatch(/Atomic Miraging Butterfly<\/a> does not/);
  });

  it('rewrites the [XDEX] flag away from the full-circle-dex framing', async () => {
    const html = await glossary();
    const i = html.indexOf('id="op-flag-xdex"');
    expect(i, 'XDEX flag entry present').toBeGreaterThanOrEqual(0);
    const dd = html.slice(i, i + 400);
    expect(dd).not.toMatch(/full-circle dex variant/);
    expect(dd).toMatch(/notation carries <code>\[XDEX\]<\/code>/);
  });

  it('no longer claims X-Dex eligibility is an open per-base question anywhere on the page', async () => {
    const html = await glossary();
    expect(html).not.toMatch(/open per-base question/);
  });

  it('marks the atomic / quantum X-Dex trigger as ratified and links the term', async () => {
    const html = await glossary();
    expect(html).toMatch(/atomic \/ quantum <a href="#term-x-dex">X-Dex<\/a> trigger/);
  });
});
