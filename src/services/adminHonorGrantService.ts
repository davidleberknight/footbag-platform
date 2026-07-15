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

export const adminHonorGrantService = {
  /** The honor-grant form plus the recent-grants accountability list. */
  getHonorGrantsPage(opts: { errorMessage?: string } = {}): PageViewModel<HonorGrantsContent> {
    const rows = memberTier.listRecentHonorGrants.all(RECENT_LIMIT) as Array<{
      occurred_at: string;
      action_type: string;
      member_id: string;
      display_name: string | null;
      slug: string | null;
    }>;
    const recent: RecentHonorGrant[] = rows.map((r) => ({
      honorLabel: r.action_type === 'tier.hof_grant' ? HONOR_LABEL.hof : HONOR_LABEL.bap,
      displayName: r.display_name ?? '(unknown member)',
      slug: r.slug ?? r.member_id,
      occurredAt: r.occurred_at,
    }));
    return {
      seo: { title: 'Grant an honor tier', noindex: true },
      page: { sectionKey: '', pageKey: 'admin_honor_grants', title: 'Grant an honor tier' },
      content: { errorMessage: opts.errorMessage, recent },
    };
  },

  /**
   * Resolve and validate a grant the way grantHonor would, but write nothing:
   * render the confirmation. A member who already holds this honor is shown as
   * already-granted with no working confirm action.
   */
  previewHonorGrant(memberKey: string, honorRaw: string): PageViewModel<HonorGrantConfirmContent> {
    const honor = normalizeHonor(honorRaw);
    const member = resolveMember(memberKey);
    const alreadyGranted = hasHonorGrant(member.id, honor);
    const tier = getTierStatus(member.id);
    return {
      seo: { title: 'Confirm honor tier grant', noindex: true },
      page: { sectionKey: '', pageKey: 'admin_honor_grants_confirm', title: 'Confirm: grant an honor tier' },
      content: {
        memberKey: memberKey.trim(),
        honor,
        honorLabel: HONOR_LABEL[honor],
        displayName: member.display_name,
        slug: member.slug,
        tierLabel: TIER_LABEL[tier.tier_status],
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
  grantHonor(actorId: string, memberKey: string, honorRaw: string): void {
    const honor = normalizeHonor(honorRaw);
    const member = resolveMember(memberKey);
    applyHonorGrant(actorId, member.id, honor);
  },
};
