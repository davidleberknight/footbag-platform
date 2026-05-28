/**
 * Pre-Adrian polish slice 4 — ADD-flattening glossary note + eclipse
 * promotion (2026-05-25).
 *
 * Two concerns:
 *
 * 1. Glossary §8 (ADD Accounting) carries a new advanced-tier note
 *    explaining that historically-assigned ADD values can flatten
 *    execution-difficulty differences. The held-delay leg-over family
 *    (hop-over / walk-over / wrap) is the worked example.
 *
 * 2. Eclipse trick: curator-supplied operational notation
 *    (`SET > (jump) [BOD] > SAME or OP INSIDE [DEL] > OP OUT [DEX] > (land)`)
 *    applied via red_corrections + RESOLVED_FORMULAS overlay. Eclipse is
 *    now in FIRST_CLASS_TIER_2 so its browse card renders JOB + ADD.
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
import { RESOLVED_FORMULAS_SPRINT_1 } from '../../src/content/freestyleResolvedFormulas';

const { dbPath } = setTestEnv('3164');

let createApp: Awaited<ReturnType<typeof importApp>>;

beforeAll(async () => {
  const db = createTestDb(dbPath);
  // Eclipse with the corrected op_notation (post-loader-19 state).
  insertFreestyleTrick(db, {
    slug:                'eclipse',
    canonical_name:      'eclipse',
    adds:                '3',
    base_trick:          'eclipse',
    trick_family:        'eclipse',
    category:            'compound',
    review_status:       'expert_reviewed',
    is_active:           1,
    operational_notation: 'SET > (jump) [BOD] > SAME or OP INSIDE [DEL] > OP OUT [DEX] > (land)',
  });
  // Curator rulings 2026-05-25: sui-generis primitives + multi-bag boundary
  // object. Seed all three so the describe blocks below can assert against
  // them. (createTestDb may only be called once per file — schema would
  // re-create otherwise.)
  insertFreestyleTrick(db, {
    slug:                'double-knee',
    canonical_name:      'double-knee',
    adds:                '1',
    base_trick:          'double-knee',
    trick_family:        'double-knee',
    category:            'body',
    review_status:       'expert_reviewed',
    is_active:           1,
    operational_notation: 'double knee',
  });
  insertFreestyleTrick(db, {
    slug:                'peak-delay',
    canonical_name:      'peak delay',
    adds:                '1',
    base_trick:          'peak-delay',
    trick_family:        'peak-delay',
    category:            'surface',
    review_status:       'expert_reviewed',
    is_active:           1,
    operational_notation: '[set] > peak',
  });
  insertFreestyleTrick(db, {
    slug:                '2-bag-juggling',
    canonical_name:      '2-bag-juggling',
    adds:                '2',
    base_trick:          '2-bag-juggling',
    trick_family:        '2-bag-juggling',
    category:            'multi-bag',
    review_status:       'expert_reviewed',
    is_active:           1,
    operational_notation: 'TOE > TOE',
  });
  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('Glossary §8 — ADD-flattening note', () => {
  it('/freestyle/glossary renders the advanced-tier ADD-flattening note in the ADD Accounting section', async () => {
    const res = await request(await createApp()).get('/freestyle/glossary');
    expect(res.status).toBe(200);
    // The ADD Accounting section anchor must be present
    expect(res.text).toContain('id="section-add-accounting"');
    // The new advanced-tier summary phrase
    expect(res.text).toContain('ADD value can flatten execution difficulty');
  });

  it('the note cites hop-over / walk-over / wrap as the 2-ADD held-delay leg-over family example', async () => {
    const res = await request(await createApp()).get('/freestyle/glossary');
    expect(res.text).toMatch(/hop-over[\s\S]*walk-over[\s\S]*wrap/);
    // Allow whitespace (incl. newlines from HTML wrapping) between tokens
    expect(res.text).toMatch(/held-delay\s+leg-over chassis/);
  });

  it('the note preserves the doctrine framing (historical ADD stays canonical; structural / mechanical relationships discussed separately)', async () => {
    const res = await request(await createApp()).get('/freestyle/glossary');
    expect(res.text).toContain('preserves historical ADD doctrine');
    expect(res.text).toContain('structural and mechanical relationships');
  });
});

describe('Eclipse — curator-supplied operational notation', () => {
  it('RESOLVED_FORMULAS_SPRINT_1 carries an eclipse entry with the airborne-hop-over JOB', () => {
    const entry = RESOLVED_FORMULAS_SPRINT_1.find(e => e.slug === 'eclipse');
    expect(entry).toBeDefined();
    expect(entry?.totalAdd).toBe(3);
    expect(entry?.operationalNotation).toBe('SET > (jump) [BOD] > SAME or OP INSIDE [DEL] > OP OUT [DEX] > (land)');
    expect(entry?.provenance ?? '').toMatch(/airborne[\s\S]*hop-over topology/i);
    expect(entry?.derivation ?? '').toMatch(/bod\(1\)[^=]*\+[^=]*del\(1\)[^=]*\+[^=]*dex\(1\)[^=]*=[^=]*3 ADD/);
  });

  it('/freestyle/tricks/eclipse renders the curator-supplied op-notation tokens', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/eclipse');
    expect(res.status).toBe(200);
    // The Set notation section must be present
    expect(res.text).toContain('operational-notation-display');
    // Component flags render bracketed verbatim (`[BOD]`, `[DEL]`, `[DEX]`);
    // unknown / side / direction / pre_state tokens render bare.
    const tokens = ['SET', '[BOD]', 'SAME', 'OP', 'INSIDE', '[DEL]', 'OUT', '[DEX]'];
    for (const token of tokens) {
      const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const pattern = new RegExp(`class="op-token[^"]*"[^>]*>${escaped}<`);
      expect(res.text).toMatch(pattern);
    }
  });

  it('eclipse appears in the FIRST_CLASS_TIER_2 cohort (browse card renders JOB + ADD)', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks?view=dex-count');
    expect(res.status).toBe(200);
    // Locate the eclipse card
    const idx = res.text.indexOf('data-trick-slug="eclipse"');
    expect(idx).toBeGreaterThan(-1);
    const articleOpen  = res.text.lastIndexOf('<article', idx);
    const articleClose = res.text.indexOf('</article>', idx);
    const card = res.text.slice(articleOpen, articleClose + '</article>'.length);
    // First-class JOB + ADD row present; no "notation pending"
    expect(card).toContain('dict-card-first-class-row');
    expect(card).toContain('<span class="dict-card-first-class-label">JOB:</span>');
    expect(card).not.toContain('notation pending');
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Curator rulings 2026-05-25:
//   - double-knee: sui-generis 1 ADD body primitive; JOB = self-token
//     "double knee"; ADD = BOD(1).
//   - peak-delay: folk-name unusual-surface delay (peak = rim of ballcap);
//     JOB = "[set] > peak"; ADD = delay(1).
//   - multi-bag doctrine: "one additional ADD per simultaneously controlled
//     bag"; 2-bag-juggling = TOE > TOE, ADD = delay(2). Boundary-object
//     ontology; future dedicated multi-bag module pending.
// ─────────────────────────────────────────────────────────────────────────

describe('Curator rulings — double-knee + peak-delay + multi-bag doctrine', () => {
  it('double-knee renders the sui-generis self-token JOB "double knee" with 1 ADD', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/double-knee');
    expect(res.status).toBe(200);
    // Self-token JOB; renderer exempts from the tautological-JOB guard
    // per the SUI_GENERIS_SELF_TOKEN_SLUGS allowlist.
    expect(res.text).toMatch(/<span class="trick-hero-meta-chip trick-hero-meta-chip-adds">1 ADD<\/span>/);
    // The Set notation section renders the self-token op-notation
    expect(res.text).toContain('operational-notation-display');
  });

  it('peak-delay renders as 1-ADD folk-name surface delay (JOB "[set] > peak")', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/peak-delay');
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/<span class="trick-hero-meta-chip trick-hero-meta-chip-adds">1 ADD<\/span>/);
    // Set notation present
    expect(res.text).toContain('operational-notation-display');
  });

  it('2-bag-juggling renders as 2-ADD multi-bag boundary-object row', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/2-bag-juggling');
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/<span class="trick-hero-meta-chip trick-hero-meta-chip-adds">2 ADD<\/span>/);
  });
});

describe('Glossary §8 — multi-bag governing rule', () => {
  it('/freestyle/glossary renders the multi-bag boundary-doctrine note in the ADD Accounting section', async () => {
    const res = await request(await createApp()).get('/freestyle/glossary');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Multi-bag governing rule');
    expect(res.text).toContain('one additional ADD for each');
    // The illustrative examples (2-bag, 3-bag JOB forms)
    expect(res.text).toMatch(/TOE &gt; TOE/);
    // Boundary-object framing
    expect(res.text).toContain('boundary object');
  });

  it('the multi-bag note explicitly notes the single-bag dictionary axes do NOT classify multi-bag rows', async () => {
    const res = await request(await createApp()).get('/freestyle/glossary');
    expect(res.text).toMatch(/single-bag dictionary axes[\s\S]*do not classify multi-bag rows/);
  });
});
