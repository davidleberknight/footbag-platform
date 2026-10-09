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
 *   the export must call; or withheld for a stated reason;
 * - cleared by a named statement on a named erasure path, which must touch that
 *   table and which that path must call; or retained for a stated reason.
 *
 * A decision no design passage makes is recorded as unruled, with the question
 * it leaves, so the open questions are a list in one place rather than an
 * absence nobody can see.
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
  | { unruled: string };

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
const NOT_LISTED = 'not among the contents the data-download story enumerates; whether the right of access reaches it is not decided';
const NO_ERASURE_RULE = 'no passage decides what erasure does to this row';

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
    export: { exported: 'activePlayer.getCurrent', reads: 'member_active_player_current' },
    erasure: { unruled: NO_ERASURE_RULE },
  },
  'active_player_reminder_sent.member_id': { export: { withheld: OPERATIONAL }, erasure: { unruled: NO_ERASURE_RULE } },
  'active_player_vouches.target_member_id': { export: { unruled: NOT_LISTED }, erasure: { unruled: NO_ERASURE_RULE } },
  'active_player_vouches.voucher_member_id': ACTOR,
  'audit_entries.actor_member_id': {
    // The download story lists audit entries where the member is the actor.
    export: { exported: 'MISSING' },
    erasure: { retained: 'erasure does not delete audit history' },
  },
  'ballots.voter_member_id': {
    export: { exported: 'memberExport.voteParticipation' },
    erasure: { retained: VOTES },
  },
  'candidate_cleanup_resolutions.parked_by_member_id': ACTOR,
  'club_bootstrap_leaders.claimed_member_id': { export: { unruled: NOT_LISTED }, erasure: { unruled: NO_ERASURE_RULE } },
  'club_bootstrap_leaders.imported_member_id': { export: { unruled: NOT_LISTED }, erasure: { unruled: NO_ERASURE_RULE } },
  'club_cleanup_claims.claimed_by_member_id': ACTOR,
  'club_cleanup_resolutions.parked_by_member_id': ACTOR,
  'club_insight_notes.member_id': {
    export: { unruled: NOT_LISTED },
    erasure: { cleared: 'clubInsightNotes.clearNotesForMember', on: 'purge' },
  },
  'club_leaders.member_id': {
    export: { exported: 'memberExport.clubLeadership' },
    erasure: { retained: 'leadership records stay attributed to the retained member row, which the purge anonymises' },
  },
  'club_viability_signals.member_id': { export: { unruled: NOT_LISTED }, erasure: { unruled: NO_ERASURE_RULE } },
  'email_archives.sender_member_id': {
    export: { unruled: NOT_LISTED },
    erasure: { cleared: 'emailArchives.clearSenderForMember', on: 'purge' },
  },
  'event_organizers.member_id': { export: { unruled: NOT_LISTED }, erasure: { unruled: NO_ERASURE_RULE } },
  'event_result_entry_participants.member_id': {
    export: { unruled: 'the download story lists "participation data" beside registrations, and whether that means official results is not decided' },
    erasure: { retained: PUBLIC_RESULTS },
  },
  'event_results_uploads.uploaded_by_member_id': ACTOR,
  'events.canceled_by_member_id': ACTOR,
  'events.payment_enabled_by_member_id': ACTOR,
  'events.sanction_decided_by_member_id': ACTOR,
  'events.sanction_requested_by_member_id': ACTOR,
  'hof_affidavits.submitted_by_member_id': { export: { unruled: NOT_LISTED }, erasure: { unruled: NO_ERASURE_RULE } },
  'hof_nominations.decided_by_admin_member_id': ACTOR,
  'hof_nominations.nominator_member_id': { export: { unruled: NOT_LISTED }, erasure: { unruled: NO_ERASURE_RULE } },
  'hof_nominations.nominee_member_id': { export: { unruled: NOT_LISTED }, erasure: { unruled: NO_ERASURE_RULE } },
  'legacy_members.claimed_by_member_id': {
    export: { exported: 'legacyMembers.findByLegacyMemberId' },
    erasure: { cleared: 'legacyMembers.clearClaim', on: 'purge' },
  },
  'mailing_list_subscriptions.member_id': {
    export: { exported: 'memberExport.mailingListSubscriptions' },
    erasure: { cleared: 'mailingListSubscriptions.deleteAllForMember', on: 'purge' },
  },
  'media_flags.reporter_member_id': {
    export: { unruled: NOT_LISTED },
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
    export: { unruled: NOT_LISTED },
    erasure: { cleared: 'memberMessages.scrubTextForMember', on: 'purge' },
  },
  'member_messages.sender_admin_member_id': ACTOR,
  'member_onboarding_tasks.member_id': { export: { withheld: OPERATIONAL }, erasure: { unruled: NO_ERASURE_RULE } },
  'member_tier_grants.actor_member_id': ACTOR,
  'member_tier_grants.member_id': {
    export: { exported: 'memberTier.getCurrent', reads: 'member_tier_current' },
    erasure: { unruled: NO_ERASURE_RULE },
  },
  'outbox_emails.recipient_member_id': {
    export: { unruled: NOT_LISTED },
    erasure: { cleared: 'outbox.scrubForMember', on: 'purge' },
  },
  'outbox_emails.reviewed_by_member_id': ACTOR,
  'outbox_emails.sender_member_id': ACTOR,
  'payments.member_id': {
    export: { exported: 'payments.listByMember' },
    erasure: { cleared: 'payments.anonymizeForCompliance', on: 'complianceWindow' },
  },
  'reconciliation_issues.resolved_by_member_id': ACTOR,
  'recurring_donation_subscription_transitions.member_id': { export: { unruled: NOT_LISTED }, erasure: { unruled: NO_ERASURE_RULE } },
  'recurring_donation_subscriptions.member_id': {
    export: { exported: 'memberExport.recurringDonations' },
    erasure: { unruled: NO_ERASURE_RULE },
  },
  'registration_discipline_selections.partner_member_id': { export: { unruled: NOT_LISTED }, erasure: { unruled: NO_ERASURE_RULE } },
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
  'vote_eligibility_snapshot.member_id': { export: { unruled: NOT_LISTED }, erasure: { retained: VOTES } },
  'vote_options.nominee_member_id': { export: { unruled: NOT_LISTED }, erasure: { retained: VOTES } },
  'vote_results.published_by_admin_member_id': ACTOR,
  'work_queue_items.claimed_by_member_id': ACTOR,
  'work_queue_items.parked_by_member_id': ACTOR,
  'work_queue_items.resolved_by_member_id': ACTOR,
};

/**
 * Decisions the design makes that the code does not yet carry out, each naming
 * the defect. The checks below assert the gap is still there, so the fix fails
 * this file until its entry here is replaced by the statement that closes it.
 */
const KNOWN_GAPS: Record<string, { side: 'export' | 'erasure'; table: string; defect: string }> = {
  'audit_entries.actor_member_id': {
    side: 'export',
    table: 'audit_entries',
    defect: 'the download story lists audit entries where the member is the actor, and the export reads no audit statement at all; the service header says the ledger is excluded, so the code and the story disagree',
  },
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let dbModule: Record<string, Record<string, any>>;
let fkColumns: string[] = [];

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
    for (const [col, d] of Object.entries(DECISIONS)) {
      if (!('exported' in d.export) || KNOWN_GAPS[col]?.side === 'export') continue;
      const table = d.export.reads ?? col.split('.')[0];
      const ref = d.export.exported;
      if (!new RegExp(`\\b${table}\\b`).test(statementSql(ref))) wrong.push(`${col}: ${ref} does not read ${table}`);
      if (!exportSrc.includes(`${ref}.`)) wrong.push(`${col}: the export never calls ${ref}`);
    }
    expect(wrong).toEqual([]);
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
