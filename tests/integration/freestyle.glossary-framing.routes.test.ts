/**
 * Integration tests for the additive glossary framing sections (2026-05-28).
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
    expect(html).toMatch(/more\s+than two active members/);
    expect(html).toMatch(/derivative\s+micro-clusters \(minor &amp; derived\)/);
    expect(html).toContain('id="section-families"');
    expect(html).toContain('Parent families');
  });
});

describe('Glossary framing — modifier-ecosystem framing', () => {
  it('frames modifiers as ecosystems, not families', async () => {
    const html = await glossary();
    expect(html).toMatch(/Modifiers form <strong>ecosystems<\/strong>/);
    expect(html).toMatch(/An ecosystem is\s+<strong>not a family<\/strong>/);
    expect(html).toMatch(/pixie appears across\s+pixie-illusion/);
  });
});

describe('Glossary framing — sidebar + non-regression', () => {
  it('adds a sidebar entry for the new section without dropping existing ones', async () => {
    const html = await glossary();
    expect(html).toContain('href="#section-reading-the-dictionary"');
    // Existing sidebar entries remain.
    expect(html).toContain('href="#section-core-concepts"');
    expect(html).toContain('href="#section-families"');
    expect(html).toContain('href="#section-notation"');
  });

  it('§families uses the parent / descendant-lineage / sub-family model (root/branch retired)', async () => {
    const html = await glossary();
    expect(html).toContain('Parent families');
    expect(html).toContain('Descendant lineages &amp; sub-families');
    // The retired vocabulary no longer renders.
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

  it('introduces the productive descendant-lineage middle tier without renaming the families taxonomy', async () => {
    const html = await glossary();
    expect(html).toMatch(/<strong>productive descendant lineage<\/strong>/);
    expect(html).toMatch(/such as the drifter lineage/);
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
    // knee clipper = surface substitution, not a new lineage.
    expect(html).toMatch(/<strong>knee contact substitution<\/strong>/);
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
    expect(html).toMatch(/Foundational surfaces<\/strong> \(toe, clipper\)/);
    expect(html).toMatch(/Modifier ecosystems<\/strong> \(pixie, ducking, spinning\)/);
  });

  it('teaches the three-tier structural-object model (parent / child sub-family / descendant lineage)', async () => {
    const html = await glossary();
    expect(html).toMatch(/<strong>parent family<\/strong>/);
    expect(html).toMatch(/<strong>child\s+sub-family<\/strong>/);
    expect(html).toMatch(/eight\s+recognized parents are mirage, illusion, butterfly, legover, pickup,\s+whirl \/ swirl, osis, and around-the-world/);
  });

  it('carries the fuzzy-boundary humility clause', async () => {
    const html = await glossary();
    expect(html).toMatch(/<strong>Where the edges blur\.<\/strong>/);
    expect(html).toMatch(/whirl \/ swirl \/ twirl/);
    expect(html).toMatch(/a future ruling may move them/);
  });

  it('cards all eight parent families, including the four formerly-uncarded parents', async () => {
    const html = await glossary();
    expect(html).toMatch(/All eight recognized parents are carded here/);
    for (const id of ['term-illusion', 'term-legover', 'term-pickup', 'term-around-the-world']) {
      expect(html, `parent card ${id}`).toContain(`id="${id}"`);
    }
  });

  it('routes a future leggy super-family to the neighborhood axis, not a parent merge', async () => {
    const html = await glossary();
    expect(html).toMatch(/leggy super-family is ever[\s\S]{0,20}recognized, it belongs on the/);
    expect(html).toMatch(/movement-neighborhood/);
  });
});

describe('Glossary Phase 6 — media claim-scope (L6)', () => {
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

describe('Glossary Phase 3 — L3 folk/structural projections + equivalence mechanism', () => {
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
    expect(html).toContain('href="/freestyle/tricks/gyro-ducking-symposium-torque"');
    expect(html).toMatch(/stepping-ducking-paradox-torque/);
    expect(html).toMatch(/alpine-big-apple/);
  });
});
