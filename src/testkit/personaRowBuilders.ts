/**
 * Membership / identity / club row-building primitives.
 *
 * Single source for the member-plus-supporting-rows inserts. The test
 * fixtures (tests/fixtures/factories.ts) re-export these, and the persona
 * harness composes them, so a persona's row shape is identical whether it is
 * instantiated in-process for a test or seeded into the dev database for a
 * browser session. There is exactly one implementation of each insert.
 *
 * Lives under src/testkit/ (permanent test scaffolding) because it is one of
 * the src subtrees the convention gate allowlists for raw inline `.prepare(`
 * (src/testkit/ and src/dev-bootstrap/). As permanent test infrastructure it
 * is excluded from the production image at build time but is never
 * source-deleted at cutover.
 *
 * Each builder inserts one row with sensible defaults and returns the inserted
 * id. Pass overrides to customize only the fields a caller cares about. No
 * config or environment dependency: every builder takes an explicit db handle
 * and plain arguments, so importing this module never loads the config
 * singleton ahead of a test's environment setup.
 */
import BetterSqlite3 from 'better-sqlite3';
import { randomUUID } from 'node:crypto';

const TS  = '2025-01-01T00:00:00.000Z';
const SYS = 'system';

let _counter = 0;
/**
 * Unique test-row id. The crypto-random suffix is what makes the id unique -- it
 * is generated the same way the application generates its own row ids, so an id
 * never collides even when a second process (the live E2E dev server) writes the
 * same database or the test module's counter restarts. The counter prefix
 * carries no uniqueness guarantee on its own; it only keeps ids readable and in
 * insertion order under a lexical sort.
 */
export function uid(): string {
  return `${(++_counter).toString().padStart(4, '0')}_${randomUUID().replace(/-/g, '')}`;
}

// ── Member ────────────────────────────────────────────────────────────────────

export interface MemberOverrides {
  id?: string;
  slug?: string;
  login_email?: string;
  real_name?: string;
  display_name?: string;
  city?: string | null;
  country?: string | null;
  password_hash?: string;
  email_verified_at?: string | null;
  is_admin?: 0 | 1;
  is_system?: 0 | 1;
  is_board?: 0 | 1;
  is_hof?: 0 | 1;
  hof_inducted_year?: number | null;
  is_bap?: 0 | 1;
  is_deceased?: 0 | 1;
  deceased_at?: string | null;
  deceased_note?: string | null;
  deleted_at?: string | null;
  deletion_requested_at?: string | null;
  deletion_grace_expires_at?: string | null;
  personal_data_purged_at?: string | null;
  show_competitive_results?: 0 | 1;
  show_first_competition_year?: 0 | 1;
  gender?: 'male' | 'female' | 'undisclosed' | null;
  show_gender?: 0 | 1;
  legacy_member_id?: string | null;
  historical_person_id?: string | null;
  first_competition_year?: number | null;
  bio?: string;
  birth_date?: string | null;
  searchable?: 0 | 1;
  password_version?: number;
}

export function insertMember(db: BetterSqlite3.Database, o: MemberOverrides = {}): string {
  const id      = o.id            ?? `member-test-${uid()}`;
  const slug    = o.slug          ?? `test_user_${uid()}`;
  const name    = o.real_name     ?? 'Test User';
  const display = o.display_name  ?? name;
  const purged   = o.personal_data_purged_at ?? null;
  const isSystem = (o.is_system ?? 0) === 1;

  // Three-branch credential-state invariant: live, purged, or system-member.
  // Purged and system-member rows both have all credential fields NULL.
  const noCredentials    = isSystem || !!purged;
  const email            = noCredentials ? null : (o.login_email ?? `test-${uid()}@example.com`);
  const emailNormalized  = email ? email.toLowerCase() : null;
  const emailVerifiedAt  = noCredentials ? null : (o.email_verified_at !== undefined ? o.email_verified_at : TS);
  const passwordHash     = noCredentials ? null : (o.password_hash ?? '[TEST_HASH]');
  const passwordChanged  = noCredentials ? null : TS;

  if (o.legacy_member_id) {
    const existing = db.prepare(`SELECT 1 FROM legacy_members WHERE legacy_member_id = ?`).get(o.legacy_member_id);
    if (!existing) {
      insertLegacyMember(db, { legacy_member_id: o.legacy_member_id });
    }
  }

  if (o.historical_person_id) {
    const existing = db.prepare(`SELECT 1 FROM historical_persons WHERE person_id = ?`).get(o.historical_person_id);
    if (!existing) {
      insertHistoricalPerson(db, { person_id: o.historical_person_id, person_name: name });
    }
  }

  db.prepare(`
    INSERT INTO members (
      id, slug,
      login_email, login_email_normalized, email_verified_at,
      password_hash, password_changed_at, password_version,
      real_name, display_name, display_name_normalized,
      bio, birth_date, city, country,
      is_admin, is_system, is_board, is_hof, hof_inducted_year, is_bap, is_deceased, deceased_at, deceased_note,
      searchable,
      deleted_at, deletion_requested_at, deletion_grace_expires_at, personal_data_purged_at,
      show_competitive_results, show_first_competition_year, gender, show_gender, legacy_member_id, historical_person_id, first_competition_year,
      created_at, created_by, updated_at, updated_by, version
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
  `).run(
    id, slug,
    email, emailNormalized, emailVerifiedAt,
    passwordHash, passwordChanged, o.password_version ?? 1,
    name, display, display.toLowerCase(),
    o.bio ?? '', o.birth_date ?? null, o.city === null ? null : (o.city ?? 'Testville'), o.country === null ? null : (o.country ?? 'US'),
    o.is_admin ?? 0, o.is_system ?? 0, o.is_board ?? 0, o.is_hof ?? 0, o.hof_inducted_year ?? null, o.is_bap ?? 0, o.is_deceased ?? 0, o.deceased_at ?? null, o.deceased_note ?? null,
    o.searchable ?? 1,
    o.deleted_at ?? null, o.deletion_requested_at ?? null, o.deletion_grace_expires_at ?? null, purged,
    o.show_competitive_results ?? 1, o.show_first_competition_year ?? 0, o.gender ?? null, o.show_gender ?? 0, o.legacy_member_id ?? null, o.historical_person_id ?? null, o.first_competition_year ?? null,
    TS, SYS, TS, SYS,
  );
  return id;
}

// ── Tag ───────────────────────────────────────────────────────────────────────

export interface TagOverrides {
  id?: string;
  tag_normalized?: string;
  tag_display?: string;
  standard_type?: string;
}

export function insertTag(db: BetterSqlite3.Database, o: TagOverrides = {}): string {
  const id         = o.id             ?? `tag-test-${uid()}`;
  const normalized = o.tag_normalized ?? `#event_test_${uid()}`;
  const display    = o.tag_display    ?? normalized;
  db.prepare(`
    INSERT INTO tags (id, tag_normalized, tag_display, is_standard, standard_type, created_at, created_by, updated_at, updated_by, version)
    VALUES (?, ?, ?, 1, ?, ?, ?, ?, ?, 1)
  `).run(id, normalized, display, o.standard_type ?? 'event', TS, SYS, TS, SYS);
  return id;
}

// ── Member named gallery + one matching media item ────────────────────────────
//
// Seeds a member-owned named gallery (is_default=0, so it is a deliberately
// named gallery rather than the auto-default Personal Gallery) plus one uploaded
// media item that resolves into it. The gallery's sole criteria tag is the
// owner's `#by_<slug>` uploader tag and the media item carries the same tag, so
// the gallery resolves to exactly one item through the standard tag-AND query.
// The uploader tag is freeform (is_standard=0); insertTag only produces standard
// tags, so the tag is inlined here.
export interface PersonaNamedGalleryOverrides {
  galleryId: string;
  ownerMemberId: string;
  ownerSlug: string;
  name: string;
  description?: string;
}

export function insertPersonaNamedGallery(
  db: BetterSqlite3.Database,
  o: PersonaNamedGalleryOverrides,
): string {
  const byTag = `#by_${o.ownerSlug}`;
  // The uploader tag may already exist (a prior upload flow, or a prior seed not
  // yet torn down): reuse it, otherwise create it freeform (is_standard=0).
  const existingTag = db.prepare(`SELECT id FROM tags WHERE tag_normalized = ?`).get(byTag) as
    | { id: string }
    | undefined;
  const byTagId = existingTag?.id ?? `tag-by-${o.ownerSlug}`;
  if (!existingTag) {
    db.prepare(`
      INSERT INTO tags (id, tag_normalized, tag_display, is_standard, standard_type, created_at, created_by, updated_at, updated_by, version)
      VALUES (?, ?, ?, 0, NULL, ?, ?, ?, ?, 1)
    `).run(byTagId, byTag, byTag, TS, SYS, TS, SYS);
  }

  db.prepare(`
    INSERT INTO member_galleries (
      id, created_at, created_by, updated_at, updated_by, version,
      owner_member_id, name, description, is_default
    ) VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, 0)
  `).run(o.galleryId, TS, SYS, TS, SYS, o.ownerMemberId, o.name, o.description ?? '');

  db.prepare(`
    INSERT INTO member_gallery_tags (gallery_id, tag_id, created_at, created_by)
    VALUES (?, ?, ?, ?)
  `).run(o.galleryId, byTagId, TS, SYS);

  // The gallery is seeded empty: its media is created by a real click-through
  // upload in the end-to-end test, so the upload path is genuinely exercised
  // rather than faked with a pre-inserted row that has no media-store bytes.
  return o.galleryId;
}

// ── Legacy member (three-table design: members + legacy_members + historical_persons) ─
//
// Row in legacy_members table — the imported-legacy-account entity.
// Returns the legacy_member_id (PK).
// ---------------------------------------------------------------------------
export interface LegacyMemberOverrides {
  legacy_member_id?: string;
  legacy_user_id?: string | null;
  legacy_email?: string | null;
  legacy_email2?: string | null;
  legacy_email3?: string | null;
  real_name?: string | null;
  display_name?: string | null;
  city?: string | null;
  region?: string | null;
  country?: string | null;
  bio?: string | null;
  birth_date?: string | null;
  street_address?: string | null;
  postal_code?: string | null;
  ifpa_join_date?: string | null;
  first_competition_year?: number | null;
  is_hof?: 0 | 1;
  is_bap?: 0 | 1;
  legacy_is_admin?: 0 | 1;
  import_source?: string | null;
  claimed_by_member_id?: string | null;
  claimed_at?: string | null;
}

export function insertLegacyMember(db: BetterSqlite3.Database, o: LegacyMemberOverrides = {}): string {
  const legacyId = o.legacy_member_id ?? `legmem-${uid()}`;
  const name     = o.real_name        ?? 'Legacy Member';
  const display  = o.display_name     ?? name;
  // Upsert: an earlier insertHistoricalPerson or insertMember may have
  // auto-created a stub legacy_members row; replace with this fuller row.
  db.prepare(`
    INSERT INTO legacy_members (
      legacy_member_id,
      legacy_user_id, legacy_email, legacy_email2, legacy_email3,
      real_name, display_name, display_name_normalized,
      city, region, country,
      bio, birth_date, street_address, postal_code,
      ifpa_join_date, first_competition_year,
      is_hof, is_bap, legacy_is_admin,
      import_source, imported_at,
      version
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    ON CONFLICT(legacy_member_id) DO UPDATE SET
      legacy_user_id = excluded.legacy_user_id,
      legacy_email = excluded.legacy_email,
      legacy_email2 = excluded.legacy_email2,
      legacy_email3 = excluded.legacy_email3,
      real_name = excluded.real_name,
      display_name = excluded.display_name,
      display_name_normalized = excluded.display_name_normalized,
      city = excluded.city,
      region = excluded.region,
      country = excluded.country,
      bio = excluded.bio,
      birth_date = excluded.birth_date,
      street_address = excluded.street_address,
      postal_code = excluded.postal_code,
      ifpa_join_date = excluded.ifpa_join_date,
      first_competition_year = excluded.first_competition_year,
      is_hof = excluded.is_hof,
      is_bap = excluded.is_bap,
      legacy_is_admin = excluded.legacy_is_admin,
      import_source = excluded.import_source,
      imported_at = excluded.imported_at
  `).run(
    legacyId,
    o.legacy_user_id ?? null,
    // Legacy emails are stored lowercase, mirroring the real loader: the claim
    // lookup seeks the plain (binary) email indexes with a lowercased lookup
    // value, so a mixed-case stored address would never match.
    o.legacy_email ? o.legacy_email.toLowerCase() : null,
    o.legacy_email2 ? o.legacy_email2.toLowerCase() : null,
    o.legacy_email3 ? o.legacy_email3.toLowerCase() : null,
    name,
    display,
    display.toLowerCase(),
    o.city ?? null,
    o.region ?? null,
    o.country ?? null,
    o.bio ?? null,
    o.birth_date ?? null,
    o.street_address ?? null,
    o.postal_code ?? null,
    o.ifpa_join_date ?? null,
    o.first_competition_year ?? null,
    o.is_hof ?? 0,
    o.is_bap ?? 0,
    o.legacy_is_admin ?? 0,
    o.import_source ?? 'test',
    TS,
  );
  if (o.claimed_by_member_id && o.claimed_at) {
    db.prepare(`
      UPDATE legacy_members
      SET claimed_by_member_id = ?, claimed_at = ?, version = version + 1
      WHERE legacy_member_id = ?
    `).run(o.claimed_by_member_id, o.claimed_at, legacyId);
  }
  return legacyId;
}

// ── Historical person ─────────────────────────────────────────────────────────

export interface HistoricalPersonOverrides {
  person_id?: string;
  person_name?: string;
  legacy_member_id?: string | null;
  country?: string | null;
  first_year?: number | null;
  event_count?: number;
  placement_count?: number;
  bap_member?: 0 | 1;
  bap_induction_year?: number | null;
  hof_member?: 0 | 1;
  hof_induction_year?: number | null;
  source?: string | null;
  source_scope?: string;
  aliases?: string | null;
  is_deceased?: 0 | 1;
}

export function insertHistoricalPerson(db: BetterSqlite3.Database, o: HistoricalPersonOverrides = {}): string {
  const id = o.person_id ?? `person-test-${uid()}`;
  if (o.legacy_member_id) {
    const existing = db.prepare(`SELECT 1 FROM legacy_members WHERE legacy_member_id = ?`).get(o.legacy_member_id);
    if (!existing) {
      insertLegacyMember(db, { legacy_member_id: o.legacy_member_id, real_name: o.person_name });
    }
  }
  db.prepare(`
    INSERT INTO historical_persons (
      person_id, person_name, legacy_member_id, country, first_year,
      event_count, placement_count,
      bap_member, bap_induction_year, hof_member, hof_induction_year,
      source, source_scope, aliases, is_deceased
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    o.person_name         ?? 'Test Person',
    o.legacy_member_id    ?? null,
    o.country             ?? 'US',
    o.first_year          ?? null,
    o.event_count         ?? 0,
    o.placement_count     ?? 0,
    o.bap_member          ?? 0,
    o.bap_induction_year  ?? null,
    o.hof_member          ?? 0,
    o.hof_induction_year  ?? null,
    o.source              ?? null,
    o.source_scope        ?? 'CANONICAL',
    o.aliases             ?? null,
    o.is_deceased         ?? 0,
  );
  return id;
}

// ── Club ───────────────────────────────────────────────────────────────────────

export interface ClubOverrides {
  id?: string;
  hashtag_tag_id?: string;
  name?: string;
  city?: string;
  region?: string | null;
  country?: string;
  external_url?: string | null;
  // Public reads hide a club URL until it is verified. A provided external_url is
  // treated as verified-by-default here so fixtures that just want a visible link
  // do not each repeat a stamp; set external_url_validated_at: null to model the
  // unverified case, or external_url_quarantine_reason to model a flagged one.
  external_url_validated_at?: string | null;
  external_url_quarantine_reason?: string | null;
  status?: 'active' | 'inactive' | 'archived';
}

export function insertClub(db: BetterSqlite3.Database, o: ClubOverrides = {}): string {
  const id    = o.id             ?? `club-test-${uid()}`;
  const tagId = o.hashtag_tag_id ?? insertTag(db, { standard_type: 'club', tag_normalized: `#club_test_${uid()}` });
  const externalUrl = o.external_url !== undefined ? o.external_url : null;
  const validatedAt = o.external_url_validated_at !== undefined
    ? o.external_url_validated_at
    : (externalUrl ? TS : null);
  const quarantineReason = o.external_url_quarantine_reason ?? null;
  db.prepare(`
    INSERT INTO clubs (
      id, hashtag_tag_id, name, description, city, region, country,
      external_url, external_url_validated_at, external_url_quarantine_reason, status,
      created_at, created_by, updated_at, updated_by, version
    ) VALUES (?, ?, ?, '', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
  `).run(
    id, tagId,
    o.name         ?? 'Test Club',
    o.city         ?? 'Testville',
    o.region       !== undefined ? o.region : null,
    o.country      ?? 'USA',
    externalUrl,
    validatedAt,
    quarantineReason,
    o.status       ?? 'active',
    TS, SYS, TS, SYS,
  );
  return id;
}

// ── Club bootstrap leader ─────────────────────────────────────────────────────

export type ClubBootstrapLeaderRole = 'leader' | 'co-leader';
export type ClubBootstrapLeaderStatus =
  'provisional' | 'claimed' | 'superseded' | 'rejected';

export interface ClubBootstrapLeaderOverrides {
  id?: string;
  club_id: string;            // required — FK to clubs(id)
  legacy_member_id: string;   // required — FK target on historical_persons.legacy_member_id
  role?: ClubBootstrapLeaderRole;
  status?: ClubBootstrapLeaderStatus;
  imported_member_id?: string | null;
  claimed_member_id?: string | null;
  confidence_score?: number | null;
  notes?: string | null;
}

/**
 * Insert a club_bootstrap_leaders row. The legacy_member_id is what the
 * production loader joins to historical_persons.legacy_member_id at render
 * time, so callers should ensure a matching historical_persons row exists
 * (use insertHistoricalPerson with legacy_member_id set).
 */
export function insertClubBootstrapLeader(
  db: BetterSqlite3.Database,
  o: ClubBootstrapLeaderOverrides,
): string {
  const id = o.id ?? `cbl-test-${uid()}`;
  db.prepare(`
    INSERT INTO club_bootstrap_leaders (
      id, created_at, created_by, updated_at, updated_by, version,
      club_id, imported_member_id, claimed_member_id, legacy_member_id,
      role, confidence_score, status, notes
    ) VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, TS, SYS, TS, SYS,
    o.club_id,
    o.imported_member_id ?? null,
    o.claimed_member_id  ?? null,
    o.legacy_member_id,
    o.role   ?? 'leader',
    o.confidence_score ?? 0.9,
    o.status ?? 'provisional',
    o.notes  ?? null,
  );
  return id;
}

// ── Club bootstrap leader signal ──────────────────────────────────────────────

export type ClubBootstrapLeaderSignalType =
  | 'listed_contact' | 'affiliation' | 'hosting' | 'roster' | 'mirror_text'
  | 'tier_signal' | 'recent_activity' | 'geographic_alignment';

export interface ClubBootstrapLeaderSignalOverrides {
  id?: string;
  bootstrap_leader_id: string;     // required — FK to club_bootstrap_leaders(id)
  signal_type: ClubBootstrapLeaderSignalType;
  is_present: 0 | 1;
  signal_payload_json?: string;
  source?: string;
}

/**
 * Insert a club_bootstrap_leader_signals row. Production loader 08 emits one
 * row per (leader, signal_type); tests typically seed only the signal_types
 * they need to drive a particular classification gate.
 */
export function insertClubBootstrapLeaderSignal(
  db: BetterSqlite3.Database,
  o: ClubBootstrapLeaderSignalOverrides,
): string {
  const id = o.id ?? `cbls-test-${uid()}`;
  db.prepare(`
    INSERT INTO club_bootstrap_leader_signals (
      id, created_at, created_by, updated_at, updated_by, version,
      bootstrap_leader_id, signal_type, signal_payload_json,
      is_present, source
    ) VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?)
  `).run(
    id, TS, SYS, TS, SYS,
    o.bootstrap_leader_id,
    o.signal_type,
    o.signal_payload_json ?? '{}',
    o.is_present,
    o.source ?? 'test_fixture',
  );
  return id;
}

// ── Club leader (live leadership row) ─────────────────────────────────────────
//
// The club_leaders table is what the club-content authorization gate reads: a
// confirmed live co-leader, distinct from the migration-time
// club_bootstrap_leaders claim. Co-leaders are a flat equal set (the only role
// is 'co-leader'); a member co-leads at most one club. Two co-leaders of
// different clubs is the adjacent-owner shape that catches club-scoped
// authorization that checks only "any leadership row".

export interface ClubLeaderOverrides {
  id?: string;
  club_id: string;   // required — FK to clubs(id)
  member_id: string; // required — FK to members(id)
}

export function insertClubLeader(db: BetterSqlite3.Database, o: ClubLeaderOverrides): string {
  const id = o.id ?? `cl-test-${uid()}`;
  db.prepare(`
    INSERT INTO club_leaders (
      id, created_at, created_by, updated_at, updated_by, version,
      club_id, member_id, role, added_at
    ) VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?)
  `).run(id, TS, SYS, TS, SYS, o.club_id, o.member_id, 'co-leader', TS);
  return id;
}

// ── Member club affiliation ───────────────────────────────────────────────────

export interface MemberClubAffiliationOverrides {
  id?: string;
  is_current?: 0 | 1;
  is_primary?: 0 | 1;
  is_contact?: 0 | 1;
  source?: 'legacy_claim' | 'admin' | 'member_self_service';
}

export function insertMemberClubAffiliation(
  db: BetterSqlite3.Database,
  memberId: string,
  clubId: string,
  o: MemberClubAffiliationOverrides = {},
): string {
  const id = o.id ?? `mca-test-${uid()}`;
  db.prepare(`
    INSERT INTO member_club_affiliations (
      id, created_at, created_by, updated_at, updated_by, version,
      member_id, club_id, is_current, is_primary, is_contact, source
    ) VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?)
  `).run(
    id, TS, SYS, TS, SYS,
    memberId, clubId,
    o.is_current ?? 1,
    o.is_primary ?? 0,
    o.is_contact ?? 0,
    o.source ?? 'member_self_service',
  );
  return id;
}

// ── Member external link ──────────────────────────────────────────────────────
//
// Minimal `member_links` row factory. The application validates and stamps
// `validated_at` on real writes; this factory seeds an already-validated link
// for read/display tests.

export interface MemberLinkOverrides {
  id?: string;
  label?: string;
  url?: string;
  validated_at?: string | null;
  sort_order?: number;
}

export function insertMemberLink(
  db: BetterSqlite3.Database,
  memberId: string,
  o: MemberLinkOverrides = {},
): string {
  const id = o.id ?? `mlink-test-${uid()}`;
  db.prepare(`
    INSERT INTO member_links (
      id, created_at, created_by, updated_at, updated_by, version,
      member_id, label, url, validated_at, sort_order
    ) VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?)
  `).run(
    id, TS, SYS, TS, SYS,
    memberId,
    o.label ?? 'My Site',
    o.url ?? 'https://example.com/',
    o.validated_at === undefined ? TS : o.validated_at,
    o.sort_order ?? 0,
  );
  return id;
}

// ── Payment ───────────────────────────────────────────────────────────────────
//
// Minimal `payments` row factory. Sufficient for tests that need a real FK
// target (e.g. member_tier_grants.related_payment_id). Does not exercise
// the full payment lifecycle (status transitions, Stripe identifiers,
// refund handling); extend this factory when those land.

export interface PaymentOverrides {
  id?: string;
  member_id?: string | null;
  payment_type?: 'donation' | 'membership' | 'event_registration';
  amount_cents?: number;
  currency?: string;
  status?: 'pending' | 'succeeded' | 'failed' | 'canceled' | 'refunded';
  descriptor?: string;
  purchased_tier_status?: 'tier1' | 'tier2' | null;
}

export function insertPayment(db: BetterSqlite3.Database, o: PaymentOverrides = {}): string {
  const id = o.id ?? `pay-test-${uid()}`;
  const paymentType = o.payment_type ?? 'membership';
  const purchasedTier =
    paymentType === 'membership'
      ? (o.purchased_tier_status ?? 'tier1')
      : (o.purchased_tier_status ?? null);
  db.prepare(`
    INSERT INTO payments (
      id, created_at, created_by, updated_at, updated_by, version,
      member_id,
      payment_type, amount_cents, currency,
      status, descriptor,
      purchased_tier_status
    ) VALUES (?, ?, 'system', ?, 'system', 1, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, TS, TS,
    o.member_id ?? null,
    paymentType,
    o.amount_cents ?? 1000,
    o.currency ?? 'USD',
    o.status ?? 'succeeded',
    o.descriptor ?? 'Test payment',
    purchasedTier,
  );
  return id;
}

// ── Member tier grant ─────────────────────────────────────────────────────────
//
// Append-only ledger row in member_tier_grants. UPDATE/DELETE blocked by triggers.
// `created_at` overrides are honored so tests can build deterministic ordering;
// the latest-row-per-member computation in member_tier_current uses
// (created_at DESC, id DESC).

export type MemberTierString = 'tier0' | 'tier1' | 'tier2' | 'tier3';
export type MemberTierChangeType =
  | 'grant' | 'revoke' | 'correct' | 'governance_set' | 'governance_removed';

export interface MemberTierGrantOverrides {
  id?: string;
  created_at?: string;
  member_id: string;
  actor_member_id?: string | null;
  change_type?: MemberTierChangeType;
  old_tier_status?: MemberTierString | null;
  new_tier_status?: MemberTierString;
  old_underlying_tier_status?: 'tier1' | 'tier2' | null;
  new_underlying_tier_status?: 'tier1' | 'tier2' | null;
  reason_code?: string;
  reason_text?: string | null;
  related_payment_id?: string | null;
}

export function insertMemberTierGrant(
  db: BetterSqlite3.Database,
  o: MemberTierGrantOverrides,
): string {
  const id = o.id ?? `mtg-test-${uid()}`;
  db.prepare(`
    INSERT INTO member_tier_grants (
      id, created_at, created_by,
      member_id, actor_member_id,
      change_type,
      old_tier_status, new_tier_status,
      old_underlying_tier_status, new_underlying_tier_status,
      reason_code, reason_text,
      related_payment_id
    ) VALUES (?, ?, 'system', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    o.created_at ?? TS,
    o.member_id,
    o.actor_member_id ?? null,
    o.change_type ?? 'grant',
    o.old_tier_status ?? null,
    o.new_tier_status ?? 'tier1',
    o.old_underlying_tier_status ?? null,
    o.new_underlying_tier_status ?? null,
    o.reason_code ?? 'purchase.tier1',
    o.reason_text ?? null,
    o.related_payment_id ?? null,
  );
  return id;
}

// ── Active Player grant ───────────────────────────────────────────────────────
//
// Append-only ledger row in active_player_grants. UPDATE/DELETE blocked by triggers.
// At most one of related_registration_id / related_club_affiliation_id /
// related_vouch_id may be non-NULL (DB CHECK).

export type ActivePlayerChangeType = 'grant' | 'extend' | 'expire' | 'end' | 'correct';

export interface ActivePlayerGrantOverrides {
  id?: string;
  created_at?: string;
  member_id: string;
  actor_member_id?: string | null;
  change_type?: ActivePlayerChangeType;
  old_active_player_expires_at?: string | null;
  new_active_player_expires_at?: string | null;
  reason_code?: string;
  reason_text?: string | null;
  related_event_id?: string | null;
  related_registration_id?: string | null;
  related_club_id?: string | null;
  related_club_affiliation_id?: string | null;
  related_vouch_id?: string | null;
}

export function insertActivePlayerGrant(
  db: BetterSqlite3.Database,
  o: ActivePlayerGrantOverrides,
): string {
  const id = o.id ?? `apg-test-${uid()}`;
  db.prepare(`
    INSERT INTO active_player_grants (
      id, created_at, created_by,
      member_id, actor_member_id,
      change_type,
      old_active_player_expires_at, new_active_player_expires_at,
      reason_code, reason_text,
      related_event_id, related_registration_id,
      related_club_id, related_club_affiliation_id,
      related_vouch_id
    ) VALUES (?, ?, 'system', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    o.created_at ?? TS,
    o.member_id,
    o.actor_member_id ?? null,
    o.change_type ?? 'grant',
    o.old_active_player_expires_at ?? null,
    o.new_active_player_expires_at ?? null,
    o.reason_code ?? 'official_event_attendance',
    o.reason_text ?? null,
    o.related_event_id ?? null,
    o.related_registration_id ?? null,
    o.related_club_id ?? null,
    o.related_club_affiliation_id ?? null,
    o.related_vouch_id ?? null,
  );
  return id;
}

// ── Tier + AP composition helpers ─────────────────────────────────────────────
//
// Ergonomic wrappers around insertMember + insertMemberTierGrant +
// insertActivePlayerGrant for callers that need a member at a known tier or
// AP state. These are pure compositions of the primitives above — no new
// schema knowledge here.

export interface CreateMemberAtTierOpts {
  id: string;
  slug: string;
  tier: 'tier0' | 'tier1' | 'tier2' | 'tier3';
  /** Required when tier === 'tier3'; the post-governance underlying tier. */
  underlying_tier_status?: 'tier1' | 'tier2';
  /** Forwarded to insertMember (admin/system flags, display name, etc.). */
  memberOverrides?: Omit<MemberOverrides, 'id' | 'slug'>;
  /** Actor on the tier grant ledger (e.g. an admin id for governance_set). */
  actor_member_id?: string | null;
}

export function createMemberAtTier(
  db: BetterSqlite3.Database,
  o: CreateMemberAtTierOpts,
): string {
  insertMember(db, { id: o.id, slug: o.slug, ...(o.memberOverrides ?? {}) });
  if (o.tier === 'tier0') {
    return o.id;
  }
  if (o.tier === 'tier3') {
    if (!o.underlying_tier_status) {
      throw new Error('createMemberAtTier(tier3) requires underlying_tier_status');
    }
    insertMemberTierGrant(db, {
      member_id: o.id,
      actor_member_id: o.actor_member_id ?? null,
      change_type: 'governance_set',
      new_tier_status: 'tier3',
      new_underlying_tier_status: o.underlying_tier_status,
      reason_code: 'governance.tier3_set',
    });
    return o.id;
  }
  insertMemberTierGrant(db, {
    member_id: o.id,
    new_tier_status: o.tier,
    reason_code: o.tier === 'tier1' ? 'purchase.tier1' : 'purchase.tier2',
  });
  return o.id;
}

export interface CreateTier0WithActivePlayerOpts {
  id: string;
  slug: string;
  /** ISO timestamp for the AP grant's new_active_player_expires_at. */
  expiresAt: string;
  reason_code?: string;
  memberOverrides?: Omit<MemberOverrides, 'id' | 'slug'>;
}

export function createTier0WithActivePlayer(
  db: BetterSqlite3.Database,
  o: CreateTier0WithActivePlayerOpts,
): string {
  insertMember(db, { id: o.id, slug: o.slug, ...(o.memberOverrides ?? {}) });
  insertActivePlayerGrant(db, {
    member_id: o.id,
    change_type: 'grant',
    new_active_player_expires_at: o.expiresAt,
    reason_code: o.reason_code ?? 'official_event_attendance',
  });
  return o.id;
}

export interface CreateTier3WithUnderlyingOpts {
  id: string;
  slug: string;
  underlying_tier_status: 'tier1' | 'tier2';
  actor_member_id?: string | null;
  memberOverrides?: Omit<MemberOverrides, 'id' | 'slug'>;
}

export function createTier3WithUnderlying(
  db: BetterSqlite3.Database,
  o: CreateTier3WithUnderlyingOpts,
): string {
  return createMemberAtTier(db, {
    id: o.id,
    slug: o.slug,
    tier: 'tier3',
    underlying_tier_status: o.underlying_tier_status,
    actor_member_id: o.actor_member_id ?? null,
    memberOverrides: o.memberOverrides,
  });
}

// ── Onboarding tasks ──────────────────────────────────────────────────────────

export type OnboardingTaskType = 'personal_details' | 'legacy_claim' | 'club_affiliations';
export type OnboardingTaskState =
  'pending' | 'in_progress_paused' | 'skipped' | 'completed' | 'not_applicable';

/**
 * Insert one member_onboarding_tasks row at an explicit state. completed_at is
 * stamped only for the terminal 'completed' state (the wizard stamps it on
 * completion); every other state leaves completed_at NULL. INSERT OR IGNORE
 * keeps the UNIQUE(member_id, task_type) contract: the first state set for a
 * task wins, so callers seed a task once.
 *
 * The seed is read back and asserted to have landed in the requested state.
 * INSERT OR IGNORE silently drops the row on any primary-key or
 * UNIQUE(member_id, task_type) conflict, so a lost seed is otherwise invisible
 * here and surfaces far away as a wizard-gate redirect. A row that is absent, or
 * present in a state other than the one seeded, means a colliding writer (a
 * duplicate id, or the live dev server's own task-row insert when it shares this
 * database) won the row: fail loudly at the seed rather than in a distant assertion.
 */
export function insertOnboardingTask(
  db: BetterSqlite3.Database,
  memberId: string,
  taskType: OnboardingTaskType,
  state: OnboardingTaskState = 'completed',
): void {
  db.prepare(`
    INSERT OR IGNORE INTO member_onboarding_tasks
      (id, created_at, created_by, updated_at, updated_by, version, member_id, task_type, state, completed_at)
    VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?)
  `).run(`mot_${uid()}`, TS, SYS, TS, SYS, memberId, taskType, state, state === 'completed' ? TS : null);

  const landed = db.prepare(
    'SELECT state FROM member_onboarding_tasks WHERE member_id = ? AND task_type = ?',
  ).get(memberId, taskType) as { state: string } | undefined;
  if (landed?.state !== state) {
    throw new Error(
      `Onboarding-task seed did not land: ${taskType} for ${memberId} expected state ` +
        `'${state}' but found '${landed?.state ?? 'no row'}'. A duplicate id or a ` +
        `concurrent writer won the row.`,
    );
  }
}

export function completeOnboarding(db: BetterSqlite3.Database, memberId: string): void {
  insertOnboardingTask(db, memberId, 'personal_details', 'completed');
  insertOnboardingTask(db, memberId, 'legacy_claim', 'completed');
  insertOnboardingTask(db, memberId, 'club_affiliations', 'completed');
}

// ── Audit entry ───────────────────────────────────────────────────────────────
//
// Writes one audit_entries row directly against the passed db handle. The
// persona harness runs outside the Express request context (seed runner) and
// against an explicitly-opened connection, so it inserts the row here rather
// than through appendAuditEntry (which targets the db.ts singleton connection).
// actor_type is constrained to system|member|admin by the schema CHECK; the
// dev-shortcut origin is carried by created_by + action_type.

export interface AuditEntryOverrides {
  id?: string;
  created_by?: string;
  actor_type?: 'system' | 'member' | 'admin';
  actor_member_id?: string | null;
  action_type: string;
  entity_type?: string;
  entity_id: string;
  category?: string;
  reason_text?: string | null;
  metadata?: Record<string, unknown>;
  // Verbatim metadata_json, bypassing JSON.stringify. The only use is seeding a
  // deliberately invalid metadata_json (the column has no JSON CHECK) to prove
  // a reader survives corrupt metadata; normal callers pass `metadata`.
  metadata_json_raw?: string;
}

export function insertAuditEntry(db: BetterSqlite3.Database, o: AuditEntryOverrides): string {
  const id = o.id ?? `audit-test-${uid()}`;
  const metadataJson = o.metadata_json_raw ?? JSON.stringify(o.metadata ?? {});
  db.prepare(`
    INSERT INTO audit_entries (
      id, created_at, created_by,
      occurred_at, actor_type, actor_member_id,
      action_type, entity_type, entity_id,
      category, reason_text, metadata_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, TS, o.created_by ?? SYS,
    TS, o.actor_type ?? 'system', o.actor_member_id ?? null,
    o.action_type, o.entity_type ?? 'member', o.entity_id,
    o.category ?? 'identity', o.reason_text ?? null,
    metadataJson,
  );
  return id;
}

// ── Mailing list subscription ─────────────────────────────────────────────────
//
// Ensures the parent mailing_lists row exists (PK = slug, name is UNIQUE), then
// inserts one mailing_list_subscriptions row. `status` drives the
// subscribed/unsubscribed dimension the member mailing-list surfaces read.
// Defaulting the list name to the slug keeps the UNIQUE(name) constraint aligned
// with the slug, so two distinct slugs never collide on name.

export type MailingListSubscriptionStatus =
  'subscribed' | 'unsubscribed' | 'bounced' | 'complained' | 'suppressed';

export interface MailingListSubscriptionOverrides {
  id?: string;
  list_slug?: string;
  list_name?: string;
  member_id: string;
  status?: MailingListSubscriptionStatus;
}

export function insertMailingListSubscription(
  db: BetterSqlite3.Database,
  o: MailingListSubscriptionOverrides,
): string {
  const slug = o.list_slug ?? 'announce';
  db.prepare(`
    INSERT OR IGNORE INTO mailing_lists (slug, updated_at, name, description)
    VALUES (?, ?, ?, '')
  `).run(slug, TS, o.list_name ?? slug);
  const id = o.id ?? `mls-test-${uid()}`;
  db.prepare(`
    INSERT INTO mailing_list_subscriptions (
      id, created_at, created_by, updated_at, updated_by, version,
      mailing_list_id, member_id, status, status_updated_at
    ) VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?)
  `).run(id, TS, SYS, TS, SYS, slug, o.member_id, o.status ?? 'subscribed', TS);
  return id;
}

// ── Legacy club candidate ─────────────────────────────────────────────────────

export type LegacyClubCandidateClassification =
  'pre_populate' | 'onboarding_visible' | 'dormant' | 'junk';

export interface LegacyClubCandidateOverrides {
  id?: string;
  legacy_club_key?: string;
  display_name?: string;
  city?: string | null;
  region?: string | null;
  country?: string | null;
  description?: string | null;
  external_url?: string | null;
  mapped_club_id?: string | null;
  classification?: LegacyClubCandidateClassification;
  lifecycle_state?: 'archived' | 'junk_confirmed' | null;
  confidence_score?: number | null;
  bootstrap_eligible?: 0 | 1;
  // Classifier evidence columns on legacy_club_candidates (rule firings and
  // rule inputs), read by the club-cleanup classification logic.
  r1?: 0 | 1;
  r2?: 0 | 1;
  r3?: 0 | 1;
  r4?: 0 | 1;
  r5?: 0 | 1;
  r6?: 0 | 1;
  r7?: 0 | 1;
  r8?: 0 | 1;
  r9?: 0 | 1;
  r10?: 0 | 1;
  contact_signal_substitute_applied?: 0 | 1;
  last_hosted_year?: number | null;
  max_affiliated_member_last_year?: number | null;
  contact_member_last_year?: number | null;
  created_year?: number | null;
  last_updated_year?: number | null;
  unique_member_names?: number | null;
  linkable_member_count?: number | null;
  ever_hosted?: 0 | 1;
}

export function insertLegacyClubCandidate(db: BetterSqlite3.Database, o: LegacyClubCandidateOverrides = {}): string {
  const id = o.id ?? `lcc-test-${uid()}`;
  db.prepare(`
    INSERT INTO legacy_club_candidates (
      id, legacy_club_key, display_name, city, region, country,
      description, external_url, mapped_club_id, classification,
      lifecycle_state,
      confidence_score, bootstrap_eligible,
      r1, r2, r3, r4, r5, r6, r7, r8, r9, r10,
      contact_signal_substitute_applied,
      last_hosted_year, max_affiliated_member_last_year, contact_member_last_year,
      created_year, last_updated_year, unique_member_names, linkable_member_count,
      ever_hosted,
      created_at, created_by, updated_at, updated_by, version
    ) VALUES (
      ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?,
      ?, ?,
      ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
      ?,
      ?, ?, ?,
      ?, ?, ?, ?,
      ?,
      ?, ?, ?, ?, 1
    )
  `).run(
    id,
    o.legacy_club_key ?? `legacy_club_${uid()}`,
    o.display_name    ?? 'Test Club',
    o.city            !== undefined ? o.city : null,
    o.region          !== undefined ? o.region : null,
    o.country         !== undefined ? o.country : null,
    o.description     !== undefined ? o.description : null,
    o.external_url    !== undefined ? o.external_url : null,
    o.mapped_club_id  !== undefined ? o.mapped_club_id : null,
    o.classification  ?? 'junk',
    o.lifecycle_state !== undefined ? o.lifecycle_state : null,
    o.confidence_score !== undefined ? o.confidence_score : null,
    o.bootstrap_eligible ?? 0,
    o.r1 ?? 0, o.r2 ?? 0, o.r3 ?? 0, o.r4 ?? 0, o.r5 ?? 0,
    o.r6 ?? 0, o.r7 ?? 0, o.r8 ?? 0, o.r9 ?? 0, o.r10 ?? 0,
    o.contact_signal_substitute_applied ?? 0,
    o.last_hosted_year !== undefined ? o.last_hosted_year : null,
    o.max_affiliated_member_last_year !== undefined ? o.max_affiliated_member_last_year : null,
    o.contact_member_last_year !== undefined ? o.contact_member_last_year : null,
    o.created_year !== undefined ? o.created_year : null,
    o.last_updated_year !== undefined ? o.last_updated_year : null,
    o.unique_member_names !== undefined ? o.unique_member_names : null,
    o.linkable_member_count !== undefined ? o.linkable_member_count : null,
    o.ever_hosted ?? 0,
    TS, SYS, TS, SYS,
  );
  return id;
}

// ── Legacy person–club affiliation ────────────────────────────────────────────

export interface LegacyPersonClubAffiliationOverrides {
  id?: string;
  historical_person_id?: string;
  legacy_member_id?: string;
  legacy_club_candidate_id: string;
  resolution_status?: string;
  resolved_club_id?: string;
  inferred_role?: string;
  confidence_score?: number;
  display_name?: string;
}

// Wizard contract: rows arrive 'pending' from loaders;
// the onboarding wizard transitions to 'confirmed_current' AND stamps
// resolved_club_id in the same transaction. Schema CHECK enforces the pairing,
// so a caller that passes resolution_status='confirmed_current' must also
// pass resolved_club_id. Schema also CHECKs that historical_person_id OR
// legacy_member_id is non-null; provide at least one or the insert will fail.
export function insertLegacyPersonClubAffiliation(
  db: BetterSqlite3.Database,
  o: LegacyPersonClubAffiliationOverrides,
): string {
  const id = o.id ?? `lpca-test-${uid()}`;
  if (o.legacy_member_id) {
    const existing = db.prepare(`SELECT 1 FROM legacy_members WHERE legacy_member_id = ?`).get(o.legacy_member_id);
    if (!existing) {
      insertLegacyMember(db, { legacy_member_id: o.legacy_member_id });
    }
  }
  db.prepare(`
    INSERT INTO legacy_person_club_affiliations (
      id, historical_person_id, legacy_member_id, legacy_club_candidate_id,
      inferred_role, confidence_score, resolution_status, resolved_club_id, display_name,
      created_at, created_by, updated_at, updated_by, version
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
  `).run(
    id,
    o.historical_person_id        ?? null,
    o.legacy_member_id             ?? null,
    o.legacy_club_candidate_id,
    o.inferred_role                ?? 'member',
    o.confidence_score             !== undefined ? o.confidence_score : null,
    o.resolution_status            ?? 'pending',
    o.resolved_club_id             ?? null,
    o.display_name                 ?? null,
    TS, SYS, TS, SYS,
  );
  return id;
}

// ── Name variant ──────────────────────────────────────────────────────────────

export interface NameVariantOverrides {
  canonical_normalized: string;
  variant_normalized: string;
  source?: 'mirror_mined' | 'admin_added' | 'member_submitted';
  created_at?: string;
}

export function insertNameVariant(
  db: BetterSqlite3.Database,
  o: NameVariantOverrides,
): void {
  db.prepare(`
    INSERT INTO name_variants (canonical_normalized, variant_normalized, source, created_at)
    VALUES (?, ?, ?, ?)
  `).run(
    o.canonical_normalized,
    o.variant_normalized,
    o.source     ?? 'mirror_mined',
    o.created_at ?? TS,
  );
}

// ── Given-name variants (generic first-name shortenings) ─────────────────────

export interface GivenNameVariantOverrides {
  short_form_normalized: string;
  long_form_normalized: string;
  created_at?: string;
}

export function insertGivenNameVariant(
  db: BetterSqlite3.Database,
  o: GivenNameVariantOverrides,
): void {
  db.prepare(`
    INSERT INTO given_name_variants (short_form_normalized, long_form_normalized, created_at)
    VALUES (?, ?, ?)
  `).run(
    o.short_form_normalized,
    o.long_form_normalized,
    o.created_at ?? TS,
  );
}
