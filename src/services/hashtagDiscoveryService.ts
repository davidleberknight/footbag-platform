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
 *   - The hashtag index blocks the /media/browse landing renders: Popular Tags
 *     (the three-tier composition, at the landing's wider limit) and All Tags
 *     (community tags only, alphabetical), plus a highlight of recent event
 *     hashtags and the tutorial hashtag. Popular and All Tags are deliberately
 *     different populations: curated single-uploader tags are public and belong
 *     in Popular, but not in an alphabetical index of the community's own
 *     vocabulary. This is a content fragment, not a page envelope; mediaService
 *     owns the browse page view-model that carries it.
 *   - The /media/browse href for a single tag, shared with mediaService so one
 *     builder fixes every hashtag destination on the site.
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
  type TagWithUsageRow,
  type MemberTagRow,
} from '../db/db';
import { runSqliteRead } from './sqliteRetry';
import { TEACHING_TAG_SEEDS, composeSuggestedTags } from '../content/teachingTagSeeds';

/**
 * How many chips the landing's Popular Tags block carries. The list is composed,
 * not ranked alone: real community tags lead, the pinned curated starters fill
 * the remaining slots so the block is useful before anyone has uploaded, and the
 * starters are squeezed out as community usage accrues.
 */
const BROWSE_POPULAR_LIMIT = 30;
/** How many event hashtags the recency highlight carries. */
const BROWSE_HIGHLIGHT_EVENT_LIMIT = 12;

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

/**
 * The hashtag index blocks, rendered inside the /media/browse landing. Not a
 * page envelope: mediaService nests this in the browse page view-model.
 */
export interface HashtagIndexContent {
  /** Popular tags: real community usage first, curated starters filling the rest. */
  popularTags: TagChipShape[];
  hasPopularTags: boolean;
  /** Community tags only, alphabetically. A single member's tags stay personal. */
  communityTags: TagChipShape[];
  hasCommunityTags: boolean;
  /** Shown in place of the list while no tag has been shared by two members. */
  communityEmptyNote: string;
  /** Recent event hashtags, newest first, plus the tutorial tag when it has media. */
  highlightTags: TagChipShape[];
  hasHighlights: boolean;
}

/**
 * The /media/browse URL for one tag, given its `tag_normalized` form (with the
 * leading '#'). The URL token is that form minus the '#', matching the input
 * format the browse handler expects. Shared with mediaService so a hashtag has
 * exactly one destination wherever it is rendered.
 */
export function tagToBrowseHref(tagNormalized: string): string {
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

  // The hashtag index blocks for the /media/browse landing. Popular Tags and
  // All Tags are two different populations on purpose: Popular is the public
  // set, which includes curated single-uploader tags so the curated catalog
  // surfaces and so the block is useful before anyone has uploaded, while All
  // Tags is community only, so an alphabetical index is people's shared
  // vocabulary rather than a dump of the catalog.
  getHashtagIndexContent(): HashtagIndexContent {
    return runSqliteRead('hashtagDiscoveryService.getHashtagIndexContent', () => {
      const popularTags = hashtagDiscoveryService.getPopularTagsWithSeeds(BROWSE_POPULAR_LIMIT);
      const communityTags = (tagStats.listCommunityTagsAlphabetical.all() as PopularTagRow[])
        .map(rowToChip);

      // Recent events lead the highlight; the tutorial tag rides beside them so
      // the two halves of the criterion sit in one place.
      const eventRows = tagStats.listRecentEventTagsWithMedia
        .all(BROWSE_HIGHLIGHT_EVENT_LIMIT) as TagWithUsageRow[];
      const tutorialRow = tagStats.findTutorialTagWithMedia.get() as TagWithUsageRow | undefined;
      const highlightTags = eventRows.map(rowToChip);
      if (tutorialRow) highlightTags.push(rowToChip(tutorialRow));

      return {
        popularTags,
        hasPopularTags: popularTags.length > 0,
        communityTags,
        hasCommunityTags: communityTags.length > 0,
        communityEmptyNote:
          'A tag joins this list once two different members have used it. Until then, tags stay on the galleries of the members who wrote them.',
        highlightTags,
        hasHighlights: highlightTags.length > 0,
      };
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
