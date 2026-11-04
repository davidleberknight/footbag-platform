/**
 * HashtagDiscoveryService -- tag stats, tag suggest, and tag discovery.
 *
 * Owns:
 *   - Tag stats rebuild (tag_stats upsert from media_tags + media_items)
 *   - Popular public tags: the most-used tags that are public, meaning used by
 *     2+ distinct members OR carried by curator/system-uploaded content. A single
 *     non-system member's personal tags stay out so they never leak into discovery.
 *   - Suggestion tags composed in two tiers (real community-popular tags, then
 *     curator-published backfill) and the hashtag summary. Both tiers come from
 *     recorded usage, so every suggested tag carries media; when neither tier
 *     has anything the list is empty and the caller shows nothing rather than a
 *     tag that leads to an empty gallery
 *   - Standard tags with media (club/event tags that have tagged content)
 *   - The hashtag index blocks the /media/browse landing renders: Popular Tags
 *     (the two-tier composition, at the landing's wider limit) and All Tags
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
import { playerTagForMemberSlug, slugifyForTag } from './slugify';

/**
 * The cap on the landing's Popular Tags block. The list is composed, not ranked
 * alone: real community tags lead and curator-published tags fill the remaining
 * slots. Nothing pads it, so the block is as short as recorded usage makes it.
 */
const BROWSE_POPULAR_LIMIT = 30;
/** The longest prefix the tag-suggest lookup will search on. */
const SUGGEST_PREFIX_MAX_LENGTH = 100;
// The shortest typed term the event-and-club word search runs for.
const WORD_MATCH_MIN_LENGTH = 3;
/** How many event hashtags the recency highlight carries. */
const BROWSE_HIGHLIGHT_EVENT_LIMIT = 12;
/** How many popular tags a member's upload and edit forms suggest. */
const MEMBER_POPULAR_LIMIT = 5;
// Recent events offered beside a hashtag field: up to six public events that
// started within the last year or start within the next.
const RECENT_EVENT_LIMIT = 6;
const RECENT_EVENT_WINDOW_DAYS = 365;
const DAY_MS = 24 * 60 * 60 * 1000;
/** The curator marker: applied automatically, never by a member. */
const CURATED_TAG = '#curated';

/**
 * Whether a member can apply a tag themselves. `#curated` marks the curator's media
 * and `#by_` tags mark an uploader; both are applied automatically and refused in a
 * member's tag input, so a field where a member applies tags never offers them.
 * They stay offered where a person searches, where they are legitimate filters.
 */
function recentEventTagRows(now: Date): MemberTagRow[] {
  const from = new Date(now.getTime() - RECENT_EVENT_WINDOW_DAYS * DAY_MS).toISOString().slice(0, 10);
  const to = new Date(now.getTime() + RECENT_EVENT_WINDOW_DAYS * DAY_MS).toISOString().slice(0, 10);
  return tagStats.listRecentPublicEventTags.all(from, to, RECENT_EVENT_LIMIT) as MemberTagRow[];
}

function memberCanApply(tagNormalized: string): boolean {
  return tagNormalized !== CURATED_TAG && !tagNormalized.startsWith('#by_');
}

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
  /** Set when the tag is a public event's or club's standard hashtag found by a
   *  word of its real name: the kind and that name, so the list can say which
   *  event or club it is. */
  kind?: 'event' | 'club';
  name?: string;
}

interface StandardWordMatchRow {
  kind: 'event' | 'club';
  real_name: string;
  tag_normalized: string;
  tag_display: string;
  usage_count: number | null;
}

// One typed word against public event names and years and open club names and
// cities. Events and clubs are public, so the public suggest endpoint may carry
// them; members are never matched here.
function matchStandardTagsByWord(word: string, limit: number): StandardWordMatchRow[] {
  const escape = (s: string) => s.replace(/[%_\\]/g, (c) => `\\${c}`);
  const pattern = `%${escape(word)}%`;
  const tagPattern = `%${word.split(' ').filter((w) => w.length > 0).map(escape).join('\\_')}%`;
  return tagStats.matchStandardTagsByWord.all(
    pattern, word, tagPattern, pattern, pattern, tagPattern, limit) as StandardWordMatchRow[];
}

function wordMatchToSuggestion(r: StandardWordMatchRow): TagSuggestion {
  return {
    normalized: r.tag_normalized,
    display: r.tag_display,
    usageCount: r.usage_count ?? 0,
    kind: r.kind,
    name: r.real_name,
  };
}

export interface MemberTagSuggestions {
  /** The member's own player hashtag, so crediting themselves is one click. */
  playerTags: TagChipShape[];
  clubTags: TagChipShape[];
  participatedEventTags: TagChipShape[];
  /** Recent and upcoming public events, other than the member's own, media or not. */
  recentEventTags: TagChipShape[];
  popularTags: TagChipShape[];
}

/**
 * The hashtag index blocks, rendered inside the /media/browse landing. Not a
 * page envelope: mediaService nests this in the browse page view-model.
 */
export interface HashtagIndexContent {
  /** Popular tags: real community usage first, curator-published tags filling the rest. */
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

/** Community chips first, curator-published chips filling the rest, capped at
 *  `limit` and de-duplicated case-insensitively across both tiers. */
function mergeTagTiers(
  community: TagChipShape[],
  curator: TagChipShape[],
  limit: number,
): TagChipShape[] {
  const out: TagChipShape[] = [];
  const seen = new Set<string>();
  for (const chip of [...community, ...curator]) {
    if (out.length >= limit) break;
    const key = chip.normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(chip);
  }
  return out;
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

  // Suggestion surface: real community-popular tags first, then curator-published
  // tags backfilling the rest. Both tiers read recorded usage, so every tag
  // offered here has media behind it; nothing pads the list, and while neither
  // tier has anything the caller gets an empty list and shows no chips at all.
  getPopularTagsCommunityFirst(limit: number = 8): TagChipShape[] {
    return runSqliteRead('hashtagDiscoveryService.getPopularTagsCommunityFirst', () => {
      const community = (tagStats.listMemberCommunityPopularTags.all(limit) as PopularTagRow[]).map(rowToChip);
      const curator = (tagStats.listCuratorPublishedPopularTags.all(limit) as PopularTagRow[]).map(rowToChip);
      return mergeTagTiers(community, curator, limit);
    });
  },

  // Aggregated hashtag statistics for the teaching empty state. The count is
  // capped at the read limit; a teaching surface does not need an exact total.
  // At cold start every value is empty/false, so the caller hides the stats
  // block.
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
      const popularTags = hashtagDiscoveryService.getPopularTagsCommunityFirst(BROWSE_POPULAR_LIMIT);
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

  // `entry`: the field is one where a member applies tags, so the tags only the
  // platform applies are left out; a search field keeps them.
  suggestTags(prefix: string, limit: number = 10, opts: { entry?: boolean } = {}): TagSuggestion[] {
    const trimmed = prefix.trim();
    // An over-long prefix is answered empty rather than searched, so the public
    // endpoint cannot be handed arbitrarily long strings to match on.
    if (trimmed.length > SUGGEST_PREFIX_MAX_LENGTH) return [];
    const offered = (tag: string) => !opts.entry || memberCanApply(tag);
    // One extra row is read for an entry field, so leaving one out still fills the list.
    const readLimit = opts.entry ? limit + 1 : limit;
    return runSqliteRead('hashtagDiscoveryService.suggestTags', () => {
      // Folded by the one rule, so "#Zür" finds what was stored as "#zurich".
      const normalized = slugifyForTag(trimmed.replace(/^#+/, ''));
      if (normalized.length === 0) {
        const popular = tagStats.listPopularPublicTags.all(readLimit) as PopularTagRow[];
        return popular.filter(r => offered(r.tag_normalized)).slice(0, limit).map(r => ({
          normalized: r.tag_normalized,
          display: r.tag_display,
          usageCount: r.usage_count,
        }));
      }
      // A word of an event's or club's real name leads, labelled with that
      // name; the tags that start with what was typed follow, each once. A
      // folded term's underscores stand for the spaces of the name.
      // Word matches take at most half the list, so the hashtag the member is
      // spelling out still shows beside the events and clubs a word names.
      // The word search reads every event and club name, so it waits for a
      // word of three letters, by which point it narrows to a few rows.
      const byWord = normalized.length >= WORD_MATCH_MIN_LENGTH
        ? matchStandardTagsByWord(normalized.replace(/_/g, ' '), Math.ceil(limit / 2)).map(wordMatchToSuggestion)
        : [];
      const seen = new Set(byWord.map((s) => s.normalized));
      const byPrefix = suggestTagsForTerm(normalized, readLimit)
        .filter((r) => !seen.has(r.tag_normalized))
        .map((r) => ({ normalized: r.tag_normalized, display: r.tag_display, usageCount: r.usage_count ?? 0 }));
      return [...byWord, ...byPrefix].filter((s) => offered(s.normalized)).slice(0, limit);
    });
  },

  /**
   * The event or club standard hashtag a typed freeform hashtag most likely
   * meant: one whose real name, year or city holds every word of it
   * (`#2026_worlds` finds the 2026 Worlds' `#event_2026_worlds`). Null for a
   * hashtag that already is a standard one, or that matches none. It only
   * offers; nothing is ever swapped without the member's click.
   */
  didYouMean(typed: string): TagSuggestion | null {
    const body = slugifyForTag(typed.trim().replace(/^#+/, ''));
    if (body.length === 0 || body.length > SUGGEST_PREFIX_MAX_LENGTH) return null;
    if (/^(event|club)_/.test(body)) return null;
    const words = body.split('_').filter((w) => w.length > 0);
    // A year narrows the read best, else the longest word; every word must
    // then hold in the name or the hashtag itself.
    const anchor = words.find((w) => /^\d{4}$/.test(w)) ?? [...words].sort((a, b) => b.length - a.length)[0];
    return runSqliteRead('hashtagDiscoveryService.didYouMean', () => {
      // Enough rows that a year shared by a whole season of events still
      // reaches the one the other words name.
      const rows = matchStandardTagsByWord(anchor, 500);
      const hit = rows.find((r) => {
        // Whole words only: "#art" must not find "Stuttgart". And one generic
        // word that merely appears in a name ("#footbag" in "Wellington
        // Footbag Club") names nothing; a single word offers only the event or
        // club whose own hashtag is that word ("#wellington", #club_wellington).
        const ownBody = r.tag_normalized.replace(/^#(event|club)_/, '');
        const haystack = new Set([...slugifyForTag(r.real_name).split('_'), ...ownBody.split('_')]);
        if (!words.every((w) => haystack.has(w))) return false;
        return words.length > 1 || ownBody === words[0];
      });
      return hit && hit.tag_normalized !== `#${body}` ? wordMatchToSuggestion(hit) : null;
    });
  },

  getTagSuggestionsForMember(
    memberId: string, memberSlug: string, now: Date = new Date(),
  ): MemberTagSuggestions {
    return runSqliteRead('hashtagDiscoveryService.getTagSuggestionsForMember', () => {
      const clubRows = tagStats.listMemberClubTags.all(memberId) as MemberTagRow[];
      const eventRows = tagStats.listMemberParticipatedEventTags.all(memberId, 10) as MemberTagRow[];
      const ownEvents = new Set(eventRows.map((r) => r.tag_normalized));
      const recentRows = recentEventTagRows(now).filter((r) => !ownEvents.has(r.tag_normalized));
      // The same two tiers the browse page offers: community usage first, then
      // curator-published hashtags. One extra is read so dropping `#curated`
      // still leaves a full list.
      const popular = hashtagDiscoveryService.getPopularTagsCommunityFirst(MEMBER_POPULAR_LIMIT + 1)
        .filter((c) => memberCanApply(c.normalized))
        .slice(0, MEMBER_POPULAR_LIMIT);
      const ownPlayerTag = playerTagForMemberSlug(memberSlug);
      return {
        playerTags: [rowToChip({ tag_normalized: ownPlayerTag, tag_display: ownPlayerTag })],
        clubTags: clubRows.map(rowToChip),
        participatedEventTags: eventRows.map(rowToChip),
        recentEventTags: recentRows.map(rowToChip),
        popularTags: popular,
      };
    });
  },

  // Public events that started within the last year or start within the next,
  // newest first, whether or not media carries their hashtags yet: an event's
  // hashtag is offered before anyone has used it, so the first member to share
  // from an event finds it rather than inventing a near-miss.
  listRecentEventTags(now: Date = new Date()): TagChipShape[] {
    return runSqliteRead('hashtagDiscoveryService.listRecentEventTags', () =>
      recentEventTagRows(now).map(rowToChip));
  },
};
