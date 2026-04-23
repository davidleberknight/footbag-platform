/**
 * Integration tests for the reason-aware `GET /history/claim` render.
 *
 * Covers the five tier3 message branches plus the 'none' baseline:
 *   ambiguous_email_anchor
 *   multiple_name_candidates
 *   no_name_candidate
 *   hp_mismatch
 *   no_hp_for_legacy_account
 *   (no legacy anchor → plain form, no message, no candidates)
 *
 * Also confirms: identifier input prefill, auth gate, candidate list
 * appears for name-driven reasons only, and no DB rows are mutated by
 * any of these render paths.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import BetterSqlite3 from 'better-sqlite3';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import {
  insertMember,
  insertHistoricalPerson,
  insertLegacyMember,
  createTestSessionJwt,
} from '../fixtures/factories';

const { dbPath } = setTestEnv('3103');

let createApp: Awaited<ReturnType<typeof importApp>>;

// tier3 / multiple_name_candidates: email anchor + HP provenance + two HPs share the name.
const MEM_MULTI  = 'cf-mem-multi';
const HP_MULTI_A = 'cf-hp-multi-a';
const HP_MULTI_B = 'cf-hp-multi-b';

// tier3 / no_name_candidate: anchor + provenance, but real_name matches no HP.
const MEM_NONAME = 'cf-mem-noname';

// tier3 / hp_mismatch: anchor → HP A, real_name → HP B.
const MEM_HP_MISMATCH = 'cf-mem-hpmismatch';
const HP_ACTUAL       = 'cf-hp-actual';
const HP_DECOY        = 'cf-hp-decoy';

// tier3 / no_hp_for_legacy_account: email anchor exists, no HP provenance.
const MEM_NO_HP = 'cf-mem-no-hp';

// tier3 / ambiguous_email_anchor: cross-column collision in legacy_members.
const MEM_AMBIG       = 'cf-mem-ambig';
const AMBIG_STR       = 'cf-ambig@example.com';
const LM_AMBIG_A      = 'cf-lm-ambig-a';
const LM_AMBIG_B      = 'cf-lm-ambig-b';

// 'none' baseline: member with no legacy match anywhere.
const MEM_PLAIN = 'cf-mem-plain';

beforeAll(async () => {
  const db = createTestDb(dbPath);

  // multiple_name_candidates
  insertLegacyMember(db, { legacy_member_id: 'cf-lm-multi', legacy_email: 'cf-multi@example.com' });
  insertHistoricalPerson(db, {
    person_id: HP_MULTI_A, person_name: 'Pat Common',
    legacy_member_id: 'cf-lm-multi',
  });
  insertHistoricalPerson(db, { person_id: HP_MULTI_B, person_name: 'Pat Common' });
  insertMember(db, {
    id: MEM_MULTI, slug: 'cf_mem_multi',
    login_email: 'cf-multi@example.com', real_name: 'Pat Common',
  });

  // no_name_candidate
  insertLegacyMember(db, { legacy_member_id: 'cf-lm-noname', legacy_email: 'cf-noname@example.com' });
  insertHistoricalPerson(db, {
    person_id: 'cf-hp-noname', person_name: 'Provenance Target',
    legacy_member_id: 'cf-lm-noname',
  });
  insertMember(db, {
    id: MEM_NONAME, slug: 'cf_mem_noname',
    login_email: 'cf-noname@example.com', real_name: 'Totally Unrelated Name',
  });

  // hp_mismatch
  insertLegacyMember(db, { legacy_member_id: 'cf-lm-hpmismatch', legacy_email: 'cf-hpmismatch@example.com' });
  insertHistoricalPerson(db, {
    person_id: HP_ACTUAL, person_name: 'Correct Owner',
    legacy_member_id: 'cf-lm-hpmismatch',
  });
  insertHistoricalPerson(db, { person_id: HP_DECOY, person_name: 'Decoy Claimer' });
  insertMember(db, {
    id: MEM_HP_MISMATCH, slug: 'cf_mem_hpmismatch',
    login_email: 'cf-hpmismatch@example.com', real_name: 'Decoy Claimer',
  });

  // no_hp_for_legacy_account
  insertLegacyMember(db, { legacy_member_id: 'cf-lm-nohp', legacy_email: 'cf-nohp@example.com' });
  insertMember(db, {
    id: MEM_NO_HP, slug: 'cf_mem_no_hp',
    login_email: 'cf-nohp@example.com', real_name: 'Orphan Member',
  });

  // ambiguous_email_anchor (cross-column collision)
  insertLegacyMember(db, { legacy_member_id: LM_AMBIG_A, legacy_email: AMBIG_STR });
  insertLegacyMember(db, { legacy_member_id: LM_AMBIG_B, legacy_user_id: AMBIG_STR });
  insertMember(db, {
    id: MEM_AMBIG, slug: 'cf_mem_ambig',
    login_email: AMBIG_STR, real_name: 'Ambig Target',
  });

  // 'none'
  insertMember(db, {
    id: MEM_PLAIN, slug: 'cf_mem_plain',
    login_email: 'cf-plain@example.com', real_name: 'Nobody Matches',
  });

  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

function cookieFor(memberId: string): string {
  return `footbag_session=${createTestSessionJwt({ memberId })}`;
}

async function getClaim(memberId: string) {
  return request(createApp())
    .get('/history/claim')
    .set('Cookie', cookieFor(memberId));
}

describe('GET /history/claim — prefill', () => {
  it('prefills the identifier input with real_name', async () => {
    const res = await getClaim(MEM_PLAIN);
    expect(res.status).toBe(200);
    expect(res.text).toContain('value="Nobody Matches"');
  });

  it('escapes special characters in real_name (safe attribute prefill)', async () => {
    // Create on the fly: member with HTML-ish characters in real_name.
    const db = new BetterSqlite3(dbPath);
    try {
      insertMember(db, {
        id: 'cf-mem-escape', slug: 'cf_mem_escape',
        login_email: 'cf-escape@example.com',
        real_name: '<script>O\'Neil</script>',
      });
    } finally {
      db.close();
    }
    const res = await getClaim('cf-mem-escape');
    // Handlebars default escaping: raw <script> tags must NOT appear as active markup.
    expect(res.text).not.toContain('<script>O');
    // The attribute value should contain the HTML-entity-encoded form.
    expect(res.text).toMatch(/value="&lt;script&gt;/);
  });
});

describe('GET /history/claim — tier3 reason messages', () => {
  it('ambiguous_email_anchor: prompts for username or member ID', async () => {
    const res = await getClaim(MEM_AMBIG);
    expect(res.status).toBe(200);
    expect(res.text).toContain('matches multiple legacy accounts');
    expect(res.text).toContain('legacy username or member ID');
    // No candidate list for this reason — it's not name-driven.
    expect(res.text).not.toContain('Possible matches for your name');
  });

  it('multiple_name_candidates: shows message + selectable candidate list', async () => {
    const res = await getClaim(MEM_MULTI);
    expect(res.status).toBe(200);
    expect(res.text).toContain('multiple possible matches for your name');
    expect(res.text).toContain('Possible matches for your name:');
    expect(res.text).toContain(`href="/history/${HP_MULTI_A}/claim"`);
    expect(res.text).toContain(`href="/history/${HP_MULTI_B}/claim"`);
  });

  it('no_name_candidate: shows message, no candidate list', async () => {
    const res = await getClaim(MEM_NONAME);
    expect(res.status).toBe(200);
    expect(res.text).toContain('find a matching profile automatically');
    expect(res.text).not.toContain('Possible matches for your name');
  });

  it('hp_mismatch: shows message + the decoy HP as a candidate', async () => {
    const res = await getClaim(MEM_HP_MISMATCH);
    expect(res.status).toBe(200);
    expect(res.text).toContain('similar name');
    expect(res.text).toContain('Possible matches for your name:');
    expect(res.text).toContain(`href="/history/${HP_DECOY}/claim"`);
  });

  it('no_hp_for_legacy_account: shows message, no candidate list (not name-driven)', async () => {
    const res = await getClaim(MEM_NO_HP);
    expect(res.status).toBe(200);
    expect(res.text).toContain('yet linked to a competition profile');
    expect(res.text).not.toContain('Possible matches for your name');
  });
});

describe('GET /history/claim — baseline + auth gate', () => {
  it("tier 'none' member sees plain form, no tier3 message", async () => {
    const res = await getClaim(MEM_PLAIN);
    expect(res.status).toBe(200);
    expect(res.text).not.toContain('multiple possible matches');
    expect(res.text).not.toContain('find a matching profile automatically');
    expect(res.text).not.toContain('similar name');
    expect(res.text).not.toContain('matches multiple legacy accounts');
    expect(res.text).not.toContain('yet linked to a competition profile');
  });

  it('unauthenticated request still redirects to /login', async () => {
    const res = await request(createApp()).get('/history/claim');
    expect(res.status).toBe(302);
    expect(res.headers.location).toMatch(/^\/login(\?.*)?$/);
  });
});

describe('GET /history/claim — no-write invariant', () => {
  it('never mutates members or legacy_members when rendering any branch', async () => {
    const countsBefore = (() => {
      const r = new BetterSqlite3(dbPath, { readonly: true });
      const c = {
        members:   (r.prepare('SELECT COUNT(*) AS n FROM members').get() as { n: number }).n,
        legacy:    (r.prepare('SELECT COUNT(*) AS n FROM legacy_members').get() as { n: number }).n,
        claimedLm: (r.prepare(
          "SELECT COUNT(*) AS n FROM legacy_members WHERE claimed_by_member_id IS NOT NULL",
        ).get() as { n: number }).n,
        linkedM:   (r.prepare(
          'SELECT COUNT(*) AS n FROM members WHERE legacy_member_id IS NOT NULL',
        ).get() as { n: number }).n,
      };
      r.close();
      return c;
    })();

    for (const id of [
      MEM_MULTI, MEM_NONAME, MEM_HP_MISMATCH, MEM_NO_HP, MEM_AMBIG, MEM_PLAIN,
    ]) {
      await getClaim(id);
    }

    const countsAfter = (() => {
      const r = new BetterSqlite3(dbPath, { readonly: true });
      const c = {
        members:   (r.prepare('SELECT COUNT(*) AS n FROM members').get() as { n: number }).n,
        legacy:    (r.prepare('SELECT COUNT(*) AS n FROM legacy_members').get() as { n: number }).n,
        claimedLm: (r.prepare(
          "SELECT COUNT(*) AS n FROM legacy_members WHERE claimed_by_member_id IS NOT NULL",
        ).get() as { n: number }).n,
        linkedM:   (r.prepare(
          'SELECT COUNT(*) AS n FROM members WHERE legacy_member_id IS NOT NULL',
        ).get() as { n: number }).n,
      };
      r.close();
      return c;
    })();

    expect(countsAfter).toEqual(countsBefore);
  });
});
