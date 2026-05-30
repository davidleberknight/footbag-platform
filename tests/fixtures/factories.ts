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
  insertLegacyMember,
  insertHistoricalPerson,
  insertClub,
  insertClubBootstrapLeader,
  insertClubBootstrapLeaderSignal,
  insertMemberClubAffiliation,
  insertPayment,
  insertMemberTierGrant,
  insertActivePlayerGrant,
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
  insertLegacyMember,
  insertHistoricalPerson,
  insertClub,
  insertClubBootstrapLeader,
  insertClubBootstrapLeaderSignal,
  insertMemberClubAffiliation,
  insertPayment,
  insertMemberTierGrant,
  insertActivePlayerGrant,
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
  CreateMemberAtTierOpts,
  CreateTier0WithActivePlayerOpts,
  CreateTier3WithUnderlyingOpts,
} from '../../src/testkit/personaRowBuilders';

const TS  = '2025-01-01T00:00:00.000Z';
const SYS = 'system';

let _counter = 0;
function uid(): string {
  return (++_counter).toString().padStart(4, '0');
}

// ── Session JWT helper ──────────────────────────────────────────────────────
//
// Mints a JWT using the same LocalJwtAdapter keypair the app middleware verifies
// against. Tests that set `.set('Cookie', 'footbag_session=...')` should call
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
  status?: 'draft' | 'published' | 'completed' | 'cancelled';
  registration_status?: string;
  sanction_status?: string;
}

export function insertEvent(db: BetterSqlite3.Database, o: EventOverrides = {}): string {
  const id    = o.id             ?? `event-test-${uid()}`;
  const tagId = o.hashtag_tag_id ?? insertTag(db);
  db.prepare(`
    INSERT INTO events (
      id, hashtag_tag_id, title, description, start_date, end_date,
      city, region, country, status, registration_status, sanction_status,
      payment_enabled, currency,
      is_attendee_registration_open, is_tshirt_size_collected,
      created_at, created_by, updated_at, updated_by, version
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 'USD', 0, 0, ?, ?, ?, ?, 1)
  `).run(
    id, tagId,
    o.title              ?? 'Test Event',
    o.description        ?? 'A test event.',
    o.start_date         ?? '2026-06-01',
    o.end_date           ?? '2026-06-03',
    o.city               ?? 'Testville',
    o.region             ?? null,
    o.country            ?? 'US',
    o.status             ?? 'published',
    o.registration_status ?? 'open',
    o.sanction_status    ?? 'none',
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
      s3_key_thumb, s3_key_display, width_px, height_px, source_filename
    ) VALUES (?, ?, 'test', ?, 'test', 1, ?, 'photo', ?, ?, ?, ?, ?, ?, ?, ?)
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
  );
  return id;
}

// ── TT lesson media ──────────────────────────────────────────────────────────

export interface TtLessonOverrides {
  uploader_member_id: string;
  ttNumber: number;
  trickSlug: string;       // first non-meta tag attached to the lesson
  videoId: string;         // YouTube ID
  lessonTitle?: string;    // "Knee Stall", etc.; defaults derived from slug
  source_id?: string;      // 'tt_youtube' by default
  caption?: string;        // overrides the auto-generated TT caption
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
  for (const tagDisplay of [`#${o.trickSlug}`, '#freestyle', '#trick']) {
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
    `).run(`mt-${id}-${tagId}`, TS, TS, id, tagId, tagDisplay);
  }

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
): void {
  db.prepare(`
    INSERT INTO freestyle_trick_aliases (
      alias_slug, alias_text, trick_slug, alias_type, source_id, notes, created_at
    ) VALUES (?, ?, ?, 'common', NULL, NULL, ?)
  `).run(alias_slug, alias_text ?? alias_slug.replace(/-/g, ' '), trick_slug, TS);
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
}

let _sortOrderCounter = 9000;

export function insertConsecutiveKicksRecord(
  db: BetterSqlite3.Database,
  o: ConsecutiveKicksRecordOverrides = {},
): number {
  const sort_order = o.sort_order ?? ++_sortOrderCounter;
  db.prepare(`
    INSERT INTO consecutive_kicks_records
      (sort_order, section, subsection, division, year, rank,
       player_1, player_2, score, note, event_date, event_name, location)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
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
  );
  return sort_order;
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

// ── Net Raw Fragment ──────────────────────────────────────────────────────────

export interface NetRawFragmentOverrides {
  id?:            string;
  source_file?:   string;
  source_line?:   number | null;
  raw_text?:      string;
  fragment_type?: 'match_result' | 'bracket_line' | 'placement_block';
  event_hint?:    string | null;
  year_hint?:     number | null;
  parse_status?:  'pending' | 'parsed' | 'unparseable' | 'skipped';
}

export function insertNetRawFragment(
  db: BetterSqlite3.Database,
  o: NetRawFragmentOverrides = {},
): string {
  const id = o.id ?? `net-frag-${uid()}`;
  db.prepare(`
    INSERT INTO net_raw_fragment
      (id, source_file, source_line, raw_text, fragment_type, event_hint, year_hint, parse_status, imported_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    o.source_file   ?? 'test-source.txt',
    o.source_line   ?? null,
    o.raw_text      ?? 'Doubles Net - 1st - Alice/Bob, 2nd - Carol/Dave',
    o.fragment_type ?? 'placement_block',
    o.event_hint    ?? null,
    o.year_hint     ?? null,
    o.parse_status  ?? 'pending',
    TS,
  );
  return id;
}

// ── Net Candidate Match ───────────────────────────────────────────────────────

export interface NetCandidateMatchOverrides {
  candidate_id?:       string;
  fragment_id?:        string | null;
  event_id?:           string | null;
  discipline_id?:      string | null;
  player_a_raw_name?:  string | null;
  player_b_raw_name?:  string | null;
  player_a_person_id?: string | null;
  player_b_person_id?: string | null;
  raw_text?:           string;
  extracted_score?:    string | null;
  round_hint?:         string | null;
  year_hint?:          number | null;
  confidence_score?:   number | null;
  review_status?:      'pending' | 'accepted' | 'rejected' | 'needs_info';
}

export function insertNetCandidateMatch(
  db: BetterSqlite3.Database,
  o: NetCandidateMatchOverrides = {},
): string {
  const id = o.candidate_id ?? `net-cand-${uid()}`;
  db.prepare(`
    INSERT INTO net_candidate_match
      (candidate_id, fragment_id, event_id, discipline_id,
       player_a_raw_name, player_b_raw_name,
       player_a_person_id, player_b_person_id,
       raw_text, extracted_score, round_hint, year_hint,
       confidence_score, evidence_class, review_status, imported_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'unresolved_candidate', ?, ?)
  `).run(
    id,
    o.fragment_id        ?? null,
    o.event_id           ?? null,
    o.discipline_id      ?? null,
    o.player_a_raw_name  ?? null,
    o.player_b_raw_name  ?? null,
    o.player_a_person_id ?? null,
    o.player_b_person_id ?? null,
    o.raw_text           ?? 'Alice defeated Bob 15-10',
    o.extracted_score    ?? null,
    o.round_hint         ?? null,
    o.year_hint          ?? null,
    o.confidence_score   ?? null,
    o.review_status      ?? 'pending',
    TS,
  );
  return id;
}

// ── Net Curated Match ─────────────────────────────────────────────────────────

export interface NetCuratedMatchOverrides {
  curated_id?:          string;
  candidate_id:         string;   // required — must reference an existing net_candidate_match row
  curated_status?:      'approved' | 'rejected';
  event_id?:            string | null;
  discipline_id?:       string | null;
  player_a_person_id?:  string | null;
  player_b_person_id?:  string | null;
  extracted_score?:     string | null;
  raw_text?:            string;
  curator_note?:        string | null;
  curated_by?:          string;
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
  // Phase-0 notation-grammar columns (all nullable; default NULL preserves
  // the pre-Phase-3 behavior for tests that don't opt in).
  jobs_notation_raw?:        string | null;
  jobs_notation_normalized?: string | null;
  structural_parse_json?:    string | null;
  computed_add_formula?:     string | null;
  computed_adds?:            number | null;
  add_formula_status?:       string | null;
  // O1a (2026-05-10) operational notation column (nullable; default NULL).
  operational_notation?:        string | null;
  // O1d (2026-05-10) free-form curator-authored provenance / citation
  // line for operational_notation. Nullable; default NULL.
  operational_notation_source?: string | null;
}

export function insertFreestyleTrick(
  db: BetterSqlite3.Database,
  o: FreestyleTrickOverrides = {},
): string {
  const slug = o.slug ?? `trick-${uid()}`;
  db.prepare(`
    INSERT INTO freestyle_tricks
      (slug, canonical_name, adds, base_trick, trick_family, category,
       description, aliases_json, notation, sort_order, review_status, is_active, loaded_at,
       jobs_notation_raw, jobs_notation_normalized, structural_parse_json,
       computed_add_formula, computed_adds, add_formula_status,
       operational_notation, operational_notation_source)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
    TS,
    o.jobs_notation_raw         ?? null,
    o.jobs_notation_normalized  ?? null,
    o.structural_parse_json     ?? null,
    o.computed_add_formula      ?? null,
    o.computed_adds             ?? null,
    o.add_formula_status        ?? null,
    o.operational_notation      ?? null,
    o.operational_notation_source ?? null,
  );
  return slug;
}

// ── Net Review Queue Item ─────────────────────────────────────────────────────

export interface NetReviewQueueItemOverrides {
  id?:                       string;
  source_file?:              string;
  item_type?:                'quarantine_event' | 'qc_issue';
  priority?:                 1 | 2 | 3 | 4;
  event_id?:                 string | null;
  discipline_id?:            string | null;
  check_id?:                 string | null;
  severity?:                 string;
  reason_code?:              string | null;
  message?:                  string;
  raw_context?:              string | null;
  review_stage?:             string | null;
  resolution_status?:        'open' | 'resolved' | 'wont_fix' | 'escalated';
  resolution_notes?:         string | null;
  resolved_by?:              string | null;
  resolved_at?:              string | null;
  // Classification metadata
  classification?:            string | null;
  proposed_fix_type?:         string | null;
  classification_confidence?: string | null;
  decision_status?:           string | null;
  decision_notes?:            string | null;
  classified_by?:             string | null;
  classified_at?:             string | null;
}

export function insertNetReviewQueueItem(
  db: BetterSqlite3.Database,
  o: NetReviewQueueItemOverrides = {},
): string {
  const id = o.id ?? `net-review-${uid()}`;
  db.prepare(`
    INSERT INTO net_review_queue
      (id, source_file, item_type, priority, event_id, discipline_id, check_id,
       severity, reason_code, message, raw_context, review_stage,
       resolution_status, resolution_notes, resolved_by, resolved_at, imported_at,
       classification, proposed_fix_type, classification_confidence,
       decision_status, decision_notes, classified_by, classified_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    o.source_file              ?? 'test',
    o.item_type                ?? 'qc_issue',
    o.priority                 ?? 3,
    o.event_id                 ?? null,
    o.discipline_id            ?? null,
    o.check_id                 ?? null,
    o.severity                 ?? 'medium',
    o.reason_code              ?? null,
    o.message                  ?? 'Test review item',
    o.raw_context              ?? null,
    o.review_stage             ?? null,
    o.resolution_status        ?? 'open',
    o.resolution_notes         ?? null,
    o.resolved_by              ?? null,
    o.resolved_at              ?? null,
    TS,
    o.classification           ?? null,
    o.proposed_fix_type        ?? null,
    o.classification_confidence ?? null,
    o.decision_status          ?? null,
    o.decision_notes           ?? null,
    o.classified_by            ?? null,
    o.classified_at            ?? null,
  );
  return id;
}

export function insertNetCuratedMatch(
  db: BetterSqlite3.Database,
  o: NetCuratedMatchOverrides,
): string {
  const id = o.curated_id ?? `net-curated-${uid()}`;
  db.prepare(`
    INSERT INTO net_curated_match
      (curated_id, candidate_id, curated_status, evidence_class,
       event_id, discipline_id, player_a_person_id, player_b_person_id,
       extracted_score, raw_text, curator_note,
       curated_at, curated_by)
    VALUES (?, ?, ?, 'curated_enrichment', ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    o.candidate_id,
    o.curated_status      ?? 'approved',
    o.event_id            ?? null,
    o.discipline_id       ?? null,
    o.player_a_person_id  ?? null,
    o.player_b_person_id  ?? null,
    o.extracted_score     ?? null,
    o.raw_text            ?? 'Alice defeated Bob 15-10',
    o.curator_note        ?? null,
    TS,
    o.curated_by          ?? 'operator',
  );
  return id;
}

// ── Net Recovery Alias Candidate ─────────────────────────────────────────────

export interface NetRecoveryAliasCandidateOverrides {
  id?:                    string;
  stub_name?:             string;
  stub_person_id?:        string;
  suggested_person_id?:   string;
  suggested_person_name?: string;
  suggestion_type?:       string;
  confidence?:            string;
  appearance_count?:      number;
  operator_decision?:     string | null;
  operator_notes?:        string | null;
}

export function insertNetRecoveryAliasCandidate(
  db: BetterSqlite3.Database,
  o: NetRecoveryAliasCandidateOverrides = {},
): string {
  const id = o.id ?? `rc-${uid()}`;
  db.prepare(`
    INSERT INTO net_recovery_alias_candidate
      (id, stub_name, stub_person_id, suggested_person_id, suggested_person_name,
       suggestion_type, confidence, appearance_count,
       operator_decision, operator_notes, reviewed_by, reviewed_at, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    o.stub_name             ?? 'J. Test',
    o.stub_person_id        ?? `stub-${uid()}`,
    o.suggested_person_id   ?? `known-${uid()}`,
    o.suggested_person_name ?? 'Jane Test',
    o.suggestion_type       ?? 'abbreviation',
    o.confidence            ?? 'high',
    o.appearance_count      ?? 2,
    o.operator_decision     ?? null,
    o.operator_notes        ?? null,
    o.operator_decision ? 'operator' : null,
    o.operator_decision ? TS : null,
    TS,
  );
  return id;
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
      moderation_status, source_filename
    ) VALUES (?, ?, 'seed', ?, 'seed', 1, ?, 'video', 0, ?, ?, 's3', ?, NULL, ?, 'active', ?)
  `).run(
    mediaId, TS, TS,
    o.uploaderMemberId,
    o.caption ?? 'Curator demo video',
    TS,
    videoKey,
    posterUrl,
    o.sourceFilename,
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
      attended_at
    ) VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?)
  `).run(
    id, TS, SYS, TS, SYS,
    eventId, memberId, TS,
    o.registration_type ?? 'competitor',
    o.status ?? 'confirmed',
    o.attended_at ?? null,
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
// Used by the trick-dictionary tests that exercise ?view=sets and the
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
  member_id?: string;
  club_id?: string;
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
    id, TS, SYS,
    o.member_id ?? `mem_${uid()}`,
    o.club_id ?? `club_${uid()}`,
    o.source_stage ?? 'stage1b_affiliated',
    o.activity_signal ?? 'active',
    o.source_entity_type ?? null,
    o.source_entity_id ?? null,
  );
  return id;
}

