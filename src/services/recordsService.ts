/**
 * RecordsService -- public cross-sport records page (read-only).
 *
 * Serves:
 *   - GET /records (public): canonical records section entry; the single page in the section.
 *
 * Rendering contract:
 *   - getRecordsPage() returns PageViewModel<RecordsContent>.
 *   - Aggregates consecutive-kicks world records, highest scores, progression, milestones, and
 *     freestyle passback records into one view-model.
 *
 * Visibility:
 *   - Public official historical records only. Derived aggregates carry a scope caveat or are
 *     suppressed when source coverage is partial; official results and record listings outrank
 *     inferred aggregates.
 */
import { consecutiveKicksRecords, ConsecutiveKicksRow, freestyleRecords, FreestyleRecordRow } from '../db/db';
import { FreestyleRecordViewModel, shapeFreestyleRecord } from './freestyleRecordShaping';
import { getResolvableTrickSlugs } from './freestyleResolvableSlugs';
import { runSqliteRead } from './sqliteRetry';
import { PageViewModel } from '../types/page';

export interface ConsecutiveRecordViewModel {
  division:   string;
  player_1:   string | null;
  player_2:   string | null;
  score:      number | null;
  scoreFormatted: string;
  note:       string | null;
  isWorldRecord: boolean;
  eventDate:  string | null;
  eventName:  string | null;
  location:   string | null;
  year:       string | null;
}

export interface ConsecutiveGroup {
  subsection: string;
  rows:       ConsecutiveRecordViewModel[];
}

export interface RecordsContent {
  worldRecords:      ConsecutiveRecordViewModel[];
  highestScores:     ConsecutiveGroup[];
  progression:       ConsecutiveGroup[];
  milestones:        ConsecutiveGroup[];
  passbackRecords:   FreestyleRecordViewModel[];
  totalPassback:     number;
}

function formatScore(score: number | null): string {
  if (score === null) return '—';
  return score.toLocaleString('en-US');
}

function shapeRow(r: ConsecutiveKicksRow): ConsecutiveRecordViewModel {
  const noteText = r.note ?? '';
  const isWorldRecord = noteText.includes('World Record') && !noteText.includes('Former');
  return {
    division:       r.division,
    player_1:       r.player_1,
    player_2:       r.player_2,
    score:          r.score,
    scoreFormatted: formatScore(r.score),
    note:           r.note,
    isWorldRecord,
    eventDate:      r.event_date,
    eventName:      r.event_name,
    location:       r.location,
    year:           r.year,
  };
}

function groupBySubsection(rows: ConsecutiveKicksRow[]): ConsecutiveGroup[] {
  const groups: ConsecutiveGroup[] = [];
  let current: ConsecutiveGroup | null = null;
  for (const r of rows) {
    if (!current || current.subsection !== r.subsection) {
      current = { subsection: r.subsection, rows: [] };
      groups.push(current);
    }
    current.rows.push(shapeRow(r));
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

    const passbackRows = runSqliteRead('freestyleRecords.listPublic', () =>
      freestyleRecords.listPublic.all() as FreestyleRecordRow[],
    );
    const resolvableSlugs = getResolvableTrickSlugs();

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
        passbackRecords: passbackRows.map(r => shapeFreestyleRecord(r, resolvableSlugs)),
        totalPassback:   passbackRows.length,
      },
    };
  },
};
