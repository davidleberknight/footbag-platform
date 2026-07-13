/**
 * Integration tests for /freestyle/compositional-sets — the new
 * dictionary-hub exploration surface (Phase 2a + 2b of the
 * compositional-sets slice, 2026-05-23).
 *
 * Contracts under test:
 *   - Route registers and renders 200
 *   - Hero + breadcrumb + premise section render with the
 *     softened-scope wording (extends the base grammar with
 *     additional primitives/modifiers; not "every trick resolves")
 *   - All six structural families render with their intros + member
 *     cards (operator-card style, not table dump)
 *   - All five uptime-reinterpretation ladders render with steps +
 *     source citation
 *   - The Holden/platform surging divergence is surfaced honestly
 *     (conflictNote rendered)
 *   - Cross-links exist in both directions: /freestyle/sets ↔
 *     /freestyle/compositional-sets
 *   - Glossary §7 "Compositional premise" subsection renders at the
 *     canonical anchor #compositional-premise with the Ben Job
 *     attribution and the forward-link to /freestyle/compositional-sets
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

const { dbPath } = setTestEnv('3203');

let createApp: Awaited<ReturnType<typeof importApp>>;

beforeAll(async () => {
  const db = createTestDb(dbPath);

  // Seed a few canonical slugs that match the operator-card name
  // resolution so trickHref cross-links render under test.
  for (const seed of [
    { slug: 'pixie',    canonical_name: 'pixie',    adds: '1', base_trick: 'pixie',    trick_family: 'pixie',    category: 'compound', notation: 'PIXIE',    is_active: 1 },
    { slug: 'stepping', canonical_name: 'stepping', adds: '1', base_trick: 'stepping', trick_family: 'stepping', category: 'compound', notation: 'STEPPING', is_active: 1 },
    { slug: 'mobius',   canonical_name: 'mobius',   adds: '5', base_trick: 'torque',   trick_family: 'torque',   category: 'compound', notation: 'MOBIUS',   is_active: 1 },
    { slug: 'mirage',   canonical_name: 'mirage',   adds: '2', base_trick: 'mirage',   trick_family: 'mirage',   category: 'compound', notation: 'MIRAGE',   is_active: 1 },
  ]) {
    insertFreestyleTrick(db, seed);
  }

  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('/freestyle/compositional-sets — route + hero + premise', () => {
  it('route registers and renders 200', async () => {
    const res = await request(createApp()).get('/freestyle/compositional-sets');
    expect(res.status).toBe(200);
  });

  it('renders the hero with title + breadcrumb', async () => {
    const res = await request(createApp()).get('/freestyle/compositional-sets');
    expect(res.text).toMatch(/<h1>Compositional Sets<\/h1>/);
    expect(res.text).toContain('class="breadcrumb"');
    expect(res.text).toContain('href="/freestyle"');
  });

  it('opens with a beginner-plain hero intro, not grammar jargon', async () => {
    const res = await request(createApp()).get('/freestyle/compositional-sets');
    expect(res.text).toContain('How named sets are built from a few simple parts');
  });

  it('renders the premise section with the canonical formula', async () => {
    const res = await request(createApp()).get('/freestyle/compositional-sets');
    expect(res.text).toContain('class="content-section compositional-sets-premise"');
    // Canonical formula renders verbatim (the Job grammar shape).
    expect(res.text).toContain('(toe | clip) &gt; [(same | op)(in | out) dexterity]* &gt; (same | op)(toe | clip)');
  });

  it('renders the softener wording (does NOT overclaim grammar scope)', async () => {
    const res = await request(createApp()).get('/freestyle/compositional-sets');
    // The softened wording explicitly acknowledges grammar extensions —
    // never says "every trick resolves to this shape".
    expect(res.text).toMatch(/extending it with additional movement primitives and modifiers/);
    expect(res.text).toMatch(/torque-class hybrids/);
    expect(res.text).not.toMatch(/every trick.*resolves to this shape/);
  });

  it('premise examples render as operator cards with cross-link when canonical', async () => {
    const res = await request(createApp()).get('/freestyle/compositional-sets');
    // Pixie + Mobius are seeded canonical → cards link out.
    expect(res.text).toMatch(/<a href="\/freestyle\/tricks\/pixie">Pixie<\/a>/);
    expect(res.text).toMatch(/<a href="\/freestyle\/tricks\/mobius">Mobius<\/a>/);
    // Each example carries notation.
    expect(res.text).toContain('TOE &gt; SAME IN [DEX] &gt;');
    expect(res.text).toContain('CLIP &gt;&gt; (back) SPIN [BOD] &gt;&gt; SAME IN [DEX] &gt; (front) SPIN [BOD] &gt; OP CLIP [XBD] [DEL]');
  });
});

describe('/freestyle/compositional-sets — six structural families', () => {
  it('renders all six families with stable anchor ids', async () => {
    const res = await request(createApp()).get('/freestyle/compositional-sets');
    for (const key of [
      'single-dex-primitives',
      'multi-dex-compounds',
      'spinning-family',
      'whirl-swirl-family',
      'uns-sets',
      'antisymposium-and-components',
    ]) {
      expect(res.text, `family ${key} expected`).toContain(`id="family-${key}"`);
    }
  });

  it('each family carries an intro paragraph (no flat notation dumps)', async () => {
    const res = await request(createApp()).get('/freestyle/compositional-sets');
    // Single-dex intro names the structural pattern.
    expect(res.text).toMatch(/One set, one dex, terminate/);
    // Spinning intro names the body-modifier framing.
    expect(res.text).toMatch(/body spin/);
    // UNS intro names the entry-surface shift.
    expect(res.text).toMatch(/entry surface shifts/);
  });

  it('member cards render with notation + status indicators', async () => {
    const res = await request(createApp()).get('/freestyle/compositional-sets');
    // Pixie should appear as a card with notation; seeded canonical →
    // status='canonical' (no status badge), trickHref present.
    expect(res.text).toMatch(/class="compositional-set-card compositional-set-card--canonical"/);
    // Holden-only entries carry the status badge.
    expect(res.text).toMatch(/class="compositional-set-card compositional-set-card--holden-only"/);
    expect(res.text).toMatch(/Holden-only/);
    // Platform-tracked entries (not yet canonical) carry their badge.
    expect(res.text).toMatch(/platform-tracked/);
  });

  it('status badges render the shaped label; the raw status code stays class-only', async () => {
    const res = await request(createApp()).get('/freestyle/compositional-sets');
    // Visible badge text is the pre-shaped label ('Holden-only'); the
    // lowercase raw code appears only inside class attributes.
    expect(res.text).toMatch(/compositional-set-card-status[^>]*>Holden-only</);
    expect(res.text).not.toMatch(/>holden-only</);
    // Canonical cards carry no status badge at all.
    const canonicalCard = res.text.slice(
      res.text.indexOf('compositional-set-card compositional-set-card--canonical'),
      res.text.indexOf('</article>', res.text.indexOf('compositional-set-card compositional-set-card--canonical')),
    );
    expect(canonicalCard).not.toMatch(/compositional-set-card-status/);
  });

  it('Holden-only entries appear (not promoted to canonical)', async () => {
    const res = await request(createApp()).get('/freestyle/compositional-sets');
    // Slapping, Tapping, Bubba — Holden-only, no platform canonical.
    expect(res.text).toContain('Slapping');
    expect(res.text).toContain('Tapping');
    expect(res.text).toContain('Bubba');
    // Holden parentheticals preserved.
    expect(res.text).toMatch(/Holden parenthetical: Double Pixie/);
    expect(res.text).toMatch(/Holden parenthetical: High Stepping/);
  });
});

describe('/freestyle/compositional-sets — uptime reinterpretation ladders', () => {
  it('renders all five ladders with anchor ids', async () => {
    const res = await request(createApp()).get('/freestyle/compositional-sets');
    for (const setSlug of ['miraging', 'illusioning', 'blurry', 'furious', 'surging']) {
      expect(res.text, `ladder ${setSlug} expected`).toContain(`id="ladder-${setSlug}"`);
    }
  });

  it('each ladder shows reinterpretation + steps + source citation', async () => {
    const res = await request(createApp()).get('/freestyle/compositional-sets');
    // Miraging ladder reinterpretation phrase: mirage-family descriptive
    // language, not an uptime set.
    expect(res.text).toMatch(/Mirage-family descriptive language/);
    // Step entries render as <li> within an <ol>.
    expect(res.text).toContain('class="compositional-ladder-steps"');
    expect(res.text).toContain('class="compositional-ladder-step"');
    // Source citation label always renders.
    expect(res.text).toContain('Source:');
  });

  it('describes miraging as inward standalone-movement language, not a launch set; quantum is that movement realized with a set role', async () => {
    const res = await request(createApp()).get('/freestyle/compositional-sets');
    // Set-versus-standalone identity follows structural role, not execution timing.
    expect(res.text).not.toMatch(/uptime mirage structure/i);
    expect(res.text).toMatch(/miraging is not treated as a launch set/i);
    expect(res.text).toMatch(/Quantum is the same inward movement realized with a set role/i);
  });

  it('describes illusioning as a standalone movement distinct from atomic, not a launch set', async () => {
    const res = await request(createApp()).get('/freestyle/compositional-sets');
    expect(res.text).not.toMatch(/uptime illusion structure/i);
    // Illusioning is the outward standalone movement, not a launch set or an Atomic equivalent.
    expect(res.text).toMatch(/illusioning is not a launch set or an Atomic equivalent/i);
    expect(res.text).toMatch(/Atomic is the same outward movement realized with a set role/i);
  });

  it('illusioning ladder honestly notes it is a structural inference (not in Holden)', async () => {
    const res = await request(createApp()).get('/freestyle/compositional-sets');
    expect(res.text).toMatch(/structurally implied/i);
    // Handlebars HTML-encodes the apostrophe; use a tolerant pattern.
    expect(res.text).toMatch(/not (currently )?in Holden.{1,8}s (list|compilation)/i);
  });

  it('surging ladder surfaces the Holden/platform divergence honestly', async () => {
    const res = await request(createApp()).get('/freestyle/compositional-sets');
    // Both readings recorded.
    expect(res.text).toMatch(/spinning miraging/);
    expect(res.text).toMatch(/spinning stepping/);
    // Conflict note rendered.
    expect(res.text).toContain('class="compositional-ladder-conflict"');
    expect(res.text).toMatch(/documented disagreement, not normalized/);
    // Conflict class applied to the ladder wrapper.
    expect(res.text).toContain('compositional-ladder--conflict');
  });
});

describe('/freestyle/compositional-sets — cross-links + sources', () => {
  it('cross-links to /freestyle/sets/reference (the flat Holden table)', async () => {
    const res = await request(createApp()).get('/freestyle/compositional-sets');
    expect(res.text).toContain('href="/freestyle/sets/reference"');
  });

  it('cross-links to /freestyle/operators and glossary notation primer', async () => {
    const res = await request(createApp()).get('/freestyle/compositional-sets');
    expect(res.text).toContain('href="/freestyle/operators"');
    expect(res.text).toContain('href="/freestyle/glossary#operational-notation"');
  });

  it('source attribution names Ben Job + Chris Holden explicitly', async () => {
    const res = await request(createApp()).get('/freestyle/compositional-sets');
    expect(res.text).toMatch(/Ben Job/);
    expect(res.text).toMatch(/Chris Holden/);
    // Holden framed as community archive, not canonical doctrine.
    expect(res.text).toMatch(/community archive, not platform-canonical/);
  });
});

describe('/freestyle/compositional-sets — §4 consistency audit', () => {
  it('renders the audit section with summary counts', async () => {
    const res = await request(createApp()).get('/freestyle/compositional-sets');
    expect(res.text).toContain('class="content-section compositional-sets-audit"');
    expect(res.text).toContain('id="audit"');
    expect(res.text).toMatch(/<h2[^>]*>Consistency audit<\/h2>/);
    // Summary dl with four status categories.
    expect(res.text).toContain('class="compositional-sets-audit-summary"');
    expect(res.text).toMatch(/<dt>Aligned<\/dt>/);
    expect(res.text).toMatch(/<dt>Partial fit<\/dt>/);
    expect(res.text).toMatch(/<dt>Conflict<\/dt>/);
    expect(res.text).toMatch(/<dt>Holden-only<\/dt>/);
  });

  it('audit posture is transparency-not-normalization (per slice constraints)', async () => {
    const res = await request(createApp()).get('/freestyle/compositional-sets');
    expect(res.text).toMatch(/curatorial transparency,\s+not a normalization pass/);
    expect(res.text).toMatch(/Holden-only entries are[\s\S]*?not[\s\S]*?promoted to canonical/);
    expect(res.text).toMatch(/conflicts are[\s\S]*?not[\s\S]*?silently resolved/);
  });

  it('renders all four status categories among the headline rows', async () => {
    const res = await request(createApp()).get('/freestyle/compositional-sets');
    // Status modifier classes on the row wrappers.
    expect(res.text).toContain('compositional-sets-audit-row--aligned');
    expect(res.text).toContain('compositional-sets-audit-row--partial');
    expect(res.text).toContain('compositional-sets-audit-row--conflict');
    expect(res.text).toContain('compositional-sets-audit-row--holden-only');
  });

  it('headline rows include the documented divergences (atomic, nuclear, surging)', async () => {
    const res = await request(createApp()).get('/freestyle/compositional-sets');
    // Atomic — partial fit (ontological framing diverges).
    expect(res.text).toMatch(/<span class="compositional-sets-audit-row-name">Atomic<\/span>/);
    expect(res.text).toMatch(/Toe set Illusion/);
    // Nuclear — partial fit (basic vs compound framing).
    expect(res.text).toMatch(/<span class="compositional-sets-audit-row-name">Nuclear<\/span>/);
    // Surging — the single conflict.
    expect(res.text).toMatch(/<span class="compositional-sets-audit-row-name">Surging<\/span>/);
  });

  it('Holden-only headline rows render with platform-absent notation', async () => {
    const res = await request(createApp()).get('/freestyle/compositional-sets');
    // Bubba is Holden-only; the platform-absent variant of the platform-line renders.
    expect(res.text).toMatch(/<span class="compositional-sets-audit-row-name">Bubba<\/span>/);
    expect(res.text).toContain('compositional-sets-audit-row-platform--absent');
    expect(res.text).toMatch(/no current entry/);
  });

  it('headline section includes Blurry as the strongest-alignment example', async () => {
    const res = await request(createApp()).get('/freestyle/compositional-sets');
    expect(res.text).toMatch(/<span class="compositional-sets-audit-row-name">Blurry<\/span>/);
    expect(res.text).toMatch(/Stepping Paradox/);
  });
});

describe('/freestyle/sets/reference — flat Holden table (moved from /freestyle/sets in Phase B)', () => {
  it('continues to render 200 at its new path (sibling not replacement)', async () => {
    const res = await request(createApp()).get('/freestyle/sets/reference');
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/Freestyle Move Sets/);
  });

  it('/freestyle/sets renders the standalone Set Encyclopedia (HTTP 200)', async () => {
    const res = await request(createApp()).get('/freestyle/sets');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Set Encyclopedia');
  });
});

describe('/freestyle/glossary — compositional-premise §7 subsection', () => {
  it('renders the new h3 at the canonical anchor #compositional-premise', async () => {
    const res = await request(createApp()).get('/freestyle/glossary');
    expect(res.status).toBe(200);
    expect(res.text).toContain('id="compositional-premise"');
    expect(res.text).toMatch(/The compositional premise.*every trick as formula.*Ben Job, 1995/);
  });

  it('attributes Ben Job + softened-scope wording', async () => {
    const res = await request(createApp()).get('/freestyle/glossary');
    expect(res.text).toMatch(/Ben Job \(footbag discussion list, 1995\)/);
    // Multi-line HTML in the glossary; whitespace-tolerant match.
    expect(res.text).toMatch(/extending it with additional\s+movement\s+primitives and modifiers/);
    expect(res.text).toMatch(/torque-class hybrids/);
  });

  it('forward-links to /freestyle/compositional-sets', async () => {
    const res = await request(createApp()).get('/freestyle/glossary');
    expect(res.text).toContain('href="/freestyle/compositional-sets"');
  });

  it('renders the 4 worked examples (Pixie / Stepping / Blurry / Mobius)', async () => {
    const res = await request(createApp()).get('/freestyle/glossary');
    expect(res.text).toContain('class="glossary-compositional-premise-examples"');
    // Each example's notation renders.
    expect(res.text).toMatch(/TOE &gt; SAME IN \[DEX\] &gt;/);
    expect(res.text).toMatch(/CLIP &gt; OP IN \[DEX\] &gt;/);
    expect(res.text).toMatch(/CLIP &gt; OP IN \[DEX\] &gt; OP OUT \[DEX\] &gt;/);
    expect(res.text).toMatch(/CLIP &gt;&gt; \(back\) SPIN \[BOD\] &gt;&gt; SAME IN \[DEX\] &gt; \(front\) SPIN \[BOD\] &gt; OP CLIP \[XBD\] \[DEL\]/);
  });

  it('renders the compositional-premise section with its deep-link anchor', async () => {
    const res = await request(createApp()).get('/freestyle/glossary');
    expect(res.text).toContain('id="compositional-premise"');
  });
});

describe('/freestyle/compositional-sets — Furious folded into Barraging (three-dex reading superseded)', () => {
  it('presents the older Furious three-dex reading as superseded, not as current structure', async () => {
    const res = await request(createApp()).get('/freestyle/compositional-sets');
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/superseded/i);
    expect(res.text).not.toContain('Barraging-set extended with a third dex');
  });
});
