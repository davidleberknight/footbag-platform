/**
 * The development test routes serve synthetic personas only on a copy of
 * production, and reach any member on a database built any other way.
 *
 * A copy of production carries real member accounts and their addresses. The
 * copy builder marks the database with a system configuration row; while it is
 * there, the persona switch, the persona login and the claim builder refuse to
 * act as anyone but a seeded persona, and the test mailbox hides mail sent to
 * anyone else. Each case is checked both ways: without the marker the same
 * request reaches the real member, so a guard that refused everything, or one
 * that never looked at the marker, fails here.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import argon2 from 'argon2';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import { insertMember, insertSystemConfig } from '../fixtures/factories';
import { seedPersona } from '../../src/testkit/personaFactory';
import { PRODUCTION_COPY_CONFIG_KEY } from '../../src/lib/productionCopy';

const { dbPath } = setTestEnv('3627');

const PRIOR_FOOTBAG_ENV = process.env.FOOTBAG_ENV;
process.env.FOOTBAG_ENV = 'development';

let createApp: Awaited<ReturnType<typeof importApp>>;

const REAL_SLUG = 'real_copied_member';
const REAL_EMAIL = 'real.member@example.com';
const PERSONA_SLUG = 'copy_guard_persona';

const capturedWorkerMail = [
  { to: REAL_EMAIL, subject: 'Real member mail', bodyText: 'to a real member', messageId: 'msg-real', deliveredAt: '2026-11-01T00:00:00.000Z' },
  { to: `${PERSONA_SLUG}@personas.test`, subject: 'Persona mail', bodyText: 'to a persona', messageId: 'msg-persona', deliveredAt: '2026-11-01T00:00:01.000Z' },
];

function issuedSession(res: request.Response): boolean {
  return ((res.headers['set-cookie'] as unknown as string[] | undefined) ?? [])
    .some((c) => c.startsWith('__Host-footbag_session='));
}

beforeAll(async () => {
  const db = createTestDb(dbPath);
  const { TEST_PERSONA_SEED_PASSWORD_LITERAL } = await import('../../src/testkit/personaSecrets');
  const passwordHash = await argon2.hash(TEST_PERSONA_SEED_PASSWORD_LITERAL);
  seedPersona(db, { slug: PERSONA_SLUG, displayName: 'Copy Guard Persona', tier: 'tier1', testingUsage: 'Copy guard fixture.', coverageNotes: ['persona on a copy'] }, { passwordHash });
  // The real member signs in with the harness password too, so that without
  // the marker the login route reaches them and the refusal is the guard's.
  insertMember(db, { slug: REAL_SLUG, login_email: REAL_EMAIL, password_hash: passwordHash, display_name: 'Real Copied Member' });
  db.close();
  createApp = await importApp();
  const capture = await import('../../src/testkit/devOutboxCaptureClient');
  capture.setDevOutboxCaptureClientForTests({ fetchWorkerCaptured: async () => capturedWorkerMail });
});

afterAll(async () => {
  const capture = await import('../../src/testkit/devOutboxCaptureClient');
  capture.resetDevOutboxCaptureClientForTests();
  cleanupTestDb(dbPath);
  if (PRIOR_FOOTBAG_ENV === undefined) delete process.env.FOOTBAG_ENV;
  else process.env.FOOTBAG_ENV = PRIOR_FOOTBAG_ENV;
});

describe('dev test routes on a database that is not a copy', () => {
  // Defect caught: the guard refuses real members everywhere, breaking the
  // migration testing that switches into real accounts on a pipeline build.
  it('switches into a real member', async () => {
    const res = await request(createApp()).get(`/dev/switch?as=${REAL_SLUG}`);
    expect(res.status).toBe(302);
    expect(issuedSession(res)).toBe(true);
  });

  it('logs in as a real member', async () => {
    const res = await request(createApp()).get(`/dev/login?as=${REAL_SLUG}`);
    expect(res.status).toBe(302);
    expect(issuedSession(res)).toBe(true);
  });

  it('shows mail sent to a real member in the test mailbox', async () => {
    const res = await request(createApp()).get('/dev/outbox');
    expect(res.status).toBe(200);
    expect(res.text).toContain(REAL_EMAIL);
  });
});

describe('dev test routes on a copy of production', () => {
  beforeAll(async () => {
    const { db } = await import('../../src/db/db');
    insertSystemConfig(db, { config_key: PRODUCTION_COPY_CONFIG_KEY, value_json: '{"copied_at":"2026-11-01T00:00:00.000Z"}' });
  });

  // Defect caught: a tester on staging signs in as a real member of the copy
  // and acts on their account.
  it('refuses to switch into a real member, issuing no session', async () => {
    const res = await request(createApp()).get(`/dev/switch?as=${REAL_SLUG}`);
    expect(res.status).toBe(403);
    expect(issuedSession(res)).toBe(false);
  });

  // Defect caught: the guard keys on something every member has, so personas
  // are refused too and the copy cannot be tested at all.
  it('still switches into a persona', async () => {
    const res = await request(createApp()).get(`/dev/switch?as=${PERSONA_SLUG}`);
    expect(res.status).toBe(302);
    expect(issuedSession(res)).toBe(true);
  });

  it('refuses to log in as a real member, issuing no session', async () => {
    const res = await request(createApp()).get(`/dev/login?as=${REAL_SLUG}`);
    expect(res.status).toBe(403);
    expect(issuedSession(res)).toBe(false);
  });

  it('still logs in as a persona', async () => {
    const res = await request(createApp()).get(`/dev/login?as=${PERSONA_SLUG}`);
    expect(res.status).toBe(302);
    expect(issuedSession(res)).toBe(true);
  });

  // Defect caught: the claim builder signs a tester in as whichever real member
  // already claimed a legacy record, or builds a claim on a real record.
  it('refuses the claim builder before it reads or builds anything', async () => {
    const res = await request(createApp()).get('/dev/build-claim?as=12345');
    expect(res.status).toBe(403);
    expect(issuedSession(res)).toBe(false);
  });

  // Defect caught: the test mailbox shows real members' addresses and the
  // mail the copy's jobs sent them to anyone who can open staging.
  it('hides mail sent to a real member and keeps mail sent to a persona', async () => {
    const res = await request(createApp()).get('/dev/outbox');
    expect(res.status).toBe(200);
    expect(res.text).not.toContain(REAL_EMAIL);
    expect(res.text).toContain(`${PERSONA_SLUG}@personas.test`);
  });
});
