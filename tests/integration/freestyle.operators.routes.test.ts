/**
 * Integration tests for the Operators & Modifiers consistency layer.
 *
 * Verifies:
 *   - /freestyle/operators renders the compact index grouped by the
 *     relationship, body, and no-plant movement-system axes, in the
 *     dict-trick-row idiom shared with the dictionary and set encyclopedia.
 *   - Set primitives (pixie, fairy, atomic, barraging, and the rest) are NOT
 *     listed here: they are first-class objects of the Set Encyclopedia, so the
 *     same concept is never presented as both a set and an operator. The page
 *     links out to the Set Encyclopedia for them.
 *   - Each modifier row carries a type chip, an ADD weight when tracked, a
 *     status pill, and View-details / Browse-tricks click-throughs.
 *   - Body relationship modifiers (paradox, spinning) never carry a notation
 *     line; that set formula belongs to the encyclopedia.
 *   - Status pills reflect the data: a modifier with a teaching page reads
 *     "Teaching page".
 *   - The advanced decomposition reference is retained below the index.
 *   - Universal detail resolution: a known modifier without a teaching page
 *     resolves to a data-driven stub (not 404); a modifier with a teaching
 *     page still resolves to the rich page; an unknown slug 404s.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';

import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import {
  insertFreestyleTrick,
  insertFreestyleTrickModifier,
  insertFreestyleTrickModifierLink,
} from '../fixtures/factories';

const { dbPath } = setTestEnv('3097');

let createApp: Awaited<ReturnType<typeof importApp>>;

beforeAll(async () => {
  const db = createTestDb(dbPath);

  // Modifier inventory: two set modifiers (canonical-set formula) and a body
  // modifier (no notation). All flat +1 - atomic is +1 on every base, with no
  // rotational class.
  insertFreestyleTrickModifier(db, { slug: 'pixie',   modifier_name: 'Pixie',   add_bonus: 1, add_bonus_rotational: 1, modifier_type: 'set' });
  insertFreestyleTrickModifier(db, { slug: 'atomic',  modifier_name: 'Atomic',  add_bonus: 1, add_bonus_rotational: 1, modifier_type: 'set' });
  insertFreestyleTrickModifier(db, { slug: 'paradox', modifier_name: 'Paradox', add_bonus: 1, add_bonus_rotational: 1, modifier_type: 'body' });
  // Miraging renders a data-driven stub (a dual-role set that is NOT route-migrated,
  // unlike whirling/swirling); its base atom is mirage.
  insertFreestyleTrickModifier(db, { slug: 'miraging', modifier_name: 'Miraging', add_bonus: 1, add_bonus_rotational: 1, modifier_type: 'body' });

  // Tricks linked to miraging, for the stub "common tricks" list. miraging is a
  // dual-role set with no teaching page, so its modifier route renders a stub;
  // pixie now has an authored set page and redirects there instead.
  insertFreestyleTrick(db, { slug: 'smear',   canonical_name: 'smear',   adds: '3', base_trick: 'mirage',    trick_family: 'mirage' });
  insertFreestyleTrick(db, { slug: 'dimwalk', canonical_name: 'dimwalk', adds: '4', base_trick: 'butterfly', trick_family: 'butterfly' });
  insertFreestyleTrickModifierLink(db, 'smear',   'miraging');
  insertFreestyleTrickModifierLink(db, 'dimwalk', 'miraging');

  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

// Slice one modifier row's markup out of the flat page HTML.
function rowSlice(html: string, slug: string): string {
  const start = html.indexOf(`id="operator-${slug}"`);
  if (start < 0) return '';
  const next = html.indexOf('id="operator-', start + 1);
  return html.slice(start, next < 0 ? start + 1200 : next);
}

describe('GET /freestyle/operators — compact modifier index', () => {
  it('renders the relationship, body, and no-plant axes as grouped sections', async () => {
    const res = await request(await createApp()).get('/freestyle/operators');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Entry Topology');
    expect(res.text).toContain('Midtime Body Modifiers');
    expect(res.text).toContain('No-Plant &amp; Suspension');
    // The set primitives no longer have their own operator axis here.
    expect(res.text).not.toContain('Set / Uptime Systems');
    // Reuses the trick-dictionary row idiom.
    expect(res.text).toContain('dict-trick-row-stack');
    expect(res.text).toContain('class="dict-trick-row"');
  });

  it('points sets at the Set Encyclopedia instead of listing them here', async () => {
    const res = await request(await createApp()).get('/freestyle/operators');
    expect(res.text).toContain('href="/freestyle/sets"');
  });

  it('gives every relationship/body modifier a row with click-throughs', async () => {
    const res = await request(await createApp()).get('/freestyle/operators');
    for (const slug of ['paradox', 'spinning', 'symposium', 'ducking']) {
      expect(res.text, `row ${slug}`).toContain(`id="operator-${slug}"`);
    }
    expect(res.text).toContain('href="/freestyle/modifier/paradox"');
    // The movement-system view groups by axis, not per modifier, so the browse
    // link lands on the view rather than a dead per-modifier anchor.
    expect(res.text).toContain('href="/freestyle/tricks?view=movement-system"');
  });

  it('does not list set primitives as operator rows', async () => {
    const res = await request(await createApp()).get('/freestyle/operators');
    // weaving and zulu are platform-canonical ducking launch sets, not operators,
    // so they belong only in the Set Encyclopedia and never get an operator row.
    for (const slug of ['pixie', 'fairy', 'atomic', 'quantum', 'nuclear', 'barraging', 'blurry', 'stepping', 'whirling', 'weaving', 'zulu']) {
      expect(res.text, `set ${slug} absent`).not.toContain(`id="operator-${slug}"`);
    }
    // Furious is a name for the barraging set; it has no operator row either.
    expect(res.text).not.toContain('id="operator-furious"');
  });

  it('shows the flat ADD weight from the table for each modifier', async () => {
    const res = await request(await createApp()).get('/freestyle/operators');
    expect(rowSlice(res.text, 'paradox')).toContain('+1');
  });

  it('does not render a set notation line on a relationship modifier', async () => {
    const res = await request(await createApp()).get('/freestyle/operators');
    // paradox and spinning are relationships/body actions, not sets.
    expect(rowSlice(res.text, 'paradox')).not.toContain('dict-trick-row-notation');
    expect(rowSlice(res.text, 'spinning')).not.toContain('dict-trick-row-notation');
    // pixie's set formula no longer surfaces here now that sets left the page.
    expect(res.text).not.toContain('SAME IN [DEX]');
  });

  it('uses honest status pills from the data', async () => {
    const res = await request(await createApp()).get('/freestyle/operators');
    // paradox + spinning have authored teaching pages.
    expect(rowSlice(res.text, 'paradox')).toContain('operator-status-pill--teaching');
    expect(rowSlice(res.text, 'spinning')).toContain('operator-status-pill--teaching');
  });

  it('retains the advanced decomposition reference below the index', async () => {
    const res = await request(await createApp()).get('/freestyle/operators');
    expect(res.text).toContain('id="advanced-decomposition-operator-theory"');
    expect(res.text).toContain('id="alpine"');
  });

  // Paradox is taught definition-first (a side relationship between the support
  // leg and the dex), with the classic entry formula shown as the concrete
  // example, not the definition. The brackets are a short notation vocabulary,
  // distinct from the operators that leave them behind.
  it('teaches paradox by definition with the entry formula as the example, plus the notation components', async () => {
    const res = await request(await createApp()).get('/freestyle/operators');
    // Paradox section: definition + the canonical entry formula as the example.
    expect(res.text).toContain('id="paradox"');
    expect(res.text).toMatch(/side relationship between the support leg and the dexterity/);
    expect(res.text).toContain('CLIP &gt; OP IN [DEX]');
    expect(res.text).toMatch(/classic paradox entry topology/);
    // Notation/ADD components vocabulary.
    expect(res.text).toContain('id="notation-components"');
    expect(res.text).toContain('[PDX]');
    expect(res.text).toContain('[XBD]');
    expect(res.text).toContain('[XDEX]');
    // The page must not reassert paradox as a kind of cross-body.
    expect(res.text).not.toMatch(/paradox[^.]*\bspecies\b/i);
  });

  it('sub-labels the spin and head-movement families within the body axis', async () => {
    const res = await request(await createApp()).get('/freestyle/operators');
    expect(res.text).toContain('>Spin family<');
    expect(res.text).toContain('>Head-movement family<');
    // The sub-label sits before its first member.
    expect(res.text).toMatch(/>Spin family<[\s\S]*?id="operator-spinning"/);
    expect(res.text).toMatch(/>Head-movement family<[\s\S]*?id="operator-ducking"/);
  });
});

describe('GET /freestyle/modifier/:slug — universal detail resolution', () => {
  it('known modifier without a teaching page resolves to a data-driven stub', async () => {
    const res = await request(await createApp()).get('/freestyle/modifier/miraging');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Common tricks');
    // Common tricks come from the modifier links.
    expect(res.text).toContain('href="/freestyle/tricks/smear"');
    expect(res.text).toContain('href="/freestyle/tricks/dimwalk"');
    // A stub modifier still links back to its base atom (miraging -> mirage).
    expect(res.text).toContain('href="/freestyle/tricks/mirage"');
  });

  it('modifier with an authored teaching page still resolves to the rich page', async () => {
    const res = await request(await createApp()).get('/freestyle/modifier/spinning');
    expect(res.status).toBe(200);
    // The rich concept-first teaching page, not the stub.
    expect(res.text).toContain('<h2>What it is</h2>');
    expect(res.text).toContain('<h2>JOB notation</h2>');
  });

  it('an operator links back to its base atom (reverse of the atom->operator cross-link)', async () => {
    // Teaching page: spinning -> spin.
    const teaching = await request(await createApp()).get('/freestyle/modifier/spinning');
    expect(teaching.text).toContain('Base trick:');
    expect(teaching.text).toContain('href="/freestyle/tricks/spin"');
    // Stub page: miraging -> mirage (whirling/swirling are now route-migrated sets).
    const stub = await request(await createApp()).get('/freestyle/modifier/miraging');
    expect(stub.status).toBe(200);
    expect(stub.text).toContain('href="/freestyle/tricks/mirage"');
  });

  it('unknown modifier slug returns 404', async () => {
    const res = await request(await createApp()).get('/freestyle/modifier/not-a-real-modifier');
    expect(res.status).toBe(404);
  });

  it('the stub surfaces the operator-reference decomposition + worked examples (now the canonical home)', async () => {
    const res = await request(await createApp()).get('/freestyle/modifier/atomic');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Decomposition');
    // Worked example from the operator reference (the '=' renders HTML-escaped).
    expect(res.text).toContain('Atom Smasher');
    expect(res.text).toContain('Atomic Mirage');
  });
});
