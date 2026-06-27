/**
 * HashtagDiscoveryService -- tag stats, tag suggest, and tag discovery.
 *
 * Owns:
 *   - Tag stats rebuild (tag_stats upsert from media_tags + media_items)
 *   - Popular public tags: the most-used tags that are public, meaning used by
 *     2+ distinct members OR carried by curator/system-uploaded content. A single
 *     non-system member's personal tags stay out so they never leak into discovery.
 *   - Suggestion tags composed in three tiers (real community-popular tags, then
 *     pinned curated starters, then curator-published backfill) and the hashtag
 *     summary; the starters are visible while the community is quiet and are
 *     phased out as real community usage accrues
 *   - Standard tags with media (club/event tags that have tagged content)
 *   - Tag prefix suggest (autocomplete)
 *   - Member-context tag suggestions (club affiliations, participated events)
 *
 * Does not own:
 *   - Tag creation (CuratorMediaService for freeform, ClubService/EventService
 *     for standard tags)
 *   - Media tagging (CuratorMediaService)
 *   - Gallery reads (MediaGalleryService)
 *
 * Persistence:
 *   tag_stats (write), tags (read), media_tags (read), media_items (read),
 *   member_club_affiliations (read), clubs (read), events (read),
 *   event_result_entry_participants (read).
 *
 * Service shape: singleton object (no external adapters beyond db.ts).
 */
import {
  queryTagStatsSource,
  tagStats,
  suggestTagsForTerm,
  transaction,
  type PopularTagRow,
  type StandardTagWithMediaRow,
  type TagStatSourceRow,
  type MemberTagRow,
} from '../db/db';
import { runSqliteRead } from './sqliteRetry';
import { TEACHING_TAG_SEEDS, composeSuggestedTags } from '../content/teachingTagSeeds';

export interface TagChipShape {
  display: string;
  normalized: string;
  href: string;
}

export interface HashtagStatsSummary {
  /** Count of community-popular tags (capped at the read limit). */
  communityTagCount: number;
  /** The single most-used community tag, or null at cold start. */
  topTag: TagChipShape | null;
  /** Pre-shaped: true when at least one community-popular tag exists. */
  hasCommunityTags: boolean;
}

export interface TagSuggestion {
  normalized: string;
  display: string;
  usageCount: number;
}

export interface MemberTagSuggestions {
  clubTags: TagChipShape[];
  participatedEventTags: TagChipShape[];
  popularTags: TagChipShape[];
}

function tagToBrowseHref(tagNormalized: string): string {
  const token = tagNormalized.startsWith('#') ? tagNormalized.slice(1) : tagNormalized;
  return `/media/browse?tag=${encodeURIComponent(token)}`;
}

function rowToChip(row: { tag_normalized: string; tag_display: string }): TagChipShape {
  return {
    display: row.tag_display,
    normalized: row.tag_normalized,
    href: tagToBrowseHref(row.tag_normalized),
  };
}

export const hashtagDiscoveryService = {
  rebuildTagStats(): { rowsUpserted: number } {
    const now = new Date().toISOString();
    let rows!: TagStatSourceRow[];
    transaction(() => {
      rows = queryTagStatsSource();
      tagStats.deleteAll.run();
      for (const row of rows) {
        tagStats.upsertTagStat.run(
          row.tag_id,
          row.usage_count,
          row.distinct_member_count,
          row.last_used_at,
          now, now, now,
        );
      }
    });
    return { rowsUpserted: rows.length };
  },

  incrementTagStats(tagIds: string[]): void {
    if (tagIds.length === 0) return;
    const now = new Date().toISOString();
    transaction(() => {
      for (const tagId of tagIds) {
        tagStats.upsertIncrement.run(tagId, now, now, now, now);
        tagStats.recomputeDistinctMemberCountForTag.run(tagId, now, now, tagId);
      }
    });
  },

  decrementTagStats(tagIds: string[]): void {
    if (tagIds.length === 0) return;
    const now = new Date().toISOString();
    transaction(() => {
      for (const tagId of tagIds) {
        tagStats.decrementUsageCount.run(now, now, tagId);
        tagStats.deleteZeroUsage.run(tagId);
        tagStats.recomputeDistinctMemberCountForTag.run(tagId, now, now, tagId);
      }
    });
  },

  getPopularTags(limit: number = 30): TagChipShape[] {
    return runSqliteRead('hashtagDiscoveryService.getPopularTags', () => {
      const rows = tagStats.listPopularPublicTags.all(limit) as PopularTagRow[];
      return rows.map(rowToChip);
    });
  },

  // Suggestion surface: real community-popular tags first, then the pinned
  // curated starter seeds, then curator-published tags backfilling the rest.
  // Before community usage accrues the seeds are visible at the top; as members
  // upload and real community tags fill the high slots, the seeds are squeezed
  // out automatically (the composer dedups and respects the limit).
  getPopularTagsWithSeeds(limit: number = 8): TagChipShape[] {
    return runSqliteRead('hashtagDiscoveryService.getPopularTagsWithSeeds', () => {
      const community = (tagStats.listMemberCommunityPopularTags.all(limit) as PopularTagRow[]).map(rowToChip);
      const curator = (tagStats.listCuratorPublishedPopularTags.all(limit) as PopularTagRow[]).map(rowToChip);
      return composeSuggestedTags(community, TEACHING_TAG_SEEDS, curator, limit, tagToBrowseHref);
    });
  },

  // Aggregated hashtag statistics for the teaching empty state. The count is
  // capped at the read limit; a teaching surface does not need an exact total.
  // At cold start every value is empty/false, so the caller hides the stats
  // block and shows only the seeded chips.
  getCommunityHashtagSummary(): HashtagStatsSummary {
    const top = hashtagDiscoveryService.getPopularTags(50);
    return {
      communityTagCount: top.length,
      topTag: top[0] ?? null,
      hasCommunityTags: top.length > 0,
    };
  },

  getStandardTagsWithMedia(): { clubs: TagChipShape[]; events: TagChipShape[] } {
    return runSqliteRead('hashtagDiscoveryService.getStandardTagsWithMedia', () => {
      const rows = tagStats.listStandardTagsWithMedia.all() as StandardTagWithMediaRow[];
      const clubs: TagChipShape[] = [];
      const events: TagChipShape[] = [];
      for (const row of rows) {
        const chip = rowToChip(row);
        if (row.standard_type === 'club') clubs.push(chip);
        else events.push(chip);
      }
      return { clubs, events };
    });
  },

  suggestTags(prefix: string, limit: number = 10): TagSuggestion[] {
    return runSqliteRead('hashtagDiscoveryService.suggestTags', () => {
      const normalized = prefix.toLowerCase().replace(/^#/, '');
      if (normalized.length === 0) {
        const popular = tagStats.listPopularPublicTags.all(limit) as PopularTagRow[];
        return popular.map(r => ({
          normalized: r.tag_normalized,
          display: r.tag_display,
          usageCount: r.usage_count,
        }));
      }
      const rows = suggestTagsForTerm(normalized, limit);
      return rows.map(r => ({
        normalized: r.tag_normalized,
        display: r.tag_display,
        usageCount: r.usage_count ?? 0,
      }));
    });
  },

  getTagSuggestionsForMember(memberId: string): MemberTagSuggestions {
    return runSqliteRead('hashtagDiscoveryService.getTagSuggestionsForMember', () => {
      const clubRows = tagStats.listMemberClubTags.all(memberId) as MemberTagRow[];
      const eventRows = tagStats.listMemberParticipatedEventTags.all(memberId, 10) as MemberTagRow[];
      const popularRows = tagStats.listPopularPublicTags.all(5) as PopularTagRow[];
      return {
        clubTags: clubRows.map(rowToChip),
        participatedEventTags: eventRows.map(rowToChip),
        popularTags: popularRows.map(rowToChip),
      };
    });
  },
};
