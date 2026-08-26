/**
 * Test data factories.
 *
 * Each factory inserts one row with sensible defaults and returns the inserted ID.
 * Pass overrides to customize only the fields you care about.
 *
 * Cleanup: the temp DB is dropped in afterAll for the whole file, so per-row
 * cleanup is only needed when a test mutates shared state that a later test reads.
 * For mutation tests, use a fresh per-test DB or wrap in a transaction and roll back.
 */
import { randomUUID } from 'node:crypto';
import BetterSqlite3 from 'better-sqlite3';
import { signJwtLocalSync } from './signJwt';

// Membership / identity / club row builders are defined once in the
// testkit subtree (the only src location permitted to compile SQL
// inline) so the persona harness and these test fixtures share a single
// row-building code path. Re-exported here so existing test imports of
// `../fixtures/factories` keep resolving unchanged.
import {
  insertMember,
  insertTag,
  insertFreeformTag,
  attachMediaTag,
  insertLegacyMember,
  insertHistoricalPerson,
  insertClub,
  insertClubLeader,
  insertClubBootstrapLeader,
  insertClubBootstrapLeaderSignal,
  insertMemberClubAffiliation,
  insertMemberLink,
  insertPersonaNamedGallery,
  insertPayment,
  insertRecurringDonationSubscription,
  insertMemberTierGrant,
  insertActivePlayerGrant,
  insertAuditEntry,
  insertWorkQueueItem,
  insertMemberMessage,
  completeOnboarding,
  insertOnboardingTask,
  insertMailingListSubscription,
  insertLegacyClubCandidate,
  insertLegacyPersonClubAffiliation,
  insertNameVariant,
  insertGivenNameVariant,
  createMemberAtTier,
  createTier0WithActivePlayer,
  createTier3WithUnderlying,
} from '../../src/testkit/personaRowBuilders';

export {
  insertMember,
  insertTag,
  insertFreeformTag,
  attachMediaTag,
  insertLegacyMember,
  insertHistoricalPerson,
  insertClub,
  insertClubLeader,
  insertClubBootstrapLeader,
  insertClubBootstrapLeaderSignal,
  insertMemberClubAffiliation,
  insertMemberLink,
  insertPersonaNamedGallery,
  insertPayment,
  insertRecurringDonationSubscription,
  insertMemberTierGrant,
  insertActivePlayerGrant,
  insertAuditEntry,
  insertWorkQueueItem,
  insertMemberMessage,
  completeOnboarding,
  insertOnboardingTask,
  insertMailingListSubscription,
  insertLegacyClubCandidate,
  insertLegacyPersonClubAffiliation,
  insertNameVariant,
  insertGivenNameVariant,
  createMemberAtTier,
  createTier0WithActivePlayer,
  createTier3WithUnderlying,
};

export type {
  MemberOverrides,
  TagOverrides,
  LegacyMemberOverrides,
  HistoricalPersonOverrides,
  ClubOverrides,
  ClubBootstrapLeaderRole,
  ClubBootstrapLeaderStatus,
  ClubBootstrapLeaderOverrides,
  ClubBootstrapLeaderSignalType,
  ClubBootstrapLeaderSignalOverrides,
  MemberClubAffiliationOverrides,
  MemberLinkOverrides,
  PaymentOverrides,
  MemberTierString,
  MemberTierChangeType,
  MemberTierGrantOverrides,
  ActivePlayerChangeType,
  ActivePlayerGrantOverrides,
  OnboardingTaskType,
  OnboardingTaskState,
  MailingListSubscriptionStatus,
  MailingListSubscriptionOverrides,
  LegacyClubCandidateClassification,
  LegacyClubCandidateOverrides,
  LegacyPersonClubAffiliationOverrides,
  NameVariantOverrides,
  GivenNameVariantOverrides,
  AuditEntryOverrides,
  CreateMemberAtTierOpts,
  CreateTier0WithActivePlayerOpts,
  CreateTier3WithUnderlyingOpts,
} from '../../src/testkit/personaRowBuilders';

const TS  = '2025-01-01T00:00:00.000Z';
const SYS = 'system';

let _counter = 0;
// Counter for in-process ordering plus a UUID tail for cross-process
// uniqueness: e2e spec processes share one live stack database, and a bare
// counter restarts at 0001 in every process, so deterministic ids collide the
// moment two processes (or a retried spec in a fresh worker) seed the same
// table. Mirrors the uid shape in src/testkit/personaRowBuilders.ts.
function uid(): string {
  return `${(++_counter).toString().padStart(4, '0')}_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
}

// ── Session JWT helper ──────────────────────────────────────────────────────
//
// Mints a JWT using the same LocalJwtAdapter keypair the app middleware verifies
// against. Tests that set `.set('Cookie', '__Host-footbag_session=...')` should call
// this helper with the member's id + role + password_version.
//
// The target member row must already exist in the test DB: the middleware
// does a DB lookup and rejects unknown sub ids. Default passwordVersion=1
// matches insertMember's default.

export interface TestSessionJwtOpts {
  memberId: string;
  role?: 'admin' | 'member';
  passwordVersion?: number;
  kid?: string;
  ttlSeconds?: number;
}

export function createTestSessionJwt(opts: TestSessionJwtOpts): string {
  const keypairPath = process.env.JWT_LOCAL_KEYPAIR_PATH;
  if (!keypairPath) {
    throw new Error('JWT_LOCAL_KEYPAIR_PATH must be set (setTestEnv does this).');
  }
  return signJwtLocalSync(
    keypairPath,
    {
      sub: opts.memberId,
      role: opts.role ?? 'member',
      passwordVersion: opts.passwordVersion ?? 1,
    },
    {
      kid: opts.kid,
      ttlSeconds: opts.ttlSeconds,
    },
  );
}

// ── Event ─────────────────────────────────────────────────────────────────────

export interface EventOverrides {
  id?: string;
  hashtag_tag_id?: string;
  title?: string;
  description?: string;
  start_date?: string;
  end_date?: string;
  city?: string;
  region?: string | null;
  country?: string;
  status?: 'draft' | 'reg_open' | 'closed' | 'completed' | 'canceled';
  registration_status?: string;
  sanction_status?: string;
  /** The club that hosted it, which is what gives a club its event history. */
  host_club_id?: string | null;
}

export function insertEvent(db: BetterSqlite3.Database, o: EventOverrides = {}): string {
  const id    = o.id             ?? `event-test-${uid()}`;
  const tagId = o.hashtag_tag_id ?? insertTag(db);
  db.prepare(`
    INSERT INTO events (
      id, hashtag_tag_id, title, description, start_date, end_date,
      city, region, country, status, registration_status, sanction_status,
      host_club_id,
      payment_enabled, currency,
      is_attendee_registration_open, is_tshirt_size_collected,
      created_at, created_by, updated_at, updated_by, version
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 'USD', 0, 0, ?, ?, ?, ?, 1)
  `).run(
    id, tagId,
    o.title              ?? 'Test Event',
    o.description        ?? 'A test event.',
    o.start_date         ?? '2026-06-01',
    o.end_date           ?? '2026-06-03',
    o.city               ?? 'Testville',
    o.region             ?? null,
    o.country            ?? 'US',
    o.status             ?? 'reg_open',
    o.registration_status ?? 'open',
    o.sanction_status    ?? 'none',
    o.host_club_id       !== undefined ? o.host_club_id : null,
    TS, SYS, TS, SYS,
  );
  return id;
}

// ── Event discipline ──────────────────────────────────────────────────────────

export interface DisciplineOverrides {
  id?: string;
  name?: string;
  discipline_category?: string;
  team_type?: string;
  sort_order?: number;
}

export function insertDiscipline(db: BetterSqlite3.Database, eventId: string, o: DisciplineOverrides = {}): string {
  const id = o.id ?? `disc-test-${uid()}`;
  db.prepare(`
    INSERT INTO event_disciplines (id, event_id, name, discipline_category, team_type, sort_order, created_at, created_by, updated_at, updated_by, version)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
  `).run(
    id, eventId,
    o.name                ?? 'Freestyle',
    o.discipline_category ?? 'freestyle',
    o.team_type           ?? 'singles',
    o.sort_order          ?? 1,
    TS, SYS, TS, SYS,
  );
  return id;
}

// ── Results upload ────────────────────────────────────────────────────────────

export function insertResultsUpload(
  db: BetterSqlite3.Database,
  eventId: string,
  memberId: string,
  o: { id?: string; filename?: string } = {},
): string {
  const id = o.id ?? `upload-test-${uid()}`;
  db.prepare(`
    INSERT INTO event_results_uploads (
      id, event_id, uploaded_by_member_id, uploaded_at,
      original_filename, created_at, created_by, updated_at, updated_by, version
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
  `).run(id, eventId, memberId, TS, o.filename ?? 'results.csv', TS, SYS, TS, SYS);
  return id;
}

// ── Result entry ──────────────────────────────────────────────────────────────

export function insertResultEntry(
  db: BetterSqlite3.Database,
  eventId: string,
  uploadId: string,
  disciplineId: string,
  o: { id?: string; placement?: number } = {},
): string {
  const id = o.id ?? `entry-test-${uid()}`;
  db.prepare(`
    INSERT INTO event_result_entries (id, event_id, results_upload_id, discipline_id, placement, created_at, created_by, updated_at, updated_by, version)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
  `).run(id, eventId, uploadId, disciplineId, o.placement ?? 1, TS, SYS, TS, SYS);
  return id;
}

// ── Result entry participant ──────────────────────────────────────────────────

export function insertResultParticipant(
  db: BetterSqlite3.Database,
  resultEntryId: string,
  displayName: string,
  o: { id?: string; participant_order?: number; historical_person_id?: string | null; member_id?: string | null } = {},
): string {
  const id = o.id ?? `part-test-${uid()}`;
  db.prepare(`
    INSERT INTO event_result_entry_participants (id, result_entry_id, participant_order, display_name, historical_person_id, member_id, created_at, created_by, updated_at, updated_by, version)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
  `).run(id, resultEntryId, o.participant_order ?? 1, displayName, o.historical_person_id ?? null, o.member_id ?? null, TS, SYS, TS, SYS);
  return id;
}

// ── Media item ───────────────────────────────────────────────────────────────

export interface MediaItemOverrides {
  id?: string;
  uploader_member_id: string;
  is_avatar?: 0 | 1;
  s3_key_thumb?: string;
  s3_key_display?: string;
  width_px?: number;
  height_px?: number;
  source_filename?: string | null;
  caption?: string | null;
}

export function insertMediaItem(db: BetterSqlite3.Database, o: MediaItemOverrides): string {
  const id = o.id ?? `media-test-${uid()}`;
  db.prepare(`
    INSERT INTO media_items (
      id, created_at, created_by, updated_at, updated_by, version,
      uploader_member_id, media_type, is_avatar, caption, uploaded_at,
      s3_key_thumb, s3_key_display, width_px, height_px, source_filename, mime_type
    ) VALUES (?, ?, 'test', ?, 'test', 1, ?, 'photo', ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, TS, TS,
    o.uploader_member_id,
    o.is_avatar ?? 0,
    o.caption === undefined ? null : o.caption,
    TS,
    o.s3_key_thumb   ?? `test/thumb_${id}.jpg`,
    o.s3_key_display ?? `test/display_${id}.jpg`,
    o.width_px  ?? 800,
    o.height_px ?? 600,
    o.source_filename ?? null,
    'image/jpeg',
  );
  return id;
}

// ── TT lesson media ──────────────────────────────────────────────────────────

/**
 * Attach tag rows to a media item, creating each tag on first use. The
 * normalized form is the lowercased display form, matching the tags-table
 * CHECK constraint and the production tagging path.
 *
 * Distinct from the re-exported `attachMediaTag` (singular), which takes an
 * existing tag's id and throws when that tag row is missing; that guard is
 * deliberate for the persona harness. This one is for fixtures that name a tag
 * by its display form and expect it to come into being.
 */
function attachMediaTags(
  db: BetterSqlite3.Database,
  mediaId: string,
  tagDisplays: string[],
): void {
  for (const tagDisplay of tagDisplays) {
    const tagNormalized = tagDisplay.toLowerCase();
    const tagId = `tag-${tagNormalized.replace(/[^a-z0-9]/g, '_')}`;
    db.prepare(`
      INSERT OR IGNORE INTO tags (
        id, created_at, created_by, updated_at, updated_by, version,
        tag_normalized, tag_display
      ) VALUES (?, ?, 'test', ?, 'test', 1, ?, ?)
    `).run(tagId, TS, TS, tagNormalized, tagDisplay);

    db.prepare(`
      INSERT INTO media_tags (
        id, created_at, created_by, updated_at, updated_by, version,
        media_id, tag_id, tag_display
      ) VALUES (?, ?, 'test', ?, 'test', 1, ?, ?, ?)
    `).run(`mt-${mediaId}-${tagId}`, TS, TS, mediaId, tagId, tagDisplay);
  }
}

export interface TtLessonOverrides {
  uploader_member_id: string;
  ttNumber: number;
  trickSlug: string;       // first non-meta tag attached to the lesson
  videoId: string;         // YouTube ID
  lessonTitle?: string;    // "Knee Stall", etc.; defaults derived from slug
  source_id?: string;      // 'tt_youtube' by default
  caption?: string;        // overrides the auto-generated TT caption
  extraTags?: string[];    // additional tag displays beyond the sidecar three
  id?: string;
}

/**
 * Insert a YouTube URL-reference media_items row matching the TT-lesson sidecar
 * shape: caption "Footbag Lessons - Tricks of the Trade #{N} - {title}",
 * video_platform='youtube', source_id='tt_youtube'. Tags: #<slug>, #freestyle, #trick.
 */
export function insertTtLesson(db: BetterSqlite3.Database, o: TtLessonOverrides): string {
  const id = o.id ?? `media-tt-${o.ttNumber}-${uid()}`;
  const lessonTitle = o.lessonTitle ?? o.trickSlug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  const caption = o.caption ?? `Footbag Lessons - Tricks of the Trade #${o.ttNumber} - ${lessonTitle}`;
  const sourceId = o.source_id ?? 'tt_youtube';

  // Ensure the source row exists (FK to media_sources).
  db.prepare(`
    INSERT OR IGNORE INTO media_sources (source_id, source_name, source_type, url, creator)
    VALUES (?, ?, 'youtube', NULL, NULL)
  `).run(sourceId, sourceId);

  db.prepare(`
    INSERT INTO media_items (
      id, created_at, created_by, updated_at, updated_by, version,
      uploader_member_id, media_type, is_avatar, caption, uploaded_at,
      video_platform, video_id, video_url, thumbnail_url,
      source_id, moderation_status
    ) VALUES (?, ?, 'test', ?, 'test', 1, ?, 'video', 0, ?, ?,
              'youtube', ?, ?, NULL, ?, 'active')
  `).run(
    id, TS, TS,
    o.uploader_member_id,
    caption, TS,
    o.videoId, `https://www.youtube.com/watch?v=${o.videoId}`,
    sourceId,
  );

  // Tag rows: trick slug + #freestyle + #trick (matches sidecar shape).
  attachMediaTags(db, id, [`#${o.trickSlug}`, '#freestyle', '#trick', ...(o.extraTags ?? [])]);

  return id;
}

export interface MemberSubmittedVideoOverrides {
  uploader_member_id: string;
  videoId: string;                 // YouTube id -> video_url
  source_id?: string | null;       // member submissions leave this NULL (default)
  id?: string;
  moderation_status?: string;      // default 'active'
  tags?: string[];                 // tag displays to attach; none by default
}

/**
 * Insert a member-submitted URL-reference video (media_type='video',
 * created_by='member'), mirroring the production insertMemberVideo shape. By
 * default source_id is NULL, matching real member submissions; pass source_id to
 * attribute it to a media source. Pass tags to make the clip discoverable the
 * way a real submission is, for example tagging it with a trick's '#slug'.
 */
export function insertMemberSubmittedVideo(
  db: BetterSqlite3.Database,
  o: MemberSubmittedVideoOverrides,
): string {
  const id = o.id ?? `media-mv-${uid()}`;
  const sourceId = o.source_id === undefined ? null : o.source_id;
  if (sourceId) {
    db.prepare(`
      INSERT OR IGNORE INTO media_sources (source_id, source_name, source_type, url, creator)
      VALUES (?, ?, 'youtube', NULL, NULL)
    `).run(sourceId, sourceId);
  }
  db.prepare(`
    INSERT INTO media_items (
      id, created_at, created_by, updated_at, updated_by, version,
      uploader_member_id, media_type, is_avatar, caption, uploaded_at,
      video_platform, video_id, video_url, thumbnail_url,
      source_id, moderation_status, source_filename
    ) VALUES (?, ?, 'member', ?, 'member', 1, ?, 'video', 0, ?, ?,
              'youtube', ?, ?, NULL, ?, ?, NULL)
  `).run(
    id, TS, TS,
    o.uploader_member_id,
    null, TS,
    o.videoId, `https://www.youtube.com/watch?v=${o.videoId}`,
    sourceId, o.moderation_status ?? 'active',
  );
  attachMediaTags(db, id, o.tags ?? []);
  return id;
}

/**
 * Insert a freestyle_trick_aliases row (alias_slug → trick_slug). Used by TT-view
 * tests to verify alias resolution (e.g. 'neck-catch' → 'neck-stall').
 */
export function insertFreestyleTrickAlias(
  db: BetterSqlite3.Database,
  alias_slug: string,
  trick_slug: string,
  alias_text?: string,
  opts?: { alias_type?: string; alias_display?: 0 | 1 },
): void {
  db.prepare(`
    INSERT INTO freestyle_trick_aliases (
      alias_slug, alias_text, trick_slug, alias_type, alias_display, source_id, notes, created_at
    ) VALUES (?, ?, ?, ?, ?, NULL, NULL, ?)
  `).run(
    alias_slug,
    alias_text ?? alias_slug.replace(/-/g, ' '),
    trick_slug,
    opts?.alias_type ?? 'common',
    opts?.alias_display ?? 1,
    TS,
  );
}

/** Insert a freestyle_trick_sources registry row; returns the source id. */
export function insertFreestyleTrickSource(
  db: BetterSqlite3.Database,
  o: { id?: string; source_type?: string; source_label?: string; source_url?: string | null } = {},
): string {
  const id = o.id ?? `src-${uid()}`;
  db.prepare(`
    INSERT INTO freestyle_trick_sources (id, source_type, source_label, source_url, retrieved_at, notes)
    VALUES (?, ?, ?, ?, ?, NULL)
  `).run(id, o.source_type ?? 'curated', o.source_label ?? 'Curated v1', o.source_url ?? null, TS);
  return id;
}

/** Link a trick to a source (freestyle_trick_source_links). */
export function insertFreestyleTrickSourceLink(
  db: BetterSqlite3.Database,
  trick_slug: string,
  source_id: string,
  o: { external_url?: string | null; asserted_adds?: number | null } = {},
): void {
  db.prepare(`
    INSERT INTO freestyle_trick_source_links
      (trick_slug, source_id, external_ref, external_url, asserted_adds, asserted_notation, asserted_category, notes)
    VALUES (?, ?, NULL, ?, ?, NULL, NULL, NULL)
  `).run(trick_slug, source_id, o.external_url ?? null, o.asserted_adds ?? null);
}

// ── Freestyle record ──────────────────────────────────────────────────────────

export interface FreestyleRecordOverrides {
  id?: string;
  record_type?: string;
  person_id?: string | null;
  display_name?: string | null;
  trick_name?: string | null;
  sort_name?: string | null;
  adds_count?: number | null;
  value_numeric?: number;
  achieved_date?: string | null;
  date_precision?: string;
  source?: string;
  confidence?: string;
  video_url?: string | null;
  video_timecode?: string | null;
  notes?: string | null;
  superseded_by?: string | null;
}

export function insertFreestyleRecord(
  db: BetterSqlite3.Database,
  o: FreestyleRecordOverrides = {},
): string {
  const id = o.id ?? `fr-test-${uid()}`;
  db.prepare(`
    INSERT INTO freestyle_records (
      id, record_type, person_id, display_name,
      trick_name, sort_name, adds_count,
      value_numeric, achieved_date, date_precision,
      source, confidence,
      video_url, video_timecode, notes,
      superseded_by, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    o.record_type    ?? 'trick_consecutive',
    o.person_id      ?? null,
    o.display_name   ?? 'Test Player',
    o.trick_name     ?? 'Test Trick',
    o.sort_name      ?? null,
    o.adds_count     ?? null,
    o.value_numeric  ?? 10,
    o.achieved_date  ?? '2024-01-01',
    o.date_precision ?? 'day',
    o.source         ?? 'passback',
    o.confidence     ?? 'probable',
    o.video_url      ?? null,
    o.video_timecode ?? null,
    o.notes          ?? null,
    o.superseded_by  ?? null,
    TS, TS,
  );
  return id;
}

// ── Consecutive Kicks Record ──────────────────────────────────────────────────

export interface ConsecutiveKicksRecordOverrides {
  id?: string;
  sort_order?: number;
  section?: string;
  subsection?: string;
  division?: string;
  year?: string | null;
  rank?: number | null;
  player_1?: string | null;
  player_2?: string | null;
  score?: number | null;
  note?: string | null;
  event_date?: string | null;
  event_name?: string | null;
  location?: string | null;
  created_at?: string;
  updated_at?: string;
}

let _sortOrderCounter = 9000;

/** Returns the row's stable surrogate id (the primary key). */
export function insertConsecutiveKicksRecord(
  db: BetterSqlite3.Database,
  o: ConsecutiveKicksRecordOverrides = {},
): string {
  const id = o.id ?? `ckr-test-${uid()}`;
  const sort_order = o.sort_order ?? ++_sortOrderCounter;
  db.prepare(`
    INSERT INTO consecutive_kicks_records
      (id, sort_order, section, subsection, division, year, rank,
       player_1, player_2, score, note, event_date, event_name, location,
       created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    sort_order,
    o.section    ?? 'Official World Records',
    o.subsection ?? 'Current Official World Records',
    o.division   ?? 'Open Singles',
    o.year       ?? null,
    o.rank       ?? null,
    o.player_1   ?? 'Test Player',
    o.player_2   ?? null,
    o.score      ?? 1000,
    o.note       ?? null,
    o.event_date ?? null,
    o.event_name ?? null,
    o.location   ?? null,
    o.created_at ?? TS,
    o.updated_at ?? TS,
  );
  return id;
}

// ── Net Team ──────────────────────────────────────────────────────────────────

export interface NetTeamOverrides {
  team_id?:          string;
  person_id_a?:      string;
  person_id_b?:      string;
  first_year?:       number | null;
  last_year?:        number | null;
  appearance_count?: number;
}

export function insertNetTeam(db: BetterSqlite3.Database, o: NetTeamOverrides = {}): string {
  const team_id   = o.team_id    ?? `net-team-${uid()}`;
  const pid_a     = o.person_id_a ?? `person-test-${uid()}`;
  const pid_b     = o.person_id_b ?? `person-test-${uid()}`;
  // Enforce CHECK (person_id_a < person_id_b) from schema
  const [sorted_a, sorted_b] = pid_a < pid_b ? [pid_a, pid_b] : [pid_b, pid_a];
  db.prepare(`
    INSERT INTO net_team
      (team_id, person_id_a, person_id_b, first_year, last_year,
       appearance_count, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    team_id, sorted_a, sorted_b,
    o.first_year       ?? 2010,
    o.last_year        ?? 2015,
    o.appearance_count ?? 1,
    TS, TS,
  );
  return team_id;
}

// ── Net Team Member ───────────────────────────────────────────────────────────

export interface NetTeamMemberOverrides {
  id?:        string;
  team_id:    string;
  person_id:  string;
  position?:  'a' | 'b';
}

export function insertNetTeamMember(
  db: BetterSqlite3.Database,
  o: NetTeamMemberOverrides,
): string {
  const id = o.id ?? `net-member-${uid()}`;
  db.prepare(`
    INSERT INTO net_team_member (id, team_id, person_id, position)
    VALUES (?, ?, ?, ?)
  `).run(id, o.team_id, o.person_id, o.position ?? 'a');
  return id;
}

// ── Net Team Appearance ───────────────────────────────────────────────────────

export interface NetTeamAppearanceOverrides {
  id?:              string;
  team_id:          string;
  event_id:         string;
  discipline_id:    string;
  result_entry_id?: string;
  placement?:       number;
  score_text?:      string | null;
  event_year?:      number;
  evidence_class?:  string;
}

export function insertNetTeamAppearance(
  db: BetterSqlite3.Database,
  o: NetTeamAppearanceOverrides,
): string {
  const id = o.id ?? `net-appearance-${uid()}`;
  db.prepare(`
    INSERT INTO net_team_appearance
      (id, team_id, event_id, discipline_id, result_entry_id,
       placement, score_text, event_year, evidence_class, extracted_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    o.team_id,
    o.event_id,
    o.discipline_id,
    o.result_entry_id ?? `result-test-${uid()}`,
    o.placement       ?? 1,
    o.score_text      ?? null,
    o.event_year      ?? 2010,
    o.evidence_class  ?? 'canonical_only',
    TS,
  );
  return id;
}

// ── Freestyle Trick Dictionary ────────────────────────────────────────────────

export interface FreestyleTrickOverrides {
  slug?:           string;
  canonical_name?: string;
  adds?:           string | null;
  base_trick?:     string | null;
  trick_family?:   string | null;
  category?:       string | null;
  description?:    string | null;
  aliases_json?:   string;
  notation?:       string | null;
  sort_order?:     number;
  review_status?:  string;
  is_active?:      0 | 1;
  // Marks an irreducible dex/body/set primitive. Defaults to 0, the state of
  // every compound row.
  is_core?:        0 | 1;
  // Notation-grammar columns (all nullable; a test that does not opt in
  // gets NULL and is unaffected by them).
  jobs_notation_raw?:        string | null;
  jobs_notation_normalized?: string | null;
  structural_parse_json?:    string | null;
  computed_add_formula?:     string | null;
  computed_adds?:            number | null;
  add_formula_status?:       string | null;
  // Operational notation column (nullable; default NULL).
  operational_notation?:        string | null;
  // Free-form curator-authored provenance / citation line for
  // operational_notation. Nullable; default NULL.
  operational_notation_source?: string | null;
  pronunciation?:               string | null;
  // Curator-authored instructional prose (rendered in the Technique Notes
  // disclosure on trick-detail). All nullable; default NULL.
  short_description?:           string | null;
  execution_summary?:           string | null;
  learning_notes?:              string | null;
  prerequisite_notes?:          string | null;
}

export function insertFreestyleTrick(
  db: BetterSqlite3.Database,
  o: FreestyleTrickOverrides = {},
): string {
  const slug = o.slug ?? `trick-${uid()}`;
  db.prepare(`
    INSERT INTO freestyle_tricks
      (slug, canonical_name, adds, base_trick, trick_family, category,
       description, aliases_json, notation, sort_order, review_status, is_active, is_core, loaded_at,
       jobs_notation_raw, jobs_notation_normalized, structural_parse_json,
       computed_add_formula, computed_adds, add_formula_status,
       operational_notation, operational_notation_source, pronunciation,
       short_description, execution_summary, learning_notes, prerequisite_notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    slug,
    o.canonical_name ?? slug.replace(/-/g, ' '),
    o.adds           ?? '3',
    o.base_trick     ?? null,
    o.trick_family   ?? null,
    o.category       ?? 'compound',
    o.description    ?? null,
    o.aliases_json   ?? '[]',
    o.notation       ?? null,
    o.sort_order     ?? 0,
    o.review_status  ?? 'curated',
    o.is_active      ?? 1,
    o.is_core        ?? 0,
    TS,
    o.jobs_notation_raw         ?? null,
    o.jobs_notation_normalized  ?? null,
    o.structural_parse_json     ?? null,
    o.computed_add_formula      ?? null,
    o.computed_adds             ?? null,
    o.add_formula_status        ?? null,
    o.operational_notation      ?? null,
    o.operational_notation_source ?? null,
    o.pronunciation             ?? null,
    o.short_description         ?? null,
    o.execution_summary         ?? null,
    o.learning_notes            ?? null,
    o.prerequisite_notes        ?? null,
  );
  return slug;
}

// ── Freestyle Trick Tip (legacy footbag.org Member Tips) ──────────────────────

export interface FreestyleTrickTipOverrides {
  trick_slug:          string;          // required: FK to freestyle_tricks(slug)
  tip_text?:           string;
  legacy_hint_id?:     number | null;
  legacy_move_id?:     number | null;
  created_at_legacy?:  number | null;
  modified_at_legacy?: number | null;
  display_order?:      number;
  status?:             string;
  source?:             string;
}

export function insertFreestyleTrickTip(
  db: BetterSqlite3.Database,
  o: FreestyleTrickTipOverrides,
): number {
  const info = db.prepare(`
    INSERT INTO freestyle_trick_tips
      (trick_slug, legacy_hint_id, legacy_move_id, tip_text,
       created_at_legacy, modified_at_legacy, display_order, status, source, loaded_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    o.trick_slug,
    o.legacy_hint_id     ?? null,
    o.legacy_move_id     ?? null,
    o.tip_text           ?? 'Keep your head down and set the bag waist high.',
    o.created_at_legacy  ?? null,
    o.modified_at_legacy ?? null,
    o.display_order      ?? 0,
    o.status             ?? 'published',
    o.source             ?? 'footbag_org_moves2',
    TS,
  );
  return Number(info.lastInsertRowid);
}

export interface NetDisciplineGroupOverrides {
  canonical_group?: string;
  match_method?:    'exact' | 'pattern' | 'fallback';
  review_needed?:   0 | 1;
  conflict_flag?:   0 | 1;
  mapped_by?:       string;
}

/**
 * Annotates a discipline with its canonical net group. conflict_flag = 1 means the
 * discipline matched more than one group pattern, so the stored group is a best guess
 * and the public net events page shows that a review is outstanding.
 */
export function insertNetDisciplineGroup(
  db: BetterSqlite3.Database,
  disciplineId: string,
  o: NetDisciplineGroupOverrides = {},
): string {
  db.prepare(`
    INSERT INTO net_discipline_group
      (discipline_id, canonical_group, match_method, review_needed, conflict_flag,
       mapped_at, mapped_by)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    disciplineId,
    o.canonical_group ?? 'open_doubles',
    o.match_method    ?? 'pattern',
    o.review_needed   ?? 0,
    o.conflict_flag   ?? 0,
    TS,
    o.mapped_by       ?? 'test',
  );
  return disciplineId;
}

// ── Curator media (system-account-owned video tagged for a slot) ─────────────

export interface CuratorVideoOverrides {
  uploaderMemberId: string;
  sourceFilename: string; // e.g. 'demo-freestyle.mp4' — primary slot identity
  slotTag: string;        // e.g. '#demo_freestyle' (must start with '#')
  caption?: string;
  videoKey?: string;      // S3 key stored in video_id (constructURL builds /media-store/{key})
  posterUrl?: string;     // already-constructed CDN URL for the poster
  mediaId?: string;
}

/**
 * Insert a system-account-owned video media_items row tagged with the given
 * slot tag, plus the corresponding tags + media_tags rows. Mirrors the
 * production curator-seed shape so landing-page render code resolves it.
 */
export function insertCuratorVideo(
  db: BetterSqlite3.Database,
  o: CuratorVideoOverrides,
): string {
  const mediaId = o.mediaId ?? `media-curator-${uid()}`;
  const videoKey = o.videoKey ?? `${o.uploaderMemberId}/detached/${mediaId}-video.mp4`;
  const posterUrl = o.posterUrl ?? `/media-store/${o.uploaderMemberId}/detached/${mediaId}-poster-display.jpg`;
  const tagDisplay = o.slotTag;
  const tagNormalized = tagDisplay.toLowerCase();
  const tagId = `tag-${tagNormalized.replace(/[^a-z0-9]/g, '_')}`;

  db.prepare(`
    INSERT INTO media_items (
      id, created_at, created_by, updated_at, updated_by, version,
      uploader_member_id, media_type, is_avatar, caption, uploaded_at,
      video_platform, video_id, video_url, thumbnail_url,
      moderation_status, source_filename, mime_type
    ) VALUES (?, ?, 'seed', ?, 'seed', 1, ?, 'video', 0, ?, ?, 's3', ?, NULL, ?, 'active', ?, ?)
  `).run(
    mediaId, TS, TS,
    o.uploaderMemberId,
    o.caption ?? 'Curator demo video',
    TS,
    videoKey,
    posterUrl,
    o.sourceFilename,
    'video/mp4',
  );

  db.prepare(`
    INSERT OR IGNORE INTO tags (
      id, created_at, created_by, updated_at, updated_by, version,
      tag_normalized, tag_display
    ) VALUES (?, ?, 'seed', ?, 'seed', 1, ?, ?)
  `).run(tagId, TS, TS, tagNormalized, tagDisplay);

  db.prepare(`
    INSERT INTO media_tags (
      id, created_at, created_by, updated_at, updated_by, version,
      media_id, tag_id, tag_display
    ) VALUES (?, ?, 'seed', ?, 'seed', 1, ?, ?, ?)
  `).run(`mt-${mediaId}-${tagId}`, TS, TS, mediaId, tagId, tagDisplay);

  return mediaId;
}

/**
 * Insert a sidecar-backed URL-reference curator media row AND write the
 * matching sidecar JSON file under `<curatedRoot>/<category>/`. Mirrors
 * the seeder's shape so the service's resolveSidecarForRow can find it
 * at edit/delete time. media_id is computed the same way the seeder
 * does (sha1("platform|url")[:24]) so re-running the seeder against the
 * same sidecar produces the same row id.
 */
export interface CuratorUrlReferenceOverrides {
  uploaderMemberId: string;
  curatedRoot: string;
  category: string;
  primarySlug: string;
  videoUrl: string;
  videoPlatform: 'youtube' | 'vimeo';
  videoId: string;
  caption?: string | null;
  thumbnailUrl?: string | null;
  creator?: string | null;
  sourceId?: string | null;
  tier?: string | null;
  tags?: string[];
}

export function insertCuratorUrlReference(
  db: BetterSqlite3.Database,
  o: CuratorUrlReferenceOverrides,
): { mediaId: string; sidecarPath: string; sidecarFilename: string } {
  const tags = o.tags ?? ['#freestyle', '#trick', `#${o.primarySlug}`];
  const userTags = tags.filter((t) => t !== '#curated');

  const fs = require('fs') as typeof import('fs');
  const path = require('path') as typeof import('path');
  const { createHash } = require('crypto') as typeof import('crypto');

  const mediaIdHash = createHash('sha1').update(`${o.videoPlatform}|${o.videoUrl}`).digest('hex').slice(0, 24);
  const mediaId = `media_${mediaIdHash}`;
  const filenameHash = createHash('sha1').update(o.videoUrl).digest('hex').slice(0, 8);
  const sidecarFilename = `${o.primarySlug}_${filenameHash}.meta.json`;

  const categoryDir = path.join(o.curatedRoot, o.category);
  fs.mkdirSync(categoryDir, { recursive: true });
  const sidecarPath = path.join(categoryDir, sidecarFilename);
  const sidecarBody: Record<string, unknown> = {
    videoUrl: o.videoUrl,
    videoPlatform: o.videoPlatform,
  };
  if (o.caption != null) sidecarBody.title = o.caption;
  if (o.creator != null) sidecarBody.creator = o.creator;
  if (o.sourceId != null) sidecarBody.sourceId = o.sourceId;
  if (o.tier != null) sidecarBody.tier = o.tier;
  if (o.thumbnailUrl != null && o.videoPlatform === 'vimeo') {
    sidecarBody.thumbnailUrl = o.thumbnailUrl;
  }
  sidecarBody.tags = userTags;
  fs.writeFileSync(sidecarPath, JSON.stringify(sidecarBody, null, 2) + '\n', 'utf-8');

  db.prepare(`
    INSERT INTO media_items (
      id, created_at, created_by, updated_at, updated_by, version,
      uploader_member_id, media_type, is_avatar, caption, uploaded_at,
      video_platform, video_id, video_url, thumbnail_url,
      moderation_status
    ) VALUES (?, ?, 'seed', ?, 'seed', 1, ?, 'video', 0, ?, ?, ?, ?, ?, ?, 'active')
  `).run(
    mediaId, TS, TS,
    o.uploaderMemberId,
    o.caption ?? null,
    TS,
    o.videoPlatform,
    o.videoId,
    o.videoUrl,
    o.videoPlatform === 'youtube' ? null : (o.thumbnailUrl ?? null),
  );

  // Tags including #curated (seeder auto-prepends).
  const finalTags = Array.from(new Set([...userTags, '#curated'])).sort();
  const insertTag = db.prepare(`
    INSERT OR IGNORE INTO tags (
      id, created_at, created_by, updated_at, updated_by, version,
      tag_normalized, tag_display
    ) VALUES (?, ?, 'seed', ?, 'seed', 1, ?, ?)
  `);
  const selectTagId = db.prepare(`SELECT id FROM tags WHERE tag_normalized = ?`);
  const insertMediaTag = db.prepare(`
    INSERT INTO media_tags (
      id, created_at, created_by, updated_at, updated_by, version,
      media_id, tag_id, tag_display
    ) VALUES (?, ?, 'seed', ?, 'seed', 1, ?, ?, ?)
  `);
  for (const tagDisplay of finalTags) {
    const tagNormalized = tagDisplay.toLowerCase();
    const candidateId = `tag-${tagNormalized.replace(/[^a-z0-9]/g, '_')}-${uid()}`;
    insertTag.run(candidateId, TS, TS, tagNormalized, tagDisplay);
    const existing = selectTagId.get(tagNormalized) as { id: string };
    const tagId = existing.id;
    insertMediaTag.run(`mt-${mediaId}-${tagId}-${uid()}`, TS, TS, mediaId, tagId, tagDisplay);
  }

  return { mediaId, sidecarPath, sidecarFilename };
}

// ── Event registration ────────────────────────────────────────────────────────
//
// Row in the registrations table (event-attendee registration, not member
// account registration). Required as an FK target for AP grants whose
// provenance is `official_event_attendance`.

export interface RegistrationOverrides {
  id?: string;
  registration_type?: 'competitor' | 'attendee_supporter';
  status?: 'pending' | 'confirmed' | 'canceled' | 'rejected';
  attended_at?: string | null;
  /** The registration-fee payment this registration settles. It is how a payment
   *  reaches its event on the admin All Payments view, which joins through here
   *  rather than denormalising an event onto the payment. */
  payment_id?: string | null;
}

export function insertRegistration(
  db: BetterSqlite3.Database,
  eventId: string,
  memberId: string,
  o: RegistrationOverrides = {},
): string {
  const id = o.id ?? `reg-test-${uid()}`;
  db.prepare(`
    INSERT INTO registrations (
      id, created_at, created_by, updated_at, updated_by, version,
      event_id, member_id, registered_at, registration_type, status,
      attended_at, payment_id
    ) VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, TS, SYS, TS, SYS,
    eventId, memberId, TS,
    o.registration_type ?? 'competitor',
    o.status ?? 'confirmed',
    o.attended_at ?? null,
    o.payment_id ?? null,
  );
  return id;
}

// ── Active Player vouch ───────────────────────────────────────────────────────
//
// Append-only direct vouch action by Tier 2 / Tier 3 for a Tier 0 target.
// DB CHECK rejects self-vouch (voucher_member_id = target_member_id).

export interface ActivePlayerVouchOverrides {
  id?: string;
  created_at?: string;
  voucher_member_id: string;
  target_member_id: string;
  vouched_at?: string;
  reason_text?: string | null;
  old_active_player_expires_at?: string | null;
  new_active_player_expires_at?: string | null;
}

// ── Freestyle trick modifier + modifier-link helpers ─────────────────────────
//
// Used by the trick-dictionary tests that exercise ?view=modifier and the
// modifier reference table. Both helpers are minimal wrappers over the raw
// schema; they exist so tests don't have to repeat the INSERT shape.

export interface FreestyleTrickModifierOverrides {
  slug:                 string;
  modifier_name?:       string;
  modifier_type?:       string;        // 'set' | 'body' | 'rotational-qualifier'
  add_bonus?:           number;
  add_bonus_rotational?: number;
  notes?:               string | null;
}

export function insertFreestyleTrickModifier(
  db: BetterSqlite3.Database,
  o: FreestyleTrickModifierOverrides,
): void {
  db.prepare(`
    INSERT INTO freestyle_trick_modifiers
      (slug, modifier_name, add_bonus, add_bonus_rotational, modifier_type, notes, loaded_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    o.slug,
    o.modifier_name ?? o.slug,
    o.add_bonus ?? 1,
    o.add_bonus_rotational ?? 1,
    o.modifier_type ?? 'body',
    o.notes ?? null,
    TS,
  );
}

export function insertFreestyleTrickModifierLink(
  db: BetterSqlite3.Database,
  trick_slug: string,
  modifier_slug: string,
  apply_order: number = 1,
): void {
  db.prepare(`
    INSERT INTO freestyle_trick_modifier_links
      (trick_slug, modifier_slug, apply_order)
    VALUES (?, ?, ?)
  `).run(trick_slug, modifier_slug, apply_order);
}

export function insertFreestyleTrickRelation(
  db: BetterSqlite3.Database,
  from_trick_slug: string,
  to_trick_slug: string,
  o: { relation_type?: string; notes?: string | null } = {},
): void {
  db.prepare(`
    INSERT INTO freestyle_trick_relations
      (from_trick_slug, to_trick_slug, relation_type, notes, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(from_trick_slug, to_trick_slug, o.relation_type ?? 'equivalent_to', o.notes ?? null, TS);
}

export function insertActivePlayerVouch(
  db: BetterSqlite3.Database,
  o: ActivePlayerVouchOverrides,
): string {
  const id = o.id ?? `apv-test-${uid()}`;
  db.prepare(`
    INSERT INTO active_player_vouches (
      id, created_at, created_by,
      voucher_member_id, target_member_id,
      vouched_at, reason_text,
      old_active_player_expires_at, new_active_player_expires_at
    ) VALUES (?, ?, 'system', ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    o.created_at ?? TS,
    o.voucher_member_id,
    o.target_member_id,
    o.vouched_at ?? TS,
    o.reason_text ?? null,
    o.old_active_player_expires_at ?? null,
    o.new_active_player_expires_at ?? null,
  );
  return id;
}

// ── Club Viability Signals ───────────────────────────────────────────────────

export interface ClubViabilitySignalOverrides {
  id?: string;
  created_at?: string;
  member_id?: string;
  // Pass null explicitly to insert a candidate-keyed flag row (an activity
  // answer about an unpromoted candidate); omit for the club-keyed default.
  club_id?: string | null;
  source_stage?: string;
  activity_signal?: string;
  source_entity_type?: string | null;
  source_entity_id?: string | null;
}

export function insertClubViabilitySignal(db: BetterSqlite3.Database, o: ClubViabilitySignalOverrides = {}): string {
  const id = o.id ?? `cvs_${uid()}`;
  db.prepare(`
    INSERT INTO club_viability_signals
      (id, created_at, created_by, member_id, club_id,
       source_stage, activity_signal, source_entity_type, source_entity_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, o.created_at ?? TS, SYS,
    o.member_id ?? `mem_${uid()}`,
    'club_id' in o ? o.club_id : `club_${uid()}`,
    o.source_stage ?? 'stage1b_affiliated',
    o.activity_signal ?? 'active',
    o.source_entity_type ?? null,
    o.source_entity_id ?? null,
  );
  return id;
}

export interface ClubInsightNoteOverrides {
  id?: string;
  created_at?: string;
  member_id?: string;
  club_id?: string | null;
  source_stage?: 'onboarding_club_card' | 'onboarding_club_wrapup';
  note_text?: string | null;
  source_entity_type?: string | null;
  source_entity_id?: string | null;
}

// Member-authored club knowledge from the onboarding wizard. club_id is
// optional: a note about the member's area belongs to no club.
export function insertClubInsightNote(db: BetterSqlite3.Database, o: ClubInsightNoteOverrides = {}): string {
  const id = o.id ?? `cin_${uid()}`;
  db.prepare(`
    INSERT INTO club_insight_notes
      (id, created_at, created_by, member_id, club_id,
       source_stage, note_text, source_entity_type, source_entity_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, o.created_at ?? TS, SYS,
    o.member_id ?? `mem_${uid()}`,
    'club_id' in o ? o.club_id : null,
    o.source_stage ?? 'onboarding_club_card',
    // An explicit null is the purged state an account deletion leaves behind:
    // the row survives, its text does not. Presence, not truthiness, decides,
    // so a test can seed that state instead of getting the default note.
    'note_text' in o ? o.note_text : 'A note a member left about this club.',
    o.source_entity_type ?? null,
    o.source_entity_id ?? null,
  );
  return id;
}

// ── Member galleries ───────────────────────────────────────────────────────────

export interface MemberGalleryOverrides {
  id?: string;
  owner_member_id?: string;
  name?: string;
  description?: string;
  is_default?: number;
  sort_order?: string;
  created_at?: string;
}

// A named gallery (member or curator). Default is_default=0 so it appears on the
// /media/:galleryId surface and in the sitemap. Pass an existing owner_member_id
// (foreign_keys are ON in the test DB).
export function insertMemberGallery(db: BetterSqlite3.Database, o: MemberGalleryOverrides = {}): string {
  const id = o.id ?? `gallery_${uid()}`;
  db.prepare(`
    INSERT INTO member_galleries
      (id, created_at, created_by, updated_at, updated_by, version,
       owner_member_id, name, description, is_default, sort_order)
    VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?)
  `).run(
    id, o.created_at ?? TS, SYS, o.created_at ?? TS, SYS,
    o.owner_member_id ?? `mem_${uid()}`,
    o.name ?? `Gallery ${id}`,
    o.description ?? '',
    o.is_default ?? 0,
    o.sort_order ?? 'upload_desc',
  );
  return id;
}

// One AND-criterion on a named gallery: an item belongs to the gallery only if
// it carries every criterion tag. A personal gallery has exactly one, the
// owner's `#by_<slug>` uploader tag.
export function insertGalleryCriterionTag(
  db: BetterSqlite3.Database,
  galleryId: string,
  tagId: string,
): void {
  db.prepare(`
    INSERT INTO member_gallery_tags (gallery_id, tag_id, created_at, created_by)
    VALUES (?, ?, ?, ?)
  `).run(galleryId, tagId, TS, SYS);
}

// ── Outbox email ───────────────────────────────────────────────────────────────

export interface OutboxEmailOverrides {
  id?: string;
  recipient_email?: string | null;
  recipient_member_id?: string | null;
  mailing_list_id?: string | null;
  subject?: string;
  body_text?: string | null;
  template_key?: string | null;
  status?: 'pending' | 'sending' | 'sent' | 'failed' | 'dead_letter';
  last_error?: string | null;
  sent_at?: string | null;
  created_at?: string;
  /** Which sending stream the row is charged to; the column defaults to transactional. */
  stream?: 'transactional' | 'bulk';
  /** When the drain last tried this row, which is what a dead letter ages on. */
  last_attempt_at?: string | null;
}

export interface MailingListOverrides {
  slug?: string;
  name?: string;
  status?: string;
  /** Whether a member may withdraw themselves; the column defaults to 1. */
  is_member_manageable?: 0 | 1;
  /** Where the recipients come from: their own subscriptions, or a group roster. */
  recipient_source?: 'subscription' | 'group';
  source_group_id?: string | null;
  /** The list's outbound alias; null means the platform default sender. */
  from_identity?: string | null;
  /** Prepended to outgoing subjects; the column defaults to empty. */
  subject_prefix?: string;
  /** Whether composing is limited to a configured sender population. */
  restricted_sending?: 0 | 1;
}

/**
 * A mailing list on its own, with no subscriber.
 *
 * The subscription factory creates a list as a side effect, but only a plain
 * subscription-backed one. A group-backed list, and the manageability flag that
 * decides whether its mail may carry an unsubscribe control, need setting
 * directly.
 */
export function insertMailingList(db: BetterSqlite3.Database, o: MailingListOverrides = {}): string {
  const slug = o.slug ?? `list_${uid()}`;
  db.prepare(`
    INSERT INTO mailing_lists (
      slug, updated_at, name, description, status,
      is_member_manageable, recipient_source, source_group_id,
      from_identity, subject_prefix, restricted_sending
    ) VALUES (?, ?, ?, '', ?, ?, ?, ?, ?, ?, ?)
  `).run(
    slug, TS,
    o.name ?? slug,
    o.status ?? 'active',
    o.is_member_manageable ?? 1,
    o.recipient_source ?? 'subscription',
    o.source_group_id ?? null,
    o.from_identity ?? null,
    o.subject_prefix ?? '',
    o.restricted_sending ?? 0,
  );
  return slug;
}

export function insertOutboxEmail(db: BetterSqlite3.Database, o: OutboxEmailOverrides = {}): string {
  const id = o.id ?? `outbox_${uid()}`;
  const ts = o.created_at ?? TS;
  // The CHECK constraint requires at least one addressing column; default to a
  // recipient_email when the caller supplies none.
  const recipientEmail = o.recipient_email !== undefined ? o.recipient_email
    : (o.recipient_member_id || o.mailing_list_id) ? null : `outbox_${id}@example.com`;
  db.prepare(`
    INSERT INTO outbox_emails (
      id, created_at, created_by, updated_at, updated_by, version,
      recipient_email, recipient_member_id, mailing_list_id,
      subject, body_text, template_key, status, last_error, sent_at,
      stream, last_attempt_at
    ) VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, ts, SYS, ts, SYS,
    recipientEmail,
    o.recipient_member_id ?? null,
    o.mailing_list_id ?? null,
    o.subject ?? 'Test email',
    o.body_text ?? null,
    o.template_key ?? null,
    o.status ?? 'pending',
    o.last_error ?? null,
    o.sent_at ?? null,
    o.stream ?? 'transactional',
    o.last_attempt_at ?? null,
  );
  return id;
}

// ── System config tunable ───────────────────────────────────────────────────
//
// One row in the append-only system_config table. `readIntConfig` and the
// rate-limit buckets read the latest effective value per key through the
// system_config_current view, so effective_start_at defaults to a past
// timestamp and value_json is the raw JSON string (e.g. '2' for an integer cap).

export interface SystemConfigOverrides {
  id?: string;
  config_key: string;
  value_json: string;
  effective_start_at?: string;
  reason_text?: string;
  changed_by_member_id?: string | null;
  created_at?: string;
}

export function insertSystemConfig(db: BetterSqlite3.Database, o: SystemConfigOverrides): string {
  const id = o.id ?? `syscfg_${uid()}`;
  const ts = o.created_at ?? TS;
  db.prepare(`
    INSERT INTO system_config
      (id, created_at, config_key, value_json, effective_start_at, reason_text, changed_by_member_id)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, ts, o.config_key, o.value_json,
    o.effective_start_at ?? ts,
    o.reason_text ?? 'Test tunable',
    o.changed_by_member_id ?? null,
  );
  return id;
}

// ── Email template ───────────────────────────────────────────────────────────
//
// One email_templates row. Every test DB is pre-seeded with the committed
// sidecar set by createTestDb, so this factory exists for overrides: replacing
// a seeded template's wording or flags for a suite (template_key is UNIQUE, so
// INSERT OR REPLACE on the same key supersedes the seeded row).

export interface EmailTemplateOverrides {
  id?: string;
  template_key: string;
  subject_template?: string;
  body_template?: string;
  is_enabled?: number;
  pii_classification?: 'public' | 'internal' | 'confidential' | 'restricted';
}

export function insertEmailTemplate(db: BetterSqlite3.Database, o: EmailTemplateOverrides): string {
  const id = o.id ?? `emailtpl_${uid()}`;
  db.prepare(`
    INSERT OR REPLACE INTO email_templates
      (id, created_at, created_by, updated_at, updated_by, version,
       template_key, subject_template, body_template, is_enabled, pii_classification)
    VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?)
  `).run(
    id, TS, SYS, TS, SYS,
    o.template_key,
    o.subject_template ?? `Test subject for ${o.template_key}`,
    o.body_template ?? 'Hello {memberName},\ntest body.',
    o.is_enabled ?? 1,
    o.pii_classification ?? 'internal',
  );
  return id;
}

// ── Scheduled-job run ────────────────────────────────────────────────────────
//
// One system_job_runs row. A run that is still in flight has no finished_at,
// which is the shape the reaper and the health view both have to survive, so
// finished_at is only defaulted for a terminal status.

export interface SystemJobRunOverrides {
  id?: string;
  job_name?: string;
  started_at?: string;
  finished_at?: string | null;
  status?: 'running' | 'succeeded' | 'failed' | 'aborted';
  details_json?: string;
  last_error?: string | null;
}

export function insertSystemJobRun(db: BetterSqlite3.Database, o: SystemJobRunOverrides = {}): string {
  const id = o.id ?? `jobrun_${uid()}`;
  const startedAt = o.started_at ?? TS;
  const status = o.status ?? 'succeeded';
  const finishedAt = o.finished_at !== undefined
    ? o.finished_at
    : (status === 'running' ? null : startedAt);
  db.prepare(`
    INSERT INTO system_job_runs (
      id, created_at, created_by, updated_at, updated_by, version,
      job_name, started_at, finished_at, status, details_json, last_error
    ) VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?)
  `).run(
    id, startedAt, SYS, startedAt, SYS,
    o.job_name ?? 'SYS_Test_Job',
    startedAt,
    finishedAt,
    status,
    o.details_json ?? '{}',
    o.last_error ?? null,
  );
  return id;
}

// ── Platform alarm ───────────────────────────────────────────────────────────
//
// One system_alarm_events row, as the alarm-notification ingest would write it.

export interface SystemAlarmEventOverrides {
  id?: string;
  alarm_type?: string;
  severity?: 'info' | 'warning' | 'critical';
  raised_at?: string;
  cleared_at?: string | null;
  status?: 'active' | 'cleared' | 'acknowledged';
  acknowledged_by_member_id?: string | null;
  acknowledged_at?: string | null;
  acknowledgment_note?: string | null;
  details_json?: string;
}

export function insertSystemAlarmEvent(
  db: BetterSqlite3.Database,
  o: SystemAlarmEventOverrides = {},
): string {
  const id = o.id ?? `alarm_${uid()}`;
  const raisedAt = o.raised_at ?? TS;
  db.prepare(`
    INSERT INTO system_alarm_events (
      id, created_at, created_by, updated_at, updated_by, version,
      alarm_type, severity, raised_at, cleared_at, status,
      acknowledged_by_member_id, acknowledged_at, acknowledgment_note, details_json
    ) VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, raisedAt, SYS, raisedAt, SYS,
    o.alarm_type ?? 'footbag-test-alarm',
    o.severity ?? 'critical',
    raisedAt,
    o.cleared_at ?? null,
    o.status ?? 'active',
    o.acknowledged_by_member_id ?? null,
    o.acknowledged_at ?? null,
    o.acknowledgment_note ?? null,
    o.details_json ?? '{}',
  );
  return id;
}

// ── SES feedback event ───────────────────────────────────────────────────────
//
// One ses_events row: the idempotency claim the feedback webhook writes per
// processed notification, and the source the health view counts bounce and
// complaint volume from.

export interface SesEventOverrides {
  message_id?: string;
  created_at?: string;
  event_type?: 'bounce' | 'complaint';
  processed_at?: string;
  /** Addresses this one notification covered; the health view sums these
   *  rather than counting rows, because one notification can name several. */
  recipient_count?: number;
}

export function insertSesEvent(db: BetterSqlite3.Database, o: SesEventOverrides = {}): string {
  const messageId = o.message_id ?? `sns_${uid()}`;
  const ts = o.created_at ?? TS;
  db.prepare(`
    INSERT INTO ses_events (message_id, created_at, event_type, processed_at, recipient_count)
    VALUES (?, ?, ?, ?, ?)
  `).run(
    messageId, ts, o.event_type ?? 'bounce', o.processed_at ?? ts,
    o.recipient_count ?? 1,
  );
  return messageId;
}

