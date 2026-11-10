/**
 * Every column that points at a member is decided twice: does the member's own
 * data download carry it, and what does erasure do to it.
 *
 * A member asking for their data, and a member asking to be forgotten, are
 * both answered table by table, and the table nobody thought of is the one that
 * is silently left out of the download or silently left holding the person
 * after erasure. The foreign keys to the members table are read from the
 * schema itself, so a new table that points at a member fails the
 * completeness check here until somebody decides both questions for it.
 *
 * Each decision is one of:
 *
 * - exported through a named statement, which must read that table and which
 *   the export must call; withheld for a stated reason; or no writer yet, which
 *   holds only while no statement in the application writes that column;
 * - cleared by a named statement on a named erasure path, which must touch that
 *   table and which that path must call; or retained for a stated reason.
 *
 * The export side is always decided: the download answers an access request,
 * which reaches everything held about the member. An erasure decision no
 * design passage makes is recorded as unruled, with the question it leaves, so
 * the open questions are a list in one place rather than an absence nobody can
 * see.
 *
 * Some rows belong to the member without a foreign key to the members table:
 * an audit entry or work-queue item naming the member as its entity, and the
 * rows hanging off the member's own media, galleries and payments. Those links
 * are listed separately, and every foreign key into a table the download
 * carries must appear there, so a new child table is decided too.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import BetterSqlite3 from 'better-sqlite3';
import { setTestEnv, createTestDb, cleanupTestDb } from '../fixtures/testDb';
import { REPO_ROOT } from '../fixtures/sourceTree';

const { dbPath } = setTestEnv('4463');

type Export =
  | { exported: string; reads?: string }
  | { withheld: string }
  | { noWriter: string };

/** A link whose rows are already in the download through the named decision. */
type Covered = { covered: string };

type ErasurePath = 'purge' | 'deceasedScrub' | 'deletion' | 'complianceWindow';

type Erasure =
  | { cleared: string; on: ErasurePath }
  | { retained: string }
  | { unruled: string };

interface Decision {
  export: Export;
  erasure: Erasure;
}

/** Where each erasure path lives: the file and the function that runs it. */
const ERASURE_PATHS: Record<ErasurePath, { file: string; fn: string }> = {
  purge:            { file: 'src/services/memberService.ts', fn: 'function purgeAccountPII(' },
  deceasedScrub:    { file: 'src/services/memberService.ts', fn: 'function scrubDeceasedMemberPII(' },
  deletion:         { file: 'src/services/accountDeletionService.ts', fn: 'async requestAccountDeletion(' },
  complianceWindow: { file: 'src/services/operationsPlatformService.ts', fn: 'async runPiiPurgeScan(' },
};

const EXPORT_FILE = 'src/services/memberDataExportService.ts';

// Reasons, each stated once.
const ACTOR = {
  export: { withheld: 'the column records an act the member performed on somebody else\'s record or on the platform (as administrator, organizer, reviewer or voucher); the download story lists what is held about the member, and this is not among it' },
  erasure: { unruled: 'no passage decides what erasure does to the link naming who performed an act; it is kept today, pointing at the anonymised member row' },
} satisfies Decision;
const VOTES = 'vote records are IFPA governance data whose disposition is the IFPA secretary\'s decision, never an operator job, so erasure does not touch them';
const PUBLIC_RESULTS = 'official results are public historical record, which erasure leaves standing while severing the account from it';
const OPERATIONAL = 'the row is platform bookkeeping about a step already taken, not information about the member';
const NO_ERASURE_RULE = 'no passage decides what erasure does to this row';
const NO_WRITER = 'no statement in the application writes this column, so it holds nothing about any member; the first writer fails this sweep until the download is decided';

/**
 * One decision per foreign-key column to members, keyed `table.column`.
 */
const DECISIONS: Record<string, Decision> = {
  'account_tokens.member_id': {
    export: { withheld: 'single-use credential hashes: the raw token is never stored, so there is nothing the member could use' },
    erasure: { unruled: NO_ERASURE_RULE },
  },
  'active_player_grants.actor_member_id': ACTOR,
  'active_player_grants.member_id': {
    export: { exported: 'memberExport.activePlayerGrantHistory' },
    erasure: { unruled: NO_ERASURE_RULE },
  },
  'active_player_reminder_sent.member_id': { export: { withheld: OPERATIONAL }, erasure: { unruled: NO_ERASURE_RULE } },
  'active_player_vouches.target_member_id': { export: { exported: 'memberExport.vouchesReceived' }, erasure: { unruled: NO_ERASURE_RULE } },
  'active_player_vouches.voucher_member_id': ACTOR,
  'audit_entries.actor_member_id': {
    export: { exported: 'memberExport.ownAuditActions' },
    erasure: { retained: 'erasure does not delete audit history' },
  },
  'ballots.voter_member_id': {
    export: { exported: 'memberExport.voteParticipation' },
    erasure: { retained: VOTES },
  },
  'candidate_cleanup_resolutions.parked_by_member_id': ACTOR,
  'club_bootstrap_leaders.claimed_member_id': {
    export: { withheld: 'a confirmed claim becomes the leadership row the download carries; the bootstrap row is the import\'s provisional candidate for the old-site account, which the download carries as the legacy account' },
    erasure: { unruled: NO_ERASURE_RULE },
  },
  // The roster loader inserts every row with this column empty.
  'club_bootstrap_leaders.imported_member_id': { export: { noWriter: NO_WRITER }, erasure: { unruled: NO_ERASURE_RULE } },
  'club_cleanup_claims.claimed_by_member_id': ACTOR,
  'club_cleanup_resolutions.parked_by_member_id': ACTOR,
  'club_insight_notes.member_id': {
    export: { exported: 'memberExport.clubInsightNotes' },
    erasure: { cleared: 'clubInsightNotes.clearNotesForMember', on: 'purge' },
  },
  'club_leaders.member_id': {
    export: { exported: 'memberExport.clubLeadership' },
    erasure: { retained: 'leadership records stay attributed to the retained member row, which the purge anonymises' },
  },
  'club_viability_signals.member_id': { export: { exported: 'memberExport.clubViabilitySignals' }, erasure: { unruled: NO_ERASURE_RULE } },
  'email_archives.sender_member_id': {
    export: ACTOR.export,
    erasure: { cleared: 'emailArchives.clearSenderForMember', on: 'purge' },
  },
  'event_organizers.member_id': { export: { exported: 'memberExport.eventOrganizerRoles' }, erasure: { unruled: NO_ERASURE_RULE } },
  // The results loader inserts every participant with this column empty; the
  // historical-person link carries the association instead.
  'event_result_entry_participants.member_id': {
    export: { noWriter: NO_WRITER },
    erasure: { retained: PUBLIC_RESULTS },
  },
  'event_results_uploads.uploaded_by_member_id': ACTOR,
  'events.canceled_by_member_id': ACTOR,
  'events.payment_enabled_by_member_id': ACTOR,
  'events.sanction_decided_by_member_id': ACTOR,
  'events.sanction_requested_by_member_id': ACTOR,
  'hof_affidavits.submitted_by_member_id': { export: { noWriter: NO_WRITER }, erasure: { unruled: NO_ERASURE_RULE } },
  'hof_nominations.decided_by_admin_member_id': ACTOR,
  'hof_nominations.nominator_member_id': { export: { noWriter: NO_WRITER }, erasure: { unruled: NO_ERASURE_RULE } },
  'hof_nominations.nominee_member_id': { export: { noWriter: NO_WRITER }, erasure: { unruled: NO_ERASURE_RULE } },
  'legacy_members.claimed_by_member_id': {
    export: { exported: 'legacyMembers.findByLegacyMemberId' },
    erasure: { cleared: 'legacyMembers.clearClaim', on: 'purge' },
  },
  'mailing_list_subscriptions.member_id': {
    export: { exported: 'memberExport.mailingListSubscriptions' },
    erasure: { cleared: 'mailingListSubscriptions.deleteAllForMember', on: 'purge' },
  },
  'media_flags.reporter_member_id': {
    export: { exported: 'memberExport.flagsRaised' },
    erasure: { cleared: 'mediaFlags.scrubTextForMember', on: 'purge' },
  },
  'media_flags.resolved_by_admin_member_id': ACTOR,
  'media_items.uploader_member_id': {
    export: { exported: 'memberExport.media' },
    erasure: { cleared: 'media.deleteMediaItem', on: 'deletion' },
  },
  'media_jobs.admin_member_id': ACTOR,
  'member_club_affiliations.member_id': {
    export: { exported: 'memberExport.clubAffiliations' },
    erasure: { unruled: NO_ERASURE_RULE },
  },
  'member_declared_anchors.member_id': {
    export: { exported: 'declaredAnchors.listByMember' },
    erasure: { cleared: 'declaredAnchors.deleteAllForMember', on: 'purge' },
  },
  'member_galleries.owner_member_id': {
    export: { exported: 'media.listMemberGalleriesByOwner' },
    erasure: { cleared: 'media.deleteMemberGalleryById', on: 'deletion' },
  },
  'member_links.member_id': {
    export: { exported: 'memberLinks.listByMember' },
    erasure: { unruled: NO_ERASURE_RULE },
  },
  'member_messages.recipient_member_id': {
    export: { exported: 'memberExport.messagesReceived' },
    erasure: { cleared: 'memberMessages.scrubTextForMember', on: 'purge' },
  },
  'member_messages.sender_admin_member_id': ACTOR,
  'member_onboarding_tasks.member_id': {
    export: { exported: 'memberExport.onboardingTasks' },
    erasure: { cleared: 'memberOnboarding.clearHeldAnswersForMember', on: 'purge' },
  },
  'member_tier_grants.actor_member_id': ACTOR,
  'member_tier_grants.member_id': {
    export: { exported: 'memberExport.tierGrantHistory' },
    erasure: { unruled: NO_ERASURE_RULE },
  },
  'outbox_emails.recipient_member_id': {
    export: { exported: 'memberExport.mailReceived' },
    erasure: { cleared: 'outbox.scrubForMember', on: 'purge' },
  },
  'outbox_emails.reviewed_by_member_id': ACTOR,
  'outbox_emails.sender_member_id': ACTOR,
  'payments.member_id': {
    export: { exported: 'payments.listByMember' },
    erasure: { cleared: 'payments.anonymizeForCompliance', on: 'complianceWindow' },
  },
  'reconciliation_issues.resolved_by_member_id': ACTOR,
  'recurring_donation_subscription_transitions.member_id': { export: { exported: 'memberExport.recurringDonationTransitions' }, erasure: { unruled: NO_ERASURE_RULE } },
  'recurring_donation_subscriptions.member_id': {
    export: { exported: 'memberExport.recurringDonations' },
    erasure: { unruled: NO_ERASURE_RULE },
  },
  'registration_discipline_selections.partner_member_id': { export: { noWriter: NO_WRITER }, erasure: { unruled: NO_ERASURE_RULE } },
  'registrations.attended_marked_by_member_id': ACTOR,
  'registrations.member_id': {
    export: { exported: 'memberExport.registrations' },
    // Upcoming registrations are withdrawn at the deletion request; past ones
    // stay, because past results keep their references to the retained row.
    erasure: { cleared: 'deceasedMarking.cancelUpcomingRegistrations', on: 'deletion' },
  },
  'system_alarm_events.acknowledged_by_member_id': ACTOR,
  'system_config.changed_by_member_id': ACTOR,
  'tags.retired_by_member_id': ACTOR,
  'vote_eligibility_snapshot.member_id': { export: { noWriter: NO_WRITER }, erasure: { retained: VOTES } },
  'vote_options.nominee_member_id': { export: { noWriter: NO_WRITER }, erasure: { retained: VOTES } },
  'vote_results.published_by_admin_member_id': ACTOR,
  'work_queue_items.claimed_by_member_id': ACTOR,
  'work_queue_items.parked_by_member_id': ACTOR,
  'work_queue_items.resolved_by_member_id': ACTOR,
};

/**
 * Member-linked rows the foreign keys to members do not reach, keyed
 * `table.column`: an entity link naming the member, and every foreign key into
 * a table the download carries. Each is exported, withheld, no writer yet, or
 * covered by a decision whose rows already put both ends in the download.
 */
const LINKS: Record<string, Export | Covered> = {
  // Entity links: the member is the subject, named by id rather than a key.
  'audit_entries.entity_id':    { exported: 'memberExport.auditActionsAbout' },
  'work_queue_items.entity_id': { exported: 'memberExport.workQueueItemsAbout' },

  // Rows hanging off the member's own media, galleries and payments.
  'media_tags.media_id':                     { exported: 'memberExport.mediaTags' },
  'media_flags.media_id':                    { exported: 'memberExport.flagsOnOwnMedia' },
  'member_gallery_tags.gallery_id':          { exported: 'memberExport.galleryTags' },
  'member_gallery_exclude_tags.gallery_id':  { exported: 'memberExport.galleryTags' },
  'gallery_external_links.gallery_id':       { exported: 'memberExport.galleryExternalLinks' },
  'payment_status_transitions.payment_id':   { exported: 'memberExport.paymentTransitions' },
  'media_jobs.media_id': { withheld: 'an administrator\'s upload-pipeline record for curator video, never a member\'s own upload' },
  'reconciliation_issues.payment_id': { withheld: 'an administrator\'s comparison of the platform against the payment provider, carrying provider identifiers; the payment and its transitions are in the download' },
  'reconciliation_issues.subscription_record_id': { withheld: 'an administrator\'s comparison of the platform against the payment provider, carrying provider identifiers; the gift and its transitions are in the download' },
  'ses_events.outbox_email_id': { withheld: 'the mail provider\'s delivery feedback, keyed by its message identifier; its effect on the member is the email status on their own row' },
  'registration_discipline_selections.registration_id': { noWriter: NO_WRITER },

  // Links between rows that are each in the download through their own member key.
  'active_player_grants.related_club_affiliation_id': { covered: 'active_player_grants.member_id' },
  'active_player_grants.related_registration_id':     { covered: 'active_player_grants.member_id' },
  'active_player_grants.related_vouch_id':            { covered: 'active_player_grants.member_id' },
  'member_tier_grants.related_payment_id':            { covered: 'member_tier_grants.member_id' },
  'member_galleries.cover_media_id':                  { covered: 'member_galleries.owner_member_id' },
  'members.avatar_media_id':                          { covered: 'media_items.uploader_member_id' },
  'payments.recurring_subscription_id':               { covered: 'payments.member_id' },
  'registrations.payment_id':                         { covered: 'registrations.member_id' },
  'recurring_donation_subscription_transitions.recurring_subscription_id': { covered: 'recurring_donation_subscription_transitions.member_id' },
  'member_messages.work_queue_item_id':               { covered: 'member_messages.recipient_member_id' },
  'members.legacy_member_id':                         { covered: 'legacy_members.claimed_by_member_id' },

  // Imported records the claimed old-site account links to.
  'historical_persons.legacy_member_id': { withheld: 'the public historical record, which the member row names by its historical person id; its content is the official record, not data held about the account' },
  'legacy_person_club_affiliations.legacy_member_id': { withheld: 'the old-site club rosters onboarding proposed as club cards; the member\'s answers to them are the affiliations, leadership and activity signals the download carries' },
};

/** Links named for an entity id rather than reached by a foreign key. */
const ENTITY_LINKS = ['audit_entries.entity_id', 'work_queue_items.entity_id'];

/**
 * Decisions the design makes that the code does not yet carry out, each naming
 * the defect. The checks below assert the gap is still there, so the fix fails
 * this file until its entry here is replaced by the statement that closes it.
 */
const KNOWN_GAPS: Record<string, { side: 'export' | 'erasure'; table: string; defect: string }> = {};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let dbModule: Record<string, Record<string, any>>;
let fkColumns: string[] = [];
/** Every foreign key in the schema, as `table.column` and the table it targets. */
let allForeignKeys: Array<{ col: string; target: string }> = [];
let schemaColumns = new Set<string>();

/**
 * The file's code with comments removed, so a call that has been commented out
 * no longer counts as made. A `//` directly after a colon or a quote is kept,
 * as the start of a URL inside a string rather than a comment.
 */
function sourceOf(file: string): string {
  return readFileSync(path.join(REPO_ROOT, file), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
}

/** The body of the named function: from its declaration to the next top-level one. */
function bodyOf(file: string, fn: string): string {
  const src = sourceOf(file);
  const start = src.indexOf(fn);
  if (start < 0) throw new Error(`${fn} not found in ${file}`);
  const rest = src.slice(start + fn.length);
  const next = rest.search(/\n(?:export )?(?:async )?function |\n {4}async [a-zA-Z]+\(|\n {2}async [a-zA-Z]+\(/);
  return next < 0 ? rest : rest.slice(0, next);
}

function statementSql(ref: string): string {
  const [group, name] = ref.split('.');
  const stmt = dbModule[group]?.[name];
  if (!stmt) throw new Error(`no statement ${ref} in db.ts`);
  return String(stmt.source);
}

beforeAll(async () => {
  const db = createTestDb(dbPath);
  fkColumns = (db.prepare(`
    SELECT m.name || '.' || p."from" AS col
      FROM sqlite_master m, pragma_foreign_key_list(m.name) p
     WHERE m.type = 'table' AND p."table" = 'members'
     ORDER BY col
  `).all() as Array<{ col: string }>).map((r) => r.col);
  allForeignKeys = db.prepare(`
    SELECT m.name || '.' || p."from" AS col, p."table" AS target
      FROM sqlite_master m, pragma_foreign_key_list(m.name) p
     WHERE m.type = 'table'
     ORDER BY col
  `).all() as Array<{ col: string; target: string }>;
  schemaColumns = new Set((db.prepare(`
    SELECT m.name || '.' || c.name AS col
      FROM sqlite_master m, pragma_table_info(m.name) c
     WHERE m.type = 'table'
  `).all() as Array<{ col: string }>).map((r) => r.col));
  db.close();
  dbModule = (await import('../../src/db/db')) as unknown as typeof dbModule;
});

afterAll(() => cleanupTestDb(dbPath));

describe('member data export and erasure: every member foreign key decided', () => {
  // Defect caught: a new table pointing at a member ships with nobody deciding
  // whether the download carries it or erasure reaches it.
  it('every foreign key to members has a decision, and every decision names a live foreign key', () => {
    expect(fkColumns.length, 'the schema yielded no member foreign keys').toBeGreaterThan(40);
    expect(fkColumns.filter((c) => !DECISIONS[c])).toEqual([]);
    expect(Object.keys(DECISIONS).filter((c) => !fkColumns.includes(c))).toEqual([]);
  });

  // Defect caught: a section the download claims to carry stops being read,
  // or reads a different table, so the member's copy silently loses it.
  it('every exported column is read by a statement the export calls', () => {
    const exportSrc = sourceOf(EXPORT_FILE);
    const wrong: string[] = [];
    const exports: Array<[string, Export | Covered]> = [
      ...Object.entries(DECISIONS).map(([col, d]): [string, Export] => [col, d.export]),
      ...Object.entries(LINKS),
    ];
    for (const [col, e] of exports) {
      if (!('exported' in e) || KNOWN_GAPS[col]?.side === 'export') continue;
      const table = e.reads ?? col.split('.')[0];
      const ref = e.exported;
      if (!new RegExp(`\\b${table}\\b`).test(statementSql(ref))) wrong.push(`${col}: ${ref} does not read ${table}`);
      if (!exportSrc.includes(`${ref}.`)) wrong.push(`${col}: the export never calls ${ref}`);
    }
    expect(wrong).toEqual([]);
  });

  // Defect caught: a column is parked as an open question on the download
  // side, so the member's access request is silently under-answered for it.
  it('every download decision is exported, withheld for a reason, or has no writer yet', () => {
    const undecided = [
      ...Object.entries(DECISIONS).map(([col, d]) => [col, d.export] as const),
      ...Object.entries(LINKS),
    ].filter(([, e]) => !['exported', 'withheld', 'noWriter', 'covered'].some((k) => k in e)
      || Object.keys(e).some((k) => !['exported', 'reads', 'withheld', 'noWriter', 'covered'].includes(k)))
      .map(([col]) => col);
    expect(undecided).toEqual([]);
  });

  // Defect caught: a new table hangs rows off the member's media, galleries or
  // payments, and the download never carries them because no member foreign
  // key points at it.
  it('every foreign key into a table the download carries is decided as a link', () => {
    const carried = new Set([
      ...Object.entries(DECISIONS).filter(([, d]) => 'exported' in d.export).map(([col]) => col.split('.')[0]),
      ...Object.entries(LINKS).filter(([, e]) => 'exported' in e).map(([col]) => col.split('.')[0]),
    ]);
    const children = allForeignKeys
      .filter((fk) => fk.target !== 'members' && carried.has(fk.target))
      .map((fk) => fk.col);
    expect(children.filter((c) => !LINKS[c])).toEqual([]);
    expect(Object.keys(LINKS).filter((c) => !children.includes(c) && !ENTITY_LINKS.includes(c))).toEqual([]);
    expect(ENTITY_LINKS.filter((c) => !schemaColumns.has(c))).toEqual([]);
  });

  // Defect caught: a link is waved through as covered by a decision that does
  // not in fact put its rows in the download.
  it('every covered link names a decision the download exports', () => {
    const wrong = Object.entries(LINKS)
      .filter(([, e]) => 'covered' in e)
      .filter(([, e]) => !('exported' in (DECISIONS[(e as Covered).covered]?.export ?? {})))
      .map(([col, e]) => `${col}: ${(e as Covered).covered}`);
    expect(wrong).toEqual([]);
  });

  // Defect caught: the application starts writing a column recorded as having
  // no writer, so real rows about members exist that the download leaves out.
  it('every column with no writer yet is written by no statement', () => {
    const dbSrc = sourceOf('src/db/db.ts');
    const writes = [...dbSrc.matchAll(/\b(?:INSERT(?:\s+OR\s+\w+)?\s+INTO|UPDATE)\s+(\w+)\b([^`]*)/gi)]
      .map((m) => ({ table: m[1], body: m[2] }));
    const written = [
      ...Object.entries(DECISIONS).map(([col, d]) => [col, d.export] as const),
      ...Object.entries(LINKS),
    ].filter(([, e]) => 'noWriter' in e)
      .map(([col]) => col)
      .filter((col) => {
        const [table, column] = col.split('.');
        return writes.some((w) => w.table === table && new RegExp(`\\b${column}\\b`).test(w.body));
      });
    expect(written).toEqual([]);
  });

  // Defect caught: an erasure step a column relies on is dropped from its
  // path, or writes a different table, so the member's data outlives erasure.
  it('every cleared column is written by a statement its erasure path calls', () => {
    const wrong: string[] = [];
    for (const [col, d] of Object.entries(DECISIONS)) {
      if (!('cleared' in d.erasure) || KNOWN_GAPS[col]?.side === 'erasure') continue;
      const table = col.split('.')[0];
      const { cleared: ref, on } = d.erasure;
      const sql = statementSql(ref);
      if (!new RegExp(`\\b(UPDATE|DELETE FROM|INSERT INTO)\\s+${table}\\b`, 'i').test(sql)) {
        wrong.push(`${col}: ${ref} does not write ${table}`);
      }
      const { file, fn } = ERASURE_PATHS[on];
      if (!bodyOf(file, fn).includes(`${ref}.run(`)) wrong.push(`${col}: the ${on} path never runs ${ref}`);
    }
    expect(wrong).toEqual([]);
  });

  // Defect caught: a recorded gap is closed (or moves) without its record
  // being updated, so the register states a defect that no longer exists.
  it('each recorded gap is still open exactly as recorded', () => {
    const exportSrc = sourceOf(EXPORT_FILE);
    for (const [col, gap] of Object.entries(KNOWN_GAPS)) {
      expect(DECISIONS[col], `gap ${col} has a decision`).toBeDefined();
      if (gap.side === 'export') {
        const reads = Object.entries(dbModule)
          .flatMap(([group, stmts]) => Object.keys(Object.getOwnPropertyDescriptors(stmts))
            .filter((name) => exportSrc.includes(`${group}.${name}.`))
            .map((name) => `${group}.${name}`))
          .filter((ref) => new RegExp(`\\b${gap.table}\\b`).test(statementSql(ref)));
        expect(reads, `${col}: ${gap.defect}`).toEqual([]);
      } else {
        const paths = Object.values(ERASURE_PATHS).map(({ file, fn }) => bodyOf(file, fn)).join('\n');
        const writes = [...paths.matchAll(/\b([a-zA-Z]+)\.([a-zA-Z]+)\.run\(/g)]
          .map((m) => `${m[1]}.${m[2]}`)
          .filter((ref) => dbModule[ref.split('.')[0]]?.[ref.split('.')[1]])
          .filter((ref) => new RegExp(`\\b(UPDATE|DELETE FROM)\\s+${gap.table}\\b`, 'i').test(statementSql(ref)));
        expect(writes, `${col}: ${gap.defect}`).toEqual([]);
      }
    }
  });

  // Defect caught: the export reads a table with SELECT *, so a column added
  // later (a provider identifier, a hash) flows into the member's file unseen.
  it('no statement the export calls selects every column', () => {
    const exportSrc = sourceOf(EXPORT_FILE);
    const star = [...exportSrc.matchAll(/\b([a-zA-Z]+)\.([a-zA-Z]+)\.(?:get|all|iterate)\(/g)]
      .map((m) => `${m[1]}.${m[2]}`)
      .filter((ref) => dbModule[ref.split('.')[0]]?.[ref.split('.')[1]])
      // A bare `*` or a table-qualified `t.*`, first in the list or after a comma.
      .filter((ref) => /(?:SELECT\s+(?:DISTINCT\s+)?|,\s*)(?:\w+\.)?\*/i.test(statementSql(ref)));
    expect([...new Set(star)]).toEqual([]);
  });
});
