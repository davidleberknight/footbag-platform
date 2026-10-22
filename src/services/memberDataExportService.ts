/**
 * MemberDataExportService -- a member asking for a copy of their own data.
 *
 * Owns:
 *   - Assembling the export document: which sections it carries and, more
 *     importantly, which fields never enter it.
 *   - Shaping the file the signed-in member downloads from their own profile.
 *
 * Does not own:
 *   - Deletion or erasure of any kind (AccountDeletionService marks, MemberService
 *     purges). An export reads and writes nothing about the member.
 *   - The ownership gate: the route admits only the signed-in member to their
 *     own download, before this service is reached.
 *   - The profile page the download is offered from (MemberService shapes it).
 *
 * Required patterns:
 *   - Every read is keyed on the requesting member and returns only their own
 *     rows. No section is sourced from a page-facing read, because those filter
 *     for what a visitor may see rather than for what the platform holds: the
 *     member's own media read hides avatars and administrator-hidden items, the
 *     subscriptions read hides lists they cannot manage, the clubs read hides
 *     affiliations they have left. An export that inherited those filters would
 *     under-answer the request it exists to answer.
 *   - Three things are excluded by rule rather than by omission, and each is
 *     enforced at the statement: how the member voted (the encrypted ballot
 *     envelope and the receipt-token hash are never selected), payment-provider
 *     identifiers, and everything in the audit ledger beyond the member's own
 *     actions. Those actions are carried as the action type and the time only:
 *     the ledger's metadata, reason and entity are free-form and routinely name
 *     other people, and an entry where the member is only the subject records
 *     someone else's act.
 *   - The download is a read: it is built fresh on each request and writes
 *     nothing, so it is safe to repeat and safe for anything that follows links.
 *
 * Persistence: reads members, member_club_affiliations, club_leaders,
 *   registrations, mailing_list_subscriptions, media_items, media_tags,
 *   member_galleries, payments, recurring_donation_subscriptions, ballots,
 *   member_declared_anchors, legacy_members, audit_entries. Writes nothing.
 *
 * Side effects: none.
 *
 * Service shape: singleton object literal; it reaches no adapter.
 */
import {
  memberExport,
  media,
  memberLinks,
  declaredAnchors,
  legacyMembers,
  memberTier,
  activePlayer,
  payments,
} from '../db/db';
import { NotFoundError } from './serviceErrors';

/**
 * The ceiling on any one repeating section. A member's own data is small, so
 * this is a guard against a pathological row count rather than a page size.
 */
const SECTION_CAP = 5000;

interface ProfileRow {
  id: string;
  legacy_member_id: string | null;
  [column: string]: unknown;
}

export interface MemberDataExport {
  exportedAt: string;
  member: Record<string, unknown>;
  membership: Record<string, unknown>;
  emailSubscriptions: unknown[];
  clubs: { affiliations: unknown[]; leadership: unknown[] };
  eventRegistrations: unknown[];
  media: { items: unknown[]; galleries: unknown[] };
  payments: { history: unknown[]; recurringDonations: unknown[] };
  votesParticipatedIn: unknown[];
  declaredAnchors: unknown[];
  /** The archival snapshot of the old-site account this member claimed. The
   *  street address and postcode live here and deliberately not on the member
   *  row, so this is the only place an export can honestly find them. */
  legacyAccount: Record<string, unknown> | null;
  externalLinks: unknown[];
  /** Each audit entry where the member is the actor: action type and time. */
  ownActions: unknown[];
}

function capped<T>(rows: T[], truncated: { hit: boolean }): T[] {
  if (rows.length <= SECTION_CAP) return rows;
  truncated.hit = true;
  return rows.slice(0, SECTION_CAP);
}

export const memberDataExportService = {
  /**
   * Assemble everything the platform holds about one member. Throws when the
   * member does not exist; every caller reaches this behind an ownership gate,
   * so a miss is a bug rather than a visitor probing.
   */
  buildExport(memberId: string): { document: MemberDataExport; truncated: boolean } {
    const profile = memberExport.profile.get(memberId) as ProfileRow | undefined;
    if (!profile) throw new NotFoundError(`member ${memberId} not found`);

    const truncated = { hit: false };

    // The tier read throws when a member holds no tier row at all, which is a
    // real state rather than an error here: an export says what is true, and
    // "no membership recorded" is true.
    let membership: Record<string, unknown>;
    try {
      membership = {
        tier:         memberTier.getCurrent.get(memberId) ?? null,
        activePlayer: activePlayer.getCurrent.get(memberId) ?? null,
      };
    } catch {
      membership = { tier: null, activePlayer: null };
    }

    const mediaItems = capped(memberExport.media.all(memberId) as unknown[], truncated);
    const tagRows = memberExport.mediaTags.all(memberId) as { media_id: string; tag_display: string }[];
    const tagsByMedia = new Map<string, string[]>();
    for (const row of tagRows) {
      const list = tagsByMedia.get(row.media_id) ?? [];
      list.push(row.tag_display);
      tagsByMedia.set(row.media_id, list);
    }
    const itemsWithTags = mediaItems.map((item) => {
      const row = item as { id: string };
      return { ...row, tags: tagsByMedia.get(row.id) ?? [] };
    });

    // The legacy snapshot is read only through the claim the member's own row
    // records. Reading it by identifier alone would return a row whoever asked
    // for it, claimed or not.
    const legacyAccount = profile.legacy_member_id
      ? (legacyMembers.findByLegacyMemberId.get(profile.legacy_member_id) as Record<string, unknown> | undefined) ?? null
      : null;

    const document: MemberDataExport = {
      exportedAt:         new Date().toISOString(),
      member:             profile,
      membership,
      emailSubscriptions: capped(memberExport.mailingListSubscriptions.all(memberId) as unknown[], truncated),
      clubs: {
        affiliations: capped(memberExport.clubAffiliations.all(memberId) as unknown[], truncated),
        leadership:   capped(memberExport.clubLeadership.all(memberId) as unknown[], truncated),
      },
      eventRegistrations: capped(memberExport.registrations.all(memberId) as unknown[], truncated),
      media: {
        items:     itemsWithTags,
        galleries: capped(media.listMemberGalleriesByOwner.all(memberId) as unknown[], truncated),
      },
      payments: {
        history:           capped(payments.listByMember.all(memberId) as unknown[], truncated),
        recurringDonations: capped(memberExport.recurringDonations.all(memberId) as unknown[], truncated),
      },
      votesParticipatedIn: capped(memberExport.voteParticipation.all(memberId) as unknown[], truncated),
      declaredAnchors:     capped(declaredAnchors.listByMember.all(memberId) as unknown[], truncated),
      legacyAccount,
      externalLinks:       capped(memberLinks.listByMember.all(memberId) as unknown[], truncated),
      // Every own action, uncapped: each is only a type and a time, and the
      // seven-year purge bounds them, while a cap here kept the oldest and
      // silently dropped the newest.
      ownActions:          memberExport.ownAuditActions.all(memberId) as unknown[],
    };

    return { document, truncated: truncated.hit };
  },

  /** The file itself, shaped the way the one existing download in the codebase
   *  shapes its own: the service owns the type, the name and the bytes, and the
   *  controller only sets two headers. */
  getExportBody(memberId: string): { contentType: string; filename: string; body: string; truncated: boolean } {
    const { document, truncated } = this.buildExport(memberId);
    return {
      contentType: 'application/json',
      filename:    'footbag-my-data.json',
      body:        JSON.stringify(document, null, 2),
      truncated,
    };
  },
};
