/**
 * AdminHonorGrantService -- the post-go-live admin surface for HoF/BAP honor
 * tier grants.
 *
 * Owns the honor-grant page and confirmation view-models, resolves and validates
 * the target member and the honor (hof/bap allowlist), and delegates the write
 * to `membershipTieringService.applyHonorGrant`, which owns the ledger row, the
 * audit row, the congrats email, and the authoritative duplicate guard. This
 * service writes nothing itself; the confirmation carries only the member id
 * and honor, both re-resolved and re-validated at commit.
 *
 * The member to grant an honor, or to put on the board, is chosen in that
 * form's member picker, which searches the administrator's member lookup
 * (AdminMemberService), so it reaches members who opted out of member search;
 * the board picker leaves out sitting directors. Taking back a grant, or taking
 * a director off the board, starts from the holder's own row in the page's
 * lists. Every form posts the member by id, and only an onboarded member is
 * accepted; a slug or profile address is never accepted in its place.
 */
import { account, memberTier } from '../db/db';
import { adminMemberService } from './adminMemberService';
import { personLocation } from './countryUtils';
import { PICKER_LIMIT, buildMemberPicker, type MemberPickerView, type PickIntent } from './memberPicker';
import {
  applyHonorGrant,
  getTierStatus,
  hasHonorGrant,
  removeGovernanceTier3,
  removeHonorGrant,
  setGovernanceTier3,
  TIER_NAMES,
  type MemberTier,
} from './membershipTieringService';
import { ValidationError } from './serviceErrors';
import { findStandingOwnAct } from './auditService';
import { PageViewModel } from '../types/page';
import type { ActionEnding } from '../lib/actionOutcome';
import type { OutcomeNoticeView } from '../lib/outcomeNotice';
import { cleanUserText } from '../lib/textSanitizer';

/** How a committed honor grant ended. The first submit and this admin's own
 *  repeat redirect silently; an honor another act left in place carries the
 *  informational sentence the page shows. */
export interface HonorGrantOutcome {
  ending: Exclude<ActionEnding, 'refused'>;
  notice: string | null;
}

const ALREADY_HELD_NOTICE = 'This member already holds that honor, so nothing was changed.';
const ALREADY_ON_BOARD_NOTICE = 'This member is already on the board.';
const NOT_ON_BOARD_NOTICE = 'This member is not on the board.';

type Honor = 'hof' | 'bap';

const HONOR_LABEL: Record<Honor, string> = {
  hof: 'Hall of Fame',
  bap: 'Big Add Posse',
};

const TIER_LABEL: Record<MemberTier, string> = TIER_NAMES;

const RECENT_LIMIT = 20;

/** A roster row as the page shows it: who they are, and the id the forms take. */
function readHolders(rows: unknown[]): HolderRow[] {
  return (rows as Array<{
    id: string; display_name: string | null; slug: string | null; inducted_year?: number | null;
  }>).map((r) => ({
    displayName: r.display_name ?? r.id,
    slug:        r.slug ?? r.id,
    memberId:    r.id,
    yearLabel:   r.inducted_year ? `Inducted ${r.inducted_year}` : null,
  }));
}

interface RecentHonorGrant {
  honorLabel: string;
  /** True for a grant taken back, which the list shows beside the grants. */
  isRemoval: boolean;
  displayName: string;
  slug: string;
  occurredAt: string;
  /** Set where the grant was not recorded as real business, null when it was. */
  dataOriginLabel: string | null;
}

/** One current holder, as the page lists them. */
interface HolderRow {
  displayName: string;
  slug: string;
  memberId: string;
  /** The year, where one is recorded; a legacy induction may carry none. */
  yearLabel: string | null;
}

interface HonorGrantsContent {
  errorMessage?: string;
  recent: RecentHonorGrant[];
  /**
   * Who currently holds each honor, and who currently sits on the board. Each
   * holder's row carries the form that takes the grant back or takes the
   * director off the board.
   */
  hofHolders: HolderRow[];
  bapHolders: HolderRow[];
  boardMembers: HolderRow[];
  /** The grant form: its picker and what was typed beside it. */
  grantFormId: string;
  grantHref: string;
  grantPicker: MemberPickerView;
  honorOptions: Array<{ value: Honor; label: string; selected: boolean }>;
  inductionYearValue: string;
  /** The board form: its picker and the reason typed beside it. */
  boardFormId: string;
  boardHref: string;
  boardPicker: MemberPickerView;
  boardReasonValue: string;
}

/** What a picker-bearing form submitted: the chosen member, its other fields,
 *  and a picker control's request, which draws the page again with nothing
 *  written. */
export interface HonorPickForm {
  form: 'grant' | 'board';
  memberId: string;
  intent: PickIntent | null;
  query: string;
  honor?: string;
  inductionYear?: string;
  reason?: string;
}

interface HonorGrantConfirmContent {
  memberId: string;
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

interface MemberRow {
  id: string; slug: string; display_name: string;
  city: string | null; region: string | null; country: string | null;
}

function findMember(memberId: string): MemberRow | undefined {
  const id = memberId.trim();
  return id === '' ? undefined : account.findActiveMemberById.get(id) as MemberRow | undefined;
}

/** The member a form posted, by id alone: the picker's choice, or a holder's row. */
function resolveMember(memberId: string): MemberRow {
  const member = findMember(memberId);
  if (!member) throw new ValidationError('Search for the member by name and choose them.');
  return member;
}

const GRANT_FORM_ID = 'honor-grant-form';
const GRANT_HREF = '/admin/honor-grants/grant';
const BOARD_FORM_ID = 'board-set-form';
const BOARD_HREF = '/admin/honor-grants/board/set';

/** One of the page's two pickers, which share every setting but their form. */
function honorPicker(opts: {
  formId: string; formAction: string; key: string; ariaVerb: string;
  form: HonorPickForm | undefined; accept: (memberId: string) => boolean; openOnLoad: boolean;
}): MemberPickerView {
  const own = opts.form?.form === opts.key ? opts.form : undefined;
  const intent = own?.intent ?? null;
  const chosenId = intent?.kind === 'choose' && intent.key === opts.key ? intent.memberId : own?.memberId ?? '';
  const chosen = findMember(chosenId);
  const search = intent?.kind === 'search' && intent.key === opts.key
    ? adminMemberService.lookupMembersForPicker(own?.query ?? '', { limit: PICKER_LIMIT, accept: opts.accept })
    : null;
  return buildMemberPicker({
    formId: opts.formId,
    formAction: opts.formAction,
    fieldName: 'member_id',
    fieldKey: opts.key,
    label: 'Member',
    searchLabel: 'Name or login email',
    openLabel: 'Choose Member',
    rowAction: { label: 'Choose', completes: false, ariaLabel: (name) => `Choose ${name} ${opts.ariaVerb}` },
    chosen: chosen
      ? { memberId: chosen.id, displayName: chosen.display_name, location: personLocation(chosen.city, chosen.region, chosen.country)?.text ?? null }
      : null,
    intent,
    openOnLoad: opts.openOnLoad,
    query: own?.query ?? '',
    search: search && { ...search, rateLimited: false, retryAfterSeconds: null },
    notFoundHint: null,
  });
}

/** The one confirmation shape the correction and governance actions share. */
export interface HonorActionConfirmContent {
  memberId: string;
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
  // Cleaned before the check, so a reason that is only markup counts as empty.
  const reason = cleanUserText(raw, 'single_line', 'reason');
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

const HONOR_CONFIRM_INSTRUCTIONS = { what: 'Review this honor change before it is written.' };

function confirmEnvelope(
  title: string,
  content: HonorActionConfirmContent,
): PageViewModel<HonorActionConfirmContent> {
  return {
    seo:  { title, noindex: true },
    page: {
      sectionKey: '', pageKey: 'admin_honor_action_confirm', title,
      instructions: HONOR_CONFIRM_INSTRUCTIONS,
    },
    content,
  };
}

export const adminHonorGrantService = {
  /** The honor-grant form plus the recent-grants accountability list. */
  getHonorGrantsPage(
    opts: { errorMessage?: string; outcome?: OutcomeNoticeView | null; form?: HonorPickForm } = {},
  ): PageViewModel<HonorGrantsContent> {
    // One picker is open at a time: the grant form's, unless the board form's
    // picker is the one in use.
    const boardActive = opts.form?.form === 'board' && opts.form.intent !== null;
    const grantPicker = honorPicker({
      formId: GRANT_FORM_ID, formAction: GRANT_HREF, key: 'grant', ariaVerb: 'for the honor',
      form: opts.form, openOnLoad: !boardActive,
      accept: (id) => findMember(id) !== undefined,
    });
    const boardPicker = honorPicker({
      formId: BOARD_FORM_ID, formAction: BOARD_HREF, key: 'board', ariaVerb: 'for the board',
      form: opts.form, openOnLoad: false,
      accept: (id) => findMember(id) !== undefined && getTierStatus(id).tier_status !== 'tier3',
    });
    const typedHonor = opts.form?.form === 'grant' ? opts.form.honor ?? '' : '';
    const rows = memberTier.listRecentHonorGrants.all(RECENT_LIMIT) as Array<{
      occurred_at: string;
      action_type: string;
      member_id: string;
      display_name: string;
      slug: string;
      data_origin: string;
      is_nameable: 0 | 1;
    }>;
    const recent: RecentHonorGrant[] = rows.map((r) => ({
      honorLabel: r.action_type.startsWith('tier.hof_') ? HONOR_LABEL.hof : HONOR_LABEL.bap,
      isRemoval: r.action_type.endsWith('_removed'),
      // A prospective member is never named on an admin page: the
      // grant stays in the accountability list under their id.
      displayName: r.is_nameable ? r.display_name : r.member_id,
      slug: r.is_nameable ? r.slug : r.member_id,
      occurredAt: r.occurred_at,
      dataOriginLabel: r.data_origin === 'live'
        ? null
        : r.data_origin === 'test' ? 'Test data' : 'Unknown origin',
    }));
    return {
      seo: { title: 'Grant an Honor Tier', noindex: true },
      page: {
        sectionKey: '',
        pageKey: 'admin_honor_grants',
        title: 'Grant an Honor Tier',
        instructions: {
          what: 'Grants or takes back the Hall of Fame and Big Add Posse honors, and puts directors on or takes them off the board.',
          why: 'Honors and board standing are never self-served, and each carries a membership tier only an administrator can confer.',
          how: 'To grant an honor or put a director on the board, search for the member by name and choose them. To take back a grant or take a director off the board, give a reason on their row in the lists. Each is reviewed on a confirm page before it is written.',
          headsUp: [
            'A grant gives Tier 2 (a Tier 3 director stays at Tier 3) and emails the member a congratulation.',
            'Putting a director on or off the board changes their tier and emails them, and the email includes your reason.',
            'Taking back a grant made in error leaves the tier alone and sends nothing.',
            'Every act is recorded in the audit log.',
          ],
        },
        notice: opts.outcome?.text,
        noticeTone: opts.outcome?.tone,
      },
      content: {
        errorMessage: opts.errorMessage,
        recent,
        hofHolders:   readHolders(memberTier.listCurrentHofHolders.all()),
        bapHolders:   readHolders(memberTier.listCurrentBapHolders.all()),
        boardMembers: readHolders(memberTier.listCurrentBoardMembers.all()),
        grantFormId: GRANT_FORM_ID,
        grantHref: GRANT_HREF,
        grantPicker,
        honorOptions: (Object.keys(HONOR_LABEL) as Honor[]).map((value) => ({
          value, label: HONOR_LABEL[value], selected: value === typedHonor,
        })),
        inductionYearValue: opts.form?.form === 'grant' ? opts.form.inductionYear ?? '' : '',
        boardFormId: BOARD_FORM_ID,
        boardHref: BOARD_HREF,
        boardPicker,
        boardReasonValue: opts.form?.form === 'board' ? opts.form.reason ?? '' : '',
      },
    };
  },

  /**
   * Resolve and validate a grant the way grantHonor would, but write nothing:
   * render the confirmation. A member who already holds this honor is shown as
   * already-granted with no working confirm action.
   */
  previewHonorGrant(
    memberId: string,
    honorRaw: string,
    inductionYearRaw = '',
  ): PageViewModel<HonorGrantConfirmContent> {
    const honor = normalizeHonor(honorRaw);
    const member = resolveMember(memberId);
    const alreadyGranted = hasHonorGrant(member.id, honor);
    const tier = getTierStatus(member.id);
    const inductionYear = readInductionYear(inductionYearRaw);
    return {
      seo: { title: 'Confirm Honor Tier Grant', noindex: true },
      page: {
        sectionKey: '', pageKey: 'admin_honor_grants_confirm', title: 'Confirm: Grant an Honor Tier',
        instructions: HONOR_CONFIRM_INSTRUCTIONS,
      },
      content: {
        memberId: member.id,
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
   * the duplicate guard inside its transaction and writes nothing for an honor
   * the member already holds: this admin's own repeat ends as the first submit
   * did, and an honor another act left in place carries the informational
   * sentence the page shows.
   */
  grantHonor(
    actorId: string,
    memberId: string,
    honorRaw: string,
    inductionYearRaw = '',
  ): HonorGrantOutcome {
    const honor = normalizeHonor(honorRaw);
    const member = resolveMember(memberId);
    const { status } = applyHonorGrant(actorId, member.id, honor, readInductionYear(inductionYearRaw));
    return { ending: status, notice: status === 'already_held' ? ALREADY_HELD_NOTICE : null };
  },

  /**
   * Preview taking back an honour granted in error. Nothing is written.
   *
   * The wording is deliberate throughout: this corrects the platform's record of
   * a grant that should not have been made, and does not revoke an honour, which
   * is not the platform's to revoke.
   */
  previewHonorRemoval(
    memberId: string,
    honorRaw: string,
    rawReason: string,
  ): PageViewModel<HonorActionConfirmContent> {
    const honor = normalizeHonor(honorRaw);
    const member = resolveMember(memberId);
    const reason = requireReason(rawReason);
    if (!hasHonorGrant(member.id, honor)) {
      throw new ValidationError(`This member holds no ${HONOR_LABEL[honor]} grant to take back.`);
    }
    const tier = getTierStatus(member.id);

    return confirmEnvelope('Confirm: Take Back an Honour Grant', {
      memberId:    member.id,
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
        { name: 'member_id', value: member.id },
        { name: 'honor',      value: honor },
        { name: 'reason',     value: reason },
      ],
      confirmAction: '/admin/honor-grants/remove/confirm',
      confirmLabel:  'Yes, Take Back the Grant',
      cancelHref:    '/admin/honor-grants',
    });
  },

  /** Commit the correction through the service that owns the honour ledger. */
  removeHonor(actorId: string, memberId: string, honorRaw: string, rawReason: string): void {
    const honor = normalizeHonor(honorRaw);
    const member = resolveMember(memberId);
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
    memberId: string,
    setting: boolean,
    rawReason: string,
  ): PageViewModel<HonorActionConfirmContent> {
    const member = resolveMember(memberId);
    const reason = requireReason(rawReason);
    const tier = getTierStatus(member.id);

    if (setting && tier.tier_status === 'tier3') {
      throw new ValidationError(ALREADY_ON_BOARD_NOTICE);
    }
    if (!setting && tier.tier_status !== 'tier3') {
      throw new ValidationError(NOT_ON_BOARD_NOTICE);
    }

    // Entering from Tier 0 or Tier 1 reverts to Tier 1; entering from Tier 2, or
    // from an honour, reverts to Tier 2.
    const revertsTo = setting
      ? (tier.tier_status === 'tier2' ? 'tier2' : 'tier1')
      : (tier.underlying_tier_status ?? 'tier1');

    return confirmEnvelope(
      setting ? 'Confirm: Put the Member on the Board' : 'Confirm: Take the Member Off the Board',
      {
        memberId:    member.id,
        displayName: member.display_name,
        slug:        member.slug,
        summary: setting
          ? 'This sets Tier 3 director standing and the board badge, and records the tier the member '
            + 'returns to when they leave the board. A Tier 0 Registered Member entering the board also ends any '
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
          { name: 'member_id', value: member.id },
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

  /**
   * Commit the board change through the service that owns governance standing.
   * A member already in the asked-for standing is a repeat and writes nothing:
   * this admin's own standing change ends as the first submit did, and a
   * standing another act left carries the informational sentence.
   */
  applyBoardChange(actorId: string, memberId: string, setting: boolean, rawReason: string): HonorGrantOutcome {
    const member = resolveMember(memberId);
    const reason = requireReason(rawReason);
    const onBoard = getTierStatus(member.id).tier_status === 'tier3';
    if (onBoard === setting) {
      const act = setting ? 'tier.governance_set' : 'tier.governance_removed';
      const reversal = setting ? 'tier.governance_removed' : 'tier.governance_set';
      if (findStandingOwnAct(actorId, act, reversal, 'member', member.id)) {
        return { ending: 'own_repeat', notice: null };
      }
      return { ending: 'already_held', notice: setting ? ALREADY_ON_BOARD_NOTICE : NOT_ON_BOARD_NOTICE };
    }
    if (setting) {
      setGovernanceTier3(actorId, member.id, reason);
    } else {
      removeGovernanceTier3(actorId, member.id, reason);
    }
    return { ending: 'advance', notice: null };
  },
};
