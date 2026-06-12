/**
 * Integration tests for the Operators & Modifiers consistency layer.
 *
 * Verifies:
 *   - /freestyle/operators renders the compact index grouped by the four
 *     movement-system axes, in the dict-trick-row idiom shared with the
 *     dictionary and set encyclopedia.
 *   - Each modifier row carries a type chip, an ADD weight when tracked, a
 *     status pill, and View-details / Browse-tricks click-throughs.
 *   - Notation appears only for set-structured modifiers (canonical-set
 *     formula); body modifiers never carry a fabricated notation line.
 *   - Status pills reflect the data: a modifier with a teaching page reads
 *     "Teaching page", a tracked one reads "Platform-tracked".
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

  // Modifier inventory: a set modifier (canonical-set formula), a rotational
  // set modifier (split ADD), and a body modifier (no notation).
  insertFreestyleTrickModifier(db, { slug: 'pixie',   modifier_name: 'Pixie',   add_bonus: 1, add_bonus_rotational: 1, modifier_type: 'set' });
  insertFreestyleTrickModifier(db, { slug: 'atomic',  modifier_name: 'Atomic',  add_bonus: 1, add_bonus_rotational: 2, modifier_type: 'set' });
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
  it('renders the four movement-system axes as grouped sections', async () => {
    const res = await request(await createApp()).get('/freestyle/operators');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Set / Uptime Systems');
    expect(res.text).toContain('Entry Topologies');
    expect(res.text).toContain('Midtime Body Modifiers');
    expect(res.text).toContain('No-Plant &amp; Suspension');
    // Reuses the trick-dictionary row idiom.
    expect(res.text).toContain('dict-trick-row-stack');
    expect(res.text).toContain('class="dict-trick-row"');
  });

  it('gives every curated modifier a row with click-throughs', async () => {
    const res = await request(await createApp()).get('/freestyle/operators');
    for (const slug of ['pixie', 'atomic', 'paradox', 'spinning', 'symposium', 'whirling']) {
      expect(res.text, `row ${slug}`).toContain(`id="operator-${slug}"`);
    }
    expect(res.text).toContain('href="/freestyle/modifier/pixie"');
    expect(res.text).toContain('href="/freestyle/tricks?view=movement-system#movement-pixie"');
  });

  it('shows the ADD weight from the table (split weight for rotational)', async () => {
    const res = await request(await createApp()).get('/freestyle/operators');
    expect(rowSlice(res.text, 'paradox')).toContain('+1');
    expect(rowSlice(res.text, 'atomic')).toContain('+1 / +2 rot');
  });

  it('shows notation only for set modifiers, never for body modifiers', async () => {
    const res = await request(await createApp()).get('/freestyle/operators');
    // pixie is a canonical set -> SET notation line present.
    const pixie = rowSlice(res.text, 'pixie');
    expect(pixie).toContain('dict-trick-row-notation');
    expect(pixie).toContain('SAME IN [DEX]');
    // paradox is a body modifier -> no notation line.
    expect(rowSlice(res.text, 'paradox')).not.toContain('dict-trick-row-notation');
  });

  it('uses honest status pills from the data', async () => {
    const res = await request(await createApp()).get('/freestyle/operators');
    // paradox + spinning have authored teaching pages.
    expect(rowSlice(res.text, 'paradox')).toContain('operator-status-pill--teaching');
    expect(rowSlice(res.text, 'spinning')).toContain('operator-status-pill--teaching');
    // pixie is tracked but has no teaching page.
    expect(rowSlice(res.text, 'pixie')).toContain('operator-status-pill--platform-tracked');
  });

  it('retains the advanced decomposition reference below the index', async () => {
    const res = await request(await createApp()).get('/freestyle/operators');
    expect(res.text).toContain('id="advanced-decomposition-operator-theory"');
    expect(res.text).toContain('id="execution-mechanics"');
  });

  it('sub-labels the spin and head-movement families within the body axis', async () => {
    const res = await request(await createApp()).get('/freestyle/operators');
    expect(res.text).toContain('>Spin family<');
    expect(res.text).toContain('>Head-movement family<');
    // The sub-label sits before its first member.
    expect(res.text).toMatch(/>Spin family<[\s\S]*?id="operator-spinning"/);
    expect(res.text).toMatch(/>Head-movement family<[\s\S]*?id="operator-ducking"/);
  });

  it('folds furious into barraging (no separate furious index row)', async () => {
    const res = await request(await createApp()).get('/freestyle/operators');
    expect(res.text).toContain('id="operator-barraging"');
    expect(res.text).not.toContain('id="operator-furious"');
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

  it('unknown modifier slug returns 404', async () => {
    const res = await request(await createApp()).get('/freestyle/modifier/not-a-real-modifier');
    expect(res.status).toBe(404);
  });
});
