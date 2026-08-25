/**
 * AdminHonorGrantService -- the post-go-live admin surface for HoF/BAP honor
 * tier grants.
 *
 * Owns the honor-grant page and confirmation view-models, resolves and validates
 * the target member (active-member lookup) and the honor (hof/bap allowlist), and
 * delegates the write to `membershipTieringService.applyHonorGrant`, which owns
 * the ledger row, the audit row, the congrats email, and the authoritative
 * duplicate guard. This service writes nothing itself; the confirmation carries
 * only the member key and honor, both re-resolved and re-validated at commit.
 */
import { account, memberTier } from '../db/db';
import {
  applyHonorGrant,
  getTierStatus,
  hasHonorGrant,
  removeGovernanceTier3,
  removeHonorGrant,
  setGovernanceTier3,
  type MemberTier,
} from './membershipTieringService';
import { ValidationError } from './serviceErrors';
import { PageViewModel } from '../types/page';

type Honor = 'hof' | 'bap';

const HONOR_LABEL: Record<Honor, string> = {
  hof: 'Hall of Fame',
  bap: 'Big Add Posse',
};

const TIER_LABEL: Record<MemberTier, string> = {
  tier0: 'Tier 0 (none)',
  tier1: 'Tier 1',
  tier2: 'Tier 2',
  tier3: 'Tier 3',
};

const RECENT_LIMIT = 20;

interface RecentHonorGrant {
  honorLabel: string;
  displayName: string;
  slug: string;
  occurredAt: string;
  /** Set where the grant was not recorded as real business, null when it was. */
  dataOriginLabel: string | null;
}

interface HonorGrantsContent {
  errorMessage?: string;
  recent: RecentHonorGrant[];
}

interface HonorGrantConfirmContent {
  memberKey: string;
  honor: Honor;
  honorLabel: string;
  displayName: string;
  slug: string;
  tierLabel: string;
  /** The year as the form carries it, and as the confirmation reads it. */
  inductionYear: string;
  inductionYearLabel: string;
  alreadyGranted: boolean;
  confirmHref: string;
  cancelHref: string;
}

function normalizeHonor(raw: string): Honor {
  const h = raw.trim().toLowerCase();
  if (h === 'hof' || h === 'bap') return h;
  throw new ValidationError('Choose a valid honor: Hall of Fame or Big Add Posse.');
}

function resolveMember(memberKey: string): { id: string; slug: string; display_name: string } {
  const key = memberKey.trim();
  const member = account.findActiveMemberByKey.get(key, key) as
    | { id: string; slug: string; display_name: string }
    | undefined;
  if (!member) throw new ValidationError('No active member with that id or slug.');
  return member;
}

/** The one confirmation shape the correction and governance actions share. */
export interface HonorActionConfirmContent {
  memberKey: string;
  displayName: string;
  slug: string;
  summary: string;
  facts: Array<{ label: string; value: string }>;
  reason: string;
  hiddenFields: Array<{ name: string; value: string }>;
  confirmAction: string;
  confirmLabel: string;
  cancelHref: string;
}

function requireReason(raw: string): string {
  const reason = raw.trim();
  if (!reason) throw new ValidationError('Enter the reason for this change.');
  return reason;
}

/** The induction year as the form supplies it: a four-digit year, or nothing. */
function readInductionYear(raw: string): number | null {
  const value = raw.trim();
  if (value === '') return null;
  if (!/^\d{4}$/.test(value)) {
    throw new ValidationError('Enter the induction year as a four-digit year, or leave it blank.');
  }
  return Number(value);
}

function confirmEnvelope(
  title: string,
  content: HonorActionConfirmContent,
): PageViewModel<HonorActionConfirmContent> {
  return {
    seo:  { title, noindex: true },
    page: { sectionKey: '', pageKey: 'admin_honor_action_confirm', title },
    content,
  };
}

export const adminHonorGrantService = {
  /** The honor-grant form plus the recent-grants accountability list. */
  getHonorGrantsPage(opts: { errorMessage?: string } = {}): PageViewModel<HonorGrantsContent> {
    const rows = memberTier.listRecentHonorGrants.all(RECENT_LIMIT) as Array<{
      occurred_at: string;
      action_type: string;
      member_id: string;
      display_name: string | null;
      slug: string | null;
      data_origin: string;
    }>;
    const recent: RecentHonorGrant[] = rows.map((r) => ({
      honorLabel: r.action_type === 'tier.hof_grant' ? HONOR_LABEL.hof : HONOR_LABEL.bap,
      displayName: r.display_name ?? '(unknown member)',
      slug: r.slug ?? r.member_id,
      occurredAt: r.occurred_at,
      dataOriginLabel: r.data_origin === 'live'
        ? null
        : r.data_origin === 'test' ? 'Test data' : 'Unknown origin',
    }));
    return {
      seo: { title: 'Grant an Honor Tier', noindex: true },
      page: { sectionKey: '', pageKey: 'admin_honor_grants', title: 'Grant an Honor Tier' },
      content: { errorMessage: opts.errorMessage, recent },
    };
  },

  /**
   * Resolve and validate a grant the way grantHonor would, but write nothing:
   * render the confirmation. A member who already holds this honor is shown as
   * already-granted with no working confirm action.
   */
  previewHonorGrant(
    memberKey: string,
    honorRaw: string,
    inductionYearRaw = '',
  ): PageViewModel<HonorGrantConfirmContent> {
    const honor = normalizeHonor(honorRaw);
    const member = resolveMember(memberKey);
    const alreadyGranted = hasHonorGrant(member.id, honor);
    const tier = getTierStatus(member.id);
    const inductionYear = readInductionYear(inductionYearRaw);
    return {
      seo: { title: 'Confirm Honor Tier Grant', noindex: true },
      page: { sectionKey: '', pageKey: 'admin_honor_grants_confirm', title: 'Confirm: Grant an Honor Tier' },
      content: {
        memberKey: memberKey.trim(),
        honor,
        honorLabel: HONOR_LABEL[honor],
        displayName: member.display_name,
        slug: member.slug,
        tierLabel: TIER_LABEL[tier.tier_status],
        inductionYear: inductionYear === null ? '' : String(inductionYear),
        inductionYearLabel: inductionYear === null ? 'Not recorded' : String(inductionYear),
        alreadyGranted,
        confirmHref: '/admin/honor-grants/grant/confirm',
        cancelHref: '/admin/honor-grants',
      },
    };
  },

  /**
   * Commit: re-resolve and re-validate, then delegate. applyHonorGrant re-checks
   * the duplicate guard inside its transaction and throws ConflictError on a
   * repeat of the same honor, so nothing is written on that path.
   */
  grantHonor(actorId: string, memberKey: string, honorRaw: string, inductionYearRaw = ''): void {
    const honor = normalizeHonor(honorRaw);
    const member = resolveMember(memberKey);
    applyHonorGrant(actorId, member.id, honor, readInductionYear(inductionYearRaw));
  },

  /**
   * Preview taking back an honour granted in error. Nothing is written.
   *
   * The wording is deliberate throughout: this corrects the platform's record of
   * a grant that should not have been made, and does not revoke an honour, which
   * is not the platform's to revoke.
   */
  previewHonorRemoval(
    memberKey: string,
    honorRaw: string,
    rawReason: string,
  ): PageViewModel<HonorActionConfirmContent> {
    const honor = normalizeHonor(honorRaw);
    const member = resolveMember(memberKey);
    const reason = requireReason(rawReason);
    if (!hasHonorGrant(member.id, honor)) {
      throw new ValidationError(`This member holds no ${HONOR_LABEL[honor]} grant to take back.`);
    }
    const tier = getTierStatus(member.id);

    return confirmEnvelope('Confirm: Take Back an Honour Grant', {
      memberKey:   memberKey.trim(),
      displayName: member.display_name,
      slug:        member.slug,
      summary: `This corrects a ${HONOR_LABEL[honor]} grant made in error. It clears the badge and `
        + 'its induction year, and records the correction in the tier ledger and the audit log. It '
        + 'does not revoke the honour itself, which is not the platform\'s to revoke. The membership '
        + 'tier is left as it is, because a member may hold it for reasons unconnected to this honour.',
      facts: [
        { label: 'Honour', value: HONOR_LABEL[honor] },
        { label: 'Membership tier, unchanged', value: TIER_LABEL[tier.tier_status] },
      ],
      reason,
      hiddenFields: [
        { name: 'member_key', value: memberKey.trim() },
        { name: 'honor',      value: honor },
        { name: 'reason',     value: reason },
      ],
      confirmAction: '/admin/honor-grants/remove/confirm',
      confirmLabel:  'Yes, Take Back the Grant',
      cancelHref:    '/admin/honor-grants',
    });
  },

  /** Commit the correction through the service that owns the honour ledger. */
  removeHonor(actorId: string, memberKey: string, honorRaw: string, rawReason: string): void {
    const honor = normalizeHonor(honorRaw);
    const member = resolveMember(memberKey);
    removeHonorGrant(actorId, member.id, honor, requireReason(rawReason));
  },

  /**
   * Preview putting a member on the IFPA board, or taking them off it. Nothing
   * is written.
   *
   * The underlying tier is shown on the way in, because that is what the member
   * reverts to when they leave the board, and an administrator should see where
   * they will land before the standing is set rather than afterwards.
   */
  previewBoardChange(
    memberKey: string,
    setting: boolean,
    rawReason: string,
  ): PageViewModel<HonorActionConfirmContent> {
    const member = resolveMember(memberKey);
    const reason = requireReason(rawReason);
    const tier = getTierStatus(member.id);

    if (setting && tier.tier_status === 'tier3') {
      throw new ValidationError('This member is already on the board.');
    }
    if (!setting && tier.tier_status !== 'tier3') {
      throw new ValidationError('This member is not on the board.');
    }

    // Entering from Tier 0 or Tier 1 reverts to Tier 1; entering from Tier 2, or
    // from an honour, reverts to Tier 2.
    const revertsTo = setting
      ? (tier.tier_status === 'tier2' ? 'tier2' : 'tier1')
      : (tier.underlying_tier_status ?? 'tier1');

    return confirmEnvelope(
      setting ? 'Confirm: Put the Member on the Board' : 'Confirm: Take the Member Off the Board',
      {
        memberKey:   memberKey.trim(),
        displayName: member.display_name,
        slug:        member.slug,
        summary: setting
          ? 'This sets Tier 3 director standing and the board badge, and records the tier the member '
            + 'returns to when they leave the board. A Tier 0 member entering the board also ends any '
            + 'current Active Player standing, because the tier supersedes it.'
          : 'This removes the board badge and returns the member to the tier recorded when they '
            + 'joined the board.',
        facts: [
          { label: 'Membership tier now', value: TIER_LABEL[tier.tier_status] },
          {
            label: setting ? 'Reverts to on leaving the board' : 'Returns to',
            value: TIER_LABEL[revertsTo as MemberTier],
          },
        ],
        reason,
        hiddenFields: [
          { name: 'member_key', value: memberKey.trim() },
          { name: 'reason',     value: reason },
        ],
        confirmAction: setting
          ? '/admin/honor-grants/board/set/confirm'
          : '/admin/honor-grants/board/remove/confirm',
        confirmLabel: setting ? 'Yes, Put Them on the Board' : 'Yes, Take Them Off the Board',
        cancelHref:   '/admin/honor-grants',
      },
    );
  },

  /** Commit the board change through the service that owns governance standing. */
  applyBoardChange(actorId: string, memberKey: string, setting: boolean, rawReason: string): void {
    const member = resolveMember(memberKey);
    const reason = requireReason(rawReason);
    if (setting) {
      setGovernanceTier3(actorId, member.id, reason);
      return;
    }
    removeGovernanceTier3(actorId, member.id, reason);
  },
};
