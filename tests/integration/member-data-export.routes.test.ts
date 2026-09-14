/**
 * Member self-service data export.
 *
 * The contract: a member may ask for a copy of their own data and nobody else's;
 * the file is not handed to the browser that asked but to the verified mailbox,
 * behind a link that works once; the document carries what the platform holds
 * about that member including the parts page-facing reads hide from them; and it
 * never carries how they voted, a payment-provider identifier, or another
 * member's personal data.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import request from '../fixtures/supertestWithOrigin';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import { expectCsrfReject } from '../fixtures/expectCsrfReject';
import {
  insertMember,
  insertMediaItem,
  insertMemberGallery,
  insertClub,
  insertMemberClubAffiliation,
  completeOnboarding,
  createTestSessionJwt,
} from '../fixtures/factories';

const { dbPath } = setTestEnv('4185');

let createApp: Awaited<ReturnType<typeof importApp>>;

function withDb<T>(fn: (db: BetterSqlite3.Database) => T): T {
  const db = new BetterSqlite3(dbPath);
  try {
    return fn(db);
  } finally {
    db.close();
  }
}

function cookieFor(memberId: string): string {
  return `__Host-footbag_session=${createTestSessionJwt({ memberId })}`;
}

function makeMember(slug: string): string {
  return withDb((db) => {
    const id = insertMember(db, {
      slug,
      display_name: slug,
      login_email:  `${slug}@example.com`,
    });
    completeOnboarding(db, id);
    return id;
  });
}

/** The emailed link, read out of the queued message the way the member would
 *  read it out of their inbox. The send worker does not run in tests, so the
 *  body is still on the row. */
function linkFromQueuedEmail(memberId: string): string {
  const row = withDb((db) => db.prepare(
    "SELECT body_text FROM outbox_emails WHERE recipient_member_id = ? AND template_key = 'data_export_ready'",
  ).get(memberId) as { body_text: string | null } | undefined);
  expect(row?.body_text).toBeTruthy();
  const match = /\/members\/[^/\s]+\/download\/([A-Za-z0-9_-]+)/.exec(row!.body_text!);
  expect(match).not.toBeNull();
  return match![0];
}

async function requestExport(slug: string, memberId: string) {
  return request(createApp())
    .post(`/members/${slug}/download`)
    .set('Cookie', cookieFor(memberId))
    .type('form')
    .send({});
}

beforeAll(async () => {
  const db = createTestDb(dbPath);
  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('asking for the export', () => {
  it('tells the member the link went to their address, and does not hand them the file', async () => {
    const slug = 'exp_asks';
    const id = makeMember(slug);
    const res = await requestExport(slug, id);

    expect(res.status).toBe(200);
    expect(res.text).toContain('emailed a download link');
    expect(res.text).toContain(`${slug}@example.com`);
    expect(res.headers['content-disposition']).toBeUndefined();
  });

  it('queues the link to the verified address, issues a single-use token, and records the request', async () => {
    const slug = 'exp_records';
    const id = makeMember(slug);
    await requestExport(slug, id);

    withDb((db) => {
      const mail = db.prepare(
        "SELECT status, recipient_email FROM outbox_emails WHERE recipient_member_id = ? AND template_key = 'data_export_ready'",
      ).get(id) as { status: string; recipient_email: string } | undefined;
      expect(mail?.status).toBe('pending');
      expect(mail?.recipient_email).toBe(`${slug}@example.com`);

      const token = db.prepare(
        "SELECT token_type, used_at FROM account_tokens WHERE member_id = ? AND token_type = 'data_export'",
      ).get(id) as { token_type: string; used_at: string | null } | undefined;
      expect(token).toBeTruthy();
      expect(token!.used_at).toBeNull();

      expect(db.prepare(
        "SELECT 1 FROM audit_entries WHERE action_type = 'member.data_exported' AND entity_id = ?",
      ).get(id)).toBeTruthy();
    });
  });

  it('answers not-found when one member asks for another member’s data', async () => {
    makeMember('exp_target');
    const nosy = makeMember('exp_nosy');
    const res = await request(createApp())
      .post('/members/exp_target/download')
      .set('Cookie', cookieFor(nosy))
      .type('form')
      .send({});
    expect(res.status).toBe(404);
  });

  it('refuses a request posted from another origin', async () => {
    const slug = 'exp_csrf';
    const id = makeMember(slug);
    await expectCsrfReject(createApp(), 'post', `/members/${slug}/download`, {
      cookie: cookieFor(id),
      body:   {},
    });
  });
});

describe('the emailed link', () => {
  it('serves the file as a download and spends the token', async () => {
    const slug = 'exp_downloads';
    const id = makeMember(slug);
    await requestExport(slug, id);
    const link = linkFromQueuedEmail(id);

    const res = await request(createApp()).get(link);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/json');
    expect(res.headers['content-disposition']).toContain('attachment');
    expect(res.headers['content-disposition']).toContain('footbag-my-data.json');

    const used = withDb((db) => db.prepare(
      "SELECT used_at FROM account_tokens WHERE member_id = ? AND token_type = 'data_export'",
    ).get(id) as { used_at: string | null });
    expect(used.used_at).not.toBeNull();
  });

  it('works once', async () => {
    const slug = 'exp_once';
    const id = makeMember(slug);
    await requestExport(slug, id);
    const link = linkFromQueuedEmail(id);

    expect((await request(createApp()).get(link)).status).toBe(200);
    expect((await request(createApp()).get(link)).status).toBe(404);
  });

  it('refuses a token nobody issued', async () => {
    const res = await request(createApp()).get('/members/exp_once/download/not-a-real-token');
    expect(res.status).toBe(404);
  });
});

describe('what the document carries', () => {
  it('carries the member’s own sections, including what page-facing reads hide from them', async () => {
    const slug = 'exp_contents';
    const id = makeMember(slug);
    withDb((db) => {
      // An avatar and a gallery: the profile media read drops avatars, so a
      // document sourced from that read would under-answer the request.
      insertMediaItem(db, { uploader_member_id: id, is_avatar: 1, caption: 'my avatar', source_filename: 'avatar.jpg' });
      insertMediaItem(db, { uploader_member_id: id, caption: 'my photo', source_filename: 'photo.jpg' });
      insertMemberGallery(db, { owner_member_id: id, name: 'My Gallery' });
      const clubId = insertClub(db, { name: 'Export Test Club' });
      insertMemberClubAffiliation(db, id, clubId);
    });

    await requestExport(slug, id);
    const res = await request(createApp()).get(linkFromQueuedEmail(id));
    const doc = JSON.parse(res.text);

    expect(doc.member.slug).toBe(slug);
    expect(doc.member.login_email).toBe(`${slug}@example.com`);
    expect(doc.media.items).toHaveLength(2);
    expect(doc.media.items.map((i: { source_filename: string }) => i.source_filename).sort())
      .toEqual(['avatar.jpg', 'photo.jpg']);
    expect(doc.media.galleries.length).toBeGreaterThan(0);
    expect(doc.clubs.affiliations).toHaveLength(1);
    expect(doc.clubs.affiliations[0].club_name).toBe('Export Test Club');
    expect(Array.isArray(doc.eventRegistrations)).toBe(true);
    expect(Array.isArray(doc.votesParticipatedIn)).toBe(true);
    expect(doc.exportedAt).toBeTruthy();
  });

  it('never carries how the member voted, nor a payment-provider identifier', async () => {
    const slug = 'exp_secrets';
    const id = makeMember(slug);
    await requestExport(slug, id);
    const body = (await request(createApp()).get(linkFromQueuedEmail(id))).text;

    for (const forbidden of [
      'encrypted_ballot_b64',
      'encrypted_data_key_b64',
      'ballot_nonce_b64',
      'ballot_auth_tag_b64',
      'receipt_token_hash',
      'kms_key_id',
      'stripe_customer_id',
      'stripe_payment_intent_id',
      'stripe_subscription_id',
      'password_hash',
    ]) {
      expect(body).not.toContain(forbidden);
    }
  });

  it('carries nothing about another member', async () => {
    const mine   = makeMember('exp_mine');
    const theirs = makeMember('exp_theirs');
    withDb((db) => {
      insertMediaItem(db, { uploader_member_id: theirs, caption: 'not-my-caption', source_filename: 'theirs.jpg' });
    });

    await requestExport('exp_mine', mine);
    const body = (await request(createApp()).get(linkFromQueuedEmail(mine))).text;

    expect(body).not.toContain('not-my-caption');
    expect(body).not.toContain('theirs.jpg');
    expect(body).not.toContain(theirs);
  });
});
