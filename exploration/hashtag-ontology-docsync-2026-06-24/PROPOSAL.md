# Doc-sync proposal for implemented hashtag ontology

**Status: No edits applied. Requesting maintainer review.**

DESIGN_DECISIONS.md and USER_STORIES.md are maintainer-owned canonical docs. The
four edits below are proposed, not applied. They bring the canonical hashtag
design into line with the role-based ontology now implemented in code.

## Why these edits

The canonical docs describe a superseded design: "exactly one identical token per
concept, no exceptions," plus the suffix set form `#toe_set`. The curator has
since decided, and the code now implements, a role-based ontology:

- trick role -> bare `#{slug}`
- set role -> `#set_{slug}`
- operator / modifier role -> `#operator_{slug}`
- family role -> `#family_{slug}`

Role, not row type, decides the form. The bare-token namespace is reserved for
trick-role media. Pixie and fairy are dual-role (both a trick and a set) and
carry both forms. Modifier and operator rows are not tricks: the trick-detail
route redirects them to their operator page, and trick search excludes them.

This is design evolution, not a stale fact: the doc lags a curator-decided,
now-implemented design. Applying the canonical edits is the maintainer's call.

---

## Edit 1 — `docs/DESIGN_DECISIONS.md` §2.6, Decision

Replaces the universal single-token claim and the suffix example `#toe_set` with
the role-based ontology, the reserved bare namespace, the dual-role exception,
and the modifier/operator redirect.

**BEFORE:**

> Hashtag-driven coupling extends to freestyle tricks and persons in addition to events and clubs. Trick slugs (e.g. `#ripwalk`) are stored as freeform tags (`tags.is_standard=0`); uniqueness is inherited from `freestyle_tricks.slug PRIMARY KEY` and the no-rename commitment makes the slug a stable canonical identity for life. A trick's slug, its hashtag body (the text after `#`), and its detail-page URL segment are one identical lowercase token of letters, digits, and underscores, with the underscore as the only word separator (the trick *double leg over* is slug `double_leg_over`, hashtag `#double_leg_over`, page `/freestyle/tricks/double_leg_over`). The same rule applies to canonical-set tags (`#toe_set`) and every slug-derived hashtag. There is exactly one such token per trick with no exceptions, so the tag a member types, the tag stored on curated media, and the gallery link are the same string. Person hashtags reuse the member slug. Records have no separate hashtag namespace; record-attributed media is reachable through its parent trick's gallery. No foreign key exists from `media_items` to domain tables; domain coupling is purely tag-based. `tags.standard_type` remains scoped to events and clubs.

**AFTER:**

> Hashtag-driven coupling extends to freestyle tricks, sets, operators, families, and persons in addition to events and clubs. Trick slugs (e.g. `#ripwalk`) are stored as freeform tags (`tags.is_standard=0`); uniqueness is inherited from `freestyle_tricks.slug PRIMARY KEY` and the no-rename commitment makes the slug a stable canonical identity for life.
>
> A freestyle concept's hashtag form is decided by the *role* it plays, not by its row type. A trick takes the bare token: its slug, its hashtag body (the text after `#`), and its detail-page URL segment are one identical lowercase underscore token (the trick *double leg over* is slug `double_leg_over`, hashtag `#double_leg_over`, page `/freestyle/tricks/double_leg_over`). A non-trick concept takes a role prefix over that same body: a set is `#set_{slug}`, an operator or modifier is `#operator_{slug}`, and a trick family is `#family_{slug}`. The bare-token namespace is reserved for trick-role media — a concept that is only a set or only an operator never takes a bare hashtag. A concept that is genuinely both a performed trick and a set, namely pixie and fairy, carries both forms: the bare `#pixie` for the trick and `#set_pixie` for the set. Membership in that dual-role set is a curator decision, never derived from a row's stored type. Because modifiers and operators are not tricks, their detail page is the operator page, and the trick-detail route redirects a modifier or operator concept there rather than rendering it as a trick.
>
> Person hashtags reuse the member slug. Records have no separate hashtag namespace; record-attributed media is reachable through its parent trick's gallery. No foreign key exists from `media_items` to domain tables; domain coupling is purely tag-based. `tags.standard_type` remains scoped to events and clubs.

---

## Edit 2 — `docs/DESIGN_DECISIONS.md` §2.6, Rationale (new bullet)

Adds the explicit prefix-not-suffix rationale, after the existing
underscore-not-hyphen bullet.

**ADD:**

> - A non-trick concept's role marker is a *prefix* (`#set_pixie`), never a suffix (`#pixie_set`). Under the underscore convention a suffix is shape-indistinguishable from a compound-trick token — `#pixie_set` reads the same as a hypothetical trick `#pixie_mirage` — so only a prefix, a fixed closed-vocabulary marker resolved before any slug match, keeps role tags from colliding with trick tags. This reuses the standardized-prefix pattern already used for `#event_*` and `#club_*`.

---

## Edit 3 — `docs/DESIGN_DECISIONS.md` §2.6, Impact (new bullet)

Lists the freestyle role prefixes alongside the existing `event_` / `club_`
impact bullets.

**ADD:**

> - Freestyle non-trick concepts use role prefixes: sets `#set_{slug}`, operators and modifiers `#operator_{slug}`, families `#family_{slug}`; tricks use the bare `#{slug}`.

---

## Edit 4 — `docs/USER_STORIES.md` freestyle section (new bullet)

Adds the non-trick hashtag behavior and the redirect/search consequences, after
the existing trick-hashtag-vs-Trick-Detail bullet. The existing bullet stays
correct for tricks and is unchanged.

**ADD:**

> - Freestyle concepts that are not tricks carry their hashtag by role, not by the bare slug: a set is `#set_{slug}` (e.g. `#set_pixie`), an operator or modifier is `#operator_{slug}` (e.g. `#operator_spinning`), and a trick family is `#family_{slug}`. The bare `#{slug}` is reserved for a trick's media, so a set or operator never shows a bare trick hashtag. Pixie and fairy are both a trick and a set, so each shows the bare trick hashtag on its trick surface and the `#set_` hashtag on set surfaces. Because a modifier or operator is not a trick, `/freestyle/tricks/{slug}` redirects it to its operator page, and trick search lists tricks and sets, not operators.

---

## Accuracy notes (not doc edits)

1. The Set Encyclopedia / detail pages still render the old suffix form
   `#<slug>-set` (`freestyleCanonicalSets.ts`), now inconsistent with the
   operators index, which renders `#set_<slug>`. This is tracked by the
   underscore-rebuild plan item (`#<slug>-set` -> `#set_<slug>`); the proposal
   describes the target prefix form, and the encyclopedia conversion remains
   pending work, not a reason to document the suffix.
2. The bare-token invariant guard is not built yet. "The bare namespace is
   reserved for trick-role media" is true on the rendering surfaces today but is
   not yet enforced in the media-tag invariant. The docs state design intent,
   which is correct for a canonical doc; the guard is a tracked follow-up,
   sequenced after concept-media re-homing.

## Maintainer decision requested

Apply Edits 1-4 to DESIGN_DECISIONS.md and USER_STORIES.md as written, or return
adjustments. No other canonical doc needs changing: USER_STORIES §1.1's
standardized-prefix philosophy (alphanumeric + underscore, prefix patterns like
`#event_*`) already accommodates the role prefixes.
