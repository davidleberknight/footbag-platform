/**
 * Persona switch + authenticated page crawl across the whole seeded catalog.
 *
 * For every persona the harness can seed (the canonical catalog minus the
 * unbuilt-feature personas and the build-on-switch DL special user, who is built
 * through real flows against loaded pipeline data and is exercised by the
 * separate dev-only crawl), this pins the switch-and-render contract end to end:
 *
 *   - a session-eligible persona switches to a real session cookie and reaches
 *     its own authenticated pages (home, owner profile edit, member galleries);
 *   - a seeded but session-blocked persona (unverified, deceased, soft-deleted)
 *     is not switchable and the switch route returns 404;
 *   - the owner edit page is a real auth gate (no cookie redirects to login);
 *   - the issued cookie carries the persona's admin/member role onto the
 *     admin-gated surface (admin reaches /admin, a member is forbidden).
 *
 * The /dev router mounts under development and staging; this pins development so
 * the issued session cookie is not marked Secure and rides supertest over http.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import { CANONICAL_PERSONAS } from '../../src/testkit/canonicalPersonas';
import { seedPersona } from '../../src/testkit/personaFactory';

const { dbPath } = setTestEnv('3439');

// The /dev router mounts when footbagEnv is 'development' or 'staging'; pin it
// before importApp boots the frozen config singleton.
const PRIOR_FOOTBAG_ENV = process.env.FOOTBAG_ENV;
process.env.FOOTBAG_ENV = 'development';

let createApp: Awaited<ReturnType<typeof importApp>>;

// The harness seeds every persona whose feature exists: all but the
// unbuilt-feature personas (blockedBy) and the DL special user (buildOnSwitch).
const SEEDED = CANONICAL_PERSONAS.filter((p) => !p.blockedBy && !p.buildOnSwitch);

// The switch route's session lookup excludes unverified, deceased, and
// soft-deleted rows, so a seeded persona is switchable only when none apply.
const isSwitchable = (p: (typeof CANONICAL_PERSONAS)[number]): boolean =>
  !p.blockedBy && !p.buildOnSwitch && p.emailVerified !== false && !p.isDeceased && !p.deletionState;

const SWITCHABLE = SEEDED.filter(isSwitchable);
const SEEDED_NOT_SWITCHABLE = SEEDED.filter((p) => !isSwitchable(p));

beforeAll(async () => {
  const db = createTestDb(dbPath);
  for (const spec of SEEDED) seedPersona(db, spec);
  db.close();
  createApp = await importApp();
});

afterAll(() => {
  cleanupTestDb(dbPath);
  if (PRIOR_FOOTBAG_ENV === undefined) delete process.env.FOOTBAG_ENV;
  else process.env.FOOTBAG_ENV = PRIOR_FOOTBAG_ENV;
});

function sessionCookie(setCookie: string[] | undefined): string {
  const entry = (setCookie ?? []).find((c) => c.startsWith('footbag_session='));
  if (!entry) throw new Error('no footbag_session cookie issued');
  return entry.split(';')[0];
}

describe('persona switch + authenticated page crawl', () => {
  it('seeds a catalog containing both switchable and session-blocked personas', () => {
    expect(SWITCHABLE.length).toBeGreaterThan(5);
    expect(SEEDED_NOT_SWITCHABLE.length).toBeGreaterThan(0);
  });

  it('switches to every switchable persona, issues a session, and renders their owner pages', async () => {
    for (const spec of SWITCHABLE) {
      const switchRes = await request(createApp()).get(`/dev/switch?as=${spec.slug}`);
      expect(switchRes.status, `${spec.slug} switch`).toBe(302);
      const cookie = sessionCookie(switchRes.headers['set-cookie'] as unknown as string[]);

      // Home renders for the logged-in persona without crashing.
      const home = await request(createApp()).get('/').set('Cookie', cookie);
      expect(home.status, `${spec.slug} home`).toBeLessThan(400);

      // The persona reaches its own profile edit page (requireAuth, owner-only),
      // proving the cookie verifies as a real session for this exact persona
      // rather than redirecting to /login.
      const edit = await request(createApp()).get(`/members/${spec.slug}/edit`).set('Cookie', cookie);
      expect(edit.status, `${spec.slug} edit`).toBe(200);

      // The member-galleries surface renders for the authenticated persona.
      const galleries = await request(createApp()).get('/media/member-galleries').set('Cookie', cookie);
      expect(galleries.status, `${spec.slug} member-galleries`).toBeLessThan(400);
    }
  });

  it('refuses to switch to a seeded but session-blocked persona (404)', async () => {
    for (const spec of SEEDED_NOT_SWITCHABLE) {
      const res = await request(createApp()).get(`/dev/switch?as=${spec.slug}`);
      expect(res.status, spec.slug).toBe(404);
    }
  });

  it('gates the owner edit page on a real session: no cookie redirects to login', async () => {
    const spec = SWITCHABLE[0];
    const res = await request(createApp()).get(`/members/${spec.slug}/edit`);
    expect(res.status).toBe(302);
    expect(res.headers.location).toContain('/login');
  });

  it('carries the persona role onto the admin-gated surface', async () => {
    const adminSpec = SWITCHABLE.find((p) => p.isAdmin);
    const memberSpec = SWITCHABLE.find((p) => !p.isAdmin);
    expect(adminSpec, 'a switchable admin persona').toBeDefined();
    expect(memberSpec, 'a switchable member persona').toBeDefined();

    const adminCookie = sessionCookie(
      (await request(createApp()).get(`/dev/switch?as=${adminSpec!.slug}`)).headers[
        'set-cookie'
      ] as unknown as string[],
    );
    const adminRes = await request(createApp()).get('/admin').set('Cookie', adminCookie);
    expect(adminRes.status, 'admin persona reaches /admin').toBe(200);

    const memberCookie = sessionCookie(
      (await request(createApp()).get(`/dev/switch?as=${memberSpec!.slug}`)).headers[
        'set-cookie'
      ] as unknown as string[],
    );
    const memberRes = await request(createApp()).get('/admin').set('Cookie', memberCookie);
    expect(memberRes.status, 'member persona forbidden from /admin').toBe(403);
  });
});
