/**
 * The structural panel on a trick page is curator material, not reader material.
 *
 * A trick-detail page carries a structural-decomposition panel reporting the
 * asserted ADD beside the editorial lineage. The lineage can disagree with the
 * published value while the row is entirely correct, because curation of base
 * tricks and modifier links is incomplete, and a reader has no way to tell a
 * curation gap from a miscount.
 *
 * So the panel is shaped for a maintainer and absent for everyone else. Absent
 * from the response, not merely unpainted: a reader, a crawler and a page-source
 * reader all get the settled editorial page. The maintainer still gets the
 * diagnostic, because the diagnosis is what a curator is reading the page for.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { cachedGet } from '../fixtures/cachedGet';
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
const page = cachedGet(() => createApp());
let db: BetterSqlite3.Database;

const ADMIN_ID  = 'aaaaaaaa-0000-0000-0000-00000000diag';
const MEMBER_ID = 'bbbbbbbb-0000-0000-0000-00000000diag';

function cookieFor(memberId: string, role: 'admin' | 'member'): string {
  return `__Host-footbag_session=${createTestSessionJwt({ memberId, role })}`;
}

// Every phrase the panel can put on the page. A reader must see none of them;
// the maintainer view is asserted separately below.
const DIAGNOSTIC_PHRASES = [
  'Structural decomposition',
  'Asserted ADD',
  'Editorial decomposition',
  'broken upstream link',
  'modifier coverage absent',
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

  // A row whose base the dictionary lacks, so the panel reports a broken link and
  // no modifier coverage: the case a reader can least interpret.
  insertFreestyleTrick(db, {
    slug: 'diag_disagreeing_trick', canonical_name: 'diag disagreeing trick',
    adds: '8', base_trick: 'swirl', trick_family: 'swirl', category: 'compound',
    description: 'A compound whose editorial lineage is incomplete.',
    operational_notation: 'CLIP > OP IN [DEX] > SAME CLIP [DEL]',
    review_status: 'expert_reviewed', is_active: 1,
  });
  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('GET /freestyle/tricks/:slug — structural panel visibility', () => {
  it('shows a signed-out reader none of the diagnostic material', async () => {
    const res = await page('/freestyle/tricks/diag_disagreeing_trick');

    expect(res.status).toBe(200);
    for (const phrase of DIAGNOSTIC_PHRASES) {
      expect(res.text, `signed-out page carries "${phrase}"`).not.toContain(phrase);
    }
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
    const res = await page('/freestyle/tricks/diag_disagreeing_trick');

    // The published value and the prose stay: removing the diagnostic must not
    // remove the page's own account of the trick.
    expect(res.text).toContain('Diag Disagreeing Trick');
    expect(res.text).toContain('A compound whose editorial lineage is incomplete.');
    expect(res.text).toContain('8 ADD');
  });

  it('gives a maintainer the diagnostic, so the capability is gated and not deleted', async () => {
    const res = await request(await createApp())
      .get('/freestyle/tricks/diag_disagreeing_trick')
      .set('Cookie', cookieFor(ADMIN_ID, 'admin'));

    expect(res.status).toBe(200);
    expect(res.text).toContain('Structural decomposition');
    expect(res.text).toContain('Editorial decomposition');
    expect(res.text).toContain('broken upstream link');
    expect(res.text).toContain('modifier coverage absent');
  });
});
