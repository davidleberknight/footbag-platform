/**
 * One member in every state a sender or listing has to tell apart.
 *
 * A path that mails, lists or counts members is usually tested with a live
 * member and perhaps one excluded state, and the state nobody seeded is the one
 * that leaks: a deceased member still receiving list mail, for instance. This
 * seeds the whole set at once, so a test asserts every state against the same
 * call and a newly added state reaches every such test together.
 *
 * `live` is the positive control. A test asserts that it IS reached, so a
 * sender that reaches nobody at all cannot pass every exclusion vacuously.
 *
 * Each member is subscribed to every list in `lists` and holds a confirmed
 * registration for `eventId` when one is given. Ids and addresses carry
 * `prefix`, so several matrices can share one database and a test can scope
 * its reads to its own matrix. Rows come only from the shared factories.
 */
import type BetterSqlite3 from 'better-sqlite3';
import {
  insertMember,
  insertMailingListSubscription,
  insertRegistration,
} from './factories';

export const MEMBER_STATES = [
  'live',
  'deceased',
  'softDeleted',
  'purged',
  'unverified',
  'bounced',
  'complained',
] as const;

export type MemberState = typeof MEMBER_STATES[number];

export type MemberStateMatrix = Record<MemberState, string>;

export interface MemberStateMatrixOpts {
  prefix: string;
  lists?: string[];
  eventId?: string;
}

const PAST = '2025-01-01T00:00:00.000Z';

export function seedMemberStateMatrix(
  db: BetterSqlite3.Database,
  opts: MemberStateMatrixOpts,
): MemberStateMatrix {
  const p = opts.prefix;
  const email = (state: MemberState) => `${p}-${state}@example.test`.toLowerCase();
  const overrides: Record<MemberState, Parameters<typeof insertMember>[1]> = {
    live:        {},
    deceased:    { is_deceased: 1, deceased_at: PAST },
    softDeleted: { deleted_at: PAST },
    purged:      { deleted_at: PAST, personal_data_purged_at: PAST },
    unverified:  { email_verified_at: null },
    bounced:     { email_status: 'bounced' },
    complained:  { email_status: 'complained' },
  };

  const matrix = {} as MemberStateMatrix;
  for (const state of MEMBER_STATES) {
    const id = `${p}-${state}`;
    insertMember(db, {
      id,
      slug: `${p}_${state}`.toLowerCase().replace(/[^a-z0-9_]/g, '_'),
      login_email: email(state),
      ...overrides[state],
    });
    for (const list of opts.lists ?? []) {
      insertMailingListSubscription(db, { list_slug: list, member_id: id, status: 'subscribed' });
    }
    if (opts.eventId) {
      insertRegistration(db, opts.eventId, id, { status: 'confirmed' });
    }
    matrix[state] = id;
  }
  return matrix;
}
