/**
 * ConsecutivesService -- public Consecutives landing page and the official IFPA records
 * (read-only).
 *
 * Serves:
 *   - GET /consecutives (public): canonical consecutives section entry; the single page in the
 *     section, carrying what consecutives is, how it is contested, and the official records.
 *     The official IFPA records are the consecutive-kicks records, so they live here.
 *
 * Rendering contract:
 *   - getConsecutivesPage() returns PageViewModel<ConsecutivesContent>.
 *   - Orientation first: the explainer (with the featured timed-consecutives clip, an upright
 *     video shown in a portrait frame, when its site media slot is seeded) and
 *     the competitions sentence, then consecutive-kicks world records, highest scores, progression
 *     and milestones. A records section with no rows renders nothing.
 *   - Freestyle passback records are freestyle records, not official IFPA records, and are not
 *     shown or linked here.
 *
 * Visibility:
 *   - Public official historical records only. Derived aggregates carry a scope caveat or are
 *     suppressed when source coverage is partial; official results and record listings outrank
 *     inferred aggregates.
 */
import { consecutiveKicksRecords, ConsecutiveKicksRow } from '../db/db';
import { runSqliteRead } from './sqliteRetry';
import { SiteVideo, loadSiteVideo } from './siteMediaService';
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
  /** Whether any of event, date or location is known, so an empty line is never drawn. */
  hasWhereWhen: boolean;
}

export interface ConsecutiveGroup {
  subsection: string;
  rows:       ConsecutiveRecordViewModel[];
  /** Sentences said once under the table, in place of a mostly empty note column. */
  footnotes:  string[];
}

export interface ConsecutivesContent {
  mascot:            { src: string; alt: string };
  explainer:         { heading: string; paragraphs: string[] };
  demoVideo:         SiteVideo | null;
  competitions:      { heading: string; paragraphs: string[] };
  worldRecordsIntro: string;
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
    hasWhereWhen:   Boolean(r.event_name || r.event_date || r.location),
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

export const consecutivesService = {
  getConsecutivesPage(): PageViewModel<ConsecutivesContent> {
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

    const worldRecords  = worldRows.map(shapeRow);
    const highestScores = groupBySubsection(highScoreRows);
    const progression   = groupBySubsection(progressionRows);
    const milestones    = groupBySubsection(milestoneRows);

    return {
      seo:  { title: 'Consecutives and World Records' },
      page: {
        sectionKey: 'consecutives',
        pageKey:    'consecutives_home',
        title:      'Consecutives',
        intro:      'Keep the footbag in the air for as many kicks as you can.',
      },
      content: {
        mascot: { src: '/img/consecutives-mascot.svg', alt: 'A player kicking a footbag to keep it in the air' },
        explainer: {
          heading: 'What Are Consecutives?',
          paragraphs: [
            'Consecutive kicks is the discipline of keeping a single footbag aloft for as many uninterrupted kicks as possible. It can be played solo or in a group, and it is the basis for some of footbag\'s longest-standing world records.',
          ],
        },
        demoVideo: loadSiteVideo('consecutives_demo'),
        competitions: {
          heading: 'Competitions',
          paragraphs: [
            'At tournaments, consecutives is contested in several competition categories, including 5-Minute Timed Consecutive, Doubles Distance One-Pass, and Singles and Doubles Consecutive Kicks.',
          ],
        },
        worldRecordsIntro: 'Open-ended record attempts can run for many hours, so they are kept as world records rather than contested at tournaments.',
        worldRecords,
        highestScores,
        progression,
        milestones,
      },
    };
  },
};
