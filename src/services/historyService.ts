import { PublicPlayerResultRow, publicPlayers, account } from '../db/db';
import { NotFoundError } from './serviceErrors';
import { personHref } from './personLink';
import { runSqliteRead } from './sqliteRetry';
import { getPhotoStorage } from '../adapters/photoStorageInstance';
import { PageViewModel } from '../types/page';
import { groupPlayerResults, buildPlayerSummaryFacts } from './playerShaping';
import type { PlayerEventGroup, PlayerHeroData } from '../types/playerProfile';

interface HistoricalPlayer {
  personId: string;
  personName: string;
  country: string | null;
  eventCount: number;
  placementCount: number;
  bapMember: boolean;
  bapNickname: string | null;
  bapInductionYear: number | null;
  hofMember: boolean;
  fbhofInductionYear: number | null;
  eventGroups: PlayerEventGroup[];
}

export interface HistoricalPlayerListEntry {
  personId: string;
  personName: string;
  country: string | null;
  eventCount: number | null;
  placementCount: number | null;
  bapMember: boolean;
  hofMember: boolean;
}

export interface HistoryLandingContent {
  playerCount: number;
  players: Array<HistoricalPlayerListEntry & { playerHref: string }>;
}

export interface HistoryDetailContent {
  personId: string;
  displayName: string;
  hofMember: boolean;
  bapMember: boolean;
  memberHref: string | null;
  avatarThumbUrl: string | null;
  heroData: PlayerHeroData;
  eventGroups: PlayerEventGroup[];
}

export const historyService = {
  getHistoryLandingPage(): PageViewModel<HistoryLandingContent> {
    const rows = runSqliteRead('listAllHistoricalPlayers', () =>
      publicPlayers.listAll.all(),
    ) as Array<{
      person_id: string;
      person_name: string;
      country: string | null;
      event_count: number | null;
      placement_count: number | null;
      bap_member: number;
      fbhof_member: number;
      linked_member_slug: string | null;
    }>;

    const players = rows.map(r => ({
      personId:       r.person_id,
      personName:     r.person_name,
      country:        r.country ?? null,
      eventCount:     r.event_count ?? null,
      placementCount: r.placement_count ?? null,
      bapMember:      Boolean(r.bap_member),
      hofMember:      Boolean(r.fbhof_member),
      playerHref:     personHref(r.linked_member_slug, r.person_id)!,
    }));

    return {
      seo: { title: 'Historical Players' },
      page: {
        sectionKey: 'history',
        pageKey:    'history_index',
        title:      'Historical Players',
        intro:      'Competitive footbag players from our legacy event results database.',
      },
      content: { playerCount: players.length, players },
    };
  },

  getHistoricalPlayerPage(personId: string): PageViewModel<HistoryDetailContent> {
    const row = runSqliteRead('getHistoricalPlayerById', () =>
      publicPlayers.getById.get(personId),
    );

    if (!row) {
      throw new NotFoundError(`Historical player not found: ${personId}`);
    }

    const p = row as ReturnType<typeof publicPlayers.getById.get> & Record<string, unknown>;

    const resultRows = runSqliteRead('listHistoricalPlayerResults', () =>
      publicPlayers.listResultsByPersonId.all(personId),
    ) as PublicPlayerResultRow[];

    const player: HistoricalPlayer = {
      personId:           String(p['person_id']),
      personName:         String(p['person_name']),
      country:            (p['country'] as string | null) ?? null,
      eventCount:         Number(p['event_count'] ?? 0),
      placementCount:     Number(p['placement_count'] ?? 0),
      bapMember:          Boolean(p['bap_member']),
      bapNickname:        (p['bap_nickname'] as string | null) ?? null,
      bapInductionYear:   (p['bap_induction_year'] as number | null) ?? null,
      hofMember:        Boolean(p['fbhof_member']),
      fbhofInductionYear: (p['fbhof_induction_year'] as number | null) ?? null,
      eventGroups:        groupPlayerResults(resultRows, { selfPersonId: personId }),
    };

    // Look up linked member account (if any) for member profile link and avatar.
    const linkedRow = runSqliteRead('findLinkedMemberSlug', () =>
      publicPlayers.findLinkedMemberSlug.get(personId),
    ) as { slug: string } | undefined;

    const memberHref = personHref(linkedRow?.slug ?? null, null);
    let avatarThumbUrl: string | null = null;

    if (memberHref && linkedRow?.slug) {
      const memberRow = runSqliteRead('findMemberBySlugForAvatar', () =>
        account.findMemberBySlug.get(linkedRow.slug),
      ) as { avatar_thumb_key: string | null } | undefined;
      if (memberRow?.avatar_thumb_key) {
        avatarThumbUrl = getPhotoStorage().constructURL(memberRow.avatar_thumb_key);
      }
    }

    const heroData: PlayerHeroData = {
      displayName:       player.personName,
      honorificNickname: player.bapNickname ?? undefined,
      isHof:             player.hofMember,
      isBap:             player.bapMember,
      hofInductionYear:  player.fbhofInductionYear ?? undefined,
      bapInductionYear:  player.bapInductionYear ?? undefined,
      country:           player.country,
      summaryFacts:      buildPlayerSummaryFacts({
        eventCount:     player.eventCount,
        placementCount: player.placementCount,
        isHof:          player.hofMember,
        isBap:          player.bapMember,
        hofYear:        player.fbhofInductionYear,
        bapYear:        player.bapInductionYear,
      }),
      isHistoricalOnly: true,
    };

    return {
      seo: { title: player.personName },
      page: {
        sectionKey: 'history',
        pageKey:    'history_player_detail',
        title:      player.personName,
      },
      navigation: {
        contextLinks: [{ label: 'Historical Players', href: '/history' }],
      },
      content: {
        personId:      player.personId,
        displayName:   player.personName,
        hofMember:     player.hofMember,
        bapMember:     player.bapMember,
        memberHref,
        avatarThumbUrl,
        heroData,
        eventGroups:   player.eventGroups,
      },
    };
  },
};
