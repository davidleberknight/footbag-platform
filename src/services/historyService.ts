/**
 * HistoryService -- public historical-person detail page (read-only).
 *
 * Serves:
 *   - GET /history/:personId: historical player detail. Public for every canonical,
 *     results-derived record, because these minimal pages are what make public results
 *     intelligible. A provisional record or an unresolved-name placeholder is member-only,
 *     whatever honor flag it carries. There is no bare /history route.
 *
 * Rendering contract:
 *   - getHistoricalPlayerPage() returns a discriminated HistoryDetailResult
 *     ({action:'redirect'} | {action:'requireAuth'} | {action:'render', vm:
 *     PageViewModel<HistoryDetailContent>}); the controller acts on the discriminant. A
 *     non-canonical record viewed by a non-member yields requireAuth (controller redirects to
 *     /login?returnTo=...); an unknown person throws NotFoundError (404).
 *   - The page publishes no derived statistic (career totals, partnership rankings): every
 *     result is already listed, and an aggregate over imported results needs a caveat the
 *     page would only repeat.
 *   - Result links are pre-shaped in the service via personHref() (resolves to
 *     /members/{slug} for a claimed member, /history/{personId} otherwise, null when neither);
 *     templates render plain text when no link exists.
 *
 * Visibility:
 *   - A historical person is a public historical identity, not a current-member account. The page
 *     renders name, country, official honors, and official result/event links only; it carries no
 *     contact fields and must not imply current-member capabilities or contactability.
 *   - The page offers no claim control. Linking a record to an account is done in the onboarding
 *     wizard's claim task and nowhere else, so this service reads public data only and takes no
 *     viewer identity beyond whether the viewer is a member.
 */
import { PublicPlayerResultRow, FreestyleRecordRow, publicPlayers, freestyleRecords } from '../db/db';
import { NotFoundError } from './serviceErrors';
import { personHref } from './personLink';
import { runSqliteRead } from './sqliteRetry';
import { PageViewModel } from '../types/page';
import { groupPlayerResults, resultsHaveDetail } from './playerShaping';
import type { PlayerEventGroup, PlayerHeroData } from '../types/playerProfile';
import { FreestyleRecordViewModel, shapeFreestyleRecord } from './freestyleRecordShaping';
import { buildActiveTrickSlugResolver } from './freestyleResolvableSlugs';

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
  hofInductionYear: number | null;
  eventGroups: PlayerEventGroup[];
}

export interface HistoryDetailContent {
  personId: string;
  displayName: string;
  hofMember: boolean;
  bapMember: boolean;
  heroData: PlayerHeroData;
  hasCompetitionResults: boolean;
  hasRecords: boolean;
  eventGroups: PlayerEventGroup[];
  resultsHaveDetail: boolean;
  freestyleRecords: FreestyleRecordViewModel[];
}

export type HistoryDetailResult =
  | { action: 'redirect'; href: string }
  | { action: 'requireAuth' }
  | { action: 'render'; vm: PageViewModel<HistoryDetailContent> };

export const historyService = {
  getHistoricalPlayerPage(
    personId: string,
    isMember: boolean,
  ): HistoryDetailResult {
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
      hofMember:        Boolean(p['hof_member']),
      hofInductionYear: (p['hof_induction_year'] as number | null) ?? null,
      eventGroups:        groupPlayerResults(resultRows, { selfPersonId: personId }),
    };

    const freestyleRows = runSqliteRead('listFreestyleRecordsByPersonId', () =>
      freestyleRecords.listByPersonId.all(personId),
    ) as FreestyleRecordRow[];

    // Look up linked member account (if any) for member profile link and avatar.
    const linkedRow = runSqliteRead('findLinkedMemberSlug', () =>
      publicPlayers.findLinkedMemberSlug.get(personId),
    ) as { slug: string; is_hof: number; is_bap: number } | undefined;

    // Redirect to the member profile only when that profile is publicly
    // viewable (the HoF/BAP exception). An ordinary member's claim must not
    // take this public historical record offline: the anonymous public has
    // no access to ordinary member profiles, so the redirect would land on
    // a 404 and the event-results attribution page would disappear.
    const linkedIsPubliclyViewable =
      linkedRow !== undefined && (linkedRow.is_hof === 1 || linkedRow.is_bap === 1);
    const memberHref = linkedIsPubliclyViewable ? personHref(linkedRow.slug, null) : null;

    if (memberHref) {
      return { action: 'redirect', href: memberHref };
    }

    // Every canonical, results-derived record is a public page. A provisional
    // record or an unresolved-name placeholder is never public, whatever honor
    // flag it carries; the member-visible rosters and result tables that link
    // such records still resolve for a member.
    const isCanonical = p['source_scope'] === 'CANONICAL';
    if (!isCanonical && !isMember) {
      return { action: 'requireAuth' };
    }

    const heroData: PlayerHeroData = {
      displayName:       player.personName,
      honorificNickname: player.bapNickname ?? undefined,
      isHof:             player.hofMember,
      isBap:             player.bapMember,
      hofInductionYear:  player.hofInductionYear ?? undefined,
      bapInductionYear:  player.bapInductionYear ?? undefined,
      country:           player.country,
    };

    const resolveActiveSlug = buildActiveTrickSlugResolver();
    return {
      action: 'render',
      vm: {
        seo: { title: `Player ${player.personName}` },
        page: {
          sectionKey: 'history',
          pageKey:    'history_player_detail',
          title:      player.personName,
        },
        navigation: {
          contextLinks: [{ label: 'Hall of Fame', href: '/hof' }],
        },
        content: {
          personId:      player.personId,
          displayName:   player.personName,
          hofMember:     player.hofMember,
          bapMember:     player.bapMember,
          heroData,
          hasCompetitionResults: player.eventGroups.length > 0,
          hasRecords:            freestyleRows.length > 0,
          eventGroups:           player.eventGroups,
          resultsHaveDetail:     resultsHaveDetail(player.eventGroups),
          freestyleRecords:      freestyleRows.map(r => shapeFreestyleRecord(r, resolveActiveSlug)),
        },
      },
    };
  },
};
