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

  // Tricks that use pixie, for the stub "common tricks" list.
  insertFreestyleTrick(db, { slug: 'smear',   canonical_name: 'smear',   adds: '3', base_trick: 'mirage',    trick_family: 'mirage' });
  insertFreestyleTrick(db, { slug: 'dimwalk', canonical_name: 'dimwalk', adds: '4', base_trick: 'butterfly', trick_family: 'butterfly' });
  insertFreestyleTrickModifierLink(db, 'smear',   'pixie');
  insertFreestyleTrickModifierLink(db, 'dimwalk', 'pixie');

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
    expect(res.text).toContain('href="/freestyle/tricks?view=movement-system#movement-paradox"');
  });

  it('does not list set primitives as operator rows', async () => {
    const res = await request(await createApp()).get('/freestyle/operators');
    for (const slug of ['pixie', 'fairy', 'atomic', 'quantum', 'nuclear', 'barraging', 'blurry', 'stepping', 'whirling']) {
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

  // The brackets an operator leaves behind are taught as a peer notation
  // vocabulary, distinct from the operators that produce them: a paradox dex
  // and a cross-body delay step are separate components, and X-Dex is a
  // conditional scoring rider, never an operator.
  it('teaches the notation/ADD components as a peer vocabulary, not as operators', async () => {
    const res = await request(await createApp()).get('/freestyle/operators');
    expect(res.text).toContain('id="notation-components"');
    expect(res.text).toContain('[PDX]');
    expect(res.text).toContain('[XBD]');
    expect(res.text).toContain('[XDEX]');
    // Paradox is taught by comparison, not by leading with its notation formula.
    expect(res.text).toContain('Paradox Mirage');
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
    const res = await request(await createApp()).get('/freestyle/modifier/pixie');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Common tricks');
    // Common tricks come from the modifier links, lowest ADD first.
    expect(res.text).toContain('href="/freestyle/tricks/smear"');
    expect(res.text).toContain('href="/freestyle/tricks/dimwalk"');
    // Related modifiers are the pixie axis siblings.
    expect(res.text).toContain('href="/freestyle/modifier/fairy"');
    // Set modifier -> notation shown.
    expect(res.text).toContain('SAME IN [DEX]');
  });

  it('modifier with an authored teaching page still resolves to the rich page', async () => {
    const res = await request(await createApp()).get('/freestyle/modifier/spinning');
    expect(res.status).toBe(200);
    // The rich teaching page, not the stub.
    expect(res.text).toContain('The body and the motion');
  });

  it('an operator links back to its base atom (reverse of the atom->operator cross-link)', async () => {
    // Teaching page: spinning -> spin.
    const teaching = await request(await createApp()).get('/freestyle/modifier/spinning');
    expect(teaching.text).toContain('Base trick:');
    expect(teaching.text).toContain('href="/freestyle/tricks/spin"');
    // Stub page: whirling -> whirl (resolves via the operator reference).
    const stub = await request(await createApp()).get('/freestyle/modifier/whirling');
    expect(stub.status).toBe(200);
    expect(stub.text).toContain('href="/freestyle/tricks/whirl"');
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
