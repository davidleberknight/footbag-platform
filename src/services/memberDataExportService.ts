/**
 * MemberDataExportService -- a member asking for a copy of their own data.
 *
 * Owns:
 *   - Assembling the export document: which sections it carries and, more
 *     importantly, which fields never enter it.
 *   - The request action: issuing the single-use download token, emailing the
 *     link to the verified address, and the audit row.
 *   - Serving the file once, against that token.
 *
 * Does not own:
 *   - Deletion or erasure of any kind (AccountDeletionService marks, MemberService
 *     purges). An export reads and writes nothing about the member.
 *   - The token primitive itself (AccountTokenService hashes, expires and
 *     single-uses it; this service only says which type and how long).
 *   - The profile page the request is made from (MemberService shapes it).
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
 *     identifiers, and the audit ledger. The ledger is out because the right of
 *     access does not extend to it and because its metadata is free-form and
 *     routinely names other people.
 *   - The link goes to the verified address rather than straight to the browser
 *     that asked, so possession of the mailbox is what unlocks the file.
 *
 * Persistence: reads members, member_club_affiliations, club_leaders,
 *   registrations, mailing_list_subscriptions, media_items, media_tags,
 *   member_galleries, payments, recurring_donation_subscriptions, ballots,
 *   member_declared_anchors, legacy_members. Writes account_tokens and
 *   audit_entries only.
 *
 * Side effects:
 *   - audit_entries append (`member.data_exported`)
 *   - outbox enqueue (the download link)
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
  recurringDonationSubscriptions,
} from '../db/db';
import { config } from '../config/env';
import { readIntConfig } from './configReader';
import { appendAuditEntry } from './auditService';
import { accountTokenService } from './accountTokenService';
import { emailService } from './emailService';
import { NotFoundError } from './serviceErrors';

/**
 * The ceiling on any one repeating section. A member's own data is small, so
 * this is a guard against a pathological row count rather than a page size; the
 * audit row records whether it bit, following the convention the administrator
 * audit export already sets, which keeps the truncation discoverable without
 * putting a marker inside the document a consumer parses.
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
        recurringDonations: capped(recurringDonationSubscriptions.listByMember.all(memberId) as unknown[], truncated),
      },
      votesParticipatedIn: capped(memberExport.voteParticipation.all(memberId) as unknown[], truncated),
      declaredAnchors:     capped(declaredAnchors.listByMember.all(memberId) as unknown[], truncated),
      legacyAccount,
      externalLinks:       capped(memberLinks.listByMember.all(memberId) as unknown[], truncated),
    };

    return { document, truncated: truncated.hit };
  },

  /**
   * The member asks for their data. The file is not handed to the browser that
   * asked: a single-use link goes to the verified address, so the thing that
   * unlocks a document full of personal data is possession of the mailbox rather
   * than possession of whatever session happens to be open.
   *
   * The document is built here rather than at download time only to the extent
   * of proving the member exists; the bytes are assembled when the link is used,
   * so a link used later carries current data rather than a stale snapshot.
   */
  requestExport(memberId: string): { status: 'sent' } | { status: 'not_found' } {
    const profile = memberExport.profile.get(memberId) as
      | { id: string; slug: string | null; display_name: string; login_email: string | null }
      | undefined;
    if (!profile || !profile.login_email) return { status: 'not_found' };

    const ttlHours = readIntConfig('data_export_link_expiry_hours', 72);
    const { rawToken, tokenRowId } = accountTokenService.issueToken({
      memberId,
      tokenType: 'data_export',
      ttlHours,
    });
    const baseUrl = config.publicBaseUrl.replace(/\/+$/, '');
    const downloadUrl = `${baseUrl}/members/${profile.slug ?? profile.id}/download/${rawToken}`;

    emailService.send({
      template: 'data_export_ready',
      params:   { memberName: profile.display_name, downloadUrl, ttlHours },
      recipientEmail:    profile.login_email,
      recipientMemberId: memberId,
      idempotencyKey:    `data-export:${tokenRowId}`,
    });

    appendAuditEntry({
      actionType:    'member.data_exported',
      category:      'member',
      actorType:     'member',
      actorMemberId: memberId,
      entityType:    'member',
      entityId:      memberId,
      reasonText:    null,
      metadata:      { link_ttl_hours: ttlHours },
    });

    return { status: 'sent' };
  },

  /** Spend the emailed link. Single use and expiry are enforced inside the
   *  token statement's own WHERE clause rather than by a read here, so two
   *  simultaneous clicks cannot both win. */
  consumeDownloadToken(rawToken: string): { memberId: string } | null {
    const consumed = accountTokenService.consumeToken(rawToken, 'data_export');
    return consumed ? { memberId: consumed.memberId } : null;
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
