/**
 * The parser diagnostic on a trick page is curator material, not reader material.
 *
 * A trick-detail page carries a structural-decomposition panel reporting the
 * parser's status, its computed ADD beside the asserted one, per-token roles,
 * unresolved tokens, and the editorial lineage. Any of those can disagree with
 * the published value while the row is entirely correct, because the parser's
 * declared coverage is narrower than the dictionary, and a reader has no way to
 * tell a coverage gap from a miscount.
 *
 * So the panel is shaped for a maintainer and absent for everyone else. Absent
 * from the response, not merely unpainted: a reader, a crawler and a page-source
 * reader all get the settled editorial page. The maintainer still gets the
 * diagnostic, because the diagnosis is what a curator is reading the page for.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import BetterSqlite3 from 'better-sqlite3';

import {
  setTestEnv,
  createTestDb,
  cleanupTestDb,
  importApp,
} from '../fixtures/testDb';
import {
  insertFreestyleTrick,
  insertMember,
  createTestSessionJwt,
} from '../fixtures/factories';

const { dbPath } = setTestEnv('4134');

let createApp: Awaited<ReturnType<typeof importApp>>;
let db: BetterSqlite3.Database;

const ADMIN_ID  = 'aaaaaaaa-0000-0000-0000-00000000diag';
const MEMBER_ID = 'bbbbbbbb-0000-0000-0000-00000000diag';

function cookieFor(memberId: string, role: 'admin' | 'member'): string {
  return `__Host-footbag_session=${createTestSessionJwt({ memberId, role })}`;
}

// Every phrase the diagnostic panel can put on the page. A reader must see none
// of them; the maintainer view is asserted separately below.
const DIAGNOSTIC_PHRASES = [
  'Parser diagnostic',
  'Structural decomposition',
  'self-atom',
  'Unresolved tokens',
  'disagrees with asserted',
  'Descriptive roles',
  'ADD-contributing roles',
  'Editorial decomposition',
];

beforeAll(async () => {
  db = createTestDb(dbPath);
  insertMember(db, {
    id: ADMIN_ID, slug: 'diag_admin', display_name: 'Diag Admin',
    login_email: 'diag-admin@example.com', is_admin: 1,
  });
  insertMember(db, {
    id: MEMBER_ID, slug: 'diag_member', display_name: 'Diag Member',
    login_email: 'diag-member@example.com',
  });

  // A row whose parse disagrees with its asserted value, which is the case the
  // panel renders most loudly and the one a reader can least interpret.
  insertFreestyleTrick(db, {
    slug: 'diag_disagreeing_trick', canonical_name: 'diag disagreeing trick',
    adds: '8', base_trick: 'swirl', trick_family: 'swirl', category: 'compound',
    description: 'A compound whose parser derivation lands one under its asserted value.',
    operational_notation: 'CLIP > OP IN [DEX] > SAME CLIP [DEL]',
    review_status: 'expert_reviewed', is_active: 1,
    // Same shape the notation parser writes: role buckets keyed by role name,
    // each holding the tokens it saw at that position.
    structural_parse_json: JSON.stringify({
      descriptive_roles: {
        core_family: [{ token: 'diag', span_start: 0, span_end: 4 }],
        unresolved_tokens: [{ token: 'disagreeing', span_start: 5, span_end: 16 }],
      },
      add_contributing_roles: {
        core_family: [{ token: 'diag', span_start: 0, span_end: 4 }],
      },
      policy_tokens: [], additive_flags: [],
      parse_warnings: ['approximate_add_formula:computed=7,asserted=8'],
      parser_version: 'test', parse_source: 'test',
      raw_token_count: 2, resolved_token_count: 1,
    }),
    computed_adds: 7,
    computed_add_formula: 'diag(7) = 7',
    add_formula_status: 'approximate',
  });
  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('GET /freestyle/tricks/:slug — parser diagnostic visibility', () => {
  it('shows a signed-out reader none of the diagnostic material', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/diag_disagreeing_trick');

    expect(res.status).toBe(200);
    for (const phrase of DIAGNOSTIC_PHRASES) {
      expect(res.text, `signed-out page carries "${phrase}"`).not.toContain(phrase);
    }
  });

  it('does not leak the computed value or the asserted-vs-computed disagreement', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/diag_disagreeing_trick');

    // The derivation without its escaping, so the assertion holds however the
    // template renders the equals sign.
    expect(res.text).not.toContain('diag(7)');
    expect(res.text).not.toContain('asserted value is editorial truth');
    expect(res.text).not.toContain('modifier coverage absent');
  });

  it('shows a signed-in ordinary member none of it either', async () => {
    const res = await request(await createApp())
      .get('/freestyle/tricks/diag_disagreeing_trick')
      .set('Cookie', cookieFor(MEMBER_ID, 'member'));

    expect(res.status).toBe(200);
    for (const phrase of DIAGNOSTIC_PHRASES) {
      expect(res.text, `member page carries "${phrase}"`).not.toContain(phrase);
    }
  });

  it('still renders the settled editorial page to a reader', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/diag_disagreeing_trick');

    // The published value and the prose stay: removing the diagnostic must not
    // remove the page's own account of the trick.
    expect(res.text).toContain('Diag Disagreeing Trick');
    expect(res.text).toContain('A compound whose parser derivation lands one under its asserted value.');
    expect(res.text).toContain('8 ADD');
  });

  it('gives a maintainer the diagnostic, so the capability is gated and not deleted', async () => {
    const res = await request(await createApp())
      .get('/freestyle/tricks/diag_disagreeing_trick')
      .set('Cookie', cookieFor(ADMIN_ID, 'admin'));

    expect(res.status).toBe(200);
    expect(res.text).toContain('Parser diagnostic');
    expect(res.text).toContain('Descriptive roles');
    expect(res.text).toContain('diag(7)');
    expect(res.text).toContain('disagrees with asserted');
    expect(res.text).toContain('Unresolved tokens');
  });
});
