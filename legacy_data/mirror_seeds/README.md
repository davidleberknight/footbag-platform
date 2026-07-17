# Archive crawl seed lists

Plain seed-URL lists for the footbag.org archive crawl, one file per content
class, generated from the frozen per-app MySQL dumps by
`legacy_data/scripts/build_archive_seed_lists.py`.

The archive crawler finds pages by following links out from a few index pages.
Some content is linked from no index page, so link-following never reaches it.
These files give the crawler those URLs directly. Each file is a sorted,
de-duplicated list of absolute URLs, one per line, no comments, so it can be fed
straight to the crawler.

## Regenerate

```
legacy_data/.venv/bin/python legacy_data/scripts/build_archive_seed_lists.py
```

Reads the dumps through the `footbag_legacy_repo` symlink at the repo root; it
never contacts the live site. `--dry-run` prints per-class counts without
writing.

## Content classes

### clubs.txt (602 URLs)

Every `/clubs/show/<ClubID>` page. The crawler misses clubs because the clubs
directory pages (`clubs/index.php`, `clubs/list.php`) list only clubs matching
`Approved > 0 AND isvalid()`. `isvalid()` further drops any club whose owner let
the periodic re-validation lapse: a club that was queried, never re-validated,
and whose query is older than the grace-period deadline is filtered out. So a
club is linked, and therefore crawlable, only while it is both approved and
freshly validated; unapproved clubs and clubs with a lapsed validation are
linked from nowhere.

Because that filter turns on a moving "validated recently enough" clock, the
set of hidden clubs cannot be reproduced by re-running the same query later. The
seed sidesteps it: the dump holds 602 clubs, every one a real, non-deleted club
(deleted clubs are gone from the table, and no row carries a test or placeholder
name), so the seed is the whole table. The crawler's dedup drops the clubs it
already reached by link-following and fetches only the approval-hidden and
validation-lapsed remainder. The real / dormant / junk decision stays with the
downstream club-candidate classifier, which runs after the crawl; the seed's
only job is to guarantee no legitimate club is skipped.

### gallery.txt (927 URLs)

Every `/gallery/showset/<RealSetID>` page for a set with `SetVisible = 0`. A
hidden set is linked from no gallery index, so the crawl never reaches it, but
its set page is directly servable and its thumbnails link to the member images.
Seeding the set page lets the crawler capture the set and follow it to every
image in it; images belong to their set reliably through `RealSetID`, so none is
stranded. This is the set-level counterpart of the clubs seed: the crawler's
dedup reconciles it against whatever a prior crawl already held, so the fetch
lands on the hidden sets still missing. Images in visible sets are already in the
link graph and are retried by the crawl itself, so they are not seeded.

The seed is every hidden set (927), not a smaller "known-missing" subset. A
count of exactly which hidden sets and images a past crawl failed to capture is a
diff against that crawl's capture log, not a fact in the dump, so the seed takes
the whole hidden-set population and lets dedup do the reconciliation.

### news.txt (17,682 URLs)

Every `/news/show/<NewsID>` permalink. The crawl already captured the article
text through the year-list pages, but not the per-item permalinks, which those
pages do not link in a form the crawl followed. The permalink is a stable deep
link worth preserving, so every news item gets one. This is by far the largest
class: it adds roughly ten times the URLs of all the others combined, so budget
the final crawl accordingly (or trim the list if only a subset of permalinks
needs preserving; the article text is not at stake either way).

### polls.txt (11 URLs)

Every `/newpoll/show/<PollID>`. The live poll path is `newpoll`, not `poll`. The
show page looks a poll up by id with no visibility filter, so every poll is
directly servable, but the poll index links only a few, so the crawl missed most
of them.

### rules.txt (16 URLs)

Every `/rules/chapter/<SectionBase>`. A chapter page returns all rule rows sharing
a section base, and the seed carries every distinct section base so no chapter is
missed. The count is the distinct section bases in the rulebook, which is broader
than the handful of top-level chapters a reader sees; the extra bases are cheap
and harmless, and the crawler's dedup settles it.

### ranking.txt (14 URLs)

One `/ranking/showranks?set=<id>&method=<id>` report per ranking set and method.
Ranking is an unofficial draft feature linked from no public index, which is why
the crawl never reached it; capture here is archival only, and the platform-side
rankings migration remains a deferred decision. The report reads its set and
method as request parameters, so the URL carries them as a query string.
Per-event ranking detail pages are keyed by registration-event ids from another
app and are left to that deferred migration.

## Investigations without a seed file

### Hall-of-Fame and historical-player photos (no dump-seedable class)

These photos were served from the old wiki's image store, and that store has no
dump: none of the per-app dumps is a wiki dump, so neither the photo binaries
nor the wiki pages that embedded them are represented in the dump set. There is
therefore no dump-derived list of photo URLs to seed.

The one photo-URL column that does live in a dump, `members.MemberPhotoURL`,
does not stand in for it: it holds only a handful of mostly-dead links to
outside hosts (photobucket, myspace, flickr, km.ru) plus a few `php.footbag.org/userdata/<id>.jpg`
references, not a manifest of the missing photos.

The miss is not a crawler defect. The crawler does fetch images (it re-encodes
every image it mirrors) and does follow every `*.footbag.org` host, so the
photos were skipped only because the wiki pages that embedded them were never
reached from the crawl's link graph. This cause is specific to the wiki: it did
not hide any other content class, because the other classes all live in dumped
apps and are hidden by in-app index filtering (approval, visibility, permalink
depth), which the seed files here address. Recovering the photos is a separate
rebuild from the archived image store, not a crawl seed.
