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
 *   - The document answers an access request, so it carries what other people
 *     recorded about the member as well as what the member did: grant reasons,
 *     vouches received, flags on their media, an administrator's questions and
 *     notes, work-queue items, and the audit entries where the member is the
 *     subject. What it leaves out is the other person: no actor, voucher,
 *     reporter, sender or administrator is ever selected, and neither is free
 *     text that names or identifies another person.
 *   - Excluded by rule rather than by omission, each enforced at the statement:
 *     how the member voted (the encrypted ballot envelope and the receipt-token
 *     hash are never selected); payment-provider identifiers, correlation keys
 *     and transition metadata; email bodies and provider message identifiers,
 *     because a reset or verification body carries a live link (mail is listed
 *     by subject, kind and time); a flag reporter's own wording on the member's
 *     media, which can identify the reporter; the reason text on a work-queue
 *     item, where an identity-link request stores a payload naming the other
 *     accounts holding the disputed records; the onboarding steps' held answers,
 *     which carry the claim target and held claim evidence and can point at
 *     another person's legacy record, so each step carries its type, state and
 *     times only; and everything in the audit ledger beyond the action type and
 *     the time, because its metadata, reason and actor are free-form or name
 *     who acted.
 *   - Every repeating section is capped at a fixed ceiling, and each section
 *     cut there is named in `incompleteSections`, inside the file itself, so a
 *     member never reads a truncated section as the whole of it. The two audit
 *     sections are uncapped: each entry is a type and a time, and the
 *     seven-year purge bounds them.
 *   - The download is a read: it is built fresh on each request and writes
 *     nothing, so it is safe to repeat and safe for anything that follows links.
 *
 * Persistence: reads members, member_tier_grants, active_player_grants,
 *   active_player_vouches, member_club_affiliations, club_leaders,
 *   club_insight_notes, club_viability_signals, registrations,
 *   event_organizers, mailing_list_subscriptions, outbox_emails,
 *   member_messages, work_queue_items, member_onboarding_tasks, media_items,
 *   media_tags, media_flags, member_galleries, member_gallery_tags,
 *   member_gallery_exclude_tags, gallery_external_links, payments,
 *   payment_status_transitions, recurring_donation_subscriptions,
 *   recurring_donation_subscription_transitions, ballots,
 *   member_declared_anchors, legacy_members, member_links, audit_entries.
 *   Writes nothing.
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
  /** The dotted path of every section cut at the per-section ceiling, so the
   *  member can tell from the file itself that it is incomplete. Empty when
   *  every section is whole. */
  incompleteSections: string[];
  member: Record<string, unknown>;
  membership: {
    tier: unknown;
    activePlayer: unknown;
    tierHistory: unknown[];
    activePlayerHistory: unknown[];
    vouchesReceived: unknown[];
  };
  emailSubscriptions: unknown[];
  mailReceived: unknown[];
  messagesReceived: unknown[];
  clubs: {
    affiliations: unknown[];
    leadership: unknown[];
    insightNotes: unknown[];
    viabilitySignals: unknown[];
  };
  eventRegistrations: unknown[];
  eventsOrganized: unknown[];
  media: {
    items: unknown[];
    flagsOnOwnMedia: unknown[];
    flagsRaised: unknown[];
    galleries: unknown[];
    galleryTags: unknown[];
    galleryExternalLinks: unknown[];
  };
  payments: {
    history: unknown[];
    statusTransitions: unknown[];
    recurringDonations: unknown[];
    recurringDonationTransitions: unknown[];
  };
  votesParticipatedIn: unknown[];
  declaredAnchors: unknown[];
  /** The archival snapshot of the old-site account this member claimed. The
   *  street address and postcode live here and deliberately not on the member
   *  row, so this is the only place an export can honestly find them. */
  legacyAccount: Record<string, unknown> | null;
  externalLinks: unknown[];
  onboardingSteps: unknown[];
  workQueueItemsAboutMember: unknown[];
  /** Each audit entry where the member is the actor: action type and time. */
  ownActions: unknown[];
  /** Each audit entry where the member is the subject and someone else, or the
   *  system, acted: action type and time. */
  actionsOnMemberRecord: unknown[];
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

    const incompleteSections: string[] = [];
    const capped = (section: string, rows: unknown[]): unknown[] => {
      if (rows.length <= SECTION_CAP) return rows;
      incompleteSections.push(section);
      return rows.slice(0, SECTION_CAP);
    };

    // The tier read throws when a member holds no tier row at all, which is a
    // real state rather than an error here: an export says what is true, and
    // "no membership recorded" is true.
    let current: { tier: unknown; activePlayer: unknown };
    try {
      current = {
        tier:         memberTier.getCurrent.get(memberId) ?? null,
        activePlayer: activePlayer.getCurrent.get(memberId) ?? null,
      };
    } catch {
      current = { tier: null, activePlayer: null };
    }

    const mediaItems = capped('media.items', memberExport.media.all(memberId));
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
      incompleteSections,
      member:             profile,
      membership: {
        ...current,
        tierHistory:         capped('membership.tierHistory', memberExport.tierGrantHistory.all(memberId)),
        activePlayerHistory: capped('membership.activePlayerHistory', memberExport.activePlayerGrantHistory.all(memberId)),
        vouchesReceived:     capped('membership.vouchesReceived', memberExport.vouchesReceived.all(memberId)),
      },
      emailSubscriptions: capped('emailSubscriptions', memberExport.mailingListSubscriptions.all(memberId)),
      mailReceived:       capped('mailReceived', memberExport.mailReceived.all(memberId)),
      messagesReceived:   capped('messagesReceived', memberExport.messagesReceived.all(memberId)),
      clubs: {
        affiliations:     capped('clubs.affiliations', memberExport.clubAffiliations.all(memberId)),
        leadership:       capped('clubs.leadership', memberExport.clubLeadership.all(memberId)),
        insightNotes:     capped('clubs.insightNotes', memberExport.clubInsightNotes.all(memberId)),
        viabilitySignals: capped('clubs.viabilitySignals', memberExport.clubViabilitySignals.all(memberId)),
      },
      eventRegistrations: capped('eventRegistrations', memberExport.registrations.all(memberId)),
      eventsOrganized:    capped('eventsOrganized', memberExport.eventOrganizerRoles.all(memberId)),
      media: {
        items:                itemsWithTags,
        flagsOnOwnMedia:      capped('media.flagsOnOwnMedia', memberExport.flagsOnOwnMedia.all(memberId)),
        flagsRaised:          capped('media.flagsRaised', memberExport.flagsRaised.all(memberId)),
        galleries:            capped('media.galleries', media.listMemberGalleriesByOwner.all(memberId)),
        galleryTags:          capped('media.galleryTags', memberExport.galleryTags.all(memberId, memberId)),
        galleryExternalLinks: capped('media.galleryExternalLinks', memberExport.galleryExternalLinks.all(memberId)),
      },
      payments: {
        history:                      capped('payments.history', payments.listByMember.all(memberId)),
        statusTransitions:            capped('payments.statusTransitions', memberExport.paymentTransitions.all(memberId)),
        recurringDonations:           capped('payments.recurringDonations', memberExport.recurringDonations.all(memberId)),
        recurringDonationTransitions: capped('payments.recurringDonationTransitions', memberExport.recurringDonationTransitions.all(memberId)),
      },
      votesParticipatedIn: capped('votesParticipatedIn', memberExport.voteParticipation.all(memberId)),
      declaredAnchors:     capped('declaredAnchors', declaredAnchors.listByMember.all(memberId)),
      legacyAccount,
      externalLinks:       capped('externalLinks', memberLinks.listByMember.all(memberId)),
      onboardingSteps:     capped('onboardingSteps', memberExport.onboardingTasks.all(memberId)),
      workQueueItemsAboutMember: capped('workQueueItemsAboutMember', memberExport.workQueueItemsAbout.all(memberId)),
      // Both audit sections are uncapped: each entry is only a type and a time,
      // and the seven-year purge bounds them, while a cap here would keep the
      // oldest entries and drop the newest.
      ownActions:            memberExport.ownAuditActions.all(memberId),
      actionsOnMemberRecord: memberExport.auditActionsAbout.all(memberId, memberId),
    };

    return { document, truncated: incompleteSections.length > 0 };
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
