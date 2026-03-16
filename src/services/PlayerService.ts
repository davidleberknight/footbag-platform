import {
  HistoricalPersonRow,
  HistoricalPersonDetailRow,
  PlayerResultRow,
  historicalPersons,
} from '../db/db';
import { NotFoundError } from './serviceErrors';
import { runSqliteRead } from './sqliteRetry';

export interface PublicPlayer {
  personId: string;
  name: string;
  country: string | null;
  firstYear: number | null;
  lastYear: number | null;
  eventCount: number | null;
  isBapMember: boolean;
  bapNickname: string | null;
}

export interface PublicPlayerResult {
  eventTitle: string;
  startDate: string;
  disciplineName: string | null;
  placement: number;
  scoreText: string | null;
  displayName: string;
}

export interface PublicPlayerDetail extends PublicPlayer {
  aliases: string | null;
  placementCount: number | null;
  bapInductionYear: number | null;
  isFbhofMember: boolean;
  fbhofInductionYear: number | null;
  freestyleSequences: number | null;
  freestyleMaxAdd: number | null;
  freestyleUniqueTricks: number | null;
  freestyleDiversityRatio: number | null;
  signatureTricks: string[];
  notes: string | null;
  results: PublicPlayerResult[];
}

function toPublicPlayer(row: HistoricalPersonRow): PublicPlayer {
  return {
    personId: row.person_id,
    name: row.person_name,
    country: row.country,
    firstYear: row.first_year,
    lastYear: row.last_year,
    eventCount: row.event_count,
    isBapMember: row.bap_member === 1,
    bapNickname: row.bap_nickname ?? null,
  };
}

function toPublicPlayerDetail(
  row: HistoricalPersonDetailRow,
  resultRows: PlayerResultRow[],
): PublicPlayerDetail {
  const signatureTricks = [row.signature_trick_1, row.signature_trick_2, row.signature_trick_3]
    .filter((t): t is string => !!t);

  return {
    personId: row.person_id,
    name: row.person_name,
    country: row.country,
    firstYear: row.first_year,
    lastYear: row.last_year,
    eventCount: row.event_count,
    isBapMember: row.bap_member === 1,
    bapNickname: row.bap_nickname ?? null,
    aliases: row.aliases ?? null,
    placementCount: row.placement_count ?? null,
    bapInductionYear: row.bap_induction_year ?? null,
    isFbhofMember: row.fbhof_member === 1,
    fbhofInductionYear: row.fbhof_induction_year ?? null,
    freestyleSequences: row.freestyle_sequences ?? null,
    freestyleMaxAdd: row.freestyle_max_add ?? null,
    freestyleUniqueTricks: row.freestyle_unique_tricks ?? null,
    freestyleDiversityRatio: row.freestyle_diversity_ratio ?? null,
    signatureTricks,
    notes: row.notes ?? null,
    results: resultRows.map((r) => ({
      eventTitle: r.event_title,
      startDate: r.start_date,
      disciplineName: r.discipline_name,
      placement: r.placement,
      scoreText: r.score_text,
      displayName: r.display_name,
    })),
  };
}

export class PlayerService {
  listPlayers(): PublicPlayer[] {
    return runSqliteRead('listPlayers', () => {
      const rows = historicalPersons.listPlayers.all() as HistoricalPersonRow[];
      return rows.map(toPublicPlayer);
    });
  }

  getPlayer(personId: string): PublicPlayerDetail {
    return runSqliteRead('getPlayer', () => {
      const row = historicalPersons.getById.get(personId) as HistoricalPersonDetailRow | undefined;
      if (!row) {
        throw new NotFoundError('Player not found.', { field: 'personId', value: personId });
      }
      const resultRows = historicalPersons.listResultsByPersonId.all(personId) as PlayerResultRow[];
      return toPublicPlayerDetail(row, resultRows);
    });
  }
}

export const playerService = new PlayerService();
