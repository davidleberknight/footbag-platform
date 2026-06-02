import { randomUUID } from 'crypto';
import {
  account,
  clubBootstrapLeaders,
  clubBootstrapLeaderSignals,
  clubViabilitySignals,
  legacyClubCandidates,
  legacyPersonClubAffiliations,
  memberOnboarding,
  transaction,
  type ClubBootstrapLeaderRow,
  type ClubBootstrapLeaderSignalRow,
  type LegacyPersonClubAffiliationRow,
  type MemberOnboardingTaskRow,
  type WizardMembershipCardRow,
  type WizardLeadershipCardRow,
} from '../db/db';
import { appendAuditEntry } from './auditService';
import { memberService } from './memberService';
import { clubService } from './clubService';
import {
  classifyBootstrapLeader,
  type StructuralSignals,
  type ContextModifiers,
} from './clubBootstrapClassificationService';
import { identityAccessService } from './identityAccessService';
import { getSesAdapter } from '../adapters/sesAdapter';
import {
  ConflictError,
  NotFoundError,
  RateLimitedError,
  ServiceError,
  ValidationError,
} from './serviceErrors';

function normalizeToArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === 'string');
  if (typeof value === 'string') return [value];
  return [];
}

type ActivitySignal = 'active' | 'not_active' | 'not_sure' | 'never_heard_of_it';

const VALID_ACTIVITY_SIGNALS: ReadonlySet<string> = new Set([
  'active', 'not_active', 'not_sure', 'never_heard_of_it',
]);

function writeViabilitySignal(
  memberId: string,
  clubId: string,
  sourceStage: string,
  activitySignal: ActivitySignal,
  sourceEntityType: string,
  sourceEntityId: string,
): void {
  const now = new Date().toISOString();
  clubViabilitySignals.insertSignal.run(
    `cvs_${randomUUID().replace(/-/g, '').slice(0, 24)}`,
    now,
    'onboarding_service',
    memberId,
    clubId,
    sourceStage,
    activitySignal,
    sourceEntityType,
    sourceEntityId,
  );
}

export const TASK_CATALOG = [
  'personal_details',
  'legacy_claim',
  'club_affiliations',
] as const;
export type OnboardingTaskType = typeof TASK_CATALOG[number];

export const TASK_STATES = [
  'pending',
  'in_progress_paused',
  'skipped',
  'completed',
  'not_applicable',
] as const;
export type OnboardingTaskState = typeof TASK_STATES[number];

export interface OnboardingTaskView {
  taskType: OnboardingTaskType;
  state: OnboardingTaskState;
  completedAt: string | null;
}

export interface DashboardTaskItem {
  taskType: OnboardingTaskType;
  taskLabel: string;
  state: OnboardingTaskState;
  completedAt: string | null;
  resumeUrl: string | null;
  targetStory: string | null;
  sourceCard:  string | null;
  ctaLabel: string;
  ctaHref:  string | null;
}

export interface DashboardTaskWidget {
  pending:   DashboardTaskItem[];
  paused:    DashboardTaskItem[];
  skipped:   DashboardTaskItem[];
  hasOutstanding: boolean;
}

const TASK_LABELS: Record<OnboardingTaskType, string> = {
  personal_details:         'Personal details',
  legacy_claim:             'Find your past records',
  club_affiliations:        'Club affiliation',
};

export class NotImplementedError extends ServiceError {
  constructor(message: string, details?: Record<string, unknown>) {
    super('not_implemented', message, details);
  }
}

const TASK_TYPE_INDEX: Record<string, number> = Object.fromEntries(
  TASK_CATALOG.map((t, i) => [t, i]),
);

function assertTaskType(taskType: string): asserts taskType is OnboardingTaskType {
  if (!(taskType in TASK_TYPE_INDEX)) {
    throw new ValidationError(`Unknown onboarding task type: ${taskType}`);
  }
}

function newTaskId(): string {
  return `mot_${randomUUID().replace(/-/g, '').slice(0, 24)}`;
}

function ensureTaskRow(memberId: string, taskType: OnboardingTaskType): MemberOnboardingTaskRow {
  const existing = memberOnboarding.findByMemberAndType.get(memberId, taskType) as
    | MemberOnboardingTaskRow
    | undefined;
  if (existing) return existing;

  const now = new Date().toISOString();
  memberOnboarding.insertTaskIfMissing.run(
    newTaskId(), now, 'onboarding_service', now, 'onboarding_service',
    memberId, taskType,
  );
  return memberOnboarding.findByMemberAndType.get(memberId, taskType) as MemberOnboardingTaskRow;
}

function transitionTask(
  memberId: string,
  taskType: string,
  nextState: OnboardingTaskState,
  actionType: string,
): void {
  assertTaskType(taskType);
  const row = ensureTaskRow(memberId, taskType);
  if (row.state === nextState) return;
  const now = new Date().toISOString();
  const completedAt = nextState === 'completed' ? now : null;
  memberOnboarding.updateState.run(
    nextState, completedAt, now, 'onboarding_service', row.id,
  );
  appendAuditEntry({
    actionType,
    category: 'onboarding',
    actorType: 'member',
    actorMemberId: memberId,
    entityType: 'member_onboarding_task',
    entityId: row.id,
    metadata: { task_type: taskType },
  });
}

function getTaskWidget(memberId: string): OnboardingTaskView[] {
  // In-sequence advance set: tasks the wizard should still push the member through.
  // Excludes `skipped` (the dashboard surfaces those; the live wizard sequence
  // does not loop the user back into a task they deliberately bypassed).
  const rows = memberOnboarding.listForMember.all(memberId) as MemberOnboardingTaskRow[];
  return rows
    .filter((r) => r.state === 'pending')
    .map((r) => ({
      taskType: r.task_type as OnboardingTaskType,
      state: r.state as OnboardingTaskState,
      completedAt: r.completed_at,
    }))
    .sort((a, b) => TASK_TYPE_INDEX[a.taskType] - TASK_TYPE_INDEX[b.taskType]);
}

// The next task to send a still-onboarding member to. Prefers the
// lowest-index pending task (the active wizard sequence); falls back to the
// lowest-index `in_progress_paused` task so a member whose tasks are all
// detour-paused is not redirected to a task that is not actually pending.
// Returns null only when nothing is outstanding.
function nextOutstandingTaskType(memberId: string): OnboardingTaskType | null {
  const rows = (memberOnboarding.listForMember.all(memberId) as MemberOnboardingTaskRow[])
    .filter((r) => (r.task_type as OnboardingTaskType) in TASK_TYPE_INDEX);
  const byIndex = (state: OnboardingTaskState): OnboardingTaskType[] =>
    rows
      .filter((r) => r.state === state)
      .map((r) => r.task_type as OnboardingTaskType)
      .sort((a, b) => TASK_TYPE_INDEX[a] - TASK_TYPE_INDEX[b]);
  const pending = byIndex('pending');
  if (pending.length > 0) return pending[0];
  const paused = byIndex('in_progress_paused');
  return paused[0] ?? null;
}

function getTaskState(memberId: string, taskType: OnboardingTaskType): OnboardingTaskState | null {
  const row = memberOnboarding.findByMemberAndType.get(memberId, taskType) as
    | MemberOnboardingTaskRow
    | undefined;
  return row ? row.state as OnboardingTaskState : null;
}

const TERMINAL_STATES: ReadonlySet<string> = new Set(['completed', 'skipped', 'not_applicable']);

function isOnboardingComplete(memberId: string): boolean {
  const rows = memberOnboarding.listForMember.all(memberId) as MemberOnboardingTaskRow[];
  if (rows.length === 0) return false;
  return rows.every((r) => TERMINAL_STATES.has(r.state));
}

function startTaskList(memberId: string): void {
  const now = new Date().toISOString();
  let inserted = 0;
  for (const taskType of TASK_CATALOG) {
    const result = memberOnboarding.insertTaskIfMissing.run(
      newTaskId(), now, 'onboarding_service', now, 'onboarding_service',
      memberId, taskType,
    );
    inserted += result.changes;
  }
  // Audit emitted once per member, only on first materialization (inserted > 0).
  // Idempotent re-calls from subsequent GETs produce no inserts and no audit
  // row, so the log records the wizard start event without flooding.
  if (inserted > 0) {
    appendAuditEntry({
      actionType:    'wizard.start',
      category:      'onboarding',
      actorType:     'member',
      actorMemberId: memberId,
      entityType:    'member',
      entityId:      memberId,
      metadata: { tasks_inserted: inserted },
    });
  }
}

function startTask(memberId: string, taskType: string): void {
  transitionTask(memberId, taskType, 'pending', 'onboarding_task_started');
}

function skipTask(memberId: string, taskType: string): void {
  transitionTask(memberId, taskType, 'skipped', 'onboarding_task_skipped');
}

function completeTask(memberId: string, taskType: string): void {
  transitionTask(memberId, taskType, 'completed', 'onboarding_task_completed');
}

function markTaskNotApplicable(memberId: string, taskType: string): void {
  transitionTask(memberId, taskType, 'not_applicable', 'onboarding_task_not_applicable');
}

/**
 * Cross-service hook: called when a member completes the underlying state of
 * a task outside the wizard surface (profile-edit saving first_competition_year,
 * direct HP claim succeeding, etc.). Idempotent: a no-op for tasks that are
 * already in a terminal state (completed, not_applicable). When called for an
 * unmaterialized task, the task row is created in the target state directly.
 */
function completeTaskIfOutstanding(memberId: string, taskType: OnboardingTaskType): void {
  const existing = memberOnboarding.findByMemberAndType.get(memberId, taskType) as
    | MemberOnboardingTaskRow
    | undefined;
  if (existing && (existing.state === 'completed' || existing.state === 'not_applicable')) {
    return;
  }
  completeTask(memberId, taskType);
}

/**
 * Auto-transition `legacy_claim` to `completed` when the underlying state
 * shows the member is already linked. Returns true if a transition occurred.
 * Handles the case where a link succeeded outside the wizard (e.g. direct
 * HP claim from the history page, or profile-edit side channel).
 */
function ensureLegacyClaimReflectsState(memberId: string): boolean {
  const row = memberOnboarding.findByMemberAndType.get(memberId, 'legacy_claim') as
    | MemberOnboardingTaskRow
    | undefined;
  if (!row || row.state === 'completed' || row.state === 'not_applicable') return false;
  const links = account.findLegacyAndHpIdsById.get(memberId) as
    | { legacy_member_id: string | null; historical_person_id: string | null }
    | undefined;
  if (!links) return false;
  if (links.legacy_member_id || links.historical_person_id) {
    completeTask(memberId, 'legacy_claim');
    return true;
  }
  return false;
}

/**
 * Auto-transition `club_affiliations` to `not_applicable` when the member
 * has no possible cards to act on (no linked legacy identity, or linked
 * legacy with zero pending cards). Returns true if a transition occurred.
 */
function ensureClubAffiliationsReflectsState(memberId: string): boolean {
  const row = memberOnboarding.findByMemberAndType.get(memberId, 'club_affiliations') as
    | MemberOnboardingTaskRow
    | undefined;
  if (!row || row.state === 'completed' || row.state === 'not_applicable') return false;
  const cards = listWizardCardsForMember(memberId);
  if (cards.length > 0) return false;
  markTaskNotApplicable(memberId, 'club_affiliations');
  return true;
}

/**
 * Move a wizard task into `in_progress_paused` because the member detoured
 * into another flow (e.g. M_Create_Club). The audit row carries the
 * `target_story` (where the member is going) and `source_card` (which wizard
 * card they came from) so the dashboard widget can render a "Resume
 * onboarding" link back to the correct card after the detour resolves.
 *
 * No-op if the task is already in a terminal state (`completed`,
 * `not_applicable`); a completed task cannot be paused.
 */
function transitionToDetourPaused(
  memberId: string,
  taskType: string,
  targetStory: string,
  sourceCard: string,
): void {
  assertTaskType(taskType);
  const row = ensureTaskRow(memberId, taskType);
  if (row.state === 'completed' || row.state === 'not_applicable') {
    return;
  }
  const now = new Date().toISOString();
  memberOnboarding.updateState.run(
    'in_progress_paused', null, now, 'onboarding_service', row.id,
  );
  appendAuditEntry({
    actionType:    'wizard.task.detour_paused',
    category:      'onboarding',
    actorType:     'member',
    actorMemberId: memberId,
    entityType:    'member_onboarding_task',
    entityId:      row.id,
    metadata: { task_type: taskType, target_story: targetStory, source_card: sourceCard },
  });
}

/**
 * Dashboard task widget: returns a member's onboarding tasks split into
 * pending / paused / completed. Paused entries carry a `resumeUrl`
 * reconstructed from the latest `wizard.task.detour_paused` audit row's
 * metadata (target_story + source_card). The url shape is intentionally
 * generic (`/onboarding-wizard?task={taskType}&card={sourceCard}`) so the
 * wizard controller can route the member back to the exact card without
 * the widget needing to know wizard route specifics.
 */
function getDashboardTaskWidget(memberId: string): DashboardTaskWidget {
  interface WidgetRow {
    id: string;
    member_id: string;
    task_type: string;
    state: string;
    completed_at: string | null;
    detour_metadata_json: string | null;
  }
  const rows = memberOnboarding.listForMemberWithDetourMeta.all(memberId) as WidgetRow[];

  const widget: DashboardTaskWidget = {
    pending: [], paused: [], skipped: [],
    hasOutstanding: false,
  };
  for (const r of rows) {
    const taskType = r.task_type as OnboardingTaskType;
    if (!(taskType in TASK_TYPE_INDEX)) continue;
    const state = r.state as OnboardingTaskState;
    if (state === 'not_applicable' || state === 'completed') continue;

    let resumeUrl:   string | null = null;
    let targetStory: string | null = null;
    let sourceCard:  string | null = null;
    if (state === 'in_progress_paused' && r.detour_metadata_json) {
      try {
        const meta = JSON.parse(r.detour_metadata_json) as {
          target_story?: string; source_card?: string;
        };
        targetStory = meta.target_story ?? null;
        sourceCard  = meta.source_card  ?? null;
      } catch { /* malformed metadata leaves resume context null */ }
    }
    if (state === 'in_progress_paused') {
      resumeUrl = `/register/wizard/${taskType}`;
    }

    let ctaLabel: string = '';
    let ctaHref:  string | null = null;
    if (state === 'in_progress_paused') {
      ctaLabel = 'Resume onboarding';
      ctaHref  = resumeUrl;
    } else if (state === 'pending') {
      ctaLabel = 'Continue onboarding';
      ctaHref  = `/register/wizard/${taskType}`;
    } else if (state === 'skipped') {
      ctaLabel = 'Resume task';
      ctaHref  = `/register/wizard/${taskType}`;
    }
    const item: DashboardTaskItem = {
      taskType,
      taskLabel: TASK_LABELS[taskType],
      state,
      completedAt: r.completed_at,
      resumeUrl,
      targetStory,
      sourceCard,
      ctaLabel,
      ctaHref,
    };
    if      (state === 'in_progress_paused') widget.paused.push(item);
    else if (state === 'skipped')            widget.skipped.push(item);
    else if (state === 'pending')            widget.pending.push(item);
  }

  const sortByCatalog = (a: DashboardTaskItem, b: DashboardTaskItem) =>
    TASK_TYPE_INDEX[a.taskType] - TASK_TYPE_INDEX[b.taskType];
  widget.pending.sort(sortByCatalog);
  widget.paused.sort(sortByCatalog);
  widget.skipped.sort(sortByCatalog);
  widget.hasOutstanding =
    widget.pending.length + widget.paused.length + widget.skipped.length > 0;
  return widget;
}

// ---------------------------------------------------------------------------
// Wizard card listing — per-member view of the club_affiliations task.
//
// Two card kinds: 'membership' (pending legacy_person_club_affiliations) and
// 'leadership' (provisional club_bootstrap_leaders). Leadership cards render
// before membership cards; within each kind, alphabetical by club name.
// ---------------------------------------------------------------------------

export type MembershipConfidenceBand = 'high' | 'medium' | 'low';

export type WizardSignalType =
  | 'listed_contact' | 'affiliation' | 'hosting' | 'roster' | 'mirror_text'
  | 'recent_activity' | 'geographic_alignment';

export interface SignalChecklistRow {
  signalType: WizardSignalType;
  signalLabel: string;
  isPresent: boolean;
}

export interface WizardMembershipCard {
  kind: 'membership';
  candidateId: string;       // legacy_person_club_affiliations.id
  clubId: string;
  clubName: string;
  confidenceBand: MembershipConfidenceBand;
  confidenceBandLabel: string;
  clubDescription: string | null;
  clubExternalUrl: string | null;
}

export interface WizardLeadershipCard {
  kind: 'leadership';
  candidateId: string;       // club_bootstrap_leaders.id
  clubId: string;
  clubName: string;
  role: 'leader' | 'co-leader';
  roleLabel: string;
  classification: 'strong' | 'weak' | 'none';
  classificationLabel: string;
  signals: SignalChecklistRow[];
  clubDescription: string | null;
  clubExternalUrl: string | null;
}

export interface WizardDisambiguationCard {
  kind: 'disambiguation';
  city: string;
  clubs: Array<{
    candidateId: string;
    clubId: string;
    clubName: string;
    confidenceBand: MembershipConfidenceBand;
    confidenceBandLabel: string;
    clubDescription: string | null;
    clubExternalUrl: string | null;
  }>;
}

export type WizardCard = WizardMembershipCard | WizardLeadershipCard | WizardDisambiguationCard;

function confidenceBandFor(score: number | null): MembershipConfidenceBand {
  // Scores arrive at fixed increments (0.50 / 0.70 / 0.90) so each band
  // maps to a real signal-count state.
  if (score === null) return 'low';
  if (score >= 0.90) return 'high';
  if (score >= 0.70) return 'medium';
  return 'low';
}

const CONFIDENCE_BAND_LABELS: Record<MembershipConfidenceBand, string> = {
  high:   'High',
  medium: 'Medium',
  low:    'Low',
};

const CLASSIFICATION_LABELS: Record<'strong' | 'weak' | 'none', string> = {
  strong: 'STRONG',
  weak:   'WEAK',
  none:   'NONE',
};

const ROLE_LABELS: Record<'leader' | 'co-leader', string> = {
  'leader':    'Primary contact',
  'co-leader': 'Contact',
};

const SIGNAL_LABELS: Record<WizardSignalType, string> = {
  listed_contact:       'Listed as contact',
  affiliation:          'Has affiliations',
  hosting:              'Hosted events',
  roster:               'Roster of 5 or more members',
  mirror_text:          'Name mirrored in description',
  recent_activity:      'Active in last 5 years',
  geographic_alignment: 'Geographic match',
};

function listWizardCardsForMember(memberId: string): WizardCard[] {
  const memberRow = account.findLegacyMemberIdById.get(memberId) as
    | { legacy_member_id: string | null }
    | undefined;
  const legacyMemberId = memberRow?.legacy_member_id ?? null;
  if (!legacyMemberId) return [];

  const membershipRows = legacyPersonClubAffiliations.listPendingForLegacyMember.all(
    legacyMemberId,
  ) as WizardMembershipCardRow[];
  const leadershipRows = clubBootstrapLeaders.listProvisionalForLegacyMember.all(
    legacyMemberId,
  ) as WizardLeadershipCardRow[];

  // Group membership rows by city for disambiguation. Single-club cities
  // produce normal cards; multi-club cities produce a disambiguation card.
  const cityGroups = new Map<string, WizardMembershipCardRow[]>();
  for (const r of membershipRows) {
    const cityKey = (r.club_city || '').toLowerCase();
    if (!cityGroups.has(cityKey)) cityGroups.set(cityKey, []);
    cityGroups.get(cityKey)!.push(r);
  }

  const memberships: (WizardMembershipCard | WizardDisambiguationCard)[] = [];
  for (const [, rows] of cityGroups) {
    if (rows.length === 1) {
      const r = rows[0];
      const band = confidenceBandFor(r.confidence_score);
      memberships.push({
        kind:                'membership' as const,
        candidateId:         r.affiliation_id,
        clubId:              r.club_id,
        clubName:            r.club_name,
        confidenceBand:      band,
        confidenceBandLabel: CONFIDENCE_BAND_LABELS[band],
        clubDescription:     r.club_description || null,
        clubExternalUrl:     r.club_external_url || null,
      });
    } else {
      memberships.push({
        kind: 'disambiguation' as const,
        city: rows[0].club_city,
        clubs: rows.map((r) => {
          const band = confidenceBandFor(r.confidence_score);
          return {
            candidateId:         r.affiliation_id,
            clubId:              r.club_id,
            clubName:            r.club_name,
            confidenceBand:      band,
            confidenceBandLabel: CONFIDENCE_BAND_LABELS[band],
            clubDescription:     r.club_description || null,
            clubExternalUrl:     r.club_external_url || null,
          };
        }),
      });
    }
  }

  const leaderships: WizardLeadershipCard[] = leadershipRows.map((r) => {
    const { structural, modifiers } = readSignalsForCandidate(r.candidate_id);
    const classified = classifyBootstrapLeader(structural, modifiers);
    const signals: SignalChecklistRow[] = [
      { signalType: 'listed_contact',       signalLabel: SIGNAL_LABELS.listed_contact,       isPresent: structural.listed_contact },
      { signalType: 'affiliation',          signalLabel: SIGNAL_LABELS.affiliation,          isPresent: structural.affiliation },
      { signalType: 'hosting',              signalLabel: SIGNAL_LABELS.hosting,              isPresent: structural.hosting },
      { signalType: 'roster',               signalLabel: SIGNAL_LABELS.roster,               isPresent: structural.roster },
      { signalType: 'mirror_text',          signalLabel: SIGNAL_LABELS.mirror_text,          isPresent: structural.mirror_text },
      { signalType: 'recent_activity',      signalLabel: SIGNAL_LABELS.recent_activity,      isPresent: modifiers.recent_activity },
      { signalType: 'geographic_alignment', signalLabel: SIGNAL_LABELS.geographic_alignment, isPresent: modifiers.geographic_alignment },
    ];
    return {
      kind:                'leadership',
      candidateId:         r.candidate_id,
      clubId:              r.club_id,
      clubName:            r.club_name,
      role:                r.role,
      roleLabel:           ROLE_LABELS[r.role],
      classification:      classified.classification,
      classificationLabel: CLASSIFICATION_LABELS[classified.classification],
      signals,
      clubDescription:     r.club_description || null,
      clubExternalUrl:     r.club_external_url || null,
    };
  });

  // Leadership first, then membership/disambiguation. Within each group,
  // sort alphabetically (by clubName for single cards, by city for disambiguation).
  const all: WizardCard[] = [...leaderships, ...memberships];
  const stageOrder = (c: WizardCard): number => (c.kind === 'leadership' ? 0 : 1);
  const sortKey = (c: WizardCard): string =>
    c.kind === 'disambiguation' ? c.city.toLowerCase() : c.clubName.toLowerCase();
  all.sort((a, b) => {
    const stageDiff = stageOrder(a) - stageOrder(b);
    if (stageDiff !== 0) return stageDiff;
    return sortKey(a).localeCompare(sortKey(b));
  });
  return all;
}

type ClubAffiliationsBranch =
  | 'promoted_leader'
  | 'promoted_co_leader'
  | 'affiliated_only'
  | 'idempotent'
  | 'declined'
  | 'confirmed';

interface ClubAffiliationsResult {
  branch: ClubAffiliationsBranch;
  classification: 'strong' | 'weak' | 'none';
  actualRole: 'leader' | 'co-leader' | null;
  attemptedRole?: 'leader' | 'co-leader';
  downgradeReason?: 'leader_slot_taken' | 'member_already_leader' | 'both' | null;
  resolvedClubId?: string | null;
  taskState: 'in_progress' | 'completed';
}

// Read pre-computed evidence rows for a bootstrap leader candidate and split
// them into the StructuralSignals + ContextModifiers shapes that
// classifyBootstrapLeader accepts. Defaults missing signals to false so the
// classifier sees a complete shape even when signal rows are absent.
function readSignalsForCandidate(candidateId: string): {
  structural: StructuralSignals;
  modifiers: ContextModifiers;
  rows: ClubBootstrapLeaderSignalRow[];
} {
  const rows = clubBootstrapLeaderSignals.listByBootstrapLeaderId.all(
    candidateId,
  ) as ClubBootstrapLeaderSignalRow[];
  const structural: StructuralSignals = {
    listed_contact: false,
    affiliation: false,
    hosting: false,
    roster: false,
    mirror_text: false,
  };
  const modifiers: ContextModifiers = {
    tier_signal: false,
    recent_activity: false,
    geographic_alignment: false,
  };
  const structuralWritable = structural as unknown as Record<string, boolean>;
  const modifiersWritable  = modifiers  as unknown as Record<string, boolean>;
  for (const r of rows) {
    const present = r.is_present === 1;
    if (r.signal_type in structural) {
      structuralWritable[r.signal_type] = present;
    } else if (r.signal_type in modifiers) {
      modifiersWritable[r.signal_type] = present;
    }
  }
  return { structural, modifiers, rows };
}

function maybeCompleteClubAffiliationsTask(memberId: string): 'in_progress' | 'completed' {
  // The task is multi-card: completion fires only when the member has no
  // remaining unresolved cards. Single-card flows complete on first submit;
  // multi-card flows stay 'in_progress' until the final card is resolved.
  const remaining = listWizardCardsForMember(memberId);
  if (remaining.length > 0) return 'in_progress';
  completeTask(memberId, 'club_affiliations');
  return 'completed';
}

function submitMembershipResponse(
  memberId: string,
  candidateId: string,
  userDecision: 'confirm' | 'correct' | 'decline',
  activitySignal: ActivitySignal | null,
): ClubAffiliationsResult {
  const affiliation = legacyPersonClubAffiliations.findById.get(candidateId) as
    | LegacyPersonClubAffiliationRow
    | undefined;
  if (!affiliation) {
    throw new NotFoundError(`Legacy affiliation candidate not found: ${candidateId}`);
  }

  // 'correct' = "this record is wrong": same lpca transition as decline,
  // distinguished only by audit metadata.
  const treatAsDecline = userDecision === 'decline' || userDecision === 'correct';
  const result = clubService.confirmAffiliation(
    candidateId,
    memberId,
    treatAsDecline ? 'decline' : 'confirm',
  );

  if (activitySignal && result.resolvedClubId) {
    writeViabilitySignal(
      memberId,
      result.resolvedClubId,
      'stage1b_affiliated',
      activitySignal,
      'legacy_person_club_affiliation',
      candidateId,
    );
  }

  const actionType =
    result.branch === 'confirmed'
      ? 'wizard.club_affiliations.confirmed'
      : result.branch === 'declined'
        ? 'wizard.club_affiliations.declined'
        : 'wizard.club_affiliations.idempotent';
  appendAuditEntry({
    actionType,
    category:      'onboarding',
    actorType:     'member',
    actorMemberId: memberId,
    entityType:    'legacy_person_club_affiliation',
    entityId:      candidateId,
    metadata: {
      kind:              'membership',
      user_decision:     userDecision,
      activity_signal:   activitySignal,
      confirm_branch:    result.branch,
      resolved_club_id:  result.resolvedClubId,
      new_affiliation_id: result.newAffiliationId,
      confidence_score:  affiliation.confidence_score,
    },
  });

  const branch: ClubAffiliationsBranch =
    result.branch === 'confirmed'  ? 'confirmed'
    : result.branch === 'declined' ? 'declined'
    : 'idempotent';
  const taskState = maybeCompleteClubAffiliationsTask(memberId);
  return {
    branch,
    classification: 'none',
    actualRole:     null,
    resolvedClubId: result.resolvedClubId,
    taskState,
  };
}

function submitLeadershipResponse(
  memberId: string,
  candidateId: string,
  userDecision: 'confirm' | 'correct' | 'decline',
  activitySignal: ActivitySignal | null,
): ClubAffiliationsResult {
  const leader = clubBootstrapLeaders.findById.get(candidateId) as
    | ClubBootstrapLeaderRow
    | undefined;
  if (!leader) {
    throw new NotFoundError(`Bootstrap leader candidate not found: ${candidateId}`);
  }

  // Idempotency: a candidate already resolved (claimed / rejected / superseded)
  // produces a no-op result. The task is completed regardless so re-submits
  // do not block wizard progression.
  if (leader.status !== 'provisional') {
    const taskState = maybeCompleteClubAffiliationsTask(memberId);
    const branch: ClubAffiliationsBranch =
      leader.status === 'claimed' ? 'idempotent'
      : leader.status === 'rejected' ? 'declined'
      : 'idempotent';
    return { branch, classification: 'none', actualRole: null, taskState };
  }

  if (activitySignal) {
    writeViabilitySignal(
      memberId,
      leader.club_id,
      'stage1a_contact',
      activitySignal,
      'club_bootstrap_leader',
      candidateId,
    );
  }

  const { structural, modifiers, rows } = readSignalsForCandidate(candidateId);
  const result = classifyBootstrapLeader(structural, modifiers);

  if (userDecision === 'decline') {
    clubBootstrapLeaders.setStatusRejected.run('onboarding_service', candidateId);
    appendAuditEntry({
      actionType:    'wizard.club_affiliations.declined',
      category:      'onboarding',
      actorType:     'member',
      actorMemberId: memberId,
      entityType:    'club_bootstrap_leader',
      entityId:      candidateId,
      metadata: {
        kind:           'leadership',
        activity_signal: activitySignal,
        classification: result.classification,
        matched_gate:   result.matchedGate,
        signal_rows:    rows.length,
      },
    });
    const taskState = maybeCompleteClubAffiliationsTask(memberId);
    return { branch: 'declined', classification: result.classification, actualRole: null, taskState };
  }

  // 'confirm' OR 'correct': auto-promote regardless of classification.
  // claimLeadership handles role downgrade to co-leader and the cap-
  // exceeded affiliate-only fall-through. Admins can later promote
  // affiliate-only members or reshape leadership via A_* admin powers.
  // The promote writes (status, club_leaders, affiliation) are atomic via
  // claimLeadership's internal transaction; the task-complete + audit
  // writes that follow are non-transactional but follow the same
  // append-only pattern as transitionTask (low risk: better-sqlite3 inserts
  // are synchronous and audit_entries inserts essentially cannot fail).
  const promote = clubService.claimLeadership(candidateId, memberId);
  appendAuditEntry({
    actionType:    'wizard.club_affiliations.promoted',
    category:      'onboarding',
    actorType:     'member',
    actorMemberId: memberId,
    entityType:    'club_bootstrap_leader',
    entityId:      candidateId,
    metadata: {
      kind:             'leadership',
      activity_signal:  activitySignal,
      classification:   result.classification,
      matched_gate:     result.matchedGate,
      user_decision:    userDecision,
      promote_branch:   promote.branch,
      actual_role:      promote.actualRole,
      attempted_role:   promote.attemptedRole,
      downgrade_reason: promote.downgradeReason,
      club_id:          promote.clubId,
      club_leader_id:   promote.clubLeaderId,
      affiliation_id:   promote.affiliationId,
      signal_rows:      rows.length,
    },
  });
  const taskState = maybeCompleteClubAffiliationsTask(memberId);
  return {
    branch:          promote.branch,
    classification:  result.classification,
    actualRole:      promote.actualRole,
    attemptedRole:   promote.attemptedRole,
    downgradeReason: promote.downgradeReason,
    taskState,
  };
}

function submitClubAffiliationsResponse(
  memberId: string,
  body: Record<string, unknown>,
): ClubAffiliationsResult {
  // Body shape: { kind: 'membership' | 'leadership' (default 'leadership'),
  //               candidateId, userDecision, activitySignal? }. `kind` is
  //               optional for backward-compatibility with direct service
  //               callers (tests that predate the membership path); the
  //               controller-facing wrapper (`processClubAffiliationsSubmit`)
  //               always sets it explicitly from the form's hidden input.
  const candidateId  = typeof body.candidateId  === 'string' ? body.candidateId  : '';
  const userDecision = body.userDecision;
  const kindRaw      = typeof body.kind === 'string' ? body.kind : 'leadership';
  if (!candidateId) {
    throw new ValidationError('candidateId is required');
  }
  if (
    userDecision !== 'confirm' &&
    userDecision !== 'correct' &&
    userDecision !== 'decline'
  ) {
    throw new ValidationError(
      "userDecision must be one of 'confirm', 'correct', 'decline'",
    );
  }
  if (kindRaw !== 'membership' && kindRaw !== 'leadership') {
    throw new ValidationError("kind must be one of 'membership', 'leadership'");
  }

  const rawSignal = typeof body.activitySignal === 'string' ? body.activitySignal : null;
  const activitySignal: ActivitySignal | null =
    rawSignal && VALID_ACTIVITY_SIGNALS.has(rawSignal) ? rawSignal as ActivitySignal : null;

  return kindRaw === 'membership'
    ? submitMembershipResponse(memberId, candidateId, userDecision, activitySignal)
    : submitLeadershipResponse(memberId, candidateId, userDecision, activitySignal);
}

function submitTaskResponse(memberId: string, taskType: string, response: unknown): void {
  assertTaskType(taskType);
  const body = (response ?? {}) as Record<string, unknown>;
  if (taskType === 'personal_details') {
    memberService.setPersonalDetails(memberId, body);
    completeTask(memberId, taskType);
    return;
  }
  if (taskType === 'club_affiliations') {
    submitClubAffiliationsResponse(memberId, body);
    return;
  }
  throw new NotImplementedError(
    `submitTaskResponse handler for task_type "${taskType}" is not implemented`,
  );
}

export type WizardFlash =
  | {
      kind: 'WIZARD_LEGACY_CLAIM_RESULT';
      payload: { hpPersonId: string | null; sinceIndex: number | null };
    }
  | { kind: 'WIZARD_AUTO_LINK_DRIFT' }
  | {
      kind: 'WIZARD_CLUB_CARD_RESOLVED';
      payload: { clubName: string; decision: 'confirm' | 'correct' | 'decline' };
    };

// Per-method `formState` shapes carried in the `validation_error` arm
// of `WizardActionResult`. Typed per-method so controllers pass through
// to the template without `as` casts.

export type LegacyClaimSubmitFormState = { identifier: string };
export type LegacyClaimAutoLinkConfirmFormState =
  | { personId: string; personName: string; confidence: 'high' | 'medium' }
  | null;
export type LegacyClaimTokenConfirmFormState = null;
export type PersonalDetailsFormState = { city: string; region: string; country: string; birthDate: string; yearValue: string; showFirstCompetitionYear: boolean; showCompetitiveResults: boolean };

// Per-arm types so the discriminant union's non-formState arms can be
// returned from helpers (e.g. advanceAfter) without binding to a
// specific TFormState parameter.
export type WizardAdvanceArm = { kind: 'advance'; nextTaskType: OnboardingTaskType | null };
export type WizardRetrySameArm = { kind: 'retry_same'; flash: WizardFlash | null };
export type WizardRateLimitedArm = { kind: 'rate_limited'; retryAfterSeconds: number };

export type WizardActionResult<TFormState = unknown> =
  | WizardAdvanceArm
  | WizardRetrySameArm
  | { kind: 'validation_error'; formState: TFormState; message: string }
  | WizardRateLimitedArm;

function nextTaskAfter(
  memberId: string,
  currentTaskType: OnboardingTaskType,
): OnboardingTaskType | null {
  const widget = getTaskWidget(memberId);
  const currentIdx = TASK_TYPE_INDEX[currentTaskType];
  for (const item of widget) {
    if (TASK_TYPE_INDEX[item.taskType] > currentIdx) return item.taskType;
  }
  return null;
}

function advanceAfter(
  memberId: string,
  currentTaskType: OnboardingTaskType,
): WizardAdvanceArm {
  startTaskList(memberId);
  return { kind: 'advance', nextTaskType: nextTaskAfter(memberId, currentTaskType) };
}

function captureSinceIndex(): number | null {
  return getSesAdapter().captureCurrentMessageIndex();
}

async function processLegacyClaimSubmit(
  memberId: string,
  identifier: string,
  ip: string,
): Promise<WizardActionResult<LegacyClaimSubmitFormState>> {
  if (!identifier) {
    return {
      kind: 'validation_error',
      formState: { identifier: '' },
      message: 'Enter an identifier to search.',
    };
  }
  const sinceIndex = captureSinceIndex();
  try {
    const outcome = identityAccessService.initiateLegacyClaim(memberId, identifier, ip);
    if (outcome.kind === 'auto_linked') {
      completeTask(memberId, 'legacy_claim');
      return advanceAfter(memberId, 'legacy_claim');
    }
    startTaskList(memberId);
    if (outcome.kind === 'enqueued') {
      return {
        kind: 'retry_same',
        flash: {
          kind: 'WIZARD_LEGACY_CLAIM_RESULT',
          payload: { hpPersonId: null, sinceIndex },
        },
      };
    }
    const hp = identityAccessService.findHistoricalPersonForLinkSubmit(identifier);
    return {
      kind: 'retry_same',
      flash: {
        kind: 'WIZARD_LEGACY_CLAIM_RESULT',
        payload: { hpPersonId: hp ? hp.person_id : null, sinceIndex: null },
      },
    };
  } catch (err) {
    if (err instanceof RateLimitedError) {
      return {
        kind: 'rate_limited',
        retryAfterSeconds: err.retryAfterSeconds ?? 60,
      };
    }
    if (err instanceof ValidationError) {
      return {
        kind: 'validation_error',
        formState: { identifier },
        message: err.message,
      };
    }
    throw err;
  }
}

function processLegacyClaimAutoLinkConfirm(
  memberId: string,
  personId: string,
): WizardActionResult<LegacyClaimAutoLinkConfirmFormState> {
  if (!personId) {
    return {
      kind: 'validation_error',
      formState: null,
      message: 'Invalid claim request.',
    };
  }
  const classification = identityAccessService.getAutoLinkClassificationForMember(memberId);
  if (classification.confidence !== 'high' && classification.confidence !== 'medium') {
    return { kind: 'retry_same', flash: { kind: 'WIZARD_AUTO_LINK_DRIFT' } };
  }
  if (classification.personId !== personId) {
    return { kind: 'retry_same', flash: { kind: 'WIZARD_AUTO_LINK_DRIFT' } };
  }
  try {
    // Merge and the wizard task transition run in one transaction: a partial
    // failure cannot leave the member claimed but the task still pending.
    transaction(() => {
      identityAccessService.claimHistoricalPersonInTx(memberId, personId);
      completeTask(memberId, 'legacy_claim');
    });
    return advanceAfter(memberId, 'legacy_claim');
  } catch (err) {
    if (err instanceof ValidationError) {
      return {
        kind: 'validation_error',
        formState: {
          personId: classification.personId,
          personName: classification.personName,
          confidence: classification.confidence,
        },
        message: err.message,
      };
    }
    throw err;
  }
}

function processLegacyClaimTokenConfirm(
  memberId: string,
  token: string,
): WizardActionResult<LegacyClaimTokenConfirmFormState> {
  if (!token) {
    return { kind: 'validation_error', formState: null, message: '' };
  }
  try {
    // SC §LegacyClaim atomicity: the token consume, the merge, AND the
    // wizard task transition run in one transaction.
    transaction(() => {
      identityAccessService.consumeAndClaimLegacyInTx(memberId, token);
      completeTask(memberId, 'legacy_claim');
    });
    return advanceAfter(memberId, 'legacy_claim');
  } catch (err) {
    if (err instanceof ValidationError) {
      return { kind: 'validation_error', formState: null, message: err.message };
    }
    throw err;
  }
}

function processPersonalDetailsSubmit(
  memberId: string,
  city: string,
  region: string,
  country: string,
  birthDate: string,
  yearValue: string,
  showFirstCompetitionYear: boolean,
  showCompetitiveResults: boolean,
): WizardActionResult<PersonalDetailsFormState> {
  try {
    submitTaskResponse(memberId, 'personal_details', {
      city, region, country, birthDate, yearValue, showFirstCompetitionYear,
    });
    memberService.setShowCompetitiveResults(memberId, showCompetitiveResults);
    return advanceAfter(memberId, 'personal_details');
  } catch (err) {
    if (err instanceof ValidationError) {
      return {
        kind: 'validation_error',
        formState: { city, region, country, birthDate, yearValue, showFirstCompetitionYear, showCompetitiveResults },
        message: err.message,
      };
    }
    throw err;
  }
}


function processTaskSkip(
  memberId: string,
  taskType: OnboardingTaskType,
): WizardActionResult {
  skipTask(memberId, taskType);
  return advanceAfter(memberId, taskType);
}

/**
 * Cross-surface HP claim: invoked by the out-of-wizard claim route
 * (`/history/:personId/claim/confirm`). Runs the merge and the wizard task
 * transition in one transaction so the dashboard widget can never disagree
 * with the underlying link state.
 *
 * Idempotent on the wizard side: completeTaskIfOutstanding is a no-op for
 * tasks already in a terminal state. Propagates ValidationError from the
 * underlying claim so the caller can re-render the form with a user-safe
 * message.
 */
function claimHistoricalPersonAndCompleteTask(
  memberId: string,
  personId: string,
): void {
  transaction(() => {
    identityAccessService.claimHistoricalPersonInTx(memberId, personId);
    completeTaskIfOutstanding(memberId, 'legacy_claim');
  });
}

// ---------------------------------------------------------------------------
// Wizard club_affiliations dispatcher (controller-facing).
//
// Wraps submitClubAffiliationsResponse with:
//   - body-shape validation (validation_error result on missing kind /
//     candidateId / userDecision rather than thrown ValidationError)
//   - F1 anti-enumeration: candidate's legacy_member_id must match the
//     authenticated member's legacy_member_id; mismatch surfaces as
//     NotFoundError (controller maps to 404, identical UX to "row missing")
//   - taskState -> WizardActionResult mapping: 'completed' advances to the
//     next task; 'in_progress' redirects back to GET to render the next
//     remaining card.
// ---------------------------------------------------------------------------

export type ClubAffiliationsFormState = null;

function assertCandidateOwnership(
  memberId: string,
  candidateId: string,
  kind: 'membership' | 'leadership',
): void {
  const memberRow = account.findLegacyMemberIdById.get(memberId) as
    | { legacy_member_id: string | null }
    | undefined;
  const memberLegacyId = memberRow?.legacy_member_id ?? null;
  if (!memberLegacyId) {
    throw new NotFoundError(`Candidate not found: ${candidateId}`);
  }
  let candidateLegacyId: string | null = null;
  if (kind === 'leadership') {
    const cbl = clubBootstrapLeaders.findById.get(candidateId) as
      | ClubBootstrapLeaderRow
      | undefined;
    candidateLegacyId = cbl?.legacy_member_id ?? null;
  } else {
    const lpca = legacyPersonClubAffiliations.findById.get(candidateId) as
      | LegacyPersonClubAffiliationRow
      | undefined;
    candidateLegacyId = lpca?.legacy_member_id ?? null;
  }
  if (!candidateLegacyId || candidateLegacyId !== memberLegacyId) {
    throw new NotFoundError(`Candidate not found: ${candidateId}`);
  }
}

function submitDisambiguationResponse(
  memberId: string,
  selectedIds: string[],
  allIds: string[],
): ClubAffiliationsResult {
  for (const id of allIds) {
    assertCandidateOwnership(memberId, id, 'membership');
  }
  const selectedSet = new Set(selectedIds);
  for (const id of allIds) {
    const decision = selectedSet.has(id) ? 'confirm' : 'decline';
    submitMembershipResponse(memberId, id, decision, null);
  }
  const taskState = maybeCompleteClubAffiliationsTask(memberId);
  return {
    branch:         selectedIds.length > 0 ? 'confirmed' : 'declined',
    classification: 'none',
    actualRole:     null,
    taskState,
  };
}

function processClubAffiliationsSubmit(
  memberId: string,
  body: Record<string, unknown>,
): WizardActionResult<ClubAffiliationsFormState> {
  const kindRaw = typeof body.kind === 'string' ? body.kind : '';

  if (kindRaw === 'disambiguation') {
    const allIds      = normalizeToArray(body.allCandidateIds);
    const selectedIds = normalizeToArray(body.selectedCandidateIds);
    if (allIds.length === 0) {
      return { kind: 'validation_error', formState: null, message: 'allCandidateIds is required' };
    }
    const result = submitDisambiguationResponse(memberId, selectedIds, allIds);
    if (result.taskState === 'completed') {
      return advanceAfter(memberId, 'club_affiliations');
    }
    const selectedCount = selectedIds.length;
    return {
      kind: 'retry_same',
      flash: {
        kind: 'WIZARD_CLUB_CARD_RESOLVED',
        payload: {
          clubName: selectedCount > 0 ? `${selectedCount} club(s)` : 'none',
          decision: selectedCount > 0 ? 'confirm' : 'decline',
        },
      },
    };
  }

  const candidateId  = typeof body.candidateId  === 'string' ? body.candidateId  : '';
  const userDecision = body.userDecision;

  if (!candidateId) {
    return { kind: 'validation_error', formState: null, message: 'candidateId is required' };
  }
  if (
    userDecision !== 'confirm' &&
    userDecision !== 'correct' &&
    userDecision !== 'decline'
  ) {
    return {
      kind:      'validation_error',
      formState: null,
      message:   "userDecision must be one of 'confirm', 'correct', 'decline'",
    };
  }
  if (kindRaw !== 'membership' && kindRaw !== 'leadership') {
    return {
      kind:      'validation_error',
      formState: null,
      message:   "kind must be one of 'membership', 'leadership'",
    };
  }

  const rawSignal = typeof body.activitySignal === 'string' ? body.activitySignal : '';
  if (!rawSignal || !VALID_ACTIVITY_SIGNALS.has(rawSignal)) {
    return {
      kind:      'validation_error',
      formState: null,
      message:   'Please select whether this club is still active.',
    };
  }

  assertCandidateOwnership(memberId, candidateId, kindRaw);

  const cardsBefore = listWizardCardsForMember(memberId);
  const resolvedCard = cardsBefore.find(
    (c): c is WizardMembershipCard | WizardLeadershipCard =>
      c.kind !== 'disambiguation' && c.candidateId === candidateId,
  );
  const clubName = resolvedCard?.clubName ?? 'that club';

  const result = submitClubAffiliationsResponse(memberId, body);
  if (result.taskState === 'completed') {
    return advanceAfter(memberId, 'club_affiliations');
  }
  return {
    kind: 'retry_same',
    flash: {
      kind: 'WIZARD_CLUB_CARD_RESOLVED',
      payload: { clubName, decision: userDecision },
    },
  };
}

// ---------------------------------------------------------------------------
// Club affiliation stages 2A / 2B / 3A — geographic and dormant matching.
// Stage 1 is the existing card-based flow above. Stages 2-3 extend it with
// geographic matching against legacy_club_candidates.
// ---------------------------------------------------------------------------

export type ClubAffiliationStage = 'stage1' | 'stage2a' | 'stage2b' | 'wrap_up';

interface NearbyClubCandidate {
  id: string;
  displayName: string;
  city: string | null;
  region: string | null;
  country: string | null;
  mappedClubId: string | null;
}

function getClubAffiliationStage(memberId: string): ClubAffiliationStage {
  const stage1Cards = listWizardCardsForMember(memberId);
  if (stage1Cards.length > 0) return 'stage1';

  const { region, country } = getMemberGeo(memberId);
  if (!country) return 'wrap_up';

  const prePopulated = region
    ? legacyClubCandidates.findPrePopulatedByRegion.all(region, country) as NearbyClubCandidate[]
    : [];
  if (prePopulated.length > 0) return 'stage2a';
  const prePopCountry = legacyClubCandidates.findPrePopulatedByCountry.all(country) as NearbyClubCandidate[];
  if (prePopCountry.length > 0) return 'stage2a';

  const onboardingVisible = region
    ? legacyClubCandidates.findOnboardingVisibleByRegion.all(region, country) as NearbyClubCandidate[]
    : [];
  if (onboardingVisible.length > 0) return 'stage2b';
  const onboardCountry = legacyClubCandidates.findOnboardingVisibleByCountry.all(country) as NearbyClubCandidate[];
  if (onboardCountry.length > 0) return 'stage2b';

  return 'wrap_up';
}

function getMemberGeo(memberId: string): { city: string | null; region: string | null; country: string | null } {
  const row = account.findPersonalDetails.get(memberId) as
    | { city: string | null; region: string | null; country: string | null }
    | undefined;
  return { city: row?.city ?? null, region: row?.region ?? null, country: row?.country ?? null };
}

function sortCityFirst(candidates: NearbyClubCandidate[], memberCity: string | null): NearbyClubCandidate[] {
  if (!memberCity) return candidates;
  const cityLower = memberCity.toLowerCase();
  return candidates.sort((a, b) => {
    const aMatch = a.city?.toLowerCase() === cityLower ? 0 : 1;
    const bMatch = b.city?.toLowerCase() === cityLower ? 0 : 1;
    return aMatch - bMatch;
  });
}

function getStage2aCandidates(memberId: string): NearbyClubCandidate[] {
  const { city, region, country } = getMemberGeo(memberId);
  if (!country) return [];
  let results: NearbyClubCandidate[];
  if (region) {
    results = legacyClubCandidates.findPrePopulatedByRegion.all(region, country) as NearbyClubCandidate[];
  }
  if (!region || results!.length === 0) {
    results = legacyClubCandidates.findPrePopulatedByCountry.all(country) as NearbyClubCandidate[];
  }
  return sortCityFirst(results!, city);
}

function getStage2bCandidates(memberId: string): NearbyClubCandidate[] {
  const { city, region, country } = getMemberGeo(memberId);
  if (!country) return [];
  let results: NearbyClubCandidate[];
  if (region) {
    results = legacyClubCandidates.findOnboardingVisibleByRegion.all(region, country) as NearbyClubCandidate[];
  }
  if (!region || results!.length === 0) {
    results = legacyClubCandidates.findOnboardingVisibleByCountry.all(country) as NearbyClubCandidate[];
  }
  return sortCityFirst(results!, city);
}

function submitStageSignal(
  memberId: string,
  candidateId: string,
  stage: 'stage2a' | 'stage2b',
  activitySignal: ActivitySignal,
): void {
  const candidate = legacyClubCandidates.findById.get(candidateId) as
    | { id: string; mapped_club_id: string | null } | undefined;
  if (!candidate) return;
  const clubId = candidate.mapped_club_id;
  if (!clubId) return;
  writeViabilitySignal(
    memberId,
    clubId,
    stage,
    activitySignal,
    'legacy_club_candidate',
    candidateId,
  );
}

export type { ClubAffiliationsBranch, ClubAffiliationsResult };

export const memberOnboardingService = {
  getTaskWidget,
  getDashboardTaskWidget,
  nextOutstandingTaskType,
  startTaskList,
  startTask,
  skipTask,
  completeTask,
  completeTaskIfOutstanding,
  markTaskNotApplicable,
  ensureLegacyClaimReflectsState,
  ensureClubAffiliationsReflectsState,
  transitionToDetourPaused,
  submitTaskResponse,
  submitClubAffiliationsResponse,
  processClubAffiliationsSubmit,
  listWizardCardsForMember,
  processPersonalDetailsSubmit,
  processLegacyClaimSubmit,
  processLegacyClaimAutoLinkConfirm,
  processLegacyClaimTokenConfirm,
  processTaskSkip,
  claimHistoricalPersonAndCompleteTask,
  getTaskState,
  isOnboardingComplete,
  getClubAffiliationStage,
  getStage2aCandidates,
  getStage2bCandidates,
  submitStageSignal,
};
