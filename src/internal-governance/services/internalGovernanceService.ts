// ---- Legacy-governance-review only: DELETE BEFORE GO-LIVE ----
/**
 * InternalGovernanceService -- read-only page shaping for the throwaway
 * legacy-governance review screen.
 *
 * Owns: browsing and filtering the internal_governance_* staging tables
 * (committees, committee rosters, group files, elections, issues, derived
 * vote tallies) so Julie/Dave/the Board can rule on disposition by looking
 * at the data.
 *
 * Does not own: writing to these tables (legacy_data/scripts/load_governance_tables.py
 * does that, outside the application), or anything on a member- or
 * admin-facing product surface.
 *
 * No ballot-level row or member id is queried or rendered anywhere in this
 * service -- the tallies tables carry aggregate counts only.
 *
 * Persistence: internal_governance_committees, internal_governance_committee_members,
 * internal_governance_group_files, internal_governance_elections,
 * internal_governance_issues, internal_governance_issue_vote_tallies (read-only).
 *
 * Side effects: none.
 *
 * Service shape: singleton object.
 */
import { internalGovernance } from '../../db/db';
import { NotFoundError } from '../../services/serviceErrors';
import { PageViewModel } from '../../types/page';

interface CommitteeRow {
  committee_id: string;
  committee_valid: number;
  committee_public: number;
  committee_name: string | null;
  committee_owner_id: string | null;
  subcommittee_of_id: string | null;
  committee_charter: string | null;
  committee_keyword: string | null;
  committee_type: string | null;
  committee_is_official: number;
  committee_created_at: string | null;
  committee_modified_at: string | null;
}

interface CommitteeMemberRow {
  committee_member_id: string;
  priority: number | null;
  title: string | null;
  alias: string | null;
  member_name: string | null;
  is_admin: number;
  privs: string | null;
  is_voting: number;
}

interface GroupFileRow {
  file_id: string;
  visible: number;
  file_name: string | null;
  priority: number | null;
  owner_id: string | null;
  created_at: string | null;
  modified_at: string | null;
  committee_scoped: number;
  scope_committee_id: string | null;
  description: string | null;
}

interface ElectionRow {
  election_id: string;
  owner_id: string | null;
  committee_id: string | null;
  visible: number;
  title: string | null;
  starts_at: string | null;
  deadline_at: string | null;
  description: string | null;
}

interface IssueRow {
  issue_id: string;
  visible: number;
  election_id: string | null;
  election_order: number | null;
  question: string | null;
  is_election: number;
}

interface TallyRow {
  answer_index: number;
  answer_text: string | null;
  derived_votes: number | null;
  stored_tally: number | null;
  capture_count: number | null;
  status: string | null;
}

export interface CommitteesListContent {
  rowTotal: number;
  shownTotal: number;
  filters: { search: string; validOnly: boolean };
  rows: Array<{
    committeeId: string;
    name: string;
    keyword: string;
    type: string;
    valid: boolean;
    isPublic: boolean;
    isOfficial: boolean;
    detailHref: string;
  }>;
}

export interface CommitteeDetailContent {
  committee: {
    committeeId: string;
    name: string;
    keyword: string;
    type: string;
    valid: boolean;
    isPublic: boolean;
    isOfficial: boolean;
    ownerId: string | null;
    subcommitteeOfId: string | null;
    charter: string | null;
    createdAt: string | null;
    modifiedAt: string | null;
  };
  roster: Array<{
    memberId: string;
    displayName: string;
    title: string;
    isAdmin: boolean;
    isVoting: boolean;
    privs: string;
  }>;
  files: Array<{
    fileId: string;
    fileName: string;
    description: string;
    visible: boolean;
    createdAt: string | null;
    committeeScoped: boolean;
  }>;
}

export interface ElectionsListContent {
  rows: Array<{
    electionId: string;
    title: string;
    committeeId: string;
    visible: boolean;
    startsAt: string | null;
    deadlineAt: string | null;
    detailHref: string;
  }>;
}

export interface ElectionDetailContent {
  election: {
    electionId: string;
    title: string;
    description: string | null;
    startsAt: string | null;
    deadlineAt: string | null;
  };
  issues: Array<{
    issueId: string;
    question: string;
    tallies: Array<{
      answerIndex: number;
      answerText: string;
      derivedVotes: number | null;
      storedTally: number | null;
      captureCount: number | null;
      status: string | null;
      disagrees: boolean;
    }>;
  }>;
}

function toCommitteeRow(r: CommitteeRow) {
  return {
    committeeId: r.committee_id,
    name: r.committee_name ?? '(untitled)',
    keyword: r.committee_keyword ?? '',
    type: r.committee_type ?? '',
    valid: r.committee_valid === 1,
    isPublic: r.committee_public === 1,
    isOfficial: r.committee_is_official === 1,
    detailHref: `/internal-governance/committees/${r.committee_id}`,
  };
}

export const internalGovernanceService = {
  getCommitteesPage(filters: { search?: string; validOnly?: boolean }): PageViewModel<CommitteesListContent> {
    const search = (filters.search ?? '').trim();
    const validOnly = filters.validOnly ?? false;

    const allRows = internalGovernance.listCommittees.all() as CommitteeRow[];
    const searchLower = search.toLowerCase();
    const filtered = allRows.filter((r) => {
      if (validOnly && r.committee_valid !== 1) return false;
      if (searchLower && !(r.committee_name ?? '').toLowerCase().includes(searchLower)) return false;
      return true;
    });

    return {
      seo: { title: 'Legacy Governance Review: Committees', noindex: true },
      page: {
        sectionKey: 'internal-governance',
        pageKey: 'internal_governance_committees',
        title: 'Legacy Governance Review: Committees',
        intro: 'Throwaway review of the legacy committee/group export. Deleted before go-live.',
      },
      content: {
        rowTotal: allRows.length,
        shownTotal: filtered.length,
        filters: { search, validOnly },
        rows: filtered.map(toCommitteeRow),
      },
    };
  },

  getCommitteeDetailPage(committeeId: string): PageViewModel<CommitteeDetailContent> {
    const committee = internalGovernance.getCommittee.get(committeeId) as CommitteeRow | undefined;
    if (!committee) {
      throw new NotFoundError(`No legacy committee with id ${committeeId}`);
    }

    const roster = (internalGovernance.listCommitteeMembers.all(committeeId) as CommitteeMemberRow[]).map((m) => ({
      memberId: m.committee_member_id,
      displayName: m.member_name ?? m.alias ?? `member ${m.committee_member_id}`,
      title: m.title ?? '',
      isAdmin: m.is_admin === 1,
      isVoting: m.is_voting === 1,
      privs: m.privs ?? '',
    }));

    const files = (internalGovernance.listGroupFiles.all(committeeId) as GroupFileRow[]).map((f) => ({
      fileId: f.file_id,
      fileName: f.file_name ?? '(untitled file)',
      description: f.description ?? '',
      visible: f.visible === 1,
      createdAt: f.created_at,
      committeeScoped: f.committee_scoped === 1,
    }));

    return {
      seo: { title: `Legacy Governance Review: ${committee.committee_name ?? committeeId}`, noindex: true },
      page: {
        sectionKey: 'internal-governance',
        pageKey: 'internal_governance_committee_detail',
        title: committee.committee_name ?? `Committee ${committeeId}`,
      },
      navigation: {
        breadcrumbs: [
          { label: 'Committees', href: '/internal-governance/committees' },
          { label: committee.committee_name ?? committeeId },
        ],
      },
      content: {
        committee: {
          committeeId: committee.committee_id,
          name: committee.committee_name ?? '(untitled)',
          keyword: committee.committee_keyword ?? '',
          type: committee.committee_type ?? '',
          valid: committee.committee_valid === 1,
          isPublic: committee.committee_public === 1,
          isOfficial: committee.committee_is_official === 1,
          ownerId: committee.committee_owner_id,
          subcommitteeOfId: committee.subcommittee_of_id,
          charter: committee.committee_charter,
          createdAt: committee.committee_created_at,
          modifiedAt: committee.committee_modified_at,
        },
        roster,
        files,
      },
    };
  },

  getElectionsPage(): PageViewModel<ElectionsListContent> {
    const rows = internalGovernance.listElections.all() as ElectionRow[];
    return {
      seo: { title: 'Legacy Governance Review: Elections', noindex: true },
      page: {
        sectionKey: 'internal-governance',
        pageKey: 'internal_governance_elections',
        title: 'Legacy Governance Review: Elections',
        intro: 'Throwaway review of legacy elections, issues and the derived vote tallies. Deleted before go-live.',
      },
      content: {
        rows: rows.map((r) => ({
          electionId: r.election_id,
          title: r.title ?? `Election ${r.election_id}`,
          committeeId: r.committee_id ?? '',
          visible: r.visible === 1,
          startsAt: r.starts_at,
          deadlineAt: r.deadline_at,
          detailHref: `/internal-governance/elections/${r.election_id}`,
        })),
      },
    };
  },

  getElectionDetailPage(electionId: string): PageViewModel<ElectionDetailContent> {
    const election = internalGovernance.getElection.get(electionId) as ElectionRow | undefined;
    if (!election) {
      throw new NotFoundError(`No legacy election with id ${electionId}`);
    }

    const issues = internalGovernance.listIssuesByElection.all(electionId) as IssueRow[];

    return {
      seo: { title: `Legacy Governance Review: ${election.title ?? electionId}`, noindex: true },
      page: {
        sectionKey: 'internal-governance',
        pageKey: 'internal_governance_election_detail',
        title: election.title ?? `Election ${electionId}`,
      },
      navigation: {
        breadcrumbs: [
          { label: 'Elections', href: '/internal-governance/elections' },
          { label: election.title ?? `Election ${electionId}` },
        ],
      },
      content: {
        election: {
          electionId: election.election_id,
          title: election.title ?? `Election ${electionId}`,
          description: election.description,
          startsAt: election.starts_at,
          deadlineAt: election.deadline_at,
        },
        issues: issues.map((issue) => {
          const tallies = internalGovernance.listTalliesByIssue.all(issue.issue_id) as TallyRow[];
          return {
            issueId: issue.issue_id,
            question: issue.question ?? `Issue ${issue.issue_id}`,
            tallies: tallies.map((t) => ({
              answerIndex: t.answer_index,
              answerText: t.answer_text ?? '(no numbered answer)',
              derivedVotes: t.derived_votes,
              storedTally: t.stored_tally,
              captureCount: t.capture_count,
              status: t.status,
              disagrees: t.derived_votes !== null && t.stored_tally !== null && t.derived_votes !== t.stored_tally,
            })),
          };
        }),
      },
    };
  },
};
