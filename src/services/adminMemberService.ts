/**
 * AdminMemberService -- the administrator's member-management surface.
 *
 * Owns the member lookup, the per-member record, and the confirmation
 * view-models for every correction reached from that record. Writes nothing
 * itself: each correction is resolved and validated here, previewed with
 * nothing written, and committed by the service that owns the data. The name
 * correction goes to IdentityAccessService, the tier change and the honor and
 * governance flags to MembershipTieringService, the Active Player expiry to
 * ActivePlayerService, and the profile-picture removal to MediaModerationService,
 * which owns every takedown whether or not a report led to it. Keeping the
 * writes there is what stops this surface becoming a second home for member
 * rules.
 *
 * Audience: admin only. The record sits at the internal-and-admin-only
 * sensitivity level and may therefore show the member's owner-and-admin-private
 * fields, including birth date, gender and contact details. The route gate is
 * the only thing standing in front of it, so no method here is reachable from a
 * member or public route.
 *
 * The lookup reads the whole member population rather than a visibility view,
 * because the record exists to reach exactly the members those views exclude:
 * someone who opted out of member search, someone inside the deletion grace
 * period, and someone marked deceased whose flag may need reversing.
 *
 * Reading a record writes nothing. The corrections each write one audit row
 * through their owning service.
 */
import { account, media } from '../db/db';
import {
  adminOverride, getTierStatus, tierBadgeShort, type MemberTier,
} from './membershipTieringService';
import {
  correctExpiry as correctActivePlayerExpiry,
  getStatus as getActivePlayerStatus,
} from './activePlayerService';
import { identityAccessService } from './identityAccessService';
import { memberService, type ProfileEditInput } from './memberService';
import { deceasedMarkingService } from './deceasedMarkingService';
import { buildAvatarUrl } from './avatarService';
import { getDefaultMediaModerationService } from './mediaModerationService';
import { NotFoundError, ValidationError } from './serviceErrors';
import { readIntConfig } from './configReader';
import { formatDateDisplay } from './dateFormat';
import type { PageViewModel } from '../types/page';
import type { OutcomeTone } from '../lib/outcomeNotice';

const LOOKUP_LIMIT = 25;
const MIN_LOOKUP_QUERY = 2;

const TIER_LABEL: Record<MemberTier, string> = {
  tier0: 'Tier 0 (none)',
  tier1: 'Tier 1',
  tier2: 'Tier 2',
  tier3: 'Tier 3 (IFPA director)',
};

/**
 * What a committed correction did, carried across the redirect as a short code
 * rather than a sentence: the wording belongs to this service, and a cookie is
 * no place to keep prose.
 */
export type CorrectionOutcome =
  | 'name_corrected'
  | 'name_unchanged'
  | 'tier_changed'
  | 'tier_recorded'
  | 'active_player_corrected'
  | 'active_player_ended'
  | 'active_player_unchanged'
  | 'active_player_not_applicable'
  | 'deceased_marked'
  | 'deceased_reverted'
  | 'deceased_grace_elapsed'
  | 'slug_corrected'
  | 'slug_unchanged'
  | 'avatar_removed'
  | 'avatar_removed_storage_pending'
  | 'profile_corrected'
  | 'profile_unchanged';

// Each outcome carries its tone. A correction that landed and a correction that
// found nothing to change are different events, and the page used to paint both
// of them, plus the two refusals, in the same warning amber.
const OUTCOME_NOTICE: Record<CorrectionOutcome, [OutcomeTone, string]> = {
  name_corrected:   ['ok',   'The name has been corrected, and the change is recorded in the audit log.'],
  name_unchanged:   ['info', 'Those are the names the record already held, so nothing changed.'],
  tier_changed:     ['ok',   'The membership tier has been changed, and the change is recorded in the audit log.'],
  tier_recorded:    ['info', 'The member already held that tier. The reason is recorded in the tier ledger, and no email was sent.'],
  active_player_corrected: ['ok',   'The Active Player expiry has been corrected, and the change is recorded in the audit log.'],
  active_player_ended:     ['ok',   'Active Player standing has ended, and the change is recorded in the audit log.'],
  active_player_unchanged: ['info', 'That is the expiry the record already held, so nothing changed.'],
  active_player_not_applicable:
    ['no', 'Active Player is a Tier 0 standing and this member holds a paid or governance tier, so the expiry was not changed.'],
  deceased_marked:
    ['ok', 'The member is marked deceased. Their honours, media and competition results are untouched, and the platform will send them nothing.'],
  deceased_reverted: ['ok', 'The deceased marking has been removed, and the reversal is recorded in the audit log.'],
  deceased_grace_elapsed:
    ['no', 'The window for reversing this marking has passed, so nothing was changed. Past that window the member\'s contact details are cleared, and full account deletion is the remaining path.'],
  slug_corrected:
    ['ok', 'The profile URL has been corrected and the uploader tag moved with it, so the member\'s media and galleries still resolve. The old URL no longer works.'],
  slug_unchanged: ['info', 'That is the profile URL the record already held, so nothing changed.'],
  avatar_removed:
    ['ok', 'The profile picture has been removed, its stored files are deleted, and the member has been told. They can upload another.'],
  profile_corrected:
    ['ok', "The member's profile details have been corrected, and every changed value is recorded in the audit log."],
  profile_unchanged: ['info', 'Those are the details the record already held, so nothing changed.'],
  avatar_removed_storage_pending:
    ['ok', 'The profile picture has been removed and the member has been told. Its stored files could not be deleted and the failure is logged for an operator; the member\'s next upload writes over them.'],
};

function isCorrectionOutcome(value: string): value is CorrectionOutcome {
  return Object.prototype.hasOwnProperty.call(OUTCOME_NOTICE, value);
}

/**
 * The tiers this surface sets. Director standing is deliberately absent: it is
 * governance standing rather than a membership tier, it carries a ledger row
 * recording the tier the member returns to and a badge every surface reads, and
 * it is conferred in exactly one place, which is the board surface. Offering it
 * here would be a second route that writes neither, leaving a former director
 * wearing the badge with nothing able to take it off.
 */
const MEMBER_RECORD_TIER_VALUES: readonly MemberTier[] = ['tier0', 'tier1', 'tier2'];

interface TierOption {
  value: MemberTier;
  label: string;
  selected: boolean;
}

/** The tier choices, with the member's current tier already chosen. */
function tierOptionsFor(current: MemberTier): TierOption[] {
  return MEMBER_RECORD_TIER_VALUES.map((value) => ({
    value,
    label: TIER_LABEL[value],
    selected: value === current,
  }));
}

/** The member row the record renders and the corrections resolve against. */
interface AdminMemberRow {
  id: string;
  slug: string | null;
  created_at: string;
  login_email: string | null;
  email_verified_at: string | null;
  email_status: string;
  last_login_at: string | null;
  family_name: string | null;
  given_names: string | null;
  real_name: string;
  display_name: string;
  city: string | null;
  region: string | null;
  country: string | null;
  gender: string | null;
  birth_date: string | null;
  phone: string | null;
  whatsapp: string | null;
  bio: string | null;
  email_visibility: string;
  phone_visible: number;
  whatsapp_visible: number;
  first_competition_year: number | null;
  show_competitive_results: number;
  show_first_competition_year: number;
  show_gender: number;
  searchable: number;
  is_admin: number;
  is_system: number;
  is_board: number;
  is_hof: number;
  is_bap: number;
  is_deceased: number;
  deceased_at: string | null;
  deleted_at: string | null;
  deletion_grace_expires_at: string | null;
  personal_data_purged_at: string | null;
  legacy_member_id: string | null;
  historical_person_id: string | null;
  ifpa_join_date: string | null;
}

interface LookupResultView {
  memberId: string;
  displayName: string;
  recordHref: string;
  /**
   * What tells two same-named members apart at a glance: the profile URL, then
   * where they are. A lookup whose rows carry only a display name cannot do the
   * one job it has.
   */
  facts: string[];
  /** Membership standing and the admin-only account states, as status chips. */
  badges: string[];
}

export interface AdminMemberLookupContent {
  query: string;
  hasQuery: boolean;
  results: LookupResultView[];
  hasResults: boolean;
  resultSummary: string;
  /** The result cap was reached, so the set shown is not the whole match. */
  hasMore: boolean;
  errorMessage?: string;
}

interface FactRow {
  label: string;
  value: string;
}

export interface AdminMemberRecordContent {
  memberId: string;
  displayName: string;
  slugLabel: string;
  profileHref: string | null;
  isSystemAccount: boolean;
  /**
   * The identifying strip under the hero: who this is and what state they are
   * in, before the administrator reads anything else or acts on anything.
   */
  identifyingFacts: string[];
  stateLabels: string[];
  identity: FactRow[];
  standing: FactRow[];
  accountState: FactRow[];
  contact: FactRow[];
  identityLinks: FactRow[];
  hasIdentityLinks: boolean;
  /** Current values, so each form opens on what the record already holds. */
  form: {
    givenNames: string;
    familyName: string;
    displayName: string;
    slug: string;
    tierOptions: TierOption[];
    activePlayerExpiryDate: string;
  };
  /**
   * The member's current profile details, so the correction form opens on what
   * the record holds rather than on blanks that would wipe it.
   */
  profileForm: {
    city: string;
    region: string;
    country: string;
    phone: string;
    whatsapp: string;
    birthDay: string;
    birthMonth: string;
    birthYear: string;
    /** Pre-shaped with the current value marked, so the template selects
     *  nothing itself and never compares a stored code. */
    emailVisibilityOptions: Array<{ value: string; label: string; selected: boolean }>;
    genderOptions: Array<{ value: string; label: string; selected: boolean }>;
    firstCompetitionYear: string;
    phoneVisible: boolean;
    whatsappVisible: boolean;
    searchable: boolean;
    showCompetitiveResults: boolean;
    showFirstCompetitionYear: boolean;
    showGender: boolean;
    /** `slot` is the one-based position the labels name, computed here because
     *  a template does no arithmetic. */
    links: Array<{ slot: number; label: string; url: string }>;
  };
  /**
   * False once the account is deleted or its personal data purged. Deletion is
   * final: the member opens a new account and an administrator links it out of
   * band. Offering a correction form on one of those records would let an
   * administrator write personal data back onto a record the platform has
   * already promised to have erased.
   */
  canCorrectProfile: boolean;
  profileAction: string;
  nameAction: string;
  slugAction: string;
  tierAction: string;
  activePlayerAction: string;
  /**
   * Whether this member has a picture to take down. The control is absent when
   * there is none, rather than offered and then refused.
   */
  hasAvatar: boolean;
  avatarRemoveAction: string;
  /** Which of the two deceased controls this record offers, and where it posts. */
  isDeceasedMarked: boolean;
  deceasedMarkAction: string;
  deceasedRevertAction: string;
  deceasedGraceNote: string;
  /** Named for where each one goes, since all three leave this record. */
  elsewhereLinks: Array<{ label: string; href: string }>;
  errorMessage?: string;
}

interface ChangeRow {
  label: string;
  before: string;
  after: string;
}

interface HiddenField {
  name: string;
  value: string;
}

export interface AdminMemberConfirmContent {
  memberId: string;
  displayName: string;
  /**
   * The member's profile URL and id, on the screen where the administrator
   * commits. Display names are not unique, so a confirmation carrying only a
   * name cannot tell two people apart at the moment that matters most.
   */
  slugLabel: string;
  summary: string;
  changes: ChangeRow[];
  hasChanges: boolean;
  noChangeMessage: string | null;
  /**
   * Null on the actions that collect no reason. A tier change and an expiry
   * correction each have several possible motives, so the administrator's own
   * words are what makes the ledger row reviewable; the deceased marking has
   * one motive and collects nothing to show here.
   */
  reason: string | null;
  /**
   * One sentence of caution, present only on the corrections that cannot be
   * taken back by repeating them. The reversible ones carry none deliberately:
   * an amber band on every confirmation is an amber band an administrator stops
   * reading, and then it is worth nothing on the three that need it.
   */
  caution?: string;
  /**
   * Present only where the thing being decided is an image. An administrator
   * asked to destroy a picture has to be able to see which picture, and a
   * confirmation that names it in words alone cannot tell two of them apart.
   */
  previewImage?: { src: string; alt: string };
  hiddenFields: HiddenField[];
  confirmAction: string;
  confirmLabel: string;
  cancelHref: string;
}

function recordHref(memberId: string): string {
  return `/admin/members/${memberId}`;
}

function readMember(memberId: string): AdminMemberRow {
  const row = account.findMemberForAdminRecord.get(memberId) as AdminMemberRow | undefined;
  if (!row) throw new NotFoundError('No member with that id.');
  return row;
}

/**
 * The account states an administrator needs to see at a glance, because each
 * one changes what the other surfaces will do with this member.
 */
function stateLabelsFor(row: {
  is_system: number;
  is_deceased: number;
  deleted_at: string | null;
  personal_data_purged_at: string | null;
  searchable: number;
  email_verified_at: string | null;
  is_admin: number;
}): string[] {
  const labels: string[] = [];
  if (row.is_system === 1) labels.push('System account');
  if (row.is_deceased === 1) labels.push('Deceased');
  if (row.deleted_at) labels.push('Deleted');
  if (row.personal_data_purged_at) labels.push('Personal data purged');
  if (row.searchable === 0) labels.push('Not in member search');
  if (!row.email_verified_at && row.is_system === 0) labels.push('Email unverified');
  if (row.is_admin === 1) labels.push('Administrator');
  return labels;
}

function displayOrDash(value: string | null | undefined): string {
  return value && value.trim() !== '' ? value : '—';
}

function dateOrDash(iso: string | null): string {
  return iso ? formatDateDisplay(iso.slice(0, 10)) : '—';
}

/**
 * The state of a member's mailbox, said in words. The stored value is a code
 * the delivery pipeline writes; an administrator reading the record needs to
 * know whether mail reaches this member, not which code stands for that.
 */
const EMAIL_STATUS_LABEL: Record<string, string> = {
  ok:        'Delivering normally',
  bounced:   'Bounced, so the platform no longer sends to it',
  complained: 'Marked as spam by the recipient, so sending has stopped',
};

function emailStatusLabel(status: string): string {
  return EMAIL_STATUS_LABEL[status] ?? status;
}

const GENDER_LABEL: Record<string, string> = {
  male:        'Male',
  female:      'Female',
  undisclosed: 'Not disclosed',
};

function genderLabel(gender: string | null): string {
  if (!gender) return '—';
  return GENDER_LABEL[gender] ?? gender;
}

/**
 * The single sentence at the top of a record whose account is in a state that
 * changes what the rest of the platform does with this member. An
 * administrator who misses it would otherwise read the record as ordinary.
 */
function recordNotice(row: AdminMemberRow): string | undefined {
  if (row.personal_data_purged_at) {
    return 'This account has been through erasure. Its personal data is gone and cannot be restored.';
  }
  if (row.is_deceased === 1) {
    return 'This member is marked deceased. The platform sends them no email, and their contact '
      + 'details are cleared once the grace period ends.';
  }
  if (row.deleted_at) {
    return 'This account is deleted and inside its grace period. The member can still restore it, '
      + 'and the platform sends them no email meanwhile.';
  }
  return undefined;
}

function confirmEnvelope(
  title: string,
  content: AdminMemberConfirmContent,
): PageViewModel<AdminMemberConfirmContent> {
  return {
    seo:  { title, noindex: true },
    page: { sectionKey: '', pageKey: 'admin_member_confirm', title },
    content,
  };
}

function deceasedGraceDays(): number {
  return readIntConfig('deceased_cleanup_grace_days', 30);
}

/** What the grace window means, said once and used wherever it is explained. */
function deceasedGraceNote(): string {
  return `A marking made in error can be removed within ${deceasedGraceDays()} days. Past that `
    + "window the member's contact details are cleared, so there is nothing left to restore.";
}

const MAX_REASON = 500;

function requireReason(raw: string): string {
  const reason = raw.trim();
  if (!reason) throw new ValidationError('Enter the reason for this correction.');
  // Capped here as well as at the write, so an over-long reason is refused
  // before an administrator is asked to confirm rather than after.
  if (reason.length > MAX_REASON) {
    throw new ValidationError(`The reason must be ${MAX_REASON} characters or fewer.`);
  }
  return reason;
}

/**
 * Whether this record's profile may be corrected at all.
 *
 * A deleted account is gone: the member opens a new one and an administrator
 * links it out of band, rather than the old record being edited back to life.
 * A purged account has had its personal data erased, and a correction that
 * filled those fields in again would undo an erasure the platform has already
 * carried out. Neither is a validation failure to report; the control is simply
 * not offered, and the write refuses if one is crafted anyway.
 */
function profileIsCorrectable(row: AdminMemberRow): boolean {
  return row.deleted_at === null && row.personal_data_purged_at === null && row.slug !== null;
}

/** The same rule at the write, so a crafted submission cannot reach past it. */
function requireCorrectableProfile(row: AdminMemberRow): void {
  if (row.personal_data_purged_at !== null) {
    throw new ValidationError(
      "This account's personal data has been erased. Correcting it would write that data back, so "
      + 'there is nothing to correct here.',
    );
  }
  if (row.deleted_at !== null) {
    throw new ValidationError(
      'This account is deleted. A member who wants to come back opens a new account and asks an '
      + 'administrator to link it, rather than this record being edited back into use.',
    );
  }
  if (!row.slug) {
    throw new ValidationError('This member has no profile URL, so there is no profile to correct.');
  }
}

/**
 * The correction form's starting values: what the record holds right now.
 *
 * Every field is prefilled because the write is a whole-profile replace, as the
 * member's own save is. A form opening on blanks would clear the fields an
 * administrator did not mean to touch.
 */
function profileFormFor(row: AdminMemberRow): AdminMemberRecordContent['profileForm'] {
  const parts = memberService.getBirthDateParts(row.id);
  return {
    city:                 row.city ?? '',
    region:               row.region ?? '',
    country:              row.country ?? '',
    phone:                row.phone ?? '',
    whatsapp:             row.whatsapp ?? '',
    birthDay:             parts.day,
    birthMonth:           parts.month,
    birthYear:            parts.year,
    emailVisibilityOptions: [
      { value: 'private', label: 'Nobody' },
      { value: 'members', label: 'Signed-in members' },
    ].map((o) => ({ ...o, selected: o.value === row.email_visibility })),
    genderOptions: [
      { value: 'undisclosed', label: 'Undisclosed' },
      { value: 'female', label: 'Female' },
      { value: 'male', label: 'Male' },
    ].map((o) => ({ ...o, selected: o.value === (row.gender ?? 'undisclosed') })),
    firstCompetitionYear: row.first_competition_year === null ? '' : String(row.first_competition_year),
    phoneVisible:            row.phone_visible === 1,
    whatsappVisible:         row.whatsapp_visible === 1,
    searchable:              row.searchable === 1,
    showCompetitiveResults:  row.show_competitive_results === 1,
    showFirstCompetitionYear: row.show_first_competition_year === 1,
    showGender:              row.show_gender === 1,
    links: memberService.listMemberLinks(row.id)
      .map((l, i) => ({ slot: i + 1, label: l.label, url: l.url })),
  };
}

/** Plain names for the profile fields, so a confirmation reads as English. */
const PROFILE_FIELD_LABEL: Record<string, string> = {
  city: 'City',
  region: 'Region',
  country: 'Country',
  phone: 'Phone',
  whatsapp: 'WhatsApp',
  birthDate: 'Date of birth',
  emailVisibility: 'Who can see the contact email',
  phoneVisible: 'Phone shown to members',
  whatsappVisible: 'WhatsApp shown to members',
  searchable: 'Listed in member search',
  firstCompetitionYear: 'First competition year',
  showCompetitiveResults: 'Competition results shown',
  showFirstCompetitionYear: 'First competition year shown',
  showGender: 'Gender shown to members',
  gender: 'Gender',
  links: 'Links',
};

/**
 * A stored value as a confirmation screen should read it. The flags are stored
 * as 0 and 1 and an administrator is being asked to approve a change, so they
 * are shown as the words they mean rather than as the digits they are.
 */
function displayFieldValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '(none)';
  if (value === 0) return 'No';
  if (value === 1) return 'Yes';
  if (Array.isArray(value)) return value.length > 0 ? value.join('; ') : '(none)';
  return String(value);
}

/**
 * The whole submission, carried across the confirmation so the commit writes
 * exactly what was previewed rather than re-reading a form the administrator
 * has since left.
 */
function profileHiddenFields(input: ProfileEditInput, reason: string): HiddenField[] {
  const fields: HiddenField[] = [
    { name: 'city', value: input.city },
    { name: 'region', value: input.region },
    { name: 'country', value: input.country },
    { name: 'phone', value: input.phone },
    { name: 'whatsapp', value: input.whatsapp },
    { name: 'birthDay', value: input.birthDay },
    { name: 'birthMonth', value: input.birthMonth },
    { name: 'birthYear', value: input.birthYear },
    { name: 'emailVisibility', value: input.emailVisibility },
    { name: 'gender', value: input.gender },
    { name: 'firstCompetitionYear', value: input.firstCompetitionYear },
  ];
  // A checkbox posts nothing when unticked, so each flag is carried as its
  // resolved value rather than by its presence, which is what a hidden field
  // cannot express.
  for (const [name, value] of [
    ['phoneVisible', input.phoneVisible],
    ['whatsappVisible', input.whatsappVisible],
    ['searchable', input.searchable],
    ['showCompetitiveResults', input.showCompetitiveResults],
    ['showFirstCompetitionYear', input.showFirstCompetitionYear],
    ['showGender', input.showGender],
  ] as const) {
    const resolved = Array.isArray(value) ? value[value.length - 1] : value;
    fields.push({ name, value: resolved === '1' ? '1' : '0' });
  }
  // Repeated names rather than indexed ones, matching the member's own form, so
  // one request assembler reads both and there is no second naming convention
  // for the same submission.
  for (const link of input.links) {
    fields.push({ name: 'link_label', value: link.label });
    fields.push({ name: 'link_url', value: link.url });
  }
  fields.push({ name: 'reason', value: reason });
  return fields;
}

/**
 * The picture currently on the member's profile, or null.
 *
 * Read from the member's own pointer rather than from the avatar media row,
 * because a taken-down picture keeps its row: the row carries the reason and
 * the decision, and the takedown detaches it by clearing this pointer. Asking
 * the media table instead would report a removed picture as still present, and
 * offer an administrator a control that refuses.
 */
function currentAvatar(memberId: string): { id: string; s3_key_thumb: string } | null {
  const pointer = account.findMemberAvatarPointer.get(memberId) as
    | { avatar_media_id: string | null }
    | undefined;
  if (!pointer?.avatar_media_id) return null;
  const row = media.getExistingAvatarMediaId.get(memberId) as
    | { id: string; s3_key_thumb: string }
    | undefined;
  return row && row.id === pointer.avatar_media_id ? row : null;
}

/**
 * A tier this surface may set. Rejects director standing explicitly rather than
 * relying on the dropdown to omit it, because a crafted submission does not go
 * through the dropdown.
 */
function isTier(value: string): value is MemberTier {
  return MEMBER_RECORD_TIER_VALUES.includes(value as MemberTier);
}

/**
 * The stored Active Player expiry is a moment; the form takes a date. A
 * corrected date means the standing runs to the end of that day, so a member
 * corrected to today keeps the day out rather than losing it at midnight.
 */
/** Whether two stored expiry moments fall on the same calendar day. */
function sameExpiryDate(a: string | null, b: string | null): boolean {
  if (a === null || b === null) return a === b;
  return a.slice(0, 10) === b.slice(0, 10);
}

function expiryDateToMoment(dateValue: string): string | null {
  const date = dateValue.trim();
  if (!date) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new ValidationError('Enter the expiry as a date, or leave it blank to end the standing.');
  }
  const moment = new Date(`${date}T23:59:59.999Z`);
  if (Number.isNaN(moment.getTime())) {
    throw new ValidationError('Enter a real calendar date.');
  }
  return moment.toISOString();
}

export const adminMemberService = {
  /**
   * The lookup. An administrator names a member by exact id, profile URL or
   * login email, or by part of their display name.
   */
  getMemberLookupPage(rawQuery: string): PageViewModel<AdminMemberLookupContent> {
    const query = rawQuery.trim();
    const title = 'Members';
    let results: LookupResultView[] = [];
    let hasMore = false;
    let errorMessage: string | undefined;

    if (query !== '' && query.length < MIN_LOOKUP_QUERY) {
      errorMessage = `Enter at least ${MIN_LOOKUP_QUERY} characters, or an exact member id, profile URL, or email.`;
    } else if (query !== '') {
      const escaped = query.toLowerCase().replace(/[\\%_]/g, (ch) => `\\${ch}`);
      // One over the cap, so a full page of results can be told apart from a
      // set that was truncated. The extra row is dropped before rendering.
      // The profile URL is stored lowercase, so the exact-key comparison is made
      // against the lowered query; otherwise an administrator who types it with
      // any capital misses the member entirely.
      const key = query.toLowerCase();
      const ids = account.findMemberIdsForAdminSearch.all(
        query, key, key, escaped, LOOKUP_LIMIT + 1,
      ) as Array<{ id: string }>;
      hasMore = ids.length > LOOKUP_LIMIT;
      results = ids.slice(0, LOOKUP_LIMIT).map(({ id }) => {
        const row = readMember(id);
        const tier = getTierStatus(row.id);
        const location = [row.city, row.region, row.country].filter(Boolean).join(', ');
        return {
          memberId:    row.id,
          displayName: row.display_name,
          recordHref:  recordHref(row.id),
          facts:       [row.slug, location].filter((f): f is string => Boolean(f)),
          // The short chip form, which is the one home for a tier on a row
          // surface. Tier 0 carries none, so an ordinary member's row stays
          // quiet and the chips that appear all mean something.
          badges:      [tierBadgeShort(tier.tier_status), ...stateLabelsFor(row)]
            .filter((b): b is string => Boolean(b)),
        };
      });
    }

    const resultSummary = query === ''
      ? 'Search for a member by id, profile URL, login email, or part of their display name.'
      : results.length === 0
        ? 'No member matches that search.'
        : hasMore
          ? `More than ${LOOKUP_LIMIT} members match. Narrow the search to see the rest.`
          : results.length === 1
            ? 'One member matches.'
            : `${results.length} members match.`;

    return {
      seo:  { title, noindex: true },
      page: { sectionKey: '', pageKey: 'admin_members', title },
      content: {
        query,
        hasQuery:   query !== '',
        results,
        hasResults: results.length > 0,
        resultSummary,
        hasMore,
        errorMessage,
      },
    };
  },

  /** The member record: everything an administrator acts on, in one place. */
  getMemberRecordPage(
    memberId: string,
    opts: { outcome?: string | null; errorMessage?: string } = {},
  ): PageViewModel<AdminMemberRecordContent> {
    const row = readMember(memberId);
    const tier = getTierStatus(row.id);
    const activePlayer = getActivePlayerStatus(row.id);
    const links = account.findIdentityLinks.get(row.id) as
      | {
          legacy_member_id: string | null;
          legacy_claimed_at: string | null;
          historical_person_id: string | null;
          historical_person_name: string | null;
        }
      | undefined;

    const identityLinks: FactRow[] = [];
    if (links?.legacy_member_id) {
      identityLinks.push({ label: 'Legacy account', value: links.legacy_member_id });
      identityLinks.push({ label: 'Claimed', value: dateOrDash(links.legacy_claimed_at) });
    }
    if (links?.historical_person_id) {
      identityLinks.push({
        label: 'Historical record',
        value: links.historical_person_name ?? links.historical_person_id,
      });
    }

    const expiresAt = activePlayer.active_player_expires_at;
    const location = [row.city, row.region, row.country].filter(Boolean).join(', ');
    // A correction just applied outranks the account's standing state, because
    // it is the answer to what the administrator did a moment ago.
    const outcomeNotice = opts.outcome && isCorrectionOutcome(opts.outcome)
      ? OUTCOME_NOTICE[opts.outcome]
      : undefined;

    return {
      // The tab title is fixed rather than the member's name: the layout
      // prefixes it with the site name, and a member whose own name carries
      // that word would read as nonsense there.
      seo:  { title: 'Member Record', noindex: true },
      page: {
        sectionKey: '',
        pageKey:    'admin_member_record',
        title:      row.display_name,
        // A standing note about the account (deceased, deletion pending) is not
        // an outcome, so it carries no tone and reads neutral.
        notice:     outcomeNotice ? outcomeNotice[1] : recordNotice(row),
        ...(outcomeNotice ? { noticeTone: outcomeNotice[0] } : {}),
      },
      navigation: {
        contextLinks: [{ label: 'Back to the Member Lookup', href: '/admin/members' }],
      },
      content: {
        memberId:        row.id,
        displayName:     row.display_name,
        slugLabel:       displayOrDash(row.slug),
        profileHref:     row.slug ? `/members/${row.slug}` : null,
        isSystemAccount: row.is_system === 1,
        identifyingFacts: [
          row.slug ? `Profile URL ${row.slug}` : null,
          `Member id ${row.id}`,
          location || null,
        ].filter((f): f is string => Boolean(f)),
        // The short chip form here; the fuller label has its own row in the
        // membership block below, where there is room for it.
        stateLabels: [tierBadgeShort(tier.tier_status), ...stateLabelsFor(row)]
          .filter((b): b is string => Boolean(b)),
        identity: [
          { label: 'Display name', value: row.display_name },
          { label: 'Recorded legal name', value: displayOrDash(row.real_name) },
          { label: 'Given names', value: displayOrDash(row.given_names) },
          { label: 'Family name', value: displayOrDash(row.family_name) },
          { label: 'Member id', value: row.id },
          { label: 'Profile URL', value: displayOrDash(row.slug) },
        ],
        standing: [
          { label: 'Membership tier', value: TIER_LABEL[tier.tier_status] },
          {
            label: 'Underlying tier',
            value: tier.underlying_tier_status ? TIER_LABEL[tier.underlying_tier_status] : '—',
          },
          {
            label: 'Active Player',
            value: activePlayer.is_active_player === 1 ? 'Current' : 'None',
          },
          { label: 'Active Player expiry', value: dateOrDash(expiresAt) },
          {
            label: 'Honors and roles',
            value: [
              row.is_hof ? 'Hall of Fame' : null,
              row.is_bap ? 'Big Add Posse' : null,
              row.is_board ? 'IFPA Board' : null,
            ].filter(Boolean).join(', ') || '—',
          },
        ],
        accountState: [
          { label: 'Registered', value: dateOrDash(row.created_at) },
          { label: 'Email verified', value: dateOrDash(row.email_verified_at) },
          { label: 'Email delivery', value: emailStatusLabel(row.email_status) },
          { label: 'Last signed in', value: dateOrDash(row.last_login_at) },
          { label: 'Deceased', value: row.is_deceased === 1 ? dateOrDash(row.deceased_at) : 'No' },
          { label: 'Deleted', value: dateOrDash(row.deleted_at) },
          { label: 'Deletion grace ends', value: dateOrDash(row.deletion_grace_expires_at) },
          { label: 'Personal data purged', value: dateOrDash(row.personal_data_purged_at) },
        ],
        contact: [
          { label: 'Login email', value: displayOrDash(row.login_email) },
          { label: 'Location', value: location || '—' },
          { label: 'Phone', value: displayOrDash(row.phone) },
          { label: 'WhatsApp', value: displayOrDash(row.whatsapp) },
          { label: 'Date of birth', value: dateOrDash(row.birth_date) },
          { label: 'Gender', value: genderLabel(row.gender) },
          { label: 'IFPA joined', value: dateOrDash(row.ifpa_join_date) },
        ],
        identityLinks,
        hasIdentityLinks: identityLinks.length > 0,
        form: {
          givenNames:  row.given_names ?? '',
          familyName:  row.family_name ?? '',
          displayName: row.display_name,
          slug:        row.slug ?? '',
          tierOptions: tierOptionsFor(tier.tier_status),
          activePlayerExpiryDate: expiresAt ? expiresAt.slice(0, 10) : '',
        },
        nameAction:         `/admin/members/${row.id}/name`,
        slugAction:         `/admin/members/${row.id}/slug`,
        tierAction:         `/admin/members/${row.id}/tier`,
        profileForm:        profileFormFor(row),
        canCorrectProfile:  profileIsCorrectable(row),
        profileAction:      `/admin/members/${row.id}/profile`,
        activePlayerAction: `/admin/members/${row.id}/active-player`,
        hasAvatar:          currentAvatar(row.id) !== null,
        avatarRemoveAction: `/admin/members/${row.id}/avatar/remove`,
        isDeceasedMarked:     row.is_deceased === 1,
        deceasedMarkAction:   `/admin/members/${row.id}/deceased`,
        deceasedRevertAction: `/admin/members/${row.id}/deceased/revert`,
        deceasedGraceNote:    deceasedGraceNote(),
        elsewhereLinks: [
          { label: "This member's history in the audit log", href: `/admin/audit-log?member=${row.id}` },
          { label: 'The honour tier grant page, where a grant names its own member', href: '/admin/honor-grants' },
          { label: 'The admin roles page, where a grant names its own member', href: '/admin/admin-roles' },
        ],
        errorMessage:       opts.errorMessage,
      },
    };
  },

  /**
   * Preview a name correction: resolve the member, run the same rules the
   * commit will run, and show what would change. Nothing is written.
   */
  previewNameCorrection(
    memberId: string,
    input: { givenNames: string; familyName: string; displayName: string },
    rawReason: string,
  ): PageViewModel<AdminMemberConfirmContent> {
    const row = readMember(memberId);
    const reason = requireReason(rawReason);
    // Running the correction against the member's current names tells us both
    // that the input is legal and exactly which names would move, without a
    // second copy of the rules living here.
    const preview = identityAccessService.previewMemberNames(row.id, input);

    const changes: ChangeRow[] = [
      { label: 'Given names', before: displayOrDash(row.given_names), after: displayOrDash(preview.givenNames) },
      { label: 'Family name', before: displayOrDash(row.family_name), after: displayOrDash(preview.familyName) },
      { label: 'Display name', before: row.display_name, after: preview.displayName },
      { label: 'Recorded legal name', before: displayOrDash(row.real_name), after: preview.realName },
    ].filter((c) => c.before !== c.after);

    return confirmEnvelope('Confirm: Correct the Member Name', {
      memberId:    row.id,
      displayName: row.display_name,
      slugLabel:   displayOrDash(row.slug),
      summary: 'The corrected name is held to every rule a name is held to at registration. '
        + "The member's profile URL, their provenance tags, and their galleries are untouched.",
      changes,
      hasChanges:      changes.length > 0,
      noChangeMessage: changes.length > 0 ? null : 'These are the names the record already holds. Nothing would change.',
      reason,
      hiddenFields: [
        { name: 'given_names',  value: input.givenNames },
        { name: 'family_name',  value: input.familyName },
        { name: 'display_name', value: input.displayName },
        { name: 'reason',       value: reason },
      ],
      confirmAction: `/admin/members/${row.id}/name/confirm`,
      confirmLabel:  'Yes, Correct the Name',
      cancelHref:    recordHref(row.id),
    });
  },

  /** Commit a name correction. Re-resolves and re-validates before writing. */
  applyNameCorrection(
    actorId: string,
    memberId: string,
    input: { givenNames: string; familyName: string; displayName: string },
    rawReason: string,
  ): CorrectionOutcome {
    const reason = requireReason(rawReason);
    const result = identityAccessService.correctMemberNames(actorId, memberId, input, reason);
    return result.status === 'corrected' ? 'name_corrected' : 'name_unchanged';
  },

  /** Preview a tier change. Nothing is written. */
  previewTierChange(
    memberId: string,
    rawTier: string,
    rawReason: string,
  ): PageViewModel<AdminMemberConfirmContent> {
    const row = readMember(memberId);
    const reason = requireReason(rawReason);
    const tier = rawTier.trim();
    if (!isTier(tier)) {
      throw new ValidationError(
        'Choose one of the three membership tiers. Director standing is set on the honour and board page.',
      );
    }
    const current = getTierStatus(row.id);

    const changes: ChangeRow[] = current.tier_status === tier
      ? []
      : [{ label: 'Membership tier', before: TIER_LABEL[current.tier_status], after: TIER_LABEL[tier] }];

    return confirmEnvelope('Confirm: Change the Membership Tier', {
      memberId:    row.id,
      displayName: row.display_name,
      slugLabel:   displayOrDash(row.slug),
      summary: 'The member is emailed about a change to their membership status. '
        + 'Active Player standing is managed separately from the membership tier.',
      changes,
      hasChanges:      changes.length > 0,
      noChangeMessage: changes.length > 0
        ? null
        : 'The member already holds this tier. Recording it again writes a ledger entry carrying the new reason, and sends no email.',
      reason,
      hiddenFields: [
        { name: 'tier',   value: tier },
        { name: 'reason', value: reason },
      ],
      confirmAction: `/admin/members/${row.id}/tier/confirm`,
      confirmLabel:  'Yes, Change the Tier',
      cancelHref:    recordHref(row.id),
    });
  },

  /** Commit a tier change through the service that owns the tier ledger. */
  applyTierChange(
    actorId: string,
    memberId: string,
    rawTier: string,
    rawReason: string,
  ): CorrectionOutcome {
    const row = readMember(memberId);
    const reason = requireReason(rawReason);
    const tier = rawTier.trim();
    if (!isTier(tier)) {
      throw new ValidationError(
        'Choose one of the three membership tiers. Director standing is set on the honour and board page.',
      );
    }
    // Read before the write: the ledger owner records a same-tier correction as
    // a reason-only entry and sends no email, and the notice must say which of
    // the two happened.
    const wasTier = getTierStatus(row.id).tier_status;
    adminOverride(actorId, row.id, tier, reason);
    return wasTier === tier ? 'tier_recorded' : 'tier_changed';
  },

  /**
   * Preview a profile-URL correction. Nothing is written, and the confirmation
   * states the one consequence that cannot be undone from here: the old address
   * stops working.
   */
  previewSlugCorrection(
    memberId: string,
    rawSlug: string,
    rawReason: string,
  ): PageViewModel<AdminMemberConfirmContent> {
    const row = readMember(memberId);
    const reason = requireReason(rawReason);
    // Runs the rules the commit runs, so an address the rules refuse never
    // reaches a confirmation screen.
    const slug = identityAccessService.previewMemberSlug(memberId, rawSlug);

    const changes: ChangeRow[] = slug === row.slug
      ? []
      : [{ label: 'Profile URL', before: displayOrDash(row.slug), after: slug }];

    return confirmEnvelope('Confirm: Correct the Profile URL', {
      memberId:    row.id,
      displayName: row.display_name,
      slugLabel:   displayOrDash(row.slug),
      summary: "The member's uploader tag moves with them, so their uploaded media and the galleries "
        + 'built on that tag keep resolving. Galleries keep the spelling in their own identifiers, '
        + 'which were fixed when each was created. The old profile URL stops working and nothing '
        + 'redirects from it, so a link the member has already shared will lead nowhere.',
      changes,
      hasChanges:      changes.length > 0,
      noChangeMessage: changes.length > 0 ? null : 'That is the profile URL the record already holds. Nothing would change.',
      caution: 'This cannot be undone by correcting it back: the old address stops resolving the '
        + 'moment this is applied, and every link already shared to it is dead from then on.',
      reason,
      hiddenFields: [
        { name: 'slug',   value: slug },
        { name: 'reason', value: reason },
      ],
      confirmAction: `/admin/members/${row.id}/slug/confirm`,
      confirmLabel:  'Yes, Correct the Profile URL',
      cancelHref:    recordHref(row.id),
    });
  },

  /** Commit the profile-URL correction through the service that owns the rules. */
  applySlugCorrection(
    actorId: string,
    memberId: string,
    rawSlug: string,
    rawReason: string,
  ): CorrectionOutcome {
    const reason = requireReason(rawReason);
    const result = identityAccessService.correctMemberSlug(actorId, memberId, rawSlug, reason);
    return result.status === 'corrected' ? 'slug_corrected' : 'slug_unchanged';
  },

  /**
   * Preview marking a member deceased, or reversing that marking. Nothing is
   * written. The confirmation spells out what follows, because most of what an
   * administrator expects to happen deliberately does not.
   */
  previewDeceasedChange(
    memberId: string,
    reverting: boolean,
  ): PageViewModel<AdminMemberConfirmContent> {
    const row = readMember(memberId);
    const alreadyMarked = row.is_deceased === 1;

    if (reverting && !alreadyMarked) {
      throw new ValidationError('This member is not marked deceased.');
    }
    if (!reverting && alreadyMarked) {
      throw new ValidationError('This member is already marked deceased.');
    }

    const changes: ChangeRow[] = [{
      label:  'Deceased',
      before: alreadyMarked ? dateOrDash(row.deceased_at) : 'No',
      after:  reverting ? 'No' : 'Yes',
    }];

    const summary = reverting
      ? 'The marking is removed and a linked historical record follows. Event registrations '
        + 'withdrawn by the marking are not reinstated, so a member returning to an event registers again. '
        + `${deceasedGraceNote()}`
      : "The member's honours, uploaded media, competition results and club history all stay exactly as "
        + 'they are. A linked historical record is marked to match, the member is withdrawn from events '
        + 'that have not happened yet, sign-in stops, and the platform sends them nothing. Their contact '
        + `details are cleared after ${deceasedGraceDays()} days.`;

    return confirmEnvelope(
      reverting ? 'Confirm: Remove the Deceased Marking' : 'Confirm: Mark the Member Deceased',
      {
        memberId:    row.id,
        displayName: row.display_name,
        slugLabel:   displayOrDash(row.slug),
        summary,
        changes,
        hasChanges:      true,
        noChangeMessage: null,
        // Only the marking cautions. Removing one is the reversal itself, and
        // it refuses rather than half-succeeding once the window has passed.
        ...(reverting ? {} : {
          caution: `This is reversible for ${deceasedGraceDays()} days and not after. Past that `
            + "window the member's contact details are cleared, and full account deletion is the "
            + 'only remaining path.',
        }),
        reason:          null,
        hiddenFields:    [],
        confirmAction: reverting
          ? `/admin/members/${row.id}/deceased/revert/confirm`
          : `/admin/members/${row.id}/deceased/confirm`,
        confirmLabel: reverting ? 'Yes, Remove the Marking' : 'Yes, Mark as Deceased',
        cancelHref:   recordHref(row.id),
      },
    );
  },

  /** Commit the marking, or its reversal, through the service that owns it. */
  applyDeceasedChange(
    actorId: string,
    memberId: string,
    reverting: boolean,
  ): CorrectionOutcome {
    if (!reverting) {
      deceasedMarkingService.markDeceased(actorId, memberId);
      return 'deceased_marked';
    }
    const result = deceasedMarkingService.revertDeceased(actorId, memberId);
    return result.status === 'reverted' ? 'deceased_reverted' : 'deceased_grace_elapsed';
  },

  /** Preview an Active Player expiry correction. Nothing is written. */
  previewActivePlayerCorrection(
    memberId: string,
    rawExpiryDate: string,
    rawReason: string,
  ): PageViewModel<AdminMemberConfirmContent> {
    const row = readMember(memberId);
    const reason = requireReason(rawReason);
    const newMoment = expiryDateToMoment(rawExpiryDate);
    const current = getActivePlayerStatus(row.id);
    const currentMoment = current.active_player_expires_at;

    // Compared on the date, matching what the ledger owner compares. The stored
    // value is a moment and the form offers a date, so comparing moments would
    // put a row on the confirmation whose before and after read identically.
    const changes: ChangeRow[] = sameExpiryDate(currentMoment, newMoment)
      ? []
      : [{
          label:  'Active Player expiry',
          before: dateOrDash(currentMoment),
          after:  newMoment ? dateOrDash(newMoment) : 'Standing ended',
        }];

    return confirmEnvelope('Confirm: Correct the Active Player Expiry', {
      memberId:    row.id,
      displayName: row.display_name,
      slugLabel:   displayOrDash(row.slug),
      summary: 'A correction is the one path that may move an expiry earlier, which is how a '
        + 'standing granted in error is taken back. Active Player is a Tier 0 status. The member '
        + 'is emailed that their standing was corrected, and told the reason you give here.',
      changes,
      hasChanges:      changes.length > 0,
      noChangeMessage: changes.length > 0 ? null : 'That is the expiry the record already holds. Nothing would change.',
      reason,
      hiddenFields: [
        { name: 'expires_on', value: rawExpiryDate.trim() },
        { name: 'reason',     value: reason },
      ],
      confirmAction: `/admin/members/${row.id}/active-player/confirm`,
      confirmLabel:  'Yes, Correct the Expiry',
      cancelHref:    recordHref(row.id),
    });
  },

  /**
   * Preview a correction of the member's profile details. Nothing is written.
   *
   * The rules are the member's own: the same validation runs on the same path,
   * so a correction cannot set a value the member's own surface would refuse,
   * and the confirmation cannot promise a change the commit would decline.
   */
  async previewProfileCorrection(
    memberId: string,
    input: ProfileEditInput,
    rawReason: string,
  ): Promise<PageViewModel<AdminMemberConfirmContent>> {
    const row = readMember(memberId);
    const reason = requireReason(rawReason);
    requireCorrectableProfile(row);

    const moved = await memberService.updateOwnProfile(
      row.slug!, input, { kind: 'administrator', memberId: 'preview', reason }, { preview: true },
    );
    const changes: ChangeRow[] = moved.map((c) => ({
      label:  PROFILE_FIELD_LABEL[c.field] ?? c.field,
      before: displayFieldValue(c.before),
      after:  displayFieldValue(c.after),
    }));

    return confirmEnvelope('Confirm: Correct the Profile Details', {
      memberId:    row.id,
      displayName: row.display_name,
      slugLabel:   displayOrDash(row.slug),
      summary: "The member's own profile is the ordinary path for these fields, and this surface is "
        + 'the backstop for when they cannot use it. Every value here passes the same rules their '
        + 'own form applies. Their written biography is not touched: it is their words, and clearing '
        + 'it is a separate action.',
      changes,
      hasChanges:      changes.length > 0,
      noChangeMessage: changes.length > 0 ? null : 'Those are the details the record already holds. Nothing would change.',
      reason,
      hiddenFields: profileHiddenFields(input, reason),
      confirmAction: `/admin/members/${row.id}/profile/confirm`,
      confirmLabel:  'Yes, Correct the Details',
      cancelHref:    recordHref(row.id),
    });
  },

  /** Commit a profile correction through the service that owns the member. */
  async applyProfileCorrection(
    actorId: string,
    memberId: string,
    input: ProfileEditInput,
    rawReason: string,
  ): Promise<CorrectionOutcome> {
    const row = readMember(memberId);
    const reason = requireReason(rawReason);
    requireCorrectableProfile(row);

    const moved = await memberService.updateOwnProfile(
      row.slug!, input, { kind: 'administrator', memberId: actorId, reason },
    );
    return moved.length > 0 ? 'profile_corrected' : 'profile_unchanged';
  },

  /** Preview a profile-picture removal. Nothing is written. */
  previewAvatarRemoval(
    memberId: string,
    rawReason: string,
  ): PageViewModel<AdminMemberConfirmContent> {
    const row = readMember(memberId);
    const reason = requireReason(rawReason);
    const avatar = currentAvatar(row.id);
    if (!avatar) {
      throw new ValidationError('This member has no profile picture to remove.');
    }

    // The before-and-after of a removal is a presence, not a value: there is no
    // copy of the image to put in a ledger, so what the row records is that one
    // was there and is not any more.
    const changes: ChangeRow[] = [{
      label:  'Profile picture',
      before: 'Set by the member',
      after:  'Removed',
    }];

    return confirmEnvelope('Confirm: Remove the Profile Picture', {
      memberId:    row.id,
      displayName: row.display_name,
      slugLabel:   displayOrDash(row.slug),
      summary: 'The picture comes off the profile and its stored files are deleted. The account, '
        + 'the membership and everything else on the record are untouched, and the member is '
        + 'emailed the reason you give here. They can upload another, so this stops a picture '
        + 'rather than a person.',
      changes,
      hasChanges:      true,
      noChangeMessage: null,
      caution: 'This cannot be undone. The stored files are deleted, and only the member can put a '
        + 'picture back by uploading a new one.',
      reason,
      previewImage: {
        // Through the avatar service's own address builder, so this screen
        // resolves the picture exactly as the profile does, under whichever
        // storage adapter is configured.
        src: buildAvatarUrl(avatar.s3_key_thumb, avatar.id) ?? '',
        // Short deliberately. The line above already names whose record this
        // is, and an object missing from storage renders its alt text inside
        // the thumbnail's box: a sentence there overflows and makes the
        // decision screen look broken at the moment it must look trustworthy.
        alt: 'Current profile picture',
      },
      hiddenFields: [{ name: 'reason', value: reason }],
      confirmAction: `/admin/members/${row.id}/avatar/remove/confirm`,
      confirmLabel:  'Yes, Remove the Picture',
      cancelHref:    recordHref(row.id),
    });
  },

  /**
   * Commit a profile-picture removal through the takedown every removed item
   * goes through. This surface is the second door onto that one act, not a
   * second way of performing it: an administrator standing on a member's record
   * has no report in front of them, and that is the only difference.
   */
  async applyAvatarRemoval(
    actorId: string,
    memberId: string,
    rawReason: string,
  ): Promise<CorrectionOutcome> {
    const row = readMember(memberId);
    const reason = requireReason(rawReason);
    const avatar = currentAvatar(row.id);
    if (!avatar) {
      throw new ValidationError('This member has no profile picture to remove.');
    }
    const result = await getDefaultMediaModerationService().decideDelete({
      mediaId: avatar.id,
      adminMemberId: actorId,
      reason,
    });
    if (result.status !== 'decided') {
      throw new ValidationError('That picture has already been taken down.');
    }
    return result.storageRemoved ? 'avatar_removed' : 'avatar_removed_storage_pending';
  },

  /** Commit an Active Player expiry correction through the ledger's owner. */
  applyActivePlayerCorrection(
    actorId: string,
    memberId: string,
    rawExpiryDate: string,
    rawReason: string,
  ): CorrectionOutcome {
    const row = readMember(memberId);
    const reason = requireReason(rawReason);
    const newMoment = expiryDateToMoment(rawExpiryDate);
    const result = correctActivePlayerExpiry(actorId, row.id, newMoment, reason);
    switch (result.status) {
      case 'corrected':
        return result.expiresAt ? 'active_player_corrected' : 'active_player_ended';
      case 'unchanged':
        return 'active_player_unchanged';
      case 'not_applicable':
        return 'active_player_not_applicable';
    }
  },
};
