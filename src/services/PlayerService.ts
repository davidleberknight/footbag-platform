import { PublicPlayerResultRow, publicPlayers } from '../db/db';
import { NotFoundError } from './serviceErrors';
import { runSqliteRead } from './sqliteRetry';

export interface PlayerResultEntry {
  disciplineName: string | null;
  disciplineCategory: string | null;
  teamType: string | null;
  placement: number;
  scoreText: string | null;
  teammates: string[];
}

export interface PlayerEventGroup {
  eventId: string;
  eventTitle: string;
  startDate: string;
  city: string;
  eventCountry: string;
  results: PlayerResultEntry[];
}

export interface PlayerDetail {
  personId: string;
  personName: string;
  country: string | null;
  eventCount: number;
  placementCount: number;
  bapMember: boolean;
  bapNickname: string | null;
  bapInductionYear: number | null;
  fbhofMember: boolean;
  fbhofInductionYear: number | null;
  eventGroups: PlayerEventGroup[];
}

function groupResults(rows: PublicPlayerResultRow[], personId: string): PlayerEventGroup[] {
  const eventMap = new Map<string, PlayerEventGroup>();

  for (const row of rows) {
    if (!eventMap.has(row.event_id)) {
      eventMap.set(row.event_id, {
        eventId:      row.event_id,
        eventTitle:   row.event_title,
        startDate:    row.start_date,
        city:         row.city,
        eventCountry: row.event_country,
        results:      [],
      });
    }

    const group = eventMap.get(row.event_id)!;

    // Find existing entry for this discipline+placement, or create one
    const key = `${row.discipline_name ?? ''}__${row.placement}`;
    let entry = group.results.find(
      r => `${r.disciplineName ?? ''}__${r.placement}` === key,
    );

    if (!entry) {
      entry = {
        disciplineName:     row.discipline_name,
        disciplineCategory: row.discipline_category,
        teamType:           row.team_type,
        placement:          row.placement,
        scoreText:          row.score_text,
        teammates:          [],
      };
      group.results.push(entry);
    }

    // Add co-participants (for doubles/team events), excluding the player themselves
    const isSelf = row.participant_person_id === personId;
    if (!isSelf && !entry.teammates.includes(row.participant_display_name)) {
      entry.teammates.push(row.participant_display_name);
    }
  }

  return Array.from(eventMap.values());
}

export const playerService = {
  getPlayerDetailPage(personId: string): { player: PlayerDetail } {
    const row = runSqliteRead('getPlayerById', () =>
      publicPlayers.getById.get(personId),
    );

    if (!row) {
      throw new NotFoundError(`Player not found: ${personId}`);
    }

    const p = row as ReturnType<typeof publicPlayers.getById.get> & Record<string, unknown>;

    const resultRows = runSqliteRead('listPlayerResults', () =>
      publicPlayers.listResultsByPersonId.all(personId),
    ) as PublicPlayerResultRow[];

    const player: PlayerDetail = {
      personId:         String(p['person_id']),
      personName:       String(p['person_name']),
      country:          (p['country'] as string | null) ?? null,
      eventCount:       Number(p['event_count'] ?? 0),
      placementCount:   Number(p['placement_count'] ?? 0),
      bapMember:        Boolean(p['bap_member']),
      bapNickname:      (p['bap_nickname'] as string | null) ?? null,
      bapInductionYear: (p['bap_induction_year'] as number | null) ?? null,
      fbhofMember:      Boolean(p['fbhof_member']),
      fbhofInductionYear: (p['fbhof_induction_year'] as number | null) ?? null,
      eventGroups:      groupResults(resultRows, personId),
    };

    return { player };
  },
};
