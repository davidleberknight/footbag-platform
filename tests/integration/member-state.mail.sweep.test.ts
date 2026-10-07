/**
 * Every email the platform can send reaches a live member and never a member
 * the platform must not mail.
 *
 * The platform sends nothing to a member it has marked deceased, nothing to a
 * deleted or erased account except the message confirming the deletion itself,
 * and no routine mail to a bouncing or complaining mailbox; a broadcast also
 * skips an unverified one. Each of those rules is enforced where the sender
 * resolves its recipients, which means one forgotten filter in one statement
 * mails a grieving family.
 *
 * The sweep has three layers:
 *
 * - The audience rows run the outbox's own audiences (one address, one member,
 *   a list, an event's participants) and the scheduled senders that resolve
 *   their own recipients, against one member in every state.
 * - The policy table names, for every logical email key, the route its send
 *   sites take. A route that keeps the enqueue gate in force is proved once for
 *   all its keys; a strict send bypasses that gate, so each strict key has a
 *   driver of its own that runs the real flow against every state.
 * - The completeness checks read every send site in the application source and
 *   fail on a key with no policy, a send site whose shape disagrees with its
 *   key's policy, or a strict key with no driver, so a new sender or a send
 *   newly made strict is swept the day it ships.
 *
 * In every row the live member, or the state the email exists for, must be
 * reached, so no row passes by reaching nobody, and every state the row
 * excludes must not be.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import BetterSqlite3 from 'better-sqlite3';
import { setTestEnv, createTestDb, cleanupTestDb } from '../fixtures/testDb';
import {
  insertEvent,
  insertMember,
  insertMediaItem,
  insertWorkQueueItem,
  insertActivePlayerGrant,
} from '../fixtures/factories';
import {
  MEMBER_STATES,
  seedMemberStateMatrix,
  type MemberState,
  type MemberStateMatrix,
} from '../fixtures/memberStates';
import { DAY_MS } from '../fixtures/clock';
import { hashTestPassword } from '../fixtures/hashTestPassword';
import { createScratchDir, removeScratch } from '../fixtures/scratchDir';
import { REPO_ROOT, scanSource } from '../fixtures/sourceTree';
import type { EmailTemplateKey } from '../../src/services/emailTemplateRegistry';

const { dbPath } = setTestEnv('4243');

/* eslint-disable @typescript-eslint/consistent-type-imports */
let createCommunicationService: typeof import('../../src/services/communicationService').createCommunicationService;
let createStubSesAdapter: typeof import('../../src/adapters/sesAdapter').createStubSesAdapter;
let workQueueService: typeof import('../../src/services/workQueueService').workQueueService;
let runDailyPass: typeof import('../../src/services/activePlayerExpiryService').runDailyPass;
let emailService: typeof import('../../src/services/emailService').emailService;
let identityAccessService: typeof import('../../src/services/identityAccessService').identityAccessService;
let adminWorkQueueService: typeof import('../../src/services/adminWorkQueueService').adminWorkQueueService;
let accountTokenService: typeof import('../../src/services/accountTokenService').accountTokenService;
let createMediaModerationService: typeof import('../../src/services/mediaModerationService').createMediaModerationService;
let createLocalMediaStorageAdapter: typeof import('../../src/adapters/mediaStorageAdapter').createLocalMediaStorageAdapter;
let listEmailLogicalKeys: typeof import('../../src/services/emailTemplateRegistry').listEmailLogicalKeys;
/* eslint-enable @typescript-eslint/consistent-type-imports */

const MEDIA_DIR = createScratchDir('member-state-mail-media');
const PASSWORD = 'SweepPass123!';
const NEW_PASSWORD = 'SweepPass456!';
let passwordHash = '';

beforeAll(async () => {
  createTestDb(dbPath).close();
  createCommunicationService = (await import('../../src/services/communicationService')).createCommunicationService;
  createStubSesAdapter = (await import('../../src/adapters/sesAdapter')).createStubSesAdapter;
  workQueueService = (await import('../../src/services/workQueueService')).workQueueService;
  runDailyPass = (await import('../../src/services/activePlayerExpiryService')).runDailyPass;
  emailService = (await import('../../src/services/emailService')).emailService;
  identityAccessService = (await import('../../src/services/identityAccessService')).identityAccessService;
  adminWorkQueueService = (await import('../../src/services/adminWorkQueueService')).adminWorkQueueService;
  accountTokenService = (await import('../../src/services/accountTokenService')).accountTokenService;
  createMediaModerationService = (await import('../../src/services/mediaModerationService')).createMediaModerationService;
  createLocalMediaStorageAdapter = (await import('../../src/adapters/mediaStorageAdapter')).createLocalMediaStorageAdapter;
  listEmailLogicalKeys = (await import('../../src/services/emailTemplateRegistry')).listEmailLogicalKeys;
  passwordHash = await hashTestPassword(PASSWORD);
});

afterAll(() => {
  cleanupTestDb(dbPath);
  removeScratch(MEDIA_DIR);
});

function withDb<T>(fn: (db: BetterSqlite3.Database) => T): T {
  const db = new BetterSqlite3(dbPath);
  try {
    return fn(db);
  } finally {
    db.close();
  }
}

function outboxCountFor(memberId: string): number {
  return withDb((db) => (db.prepare(
    'SELECT COUNT(*) AS n FROM outbox_emails WHERE recipient_member_id = ?',
  ).get(memberId) as { n: number }).n);
}

function emailOf(prefix: string, state: MemberState): string {
  return `${prefix}-${state}@example.test`.toLowerCase();
}

/** One administrator per driver, so no driver shares a rate-limit bucket. */
function seedAdmin(prefix: string): string {
  const id = `${prefix}-admin`;
  withDb((db) => insertMember(db, {
    id, slug: `${prefix}_admin`.replace(/[^a-z0-9_]/g, '_'),
    login_email: `${prefix}-admin@example.test`, is_admin: 1,
  }));
  return id;
}

const BULK_EXCLUDED: MemberState[] = [
  'deceased', 'softDeleted', 'purged', 'unverified', 'bounced', 'complained',
];

/** What the enqueue gate refuses for any non-strict send naming a member. */
const GATE_EXCLUDED: MemberState[] = ['deceased', 'softDeleted', 'purged', 'bounced', 'complained'];

interface SenderRow {
  name: string;
  /** The states the send exists for; the live member unless said otherwise. */
  reaches?: MemberState[];
  excludes: MemberState[];
  /** Seeds its own matrix, runs the sender once, and returns the matrix. */
  run: (prefix: string) => MemberStateMatrix | Promise<MemberStateMatrix>;
}

/**
 * Every member in the matrix, by the address it was seeded with. A purged
 * row no longer holds that address, but a caller that read it earlier still
 * does, which is exactly the send this has to refuse.
 */
function memberRecipients(
  prefix: string,
  matrix: MemberStateMatrix,
): Array<{ memberId: string; email: string }> {
  return MEMBER_STATES.map((state) => ({ memberId: matrix[state], email: emailOf(prefix, state) }));
}

/** Runs one row and asserts who got an outbox row. */
async function assertRow(row: SenderRow, prefix: string, knownLeaks: Partial<Record<MemberState, string>> = {}) {
  const matrix = await row.run(prefix);
  for (const state of row.reaches ?? ['live']) {
    expect(outboxCountFor(matrix[state]), `${row.name} must reach the ${state} member`).toBeGreaterThan(0);
  }
  const leaked = row.excludes.filter((state) => outboxCountFor(matrix[state]) > 0);
  // A known leak is a recorded defect, not an allowance: the row still fails
  // the day the leak changes either way, so a fix cannot land without the
  // record being removed with it.
  expect(leaked, `${row.name} mailed excluded member states`)
    .toEqual(row.excludes.filter((s) => s in knownLeaks));
}

// ── Audience rows ───────────────────────────────────────────────────────────

const AUDIENCE_ROWS: SenderRow[] = [
  {
    // The path every service notification takes. A verification mail has to
    // reach an unverified mailbox, so unverified is not part of this row's
    // claim; the member-state rule is enforced at insert, whatever the audience.
    name: 'single-address notification',
    excludes: GATE_EXCLUDED,
    run: (prefix) => {
      const matrix = withDb((db) => seedMemberStateMatrix(db, { prefix }));
      const comms = createCommunicationService(createStubSesAdapter());
      for (const r of memberRecipients(prefix, matrix)) {
        comms.enqueue({
          audience: { kind: 'address', email: r.email, memberId: r.memberId },
          subject: 'Club update',
          bodyText: 'body',
          idempotencyKey: `${prefix}-${r.memberId}`,
        });
      }
      return matrix;
    },
  },
  {
    // The member audience checks neither verification nor mailbox state at
    // resolution, so only the states the platform must never mail are claimed.
    name: 'single-member notification',
    excludes: ['deceased', 'softDeleted', 'purged'],
    run: (prefix) => {
      const matrix = withDb((db) => seedMemberStateMatrix(db, { prefix }));
      const comms = createCommunicationService(createStubSesAdapter());
      for (const state of MEMBER_STATES) {
        comms.enqueue({
          audience: { kind: 'member', memberId: matrix[state] },
          subject: 'Tier change',
          bodyText: 'body',
          idempotencyKey: `${prefix}-${state}`,
        });
      }
      return matrix;
    },
  },
  {
    name: 'mailing-list broadcast',
    excludes: BULK_EXCLUDED,
    run: (prefix) => {
      const slug = `${prefix}-list`;
      const matrix = withDb((db) => seedMemberStateMatrix(db, { prefix, lists: [slug] }));
      createCommunicationService(createStubSesAdapter()).enqueue({
        audience: { kind: 'list', slug },
        subject: 'List news',
        bodyText: 'body',
        idempotencyKey: `${prefix}-send`,
      });
      return matrix;
    },
  },
  {
    name: 'event-participant broadcast',
    excludes: BULK_EXCLUDED,
    run: (prefix) => {
      const matrix = withDb((db) => {
        const eventId = insertEvent(db);
        return { eventId, matrix: seedMemberStateMatrix(db, { prefix, eventId }) };
      });
      createCommunicationService(createStubSesAdapter()).enqueue({
        audience: { kind: 'event', eventId: matrix.eventId },
        subject: 'Schedule change',
        bodyText: 'body',
        idempotencyKey: `${prefix}-send`,
      });
      return matrix.matrix;
    },
  },
  {
    name: 'administrator work-queue digest',
    excludes: BULK_EXCLUDED,
    run: (prefix) => {
      const matrix = withDb((db) => {
        insertWorkQueueItem(db, {
          queue_category: 'membership',
          task_type: 'member_contact_request',
          entity_type: 'member',
          entity_id: `${prefix}-entity`,
        });
        return seedMemberStateMatrix(db, { prefix, lists: ['admin-alerts'] });
      });
      workQueueService.sendAdminQueueDigests();
      return matrix;
    },
  },
  {
    // The reminder gates on deliverability and subscription rather than on
    // verification, so the unverified member is not part of this row's claim.
    name: 'Active Player expiry reminder',
    excludes: GATE_EXCLUDED,
    run: (prefix) => {
      const now = new Date();
      const expiresAt = new Date(now.getTime() + 30 * DAY_MS).toISOString();
      const matrix = withDb((db) => {
        const m = seedMemberStateMatrix(db, { prefix });
        for (const state of MEMBER_STATES) {
          insertActivePlayerGrant(db, {
            member_id: m[state],
            change_type: 'grant',
            new_active_player_expires_at: expiresAt,
            reason_code: 'official_event_attendance',
          });
        }
        return m;
      });
      runDailyPass({ now });
      return matrix;
    },
  },
];

// ── Routes a templated send can take ────────────────────────────────────────

/**
 * How a logical email reaches its recipient. The route decides which rows below
 * prove it, so a key needs no driver of its own unless it bypasses the gate.
 *
 * - `member`: `sendToMember`, which resolves the member's own address through a
 *   lookup that skips deceased and removed accounts, then enqueues best-effort.
 * - `admins`: `sendToAdmins`, the administrator alert list, a broadcast.
 * - `address`: `send` to an address the caller resolved, best-effort, naming
 *   the member, so the enqueue gate holds whatever lookup the caller used.
 * - `role`: `send` to a platform role address that belongs to no member.
 * - `strict`: `send` with the gate bypassed. Nothing downstream re-checks the
 *   member, so the caller's own lookup is the only filter and each key carries
 *   a driver that runs its real flow.
 * - `self`: a strict send to the signed-in member about an act on their own
 *   account. An excluded state reaches it only by holding a session, which the
 *   member-state authentication sweep proves no excluded state can do.
 */
type Route =
  | { via: 'member' | 'admins' | 'address' | 'role' }
  | { via: 'strict'; driver: StrictDriver }
  | { via: 'self'; why: string };

type StrictDriver =
  | 'registration'
  | 'verificationResend'
  | 'passwordResetRequest'
  | 'passwordResetCompletion'
  | 'contactRequestResolution'
  | 'linkHelpResolution'
  | 'mediaTakedown';

const SELF_ACTED = 'sent only to the signed-in member about an act on their own account';

// Keyed by the registry's own key type, so a key added to the registry fails
// the type check here before it fails the run.
const POLICY: Record<EmailTemplateKey, Route> = {
  account_verify:                         { via: 'strict', driver: 'verificationResend' },
  account_exists_notice:                  { via: 'strict', driver: 'registration' },
  password_reset_request:                 { via: 'strict', driver: 'passwordResetRequest' },
  password_reset_confirm:                 { via: 'strict', driver: 'passwordResetCompletion' },
  password_changed:                       { via: 'self', why: SELF_ACTED },
  // The deliberate exception to the soft-delete rule: the confirmation of the
  // deletion itself, addressed to the account it has just made unreachable.
  account_deletion_requested:             { via: 'self', why: SELF_ACTED },
  contact_request_resolution:             { via: 'strict', driver: 'contactRequestResolution' },
  link_help_request_resolution:           { via: 'strict', driver: 'linkHelpResolution' },
  media_moderation_decision:              { via: 'strict', driver: 'mediaTakedown' },
  data_export_ready:                      { via: 'address' },
  member_question_waiting:                { via: 'member' },
  vouch_confirmation:                     { via: 'address' },
  honor_congratulation:                   { via: 'member' },
  tier_change_notice:                     { via: 'member' },
  admin_role_change:                      { via: 'member' },
  member_record_corrected:                { via: 'member' },
  club_record_corrected:                  { via: 'member' },
  gallery_moderated_member:               { via: 'member' },
  club_membership_member:                 { via: 'address' },
  club_membership_leader:                 { via: 'address' },
  club_volunteer_leadership:              { via: 'address' },
  club_coleader_invite:                   { via: 'address' },
  club_leaderless_contact:                { via: 'address' },
  active_player_expiry_reminder:          { via: 'address' },
  payment_receipt:                        { via: 'address' },
  donation_subscription_started:          { via: 'address' },
  donation_subscription_cancel_requested: { via: 'address' },
  donation_subscription_charge_failed:    { via: 'address' },
  donation_subscription_canceled:         { via: 'address' },
  admin_queue_digest:                     { via: 'address' },
  admin_loss_recruitment:                 { via: 'admins' },
  admin_queue_stale_escalation:           { via: 'admins' },
  admin_recurring_donation_ended:         { via: 'admins' },
  reconciliation_digest:                  { via: 'role' },
};

/** Which send method each route's sites must use, and whether strict. */
const ROUTE_SHAPE: Record<Route['via'], { methods: string[]; strict: boolean; memberIdNull: boolean }> = {
  member:  { methods: ['sendToMember'], strict: false, memberIdNull: false },
  admins:  { methods: ['sendToAdmins', 'sendToMailingList'], strict: false, memberIdNull: false },
  address: { methods: ['send'], strict: false, memberIdNull: false },
  role:    { methods: ['send'], strict: false, memberIdNull: true },
  strict:  { methods: ['send'], strict: true, memberIdNull: false },
  self:    { methods: ['send'], strict: true, memberIdNull: false },
};

// ── The send sites in the application source ────────────────────────────────

interface SendSite {
  file: string;
  method: string;
  /** Null when the template is passed through a variable rather than named. */
  template: string | null;
  strict: boolean;
  memberIdNull: boolean;
}

/**
 * Send sites whose template arrives through a variable, with the keys the
 * variable can hold. A site listed here that stops existing, or a new
 * variable-template site, fails the completeness check.
 */
const VARIABLE_TEMPLATE_SITES: Array<{ file: string; method: string; keys: EmailTemplateKey[] }> = [
  {
    file: 'src/services/paymentService.ts',
    method: 'send',
    keys: [
      'donation_subscription_started', 'donation_subscription_cancel_requested',
      'donation_subscription_charge_failed', 'donation_subscription_canceled',
    ],
  },
  { file: 'src/services/workQueueService.ts', method: 'sendToAdmins', keys: ['admin_loss_recruitment'] },
];

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

function callText(src: string, openParen: number): string {
  let depth = 0;
  for (let i = openParen; i < src.length; i += 1) {
    if (src[i] === '(') depth += 1;
    else if (src[i] === ')') {
      depth -= 1;
      if (depth === 0) return src.slice(openParen, i + 1);
    }
  }
  throw new Error('unbalanced send call');
}

function readSendSites(): SendSite[] {
  const files = scanSource('emailService.', { roots: ['src'], exts: ['.ts'] })
    .filter((f) => f !== 'src/services/emailService.ts');
  const sites: SendSite[] = [];
  const call = /emailService\.(send|sendToMember|sendToMailingList|sendToAdmins)\s*(?:<[^>(]*>)?\(/g;
  for (const file of files) {
    const src = stripComments(readFileSync(path.join(REPO_ROOT, file), 'utf8'));
    for (const m of src.matchAll(call)) {
      const text = callText(src, (m.index ?? 0) + m[0].length - 1);
      sites.push({
        file,
        method: m[1],
        template: /\btemplate:\s*'([a-z0-9_]+)'/.exec(text)?.[1] ?? null,
        strict: /\bstrict:\s*true\b/.test(text),
        memberIdNull: /\brecipientMemberId:\s*null\b/.test(text),
      });
    }
  }
  return sites;
}

// ── Strict drivers ──────────────────────────────────────────────────────────

/** Drops every excluded state's verification, so a resend could reach it. */
function unverify(matrix: MemberStateMatrix, states: MemberState[]): void {
  withDb((db) => {
    const stmt = db.prepare('UPDATE members SET email_verified_at = NULL WHERE id = ?');
    for (const s of states) stmt.run(matrix[s]);
  });
}

function setPasswords(matrix: MemberStateMatrix): void {
  withDb((db) => {
    const stmt = db.prepare('UPDATE members SET password_hash = ? WHERE id = ? AND login_email IS NOT NULL');
    for (const s of MEMBER_STATES) stmt.run(passwordHash, matrix[s]);
  });
}

async function ignoreRefusal(fn: () => unknown): Promise<void> {
  try {
    await fn();
  } catch {
    // A flow that refuses an excluded member is the outcome under test; the
    // assertion reads the outbox, not the exception.
  }
}

const STRICT_DRIVERS: Record<StrictDriver, SenderRow> = {
  registration: {
    // Somebody registers with an address that already belongs to an account.
    name: 'registration with an address already on file',
    excludes: ['deceased', 'softDeleted', 'purged'],
    run: async (prefix) => {
      const matrix = withDb((db) => seedMemberStateMatrix(db, { prefix }));
      for (const [i, state] of MEMBER_STATES.entries()) {
        await ignoreRefusal(() => identityAccessService.registerMember(
          emailOf(prefix, state), PASSWORD, PASSWORD, 'Probe', 'Person', 'Probe Person',
          `198.51.100.${i + 10}`,
        ));
      }
      return matrix;
    },
  },
  verificationResend: {
    // The verification resend exists for the unverified mailbox, so that is the
    // state it must reach; every excluded state is made unverified too, or its
    // exclusion would hold for the wrong reason.
    name: 'verification resend',
    reaches: ['unverified'],
    excludes: ['deceased', 'softDeleted', 'purged'],
    run: async (prefix) => {
      const matrix = withDb((db) => seedMemberStateMatrix(db, { prefix }));
      unverify(matrix, ['deceased', 'softDeleted', 'purged']);
      for (const state of MEMBER_STATES) {
        await ignoreRefusal(() => identityAccessService.resendVerifyEmail(emailOf(prefix, state)));
      }
      return matrix;
    },
  },
  passwordResetRequest: {
    name: 'password reset request',
    excludes: ['deceased', 'softDeleted', 'purged'],
    run: async (prefix) => {
      const matrix = withDb((db) => seedMemberStateMatrix(db, { prefix }));
      for (const state of MEMBER_STATES) {
        await ignoreRefusal(() => identityAccessService.requestPasswordReset(emailOf(prefix, state)));
      }
      return matrix;
    },
  },
  passwordResetCompletion: {
    // A reset link issued while the account was live and used after it left
    // that state: the confirmation must not follow it.
    name: 'password reset completion',
    excludes: ['deceased', 'softDeleted', 'purged'],
    run: async (prefix) => {
      const matrix = withDb((db) => seedMemberStateMatrix(db, { prefix }));
      setPasswords(matrix);
      for (const state of MEMBER_STATES) {
        const { rawToken } = accountTokenService.issueToken({
          memberId: matrix[state], tokenType: 'password_reset', ttlHours: 1,
        });
        await ignoreRefusal(() => identityAccessService.completePasswordReset(
          rawToken, NEW_PASSWORD, NEW_PASSWORD,
        ));
      }
      return matrix;
    },
  },
  contactRequestResolution: {
    // A member asks the administrators something, and their state changes
    // before the answer goes out.
    name: 'contact-request resolution reply',
    excludes: GATE_EXCLUDED,
    run: async (prefix) => {
      const adminId = seedAdmin(prefix);
      const { matrix, items } = withDb((db) => {
        const m = seedMemberStateMatrix(db, { prefix });
        const ids = MEMBER_STATES.map((state) => insertWorkQueueItem(db, {
          queue_category: 'membership', task_type: 'member_contact_request',
          entity_type: 'member', entity_id: m[state], created_by: m[state],
          reason_text: 'Please correct my name.',
        }));
        return { matrix: m, items: ids };
      });
      for (const queueItemId of items) {
        await ignoreRefusal(() => adminWorkQueueService.resolve({
          queueItemId, adminMemberId: adminId, decisionLabel: 'corrected', resolutionNote: 'Done.',
        }));
      }
      return matrix;
    },
  },
  linkHelpResolution: {
    name: 'identity-link help reply',
    excludes: GATE_EXCLUDED,
    run: async (prefix) => {
      const adminId = seedAdmin(prefix);
      const { matrix, items } = withDb((db) => {
        const m = seedMemberStateMatrix(db, { prefix });
        const ids = MEMBER_STATES.map((state) => insertWorkQueueItem(db, {
          queue_category: 'membership', task_type: 'member_link_help_request',
          entity_type: 'member', entity_id: m[state], created_by: m[state],
        }));
        return { matrix: m, items: ids };
      });
      for (const itemId of items) {
        await ignoreRefusal(() => identityAccessService.rejectLinkHelpRequest(adminId, itemId, 'No match.'));
      }
      return matrix;
    },
  },
  mediaTakedown: {
    // An administrator removes an item the member uploaded, the case that
    // reaches a deceased member's record most often.
    name: 'media takedown notice',
    excludes: GATE_EXCLUDED,
    run: async (prefix) => {
      const adminId = seedAdmin(prefix);
      const { matrix, media } = withDb((db) => {
        const m = seedMemberStateMatrix(db, { prefix });
        const ids = MEMBER_STATES.map((state) => insertMediaItem(db, { uploader_member_id: m[state] }));
        return { matrix: m, media: ids };
      });
      const moderation = createMediaModerationService({
        storage: createLocalMediaStorageAdapter({ baseDir: MEDIA_DIR }),
      });
      for (const mediaId of media) {
        await ignoreRefusal(() => moderation.decideDelete({ mediaId, adminMemberId: adminId, reason: 'Off topic.' }));
      }
      return matrix;
    },
  },
};

/**
 * Leaks the sweep has found and that are not yet fixed, each naming the
 * defect. The row asserts exactly these states leak, so a fix fails the row
 * until its entry is removed, and a new leak fails it at once.
 */
const KNOWN_LEAKS: Partial<Record<StrictDriver, Partial<Record<MemberState, string>>>> = {
  registration: {
    deceased: 'the duplicate-registration lookup reads every non-purged account, deceased included, and the notice is strict, so it skips the enqueue gate',
    softDeleted: 'the same lookup reads soft-deleted accounts too, and a strict send passes the soft-delete rule that only the deletion confirmation may',
  },
  contactRequestResolution: {
    deceased: 'the reply resolves its recipient through a lookup that skips removed accounts but not deceased ones, and the strict send skips the enqueue gate',
    bounced: 'the reply is strict, so it bypasses the bounce suppression that only security mail may',
    complained: 'the reply is strict, so it bypasses the complaint suppression that only security mail may',
  },
  linkHelpResolution: {
    deceased: 'the reply resolves its recipient through a lookup that skips removed accounts but not deceased ones, and the strict send skips the enqueue gate',
    bounced: 'the reply is strict, so it bypasses the bounce suppression that only security mail may',
    complained: 'the reply is strict, so it bypasses the complaint suppression that only security mail may',
  },
  mediaTakedown: {
    deceased: 'the moderation read joins the bare members table, and the notice is strict, so neither a lookup nor the gate filters the uploader',
    softDeleted: 'the same read reaches a soft-deleted uploader, and the strict send passes the soft-delete rule',
    bounced: 'the notice is strict, so it bypasses the bounce suppression that only security mail may',
    complained: 'the notice is strict, so it bypasses the complaint suppression that only security mail may',
  },
};

// ── Route proofs ────────────────────────────────────────────────────────────

const ROUTE_PROOFS: Record<'member' | 'admins' | 'address', SenderRow> = {
  member: {
    name: 'templated member notification',
    excludes: GATE_EXCLUDED,
    run: (prefix) => {
      const matrix = withDb((db) => seedMemberStateMatrix(db, { prefix }));
      for (const state of MEMBER_STATES) {
        emailService.sendToMember({
          template: 'member_question_waiting', params: {},
          memberId: matrix[state], idempotencyKey: `${prefix}-${state}`,
        });
      }
      return matrix;
    },
  },
  admins: {
    name: 'templated administrator alert',
    excludes: BULK_EXCLUDED,
    run: (prefix) => {
      const matrix = withDb((db) => seedMemberStateMatrix(db, { prefix, lists: ['admin-alerts'] }));
      emailService.sendToAdmins({
        template: 'admin_queue_stale_escalation',
        params: { taskType: 't', entityId: 'e', ageDays: 3, queueUrl: 'https://x/admin/work-queue' },
        idempotencyKeyPrefix: `${prefix}-alert`,
      });
      return matrix;
    },
  },
  address: {
    name: 'templated best-effort send to a member address',
    excludes: GATE_EXCLUDED,
    run: (prefix) => {
      const matrix = withDb((db) => seedMemberStateMatrix(db, { prefix }));
      for (const r of memberRecipients(prefix, matrix)) {
        emailService.send({
          template: 'member_question_waiting', params: {},
          recipientEmail: r.email, recipientMemberId: r.memberId,
          idempotencyKey: `${prefix}-${r.memberId}`,
        });
      }
      return matrix;
    },
  },
};

// ── The sweep ───────────────────────────────────────────────────────────────

describe('member-state mail sweep', () => {
  for (const [i, row] of AUDIENCE_ROWS.entries()) {
    // Defect caught: a sender's recipient statement forgets one member state,
    // so a deceased, deleted, purged or undeliverable member is mailed; or the
    // sender reaches nobody and every exclusion passes vacuously.
    it(`${row.name}: reaches the live member and none of ${row.excludes.join(', ')}`, async () => {
      await assertRow(row, `mss${i}`);
    });
  }

  for (const [via, row] of Object.entries(ROUTE_PROOFS)) {
    // Defect caught: the shared send path a whole route relies on stops
    // filtering a state, which would leak every key on that route at once.
    it(`the ${via} route: ${row.name} reaches the live member and none of ${row.excludes.join(', ')}`, async () => {
      await assertRow(row, `msr-${via}`);
    });
  }

  for (const [name, row] of Object.entries(STRICT_DRIVERS) as Array<[StrictDriver, SenderRow]>) {
    // Defect caught: a strict send skips the enqueue gate, so its own lookup
    // is the only filter, and a lookup that forgets a state mails it.
    it(`strict ${row.name}: reaches ${(row.reaches ?? ['live']).join(', ')} and none of ${row.excludes.join(', ')}`, async () => {
      await assertRow(row, `mst-${name}`, KNOWN_LEAKS[name]);
    });
  }
});

describe('member-state mail sweep completeness', () => {
  // Defect caught: a new logical email ships with no recipient policy, so no
  // row ever asks who it may reach.
  it('every logical email key has a policy, and every policy names a registered key', () => {
    expect(Object.keys(POLICY).sort()).toEqual(listEmailLogicalKeys());
  });

  // Defect caught: a send site takes a route its key's policy does not
  // declare (made strict, sent to a null member, sent through a different
  // method), so the proof the policy points at no longer covers it.
  it('every send site in the source takes the route its key declares', () => {
    const sites = readSendSites();
    expect(sites.length, 'the send-site scan found nothing; the scanner is broken').toBeGreaterThan(20);
    const mismatches: string[] = [];
    const seen = new Set<string>();
    for (const site of sites) {
      const keys: EmailTemplateKey[] = site.template
        ? [site.template as EmailTemplateKey]
        : (VARIABLE_TEMPLATE_SITES.find((v) => v.file === site.file && v.method === site.method)?.keys ?? []);
      if (keys.length === 0) {
        mismatches.push(`${site.file}: ${site.method} passes its template through a variable no entry declares`);
        continue;
      }
      for (const key of keys) {
        seen.add(key);
        const route = POLICY[key];
        if (!route) {
          mismatches.push(`${site.file}: ${key} has no policy`);
          continue;
        }
        const shape = ROUTE_SHAPE[route.via];
        if (!shape.methods.includes(site.method)) {
          mismatches.push(`${site.file}: ${key} is sent with ${site.method}, but its route ${route.via} uses ${shape.methods.join('/')}`);
        }
        if (site.method === 'send' && site.strict !== shape.strict) {
          mismatches.push(`${site.file}: ${key} is ${site.strict ? '' : 'not '}strict, but its route ${route.via} is ${shape.strict ? '' : 'not '}strict`);
        }
        if (site.method === 'send' && site.memberIdNull !== shape.memberIdNull) {
          mismatches.push(`${site.file}: ${key} ${site.memberIdNull ? 'names no' : 'names a'} member, but its route ${route.via} ${shape.memberIdNull ? 'names none' : 'names one'}`);
        }
      }
    }
    expect(mismatches).toEqual([]);
    // Every key must be found at a send site, or its policy describes nothing.
    expect(listEmailLogicalKeys().filter((k) => !seen.has(k))).toEqual([]);
    // A declared variable-template site that no longer exists widens the hole
    // it was written to describe.
    for (const v of VARIABLE_TEMPLATE_SITES) {
      expect(sites.some((s) => s.file === v.file && s.method === v.method && s.template === null),
        `declared variable-template site still present: ${v.file} ${v.method}`).toBe(true);
    }
  });

  // Defect caught: a recorded leak names a driver or state the sweep no
  // longer exercises, so the record outlives the defect it describes.
  it('every recorded leak names a driven state the driver claims to exclude', () => {
    for (const [driver, leaks] of Object.entries(KNOWN_LEAKS) as Array<[StrictDriver, Partial<Record<MemberState, string>>]>) {
      for (const state of Object.keys(leaks) as MemberState[]) {
        expect(STRICT_DRIVERS[driver].excludes, `${driver} leak on ${state}`).toContain(state);
      }
    }
  });
});
