/**
 * Authoring a movement notation onto a ruling, and what the save refuses.
 *
 * The draft stage writes a movement and says where it came from and what was done
 * to produce it. It creates no canonical trick: the ruling keeps every fact it
 * had, gains a notation, and leaves the backlog for the drafts list, which is the
 * only reason a saved draft stays findable at all.
 *
 * Validation here is about the shape of the record, not about publishability. The
 * scoring-bracket count is shown as information rather than checked, because the
 * difficulty it would have to match is asserted when the canonical trick is
 * created and does not exist yet. What is checked: the notation is present, both
 * provenance questions are answered from the offered vocabularies, and a
 * convention is named by a derivation and by nothing else.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from '../fixtures/supertestWithOrigin';
import BetterSqlite3 from 'better-sqlite3';

import {
  setTestEnv,
  createTestDb,
  cleanupTestDb,
  importApp,
} from '../fixtures/testDb';
import {
  insertFreestyleEvAdjudication,
  insertMember,
  createTestSessionJwt,
} from '../fixtures/factories';

const { dbPath } = setTestEnv('4138');

let createApp: Awaited<ReturnType<typeof importApp>>;
let db: BetterSqlite3.Database;

const ADMIN_ID  = 'aaaaaaaa-0000-0000-0000-0000000auth1';
const MEMBER_ID = 'bbbbbbbb-0000-0000-0000-0000000auth1';

const NOTATION = 'CLIP > OP IN [DEX] > OP OUT [DEX] > SAME CLIP [XBD] [DEL]';

function cookieFor(memberId: string, role: 'admin' | 'member'): string {
  return `__Host-footbag_session=${createTestSessionJwt({ memberId, role })}`;
}
const admin = () => cookieFor(ADMIN_ID, 'admin');

async function get(path: string, cookie?: string) {
  const req = request(await createApp()).get(path);
  if (cookie) req.set('Cookie', cookie);
  return req;
}

async function post(path: string, form: Record<string, string>, cookie = admin()) {
  return request(await createApp()).post(path).set('Cookie', cookie).type('form').send(form);
}

function validForm(overrides: Record<string, string> = {}): Record<string, string> {
  return {
    notation:         NOTATION,
    evidenceBasis:    'source-notation',
    derivationMethod: 'transcription',
    conventionId:     '',
    provenanceNote:   'Copied from the source in its own register.',
    ...overrides,
  };
}

function ruling(candidateId: string) {
  return db.prepare(
    `SELECT authored_notation, notation_evidence_basis, notation_derivation_method,
            notation_convention_id, notation_provenance_note, notation_authored_by,
            notation_authored_at, version, ev_state, final_disposition, blocker_id
       FROM freestyle_ev_adjudications WHERE candidate_id = ?`,
  ).get(candidateId) as {
    authored_notation: string | null; notation_evidence_basis: string | null;
    notation_derivation_method: string | null; notation_convention_id: string | null;
    notation_provenance_note: string | null; notation_authored_by: string | null;
    notation_authored_at: string | null; version: number; ev_state: string;
    final_disposition: string; blocker_id: string;
  };
}

function auditRows(candidateId: string) {
  // The audit key is an opaque id, so ordering is by when the entry happened and
  // by insertion order within the same instant.
  return db.prepare(
    `SELECT metadata_json FROM audit_entries
      WHERE entity_id = ? AND action_type = 'freestyle.adjudication_notation.authored'
      ORDER BY occurred_at ASC, rowid ASC`,
  ).all(candidateId) as { metadata_json: string }[];
}

function trickCount(): number {
  return (db.prepare('SELECT COUNT(*) AS n FROM freestyle_tricks').get() as { n: number }).n;
}

const CANDIDATES = ['ev-author-1', 'ev-author-2', 'ev-author-3', 'ev-author-4', 'ev-author-5'];

beforeAll(async () => {
  db = createTestDb(dbPath);
  insertMember(db, {
    id: ADMIN_ID, slug: 'author_admin', display_name: 'Author Admin',
    login_email: 'author-admin@example.com', is_admin: 1,
  });
  insertMember(db, {
    id: MEMBER_ID, slug: 'author_member', display_name: 'Author Member',
    login_email: 'author-member@example.com',
  });

  CANDIDATES.forEach((id, i) => {
    insertFreestyleEvAdjudication(db, {
      candidate_id: id,
      submitted_name: `Backlog Name ${i + 1}`,
      normalized_name: `backlogname${i + 1}`,
      ev_state: 'parser', final_disposition: 'C',
      evidence_state: 'compositional-name-only',
      blocker_id: 'D7', blocker_subtype: 'settled-modifier-on-published-terminal',
      owner: 'james', source: 'SG', confidence: 'high',
      proposed_formula: 'pixie(+1) + whirl(3) = 4',
    });
  });

  createApp = await importApp();
});

afterAll(() => {
  db.close();
  cleanupTestDb(dbPath);
});

describe('the authoring form', () => {
  it('is admin-only', async () => {
    expect((await get(`/admin/freestyle/notation-backlog/${CANDIDATES[0]}/author`)).status).toBe(302);
    expect((await get(`/admin/freestyle/notation-backlog/${CANDIDATES[0]}/author`, cookieFor(MEMBER_ID, 'member'))).status).toBe(403);
  });

  it('404s for a ruling that does not exist', async () => {
    const res = await get('/admin/freestyle/notation-backlog/ev-nope/author', admin());
    expect(res.status).toBe(404);
  });

  it('shows what the ruling already settled, so the curator restates nothing', async () => {
    const res = await get(`/admin/freestyle/notation-backlog/${CANDIDATES[0]}/author`, admin());
    expect(res.status).toBe(200);
    expect(res.text).toContain('Backlog Name 1');
    expect(res.text).toContain('Name only, composition understood');
    expect(res.text).toContain('Confirm a familiar modifier added to an existing trick');
    expect(res.text).toContain('pixie(+1) + whirl(3)');
    expect(res.text).toContain('Not yet created');
  });

  it('asks the two provenance questions in plain words, not in class names', async () => {
    const res = await get(`/admin/freestyle/notation-backlog/${CANDIDATES[0]}/author`, admin());
    expect(res.text).toContain('Where did the notation come from?');
    expect(res.text).toContain('How was it produced?');
    expect(res.text).toContain('The source wrote it this way');
    expect(res.text).toContain('Derived under a ratified convention');
    // The stored vocabulary is carried as option values, never as the label.
    expect(res.text).toContain('value="source-notation"');
    expect(res.text).not.toContain('>source-notation<');
  });

  it('offers conventions from the registry rather than a free-text box', async () => {
    const res = await get(`/admin/freestyle/notation-backlog/${CANDIDATES[0]}/author`, admin());
    expect(res.text).toContain('Swirl-chain terminal replacement');
    expect(res.text).toContain('value="swirl-chain-terminal-replacement"');
    expect(res.text).not.toContain('name="conventionId" type="text"');
  });
});

describe('saving a draft', () => {
  it('writes the notation and both provenance claims, and stamps the author', async () => {
    const res = await post(`/admin/freestyle/notation-backlog/${CANDIDATES[0]}/author`, validForm());
    expect(res.status).toBe(303);

    const row = ruling(CANDIDATES[0]);
    expect(row.authored_notation).toBe(NOTATION);
    expect(row.notation_evidence_basis).toBe('source-notation');
    expect(row.notation_derivation_method).toBe('transcription');
    expect(row.notation_convention_id).toBeNull();
    expect(row.notation_provenance_note).toBe('Copied from the source in its own register.');
    expect(row.notation_authored_by).toBe(ADMIN_ID);
    expect(row.notation_authored_at).toMatch(/^\d{4}-\d{2}-\d{2}T.*Z$/);
  });

  it('leaves the ruling itself alone: authoring a movement is not re-ruling a name', async () => {
    const row = ruling(CANDIDATES[0]);
    expect(row.ev_state).toBe('parser');
    expect(row.final_disposition).toBe('C');
    expect(row.blocker_id).toBe('D7');
  });

  it('creates no canonical trick', async () => {
    expect(trickCount()).toBe(0);
  });

  it('records the authoring with what it replaced, which is nothing the first time', async () => {
    const entries = auditRows(CANDIDATES[0]);
    expect(entries).toHaveLength(1);
    const meta = JSON.parse(entries[0].metadata_json);
    expect(meta.notation).toBe(NOTATION);
    expect(meta.evidenceBasis).toBe('source-notation');
    expect(meta.scoringBrackets).toBe(4);
    expect(meta.previousNotation).toBeNull();
    expect(meta.previousEvidenceBasis).toBeNull();
  });

  it('takes the name off the backlog and puts it on the drafts list', async () => {
    const backlog = await get('/admin/freestyle/notation-backlog', admin());
    expect(backlog.text).not.toContain('Backlog Name 1');

    const drafts = await get('/admin/freestyle/notation-drafts', admin());
    expect(drafts.status).toBe(200);
    expect(drafts.text).toContain('Backlog Name 1');
    expect(drafts.text).toContain('The source wrote it this way');
    expect(drafts.text).toContain('4 scoring brackets');
  });

  it('shows the bracket count as information, not as a verdict', async () => {
    const res = await get(`/admin/freestyle/notation-backlog/${CANDIDATES[0]}/author`, admin());
    expect(res.text).toContain('This notation carries 4 scoring brackets.');
    expect(res.text).toContain('set when the trick is published');
  });
});

describe('rewriting a draft', () => {
  it('records what it replaced', async () => {
    await post(`/admin/freestyle/notation-backlog/${CANDIDATES[1]}/author`, validForm());
    await post(`/admin/freestyle/notation-backlog/${CANDIDATES[1]}/author`, validForm({
      notation: 'TOE > SAME OUT [DEX] > SAME TOE [DEL]',
      evidenceBasis: 'footage',
      derivationMethod: 'reconstruction',
    }));

    const entries = auditRows(CANDIDATES[1]);
    expect(entries).toHaveLength(2);
    const second = JSON.parse(entries[1].metadata_json);
    expect(second.notation).toBe('TOE > SAME OUT [DEX] > SAME TOE [DEL]');
    expect(second.previousNotation).toBe(NOTATION);
    expect(second.previousEvidenceBasis).toBe('source-notation');
    expect(second.previousDerivationMethod).toBe('transcription');
  });

  it('advances the row version so the record counts its own edits', async () => {
    expect(ruling(CANDIDATES[1]).version).toBe(3); // seeded at 1, two saves
  });
});

describe('a derivation and its convention', () => {
  it('saves a derivation with the convention it was made under', async () => {
    const res = await post(`/admin/freestyle/notation-backlog/${CANDIDATES[2]}/author`, validForm({
      evidenceBasis: 'platform-structure',
      derivationMethod: 'convention-derivation',
      conventionId: 'swirl-chain-terminal-replacement',
    }));
    expect(res.status).toBe(303);
    expect(ruling(CANDIDATES[2]).notation_convention_id).toBe('swirl-chain-terminal-replacement');
  });

  it('refuses a derivation that names no convention', async () => {
    const res = await post(`/admin/freestyle/notation-backlog/${CANDIDATES[3]}/author`, validForm({
      evidenceBasis: 'platform-structure',
      derivationMethod: 'convention-derivation',
    }));
    expect(res.status).toBe(422);
    expect(res.text).toContain('Name the convention this was derived under.');
    expect(ruling(CANDIDATES[3]).authored_notation).toBeNull();
  });

  it('refuses a convention nobody ratified', async () => {
    const res = await post(`/admin/freestyle/notation-backlog/${CANDIDATES[3]}/author`, validForm({
      evidenceBasis: 'platform-structure',
      derivationMethod: 'convention-derivation',
      conventionId: 'a-rule-i-just-made-up',
    }));
    expect(res.status).toBe(422);
    expect(res.text).toContain('Choose a ratified convention from the list.');
    expect(ruling(CANDIDATES[3]).authored_notation).toBeNull();
  });

  it('refuses a convention on a method that is not a derivation', async () => {
    const res = await post(`/admin/freestyle/notation-backlog/${CANDIDATES[3]}/author`, validForm({
      conventionId: 'swirl-chain-terminal-replacement',
    }));
    expect(res.status).toBe(422);
    expect(res.text).toContain('A convention belongs only to a derivation.');
  });
});

describe('what else the save refuses', () => {
  it('refuses an empty notation', async () => {
    const res = await post(`/admin/freestyle/notation-backlog/${CANDIDATES[3]}/author`, validForm({ notation: '   ' }));
    expect(res.status).toBe(422);
    expect(res.text).toContain('A movement notation is required.');
  });

  it('refuses a notation with no answer to where it came from', async () => {
    const res = await post(`/admin/freestyle/notation-backlog/${CANDIDATES[3]}/author`, validForm({ evidenceBasis: '' }));
    expect(res.status).toBe(422);
    expect(res.text).toContain('Say where the notation came from.');
  });

  it('refuses a value outside the offered vocabulary', async () => {
    const res = await post(`/admin/freestyle/notation-backlog/${CANDIDATES[3]}/author`, validForm({ evidenceBasis: 'vibes' }));
    expect(res.status).toBe(422);
    expect(res.text).toContain('Choose one of the listed answers.');
  });

  it('writes nothing at all when it refuses', async () => {
    const row = ruling(CANDIDATES[3]);
    expect(row.authored_notation).toBeNull();
    expect(row.notation_evidence_basis).toBeNull();
    expect(row.version).toBe(1);
    expect(auditRows(CANDIDATES[3])).toHaveLength(0);
  });

  it('does not check the notation against a difficulty, because there is none to check', async () => {
    // A notation whose bracket count matches nothing in particular still saves:
    // the count is information at this stage, and the check belongs to publication.
    const res = await post(`/admin/freestyle/notation-backlog/${CANDIDATES[4]}/author`, validForm({
      notation: 'TOE > SAME TOE [DEL]',
    }));
    expect(res.status).toBe(303);
    expect(ruling(CANDIDATES[4]).authored_notation).toBe('TOE > SAME TOE [DEL]');
    expect(trickCount()).toBe(0);
  });
});
