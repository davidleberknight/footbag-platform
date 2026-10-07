/**
 * A lookup by key answers a record the viewer may not see exactly as it answers
 * a key that matches nothing.
 *
 * Every GET route addressed by a path parameter is a lookup, and a lookup that
 * answers "exists but not for you" differently from "no such thing" lets anyone
 * walk the key space and learn which members, unpublished events, removed items
 * or issued links exist. The rule is the same for every such route: equal
 * status, equal redirect target and equal body once the key itself is masked.
 *
 * The routes come from the deployed router, so a parameterised GET route added
 * tomorrow fails the completeness check until it has a probe here or an
 * exemption saying why its keys are public record.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import request from '../fixtures/supertestWithOrigin';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import { loadRouteTable } from '../fixtures/routeTable';
import {
  insertMember,
  insertEvent,
  insertMediaItem,
  insertTag,
  createTestSessionJwt,
} from '../fixtures/factories';
import { normalizeAntiEnumerationBody } from '../fixtures/normalizeAntiEnumerationBody';

const { dbPath } = setTestEnv('4451');
process.env.PAYMENT_ADAPTER = 'stub';

let createApp: Awaited<ReturnType<typeof importApp>>;

const VIEWER = 'enum-viewer';
const OTHER = 'enum-other';
const UNKNOWN_MEMBER = 'nobody_matches_this_zz';

/** Keys of records that exist but that the viewer named in each probe may not see. */
const hidden = {
  liveMember: 'enum_other',
  pendingMember: 'enum_pending',
  deletedMember: 'enum_deleted',
  unverifiedMember: 'enum_unverified',
  draftEvent: '',
  canceledEvent: '',
  removedMedia: '',
  othersCheckout: '',
  usedVerifyToken: '',
  usedResetToken: '',
};

type Viewer = 'anonymous' | 'member';

interface Probe {
  viewer: Viewer;
  /** URL for an existing record the viewer may not see, and its key. */
  existing: () => { url: string; key: string };
  /** URL for a key that matches nothing, and that key. */
  unknown: { url: string; key: string };
}

type Classification =
  | { probes: () => Probe[] }
  | { exempt: string };

function cookieFor(viewer: Viewer): string | null {
  return viewer === 'member' ? `__Host-footbag_session=${createTestSessionJwt({ memberId: VIEWER })}` : null;
}

/**
 * Same response once the key is masked: status, redirect target and body.
 * Returns what differed, or null, so one run reports every leaking route.
 */
async function difference(route: string, p: Probe): Promise<string | null> {
  const ex = p.existing();
  const fetchOne = async (url: string, key: string) => {
    const req = request(createApp()).get(url);
    const cookie = cookieFor(p.viewer);
    if (cookie) req.set('Cookie', cookie);
    const res = await req;
    const mask = (s: string) => s.split(key).join('KEY').split(encodeURIComponent(key)).join('KEY');
    return {
      status: res.status,
      location: mask(String(res.headers.location ?? '')),
      body: normalizeAntiEnumerationBody(mask(res.text ?? '')),
    };
  };
  const a = await fetchOne(ex.url, ex.key);
  const b = await fetchOne(p.unknown.url, p.unknown.key);
  const label = `${p.viewer} -> ${route} (existing ${ex.url} vs unknown ${p.unknown.url})`;
  if (a.status !== b.status) return `${label}: status ${a.status} vs ${b.status}`;
  if (a.location !== b.location) return `${label}: redirect ${a.location} vs ${b.location}`;
  if (a.body !== b.body) return `${label}: body differs`;
  return null;
}

/** Member-keyed routes: every other path parameter is filled with a placeholder. */
function memberUrl(path: string, key: string): string {
  return path.replace(':memberKey', key).replace(/:[^/]+/g, 'ph');
}

function memberProbes(path: string, viewers: Viewer[], keys: () => string[]): () => Probe[] {
  return () => viewers.flatMap((viewer) => keys().map((key) => ({
    viewer,
    existing: () => ({ url: memberUrl(path, key), key }),
    unknown: { url: memberUrl(path, UNKNOWN_MEMBER), key: UNKNOWN_MEMBER },
  })));
}

const PUBLIC_RECORD = 'existence is public record: the page is visitor-readable by design, so its key reveals nothing a visitor cannot already browse to';

/**
 * Every parameterised GET route, by its router path. Member-keyed routes are
 * filled in below from the router itself, because every one of them shares
 * one rule: a signed-in non-owner, and an anonymous visitor, get the same
 * answer for somebody else's key as for a key that matches nobody.
 */
const CLASSIFIED: Record<string, Classification> = {
  'GET /members/:memberKey': {
    // A visitor may not look members up at all, and a member may not see an
    // account that is still signing up (which is every unverified account, since
    // signing in needs verification and onboarding needs signing in) or one
    // that has been deleted.
    probes: () => [
      ...memberProbes('/members/:memberKey', ['anonymous'], () => [hidden.liveMember])(),
      ...memberProbes('/members/:memberKey', ['member'], () => [
        hidden.pendingMember, hidden.unverifiedMember, hidden.deletedMember,
      ])(),
    ],
  },
  // A probe with an invalid token on both sides is refused before the member
  // key is read, so it could never tell the two apart. The token, not the key in
  // the path, decides whose data is served; a probe with a valid single-use
  // token on each side is what would test that, and it is not written yet.
  'GET /members/:memberKey/download/:token': {
    exempt: 'the member key in the path is never read: the single-use token alone decides the response',
  },
  'GET /events/:eventKey': {
    probes: () => (['anonymous', 'member'] as Viewer[]).flatMap((viewer) =>
      [hidden.draftEvent, hidden.canceledEvent].map((key) => ({
        viewer,
        existing: () => ({ url: `/events/${key}`, key }),
        unknown: { url: '/events/event_2026_no_such_event', key: 'event_2026_no_such_event' },
      }))),
  },
  'GET /media/item/:mediaId': {
    probes: () => (['anonymous', 'member'] as Viewer[]).map((viewer) => ({
      viewer,
      existing: () => ({ url: `/media/item/${hidden.removedMedia}`, key: hidden.removedMedia }),
      unknown: { url: '/media/item/media-no-such-item', key: 'media-no-such-item' },
    })),
  },
  'GET /payments/checkout/:sessionId': {
    probes: () => (['anonymous', 'member'] as Viewer[]).map((viewer) => ({
      viewer,
      existing: () => ({ url: `/payments/checkout/${hidden.othersCheckout}`, key: hidden.othersCheckout }),
      unknown: { url: '/payments/checkout/cs_no_such_session', key: 'cs_no_such_session' },
    })),
  },
  'GET /verify/:token': {
    probes: () => [{
      viewer: 'anonymous',
      existing: () => ({ url: `/verify/${hidden.usedVerifyToken}`, key: hidden.usedVerifyToken }),
      unknown: { url: '/verify/not-a-real-token-value', key: 'not-a-real-token-value' },
    }],
  },
  'GET /password/reset/:token': {
    probes: () => [{
      viewer: 'anonymous',
      existing: () => ({ url: `/password/reset/${hidden.usedResetToken}`, key: hidden.usedResetToken }),
      unknown: { url: '/password/reset/not-a-real-token-value', key: 'not-a-real-token-value' },
    }],
  },
  'GET /register/wizard/:taskType': { exempt: 'the key is a fixed onboarding step name, not a record' },
  'GET /clubs/:key': { exempt: PUBLIC_RECORD },
  'GET /media/:galleryId': { exempt: PUBLIC_RECORD },
  'GET /media/:galleryId/:mediaId': { exempt: PUBLIC_RECORD },
  'GET /freestyle/sets/:slug': { exempt: PUBLIC_RECORD },
  'GET /freestyle/modifier/:slug': { exempt: PUBLIC_RECORD },
  'GET /freestyle/families/:slug': { exempt: PUBLIC_RECORD },
  'GET /freestyle/tricks/:add(\\d+)': { exempt: PUBLIC_RECORD },
  'GET /freestyle/tricks/:slug': { exempt: PUBLIC_RECORD },
  'GET /net/teams/:teamId': { exempt: PUBLIC_RECORD },
  'GET /rules/:disciplineSlug/:ruleSlug': { exempt: PUBLIC_RECORD },
  'GET /ifpa/:docSlug': { exempt: PUBLIC_RECORD },
  'GET /events/year/:year': { exempt: PUBLIC_RECORD },
  'GET /history/:personId': { exempt: PUBLIC_RECORD },
  'GET /history/:personId/claim': { exempt: `${PUBLIC_RECORD}; the claim step reads the same public historical record` },
};

/** Routes behind the administrator gate decide before any key is read. */
const ADMIN_PREFIX = '/admin/';
const ADMIN_EXEMPTION = 'behind the administrator gate, which answers every non-administrator before the key is read; the authorization matrix proves the gate';

/** The member-keyed routes the generic rule covers, read from the router. */
const MEMBER_PREFIX = '/members/:memberKey/';

let parameterisedRoutes: string[] = [];

beforeAll(async () => {
  const db = createTestDb(dbPath);
  insertMember(db, { id: VIEWER, slug: 'enum_viewer', login_email: 'viewer@example.test' });
  insertMember(db, { id: OTHER, slug: hidden.liveMember, login_email: 'other@example.test' });
  insertMember(db, { id: 'enum-pending', slug: hidden.pendingMember, login_email: 'pending@example.test', onboarding: 'none' });
  insertMember(db, { id: 'enum-deleted', slug: hidden.deletedMember, login_email: 'deleted@example.test', deleted_at: '2025-01-01T00:00:00.000Z' });
  // The shape registration leaves: no verification, and no onboarding answered.
  insertMember(db, {
    id: 'enum-unverified', slug: hidden.unverifiedMember, login_email: 'unverified@example.test',
    email_verified_at: null, onboarding: 'none',
  });
  hidden.draftEvent = 'event_2026_enum_draft';
  hidden.canceledEvent = 'event_2026_enum_canceled';
  insertEvent(db, { status: 'draft', hashtag_tag_id: insertTag(db, { tag_normalized: `#${hidden.draftEvent}` }) });
  insertEvent(db, { status: 'canceled', hashtag_tag_id: insertTag(db, { tag_normalized: `#${hidden.canceledEvent}` }) });
  hidden.removedMedia = insertMediaItem(db, { uploader_member_id: OTHER, moderation_status: 'removed_by_admin' });
  db.close();

  createApp = await importApp();

  const { accountTokenService } = await import('../../src/services/accountTokenService');
  const verify = accountTokenService.issueToken({ memberId: 'enum-unverified', tokenType: 'email_verify', ttlHours: 1 });
  accountTokenService.consumeToken(verify.rawToken, 'email_verify');
  hidden.usedVerifyToken = verify.rawToken;
  const reset = accountTokenService.issueToken({ memberId: OTHER, tokenType: 'password_reset', ttlHours: 1 });
  accountTokenService.consumeToken(reset.rawToken, 'password_reset');
  hidden.usedResetToken = reset.rawToken;

  const { paymentService } = await import('../../src/services/paymentService');
  hidden.othersCheckout = (await paymentService.startDonation(OTHER, 2500, null, false, '/x')).sessionId;

  // The verify-token row was consumed directly, so the account it names is
  // still unverified: that is what keeps it a hidden member for the profile row.
  const check = new BetterSqlite3(dbPath, { readonly: true });
  const row = check.prepare('SELECT email_verified_at FROM members WHERE id = ?').get('enum-unverified') as { email_verified_at: string | null };
  check.close();
  expect(row.email_verified_at).toBeNull();

  const table = await loadRouteTable();
  parameterisedRoutes = [...new Set(table.allRoutes
    .filter((r) => r.method === 'GET' && r.path.includes(':'))
    .map((r) => `GET ${r.path}`))].sort();
});

afterAll(() => cleanupTestDb(dbPath));

function classify(route: string): Classification | undefined {
  if (CLASSIFIED[route]) return CLASSIFIED[route];
  const path = route.slice('GET '.length);
  if (path.startsWith(ADMIN_PREFIX)) return { exempt: ADMIN_EXEMPTION };
  if (path.startsWith(MEMBER_PREFIX)) {
    // Owner-only pages: another member's key must answer as no member at all.
    return { probes: memberProbes(path, ['anonymous', 'member'], () => [hidden.liveMember]) };
  }
  return undefined;
}

describe('lookup anti-enumeration sweep', () => {
  // Defect caught: a parameterised route added with no decision about whether
  // its keys can be enumerated, so a leak there is never looked for.
  it('every parameterised GET route has probes or a reasoned exemption', () => {
    expect(parameterisedRoutes.length, 'the router yielded no parameterised routes').toBeGreaterThan(30);
    expect(parameterisedRoutes.filter((r) => !classify(r))).toEqual([]);
    // A classification for a route that no longer exists describes nothing.
    expect(Object.keys(CLASSIFIED).filter((r) => !parameterisedRoutes.includes(r))).toEqual([]);
  });

  // Defect caught: a lookup answers an existing record the viewer may not see
  // differently from a key that matches nothing, so the key space can be
  // walked to learn which members, unpublished events, removed items or
  // issued links exist.
  it('answers a hidden record exactly as it answers an unknown key, on every probed route', async () => {
    let probed = 0;
    const leaks: string[] = [];
    for (const route of parameterisedRoutes) {
      const c = classify(route);
      if (!c || 'exempt' in c) continue;
      for (const p of c.probes()) {
        const diff = await difference(route, p);
        if (diff) leaks.push(diff);
        probed += 1;
      }
    }
    expect(probed, 'probes ran').toBeGreaterThan(20);
    expect(leaks).toEqual([]);
  });
});
