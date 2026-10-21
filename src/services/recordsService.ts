/**
 * RecordsService -- public cross-sport records page (read-only).
 *
 * Serves:
 *   - GET /records (public): canonical records section entry; the single page in the section.
 *
 * Rendering contract:
 *   - getRecordsPage() returns PageViewModel<RecordsContent>.
 *   - Aggregates consecutive-kicks world records, highest scores, progression and milestones into
 *     one view-model. The freestyle passback records are not repeated here; the page links to
 *     /freestyle/records, which lists them.
 *
 * Visibility:
 *   - Public official historical records only. Derived aggregates carry a scope caveat or are
 *     suppressed when source coverage is partial; official results and record listings outrank
 *     inferred aggregates.
 */
import { consecutiveKicksRecords, ConsecutiveKicksRow } from '../db/db';
import { runSqliteRead } from './sqliteRetry';
import { PageViewModel } from '../types/page';

export interface ConsecutiveRecordViewModel {
  discipline: string;
  player_1:   string | null;
  player_2:   string | null;
  score:      number | null;
  scoreFormatted: string;
  eventDate:  string | null;
  eventName:  string | null;
  location:   string | null;
  year:       string | null;
}

export interface ConsecutiveGroup {
  subsection: string;
  rows:       ConsecutiveRecordViewModel[];
  /** Sentences said once under the table, in place of a mostly empty note column. */
  footnotes:  string[];
}

export interface RecordsContent {
  worldRecords:      ConsecutiveRecordViewModel[];
  highestScores:     ConsecutiveGroup[];
  progression:       ConsecutiveGroup[];
  milestones:        ConsecutiveGroup[];
}

function formatScore(score: number | null): string {
  if (score === null) return '—';
  return score.toLocaleString('en-US');
}

/** "a", "a and b", "a, b and c". */
function joinList(items: string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

function shapeRow(r: ConsecutiveKicksRow): ConsecutiveRecordViewModel {
  return {
    discipline:     r.discipline,
    player_1:       r.player_1,
    player_2:       r.player_2,
    score:          r.score,
    scoreFormatted: formatScore(r.score),
    eventDate:      r.event_date,
    eventName:      r.event_name,
    location:       r.location,
    year:           r.year,
  };
}

/**
 * Group rows by subsection. A note column empty in most rows is replaced by
 * sentences under the table: a row with no score is a note rather than a
 * record, so its note becomes a sentence and the row is dropped; runs ended on
 * purpose are named together in one sentence.
 */
function groupBySubsection(rows: ConsecutiveKicksRow[]): ConsecutiveGroup[] {
  const groups: ConsecutiveGroup[] = [];
  const endedOnPurpose = new Map<ConsecutiveGroup, string[]>();
  let current: ConsecutiveGroup | null = null;
  for (const r of rows) {
    if (!current || current.subsection !== r.subsection) {
      current = { subsection: r.subsection, rows: [], footnotes: [] };
      groups.push(current);
    }
    if (r.score === null) {
      if (r.note) current.footnotes.push(r.note.endsWith('.') ? r.note : `${r.note}.`);
      continue;
    }
    if (r.note && /intentionally ended/i.test(r.note)) {
      const scores = endedOnPurpose.get(current) ?? [];
      scores.push(formatScore(r.score));
      endedOnPurpose.set(current, scores);
    }
    current.rows.push(shapeRow(r));
  }
  for (const [group, scores] of endedOnPurpose) {
    const runs = scores.length === 1 ? 'The run of' : 'The runs of';
    group.footnotes.push(`${runs} ${joinList(scores)} ${scores.length === 1 ? 'was' : 'were'} stopped on purpose.`);
  }
  return groups;
}

export const recordsService = {
  getRecordsPage(): PageViewModel<RecordsContent> {
    const worldRows = runSqliteRead('consecutiveKicksRecords.listWorldRecords', () =>
      consecutiveKicksRecords.listWorldRecords.all() as ConsecutiveKicksRow[],
    );
    const highScoreRows = runSqliteRead('consecutiveKicksRecords.listHighestScores', () =>
      consecutiveKicksRecords.listHighestScores.all() as ConsecutiveKicksRow[],
    );
    const progressionRows = runSqliteRead('consecutiveKicksRecords.listProgression', () =>
      consecutiveKicksRecords.listProgression.all() as ConsecutiveKicksRow[],
    );
    const milestoneRows = runSqliteRead('consecutiveKicksRecords.listMilestones', () =>
      consecutiveKicksRecords.listMilestones.all() as ConsecutiveKicksRow[],
    );

    return {
      seo:  { title: 'Records' },
      page: {
        sectionKey: 'records',
        pageKey:    'records',
        title:      'Records',
        intro:      'Official consecutive and freestyle records.',
      },
      content: {
        worldRecords:    worldRows.map(shapeRow),
        highestScores:   groupBySubsection(highScoreRows),
        progression:     groupBySubsection(progressionRows),
        milestones:      groupBySubsection(milestoneRows),
      },
    };
  },
};
