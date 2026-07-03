# Phase 1 foundational editorial review, V1.0 release

Editor-in-chief pass over the four most foundational pages: the osis trick page, the
whirling swirl and swirling whirl trick pages, and the Down family page. Planning and
editorial only; no code or data changed. Every claim below was verified against the
live database (`database/footbag.db`), the rendering templates
(`src/views/freestyle/trick-shell.hbs` and partials, `family-detail.hbs`), the content
modules (`freestyleGlossaryFamilyCards.ts`, `freestyleFamilyInvariants.ts`,
`freestyleStructuralFactNotes.ts`, `freestyleTrickIntuition.ts`,
`freestyleCoreAtomEducational.ts`, `freestyleCanonicalSets.ts`,
`freestyleOperatorReference.ts`), and the doctrine
(`freestyle/doctrine/DOWN_FAMILY.md`, `OPERATOR_DERIVATIONS.md`, the stall-ontology
section of the freestyle-dictionary skill).

All drafted "About" prose below is proposed visitor-facing text and follows the
view-layer content standard: plain words, no em dashes, no internal vocabulary without
a gloss. Section (a) is the critique, (b) the drafted prose, (c) concrete connectivity
recommendations with real hrefs (each verified to resolve: routes in
`src/routes/publicRoutes.ts`, glossary anchors in `glossary.hbs` and
`glossary-family-card.hbs`, family pages gated by `isOfficialFamilyParent`).

---

## 1. Osis (`/freestyle/tricks/osis`)

### What the reader sees today (verified against the DB row and partials)

- Row: 3 ADD, family `osis`, category compound, base `osis` (self-anchored).
- Movement notation: `OSIS`. Execution notation:
  `SET > (back or front) SPIN [BOD] > SAME/OP CLIP [XBD] [DEL]`. Source note records
  cross-source ADD agreement (footbag.org, canonical db, FootbagMoves). Notation is
  sound: zero `[DEX]` tokens; the trick is a body spin plus a cross-body delay.
- Description (About): "Spin into a clipper delay. Set it from a clipper stall on the
  other foot, or from a toe delay with the foot straight in front of you; turn so the
  footbag passes behind your back and catch it on a clipper delay."
- Movement intuition prose (`freestyleTrickIntuition.ts`): legacy footbag.org text,
  "It is easiest to set this from a clipper stall on the other foot or from a toe
  delay ... From a right toe set, set straight in front of you ..."
- Technique Notes (DB `execution_summary` / `learning_notes` /
  `prerequisite_notes`): populated and good; the prerequisite note in particular
  already says "spotting the bag through the turn is the genuinely new skill".

### (a) Editorial critique

1. **The defining concept is stated in the first four words and then buried.** "Spin
   into a clipper delay" is exactly right. But two of the description's three clauses,
   and the entire first half of the intuition prose, describe where to SET the bag
   from. The curator's direction is confirmed by the page's own data: the notation's
   entry token is a generic `SET`, and the source-agreed structure is spin plus
   cross-body catch. The entry is pedagogically useful but structurally irrelevant,
   and the current wording teaches a beginner that "osis = a thing you do from a
   clipper set", which is false for most of the 84 documented descendants the family
   tier data records (`FAMILY_DESCENDANT_COUNTS`, the largest family in the roster).
2. **It describes the common beginner execution, not the structural identity.** The
   description is the footbag.org how-to voice ("set it from ... with the foot
   straight in front of you"). Nothing on the page says the load-bearing fact: osis
   is a TERMINAL movement. Torque is a mirage flowing into the osis ending, blender
   is a whirl flowing into it, and the evidence-derived Motion ruling in
   `OPERATOR_DERIVATIONS.md` literally calls the structure "the osis tail". Many
   advanced tricks are set, then one or more added movements, then osis. The page
   never says so.
3. **Why osis matters is absent.** The glossary core-atom card calls osis the
   "golden reference" atom (three ADD sources combining cleanly: spin, cross-body,
   stall) and the family page counts 84 descendants, but the trick page itself gives
   the reader no reason to care. The relationship to torque and blender appears only
   indirectly (family ladder, glossary family card notable compounds).
4. **Assumed knowledge:** "clipper delay" is used without a gloss; a new reader does
   not know it means the inside of the foot crossed behind the standing leg.
5. Consistency flags found while verifying (not About-text issues, logged in section
   5): the glossary family card writes the formula as
   `SET > (BACK or FRONT) SPIN [BOD] > SAME or OP CLIP [XBD] [DEL]`, off the ratified
   conventions (lowercase parenthetical annotations, `SAME/OP` slash form); the
   landing `CORE_TRICK_SPEC` line calls osis a "double-pass rotational dex" although
   the trick contains no dexterity token; the family invariant `spin > ss clipper`
   says same-side while the canonical row allows `SAME/OP`.

### (b) Recommended "About this trick" prose (draft)

> Osis is a spin that ends behind your back. The bag goes up, you turn your body so
> the bag passes behind you, and you catch it on a clipper, the inside surface of the
> foot crossed behind the standing leg. The turn and the cross-body catch happen as
> one motion, and together they are what make an osis an osis.
>
> What defines osis is the ending, not the beginning. You can set the bag from a toe
> delay, from a clipper on the other foot, or arrive at the spin out of another
> movement entirely. It is still an osis whenever the body turns and the bag lands on
> that behind-the-body clipper catch. Beginners usually learn it from a simple toe or
> clipper set, but the set is only the doorway, not part of the trick's identity.
>
> Because the ending is the identity, osis is one of the most important building
> blocks in freestyle. A large share of advanced tricks are built the same way: set
> the bag, add one or more movements while it is in the air, and finish with the osis
> turn and catch. The dictionary tracks more documented descendants for osis than for
> any other family.
>
> Two of those descendants are important enough to lead branches of their own.
> Torque adds a mirage, a circle of the free foot over the bag, flowing straight into
> the osis ending. Blender adds a whirl, a different circling of the foot, into the
> same ending. If you can find the osis catch reliably, torque and blender are the
> two natural next steps.

Placement note: the first two paragraphs are a `description` replacement (via
`red_corrections`, never a direct DB write); paragraphs three and four could live in
the same description or as a curator derivatives note (`freestyleAboutDerivatives.ts`
already has the torque pattern to mirror). The existing Technique Notes columns are
good and should be kept.

### (c) Connectivity recommendations

| Link | Href | Why |
|---|---|---|
| Glossary family card | `/freestyle/glossary#term-osis` | The family definition and notable compounds (torque, blender equivalences) |
| Core atom card | `/freestyle/glossary#atom-osis` | The "golden reference" three-ADD-sources teaching card |
| Spin token | `/freestyle/glossary#op-flag-bod` | Gloss for `SPIN [BOD]` in the execution notation |
| Cross-body catch tokens | `/freestyle/glossary#op-flag-xbd` and `/freestyle/glossary#op-flag-del` | Gloss for the clipper catch |
| Family page | `/freestyle/families/osis` | Overview, branch structure (torque and blender branches), 84 descendants |
| Torque | `/freestyle/tricks/torque` and `/freestyle/families/torque` | Named in the draft prose; official Family Parent branch of osis |
| Blender | `/freestyle/tricks/blender` and `/freestyle/families/blender` | Same |
| Clipper | `/freestyle/tricks/clipper` | The catch surface the draft glosses |
| Family browse | `/freestyle/tricks?family=osis` | All member tricks |
| Notation primer | `/freestyle/notation-article` and `/freestyle/glossary#section-notation` | Already partially present via the token-reference link; keep |

---

## 2. Whirling Swirl (`/freestyle/tricks/whirling_swirl`)

### What the reader sees today

- Row: 4 ADD, family `swirl`, base `swirl`, canonical name `whirling swirl`.
  Modifier link: `whirling` (registered, +1, body).
- Execution notation:
  `CLIP > OP IN [DEX] > OP BACK SWIRL [DEX] > SAME CLIP [XBD] [DEL]` (footbag.org
  canonical-bracket, copy-as-is; bracket count 4 = ADD, verified).
- Description (About): "A whirl delay followed by a swirl. For example, From a right
  clipper delay plant the right leg and bring the left leg over the bag from the
  front up and around ... hop off the right leg and complete an inside around the
  world before using this leg to finish on a clipper delay."
- Technique Notes: `execution_summary` says "a whirling set followed by a swirl";
  `learning_notes` says "chains the whirling set straight into a swirl ... holding
  the first leg suspended is what links the two halves smoothly."
- Base rows for grounding: whirl = `SET > OP IN [DEX] > OP CLIP [XBD] [DEL]` (the
  in-direction circle from the front, over the bag); swirl =
  `CLIP > SAME BACK SWIRL [DEX] > SAME CLIP [XBD] [DEL]` (the circle around the bag
  from behind, up and over; "cross-body inside around the world").

### (a) Editorial critique

1. **The description asserts the exact error the curator flags, twice.** "A whirl
   delay followed by a swirl" and "a whirling set followed by a swirl" both present
   the trick as two tricks in sequence. The notation contradicts this: both `[DEX]`
   events sit inside one unbroken `>` chain with no replant and no major break
   (`>>`), within a single flight of the bag. The learning note's "two halves"
   phrasing repeats the frame even while its actual advice (keep the first leg up,
   never reset) is the integration cue.
2. **"Whirl delay" is a vocabulary error.** A whirl is a dexterity, not a delay; the
   legacy footbag.org text survives verbatim. A new reader who has just learned
   "delay = a stall/catch" is now told a whirl is one.
3. **Nothing tells the reader which circle is the whirl and which is the swirl.**
   This is the single most useful fact for this page and it is absent. The notation
   carries it precisely: `OP IN [DEX]` is the whirl path (over the bag from in
   front, sweeping inward), `OP BACK SWIRL [DEX]` is the swirl path (around the bag
   from behind, up and over).
4. **Nothing explains why this trick and swirling whirl have different names.** The
   terminal-identity rule (the final word names the base; the base's ending decides
   the family) is exactly why this row is family `swirl` while its twin is family
   `whirl`, and it is the key that dissolves the reader's confusion. It appears
   nowhere on either page.
5. **Assumed knowledge:** dexterity, clipper, set, uptime are all used or implied
   without a gloss on this page.

### (b) Recommended "About this trick" prose (draft)

> Whirling swirl is a swirl with a whirl woven into it. Despite the name, it is not
> two tricks done one after the other. There is one set, one flight of the bag, and
> one catch. Both leg circles happen inside that single flight and blend into one
> continuous movement.
>
> The two circles are easy to tell apart once you know what to look for. The whirl
> is the circle that passes over the bag from in front, sweeping in toward your
> body. The swirl is the circle that comes around the bag from behind you, up and
> over the top. Both are dexterities, meaning full circles of a foot around the bag
> while it is in the air, and each one adds a point of difficulty.
>
> The name tells you which circle the trick fundamentally is. In footbag naming,
> the last word names the base, the movement that finishes the trick and gives it
> its family. The word ending in "-ing" names the extra element woven in. A whirling
> swirl is a swirl at heart: the swirl circle is the one that resolves the bag into
> the final catch, a clipper, the inside of the foot crossed behind the standing
> leg. The whirl happens early, while the bag is still rising off the set.
>
> The notation says the same thing. Read left to right, it lists the clipper start,
> then the whirl circle, then the swirl circle, then the cross-body clipper catch.
> That order records which circle meets the bag first, not a pause between two
> tricks. The circle written next to the catch is the one that names the move.
>
> Its mirror twin is the swirling whirl, which uses exactly the same two circles
> but finishes with the whirl instead. Both tricks contain the same ingredients and
> both score 4 ADD, which is why players mix the names up constantly. Remember that
> the last word is the landing.

Also recommended: replace the legacy DB description's "A whirl delay followed by a
swirl" lede (the right/left worked example that follows it can stay, it is genuinely
useful execution prose), and soften `execution_summary`'s "followed by" to the
woven-in framing above. All via the curated CSV overlay path, not direct DB writes.

### (c) Connectivity recommendations

| Link | Href | Why |
|---|---|---|
| Mirror twin | `/freestyle/tricks/swirling_whirl` | The confusion pair must cross-link in About prose, both directions |
| Base trick | `/freestyle/tricks/swirl` | The trick's terminal identity (already linked as base; keep prominent) |
| The other circle | `/freestyle/tricks/whirl` | The reader needs both ingredient pages one click away |
| Family page | `/freestyle/families/swirl` | Official Family Parent page (29 documented descendants) |
| Whirling as a set system | `/freestyle/sets/whirling` | The uptime-whirl launch treatment this trick uses |
| Swirling set sibling | `/freestyle/sets/swirling` | Completes the pair at the set-system layer |
| Whirl and swirl atom cards | `/freestyle/glossary#atom-whirl`, `/freestyle/glossary#atom-swirl` | The symmetry-pair teaching cards |
| Dex token gloss | `/freestyle/glossary#op-flag-dex` | "Dexterity" gloss for the draft prose |
| Direction gloss | `/freestyle/glossary#op-direction-in` | The whirl's IN path |
| Modifier page | `/freestyle/modifier/whirling` | Already linked from the structural-facts block; keep |

---

## 3. Swirling Whirl (`/freestyle/tricks/swirling_whirl`)

### What the reader sees today

- Row: 4 ADD, family `whirl`, base `whirl`, canonical name `swirling-whirl`
  (hyphenated, unlike its twin's `whirling swirl`). Modifier link: `swirling`
  (registered, +1, body).
- Execution notation:
  `SET > SAME BACK SWIRL [DEX] > OP IN [DEX] > OP CLIP [XBD] [DEL]` (bracket count
  4 = ADD, verified). No operational-notation source note (its twin has one).
- Description: "Swirling-modified whirl." This matches the placeholder pattern, so
  the render-time suppressor in `trick-about.hbs` hides it. `short_description`,
  `execution_summary`, `learning_notes`, `prerequisite_notes` are all empty. No
  intuition entry.
- Net effect: **the About section renders with no descriptive prose at all**, just
  the build path row ("swirling + whirl") and the structural-facts block, whose
  swirling note reads "The whirl-and-swirl launch set: a rotational opening carried
  by a swirl dexterity."

### (a) Editorial critique

1. **The page is effectively empty at exactly the place readers arrive confused.**
   One half of the platform's canonical name-confusion pair has rich (if flawed)
   prose; this half has none. A reader who lands here to learn the difference gets a
   build-path line and a vague modifier note. This fails the editorial floor rule
   (at least as informative as the footbag.org description) because the suppressed
   placeholder leaves literally nothing.
2. **The only prose shown is the weakest note in the file.** "The whirl-and-swirl
   launch set: a rotational opening carried by a swirl dexterity" does not say what
   the swirl path is, and "whirl-and-swirl launch set" reads as if the set contains
   both circles, which is wrong for this trick (the whirl here is the base, not part
   of the launch).
3. **The name-order trap is worse here.** "Swirling whirl" reads as "swirl, then
   whirl", and here the notation's event order happens to match that reading
   (`SAME BACK SWIRL [DEX]` before `OP IN [DEX]`), so a naive fix that says "the
   name order is meaningless" would be wrong, and the current silence lets the
   reader conclude the name IS a schedule. The correct teaching is the same as the
   twin's: the last word is the base and the landing; the "-ing" word is the woven-in
   element; the body performs one integrated movement either way.
4. **Naming inconsistency within the pair:** canonical names `whirling swirl` vs
   `swirling-whirl` (space vs hyphen). Whatever the platform's display shaping does,
   the two twins should be typographically identical in form.

### (b) Recommended "About this trick" prose (draft)

> Swirling whirl is a whirl with a swirl woven into it. As with its mirror twin the
> whirling swirl, the name does not mean one trick happens and then another. There
> is one set, one flight of the bag, and one catch. The two leg circles blend into a
> single continuous movement.
>
> The two circles are easy to tell apart. The swirl is the circle that comes around
> the bag from behind you, up and over the top. The whirl is the circle that passes
> over the bag from in front, sweeping in toward your body. Both are dexterities,
> meaning full circles of a foot around the bag while it is in the air, and each
> adds a point of difficulty.
>
> The last word of the name carries the identity. A swirling whirl is a whirl at
> heart: the whirl circle is the one that carries the bag into the final clipper
> catch, the inside of the foot crossed behind the standing leg, so the trick
> belongs to the whirl family. The swirl comes early, straight out of the set while
> the bag rises.
>
> The notation reads the same way: the set, then the swirl circle, then the whirl
> circle, then the cross-body clipper catch. The order records which circle meets
> the bag first, not a pause between two tricks. The circle written next to the
> catch is the one that names the move.
>
> Compare the whirling swirl, which uses the same two circles but finishes with the
> swirl. Same ingredients, same 4 ADD score, opposite landing. The two names differ
> only in which circle finishes the trick.

Placement note: this needs a real `description` (the current placeholder suppresses
to nothing), and ideally matching Technique Notes columns authored in the same pass
as the twin's so the pair stays symmetric. Also author the missing
`operational_notation_source` when the notation's provenance is confirmed, to match
the twin.

### (c) Connectivity recommendations

| Link | Href | Why |
|---|---|---|
| Mirror twin | `/freestyle/tricks/whirling_swirl` | Cross-link in About prose, both directions |
| Base trick | `/freestyle/tricks/whirl` | Terminal identity |
| The other circle | `/freestyle/tricks/swirl` | Ingredient page |
| Family page | `/freestyle/families/whirl` | Official Family Parent page (74 documented descendants) |
| Swirling as a set system | `/freestyle/sets/swirling` | The clipper-anchored back-swirl opening this trick uses |
| Whirling set sibling | `/freestyle/sets/whirling` | Completes the pair at the set-system layer |
| Whirl and swirl atom cards | `/freestyle/glossary#atom-whirl`, `/freestyle/glossary#atom-swirl` | Symmetry-pair teaching cards |
| Dex token gloss | `/freestyle/glossary#op-flag-dex` | "Dexterity" gloss |
| Modifier page | `/freestyle/modifier/swirling` | Already linked from the structural-facts block; keep, but see finding 12 on its note text |

---

## 4. Down family (`/freestyle/families/down`)

### What the reader sees today

- Hero: eyebrow "Family Parent" tier label, title "Down Family", then the subtitle
  **"45 documented descendants"** (the count is the first sentence of the page), then
  `#down`.
- Overview orientation (service-generated umbrella string): "The Down family is one
  core movement performed from different sets and from different feet; its named
  variants group the member tricks below." Canonical formula
  `TOE > OP OUT [DEX] > OP OUT [DEX] > OP CLIP [XBD] [DEL]` labeled with anchor
  "Down, 4 ADD" (no anchor trick exists; the formula is silently the
  double-over-down cell).
- No "How it branches" section (`freestyleTrickFamilyEvolution.ts` has no `down`
  entry).
- Member tricks grouped by the four variants (barfly, double-over-down, paradon,
  down-double-down), with cross-links to the barfly and double-over-down family
  pages (the two variants above the Family Parent threshold).
- At the bottom, collapsed under "Observational notes" with an "observational"
  badge: "One decomposition, four variants", the paragraph that actually carries the
  expert ruling.

### (a) Editorial critique

1. **The page opens with a count, which is both the curator's explicit no and a
   violation of the site's own copy standard** ("no body intro opens with a raw
   count or inventory statistic"). The subtitle slot is template-wide, but on an
   umbrella family whose name is opaque jargon, leading with "45 documented
   descendants" is maximally unhelpful.
2. **"What is a Down?" is never answered.** The orientation sentence presumes the
   reader already knows the core movement ("one core movement performed from
   different sets and from different feet" never says what the movement is). The
   canonical formula answers it only for readers who can already parse bracket
   notation, and even then it silently shows one cell of the four without saying so.
3. **The ruled doctrine is presented as an afterthought with the wrong epistemic
   label.** The one-family ruling is settled, expert-ruled doctrine
   (`DOWN_FAMILY.md`), yet the only prose stating it renders inside a collapsed
   "Observational notes" disclosure wearing an "observational" badge, the platform's
   marker for supplementary non-canonical lenses. A reader who trusts the badge
   system will discount the family's central fact.
4. **The four-cell structure (the doctrine's best teaching asset) is not on the
   page.** The 2x2 grid (set surface x which leg performs the circles) is what makes
   the four variant names memorable and shows why they are variants rather than
   separate families. The variant grouping shows the four names but not the two axes
   that generate them.
5. **How modifiers build on the common structure is absent.** The doctrine and the
   dictionary have rich examples (down diver = diving on double-over-down, fusion =
   atomic on double-over-down, dolomite = symposium on paradon, blurriest and
   nemesis on barfly), and the umbrella page shows none of the logic, only flat
   member lists.

### (b) Recommended family "About / Overview" prose (draft)

> A down is one of freestyle's core movement ideas. The bag is set into the air, the
> player circles a foot around it twice, with both circles running the same way,
> from outside the bag across to the inside, and then brings that foot down with the
> bag into a clipper catch, the inside of the foot crossed behind the standing leg.
> Two matching circles and a cross-body landing: that is a down.
>
> Every down shares that single structure. What changes between the named downs is
> only the starting point: which surface sets the bag, a toe delay or a clipper
> delay, and which leg does the circling, the leg that set the bag or the other one.
> Two set surfaces times two circling legs gives four combinations, and each has its
> own traditional name.
>
> - Double-Over Down: toe set, the setting leg circles.
> - Paradon: toe set, the other leg circles.
> - Barfly: clipper set, the setting leg circles.
> - Down Double-Down: clipper set, the other leg circles.
>
> An expert rules review confirmed what the structure suggests: these are one
> family. It is essentially the same move performed from different sets and from
> different feet, one structural decomposition with four starting points.
>
> The four variants keep their own names because each is a real base in its own
> right. Each scores 4 ADD on its own, each is separately documented in the
> historical record, and each anchors its own line of harder tricks. When bigger
> tricks are built, they are built on a specific variant, not on "down" in the
> abstract.
>
> Harder downs are made by adding movements to one of the four bases while the bag
> is in the air. Diving the upper body over a double-over down makes the down
> diver. An extra launch dexterity in front of a double-over down makes fusion.
> Keeping the support leg off the ground through a paradon makes dolomite, and the
> barfly base carries a whole line of its own, including blurriest and nemesis.
> However deep the stack goes, the trick still ends the down way: two matching
> circles brought down into the clipper catch.

Framing notes for implementation: paragraph 1 replaces the count as the page's
opening (the count can remain as supporting metadata lower down); the ruling
paragraph should move out of the observational disclosure into the main Overview (it
is doctrine, not observation); the four-cell list is the reader-facing rendering of
the doctrine grid; the last paragraph belongs either in the Overview or as the
umbrella's first "How it branches" step (authoring a `down` entry in
`freestyleTrickFamilyEvolution.ts` with a variants step plus an operator-stacking
step would fill the currently missing section). The Overview should also label the
canonical formula honestly, for example "Representative structure (the double-over
down variant)".

### (c) Connectivity recommendations

| Link | Href | Why |
|---|---|---|
| Variant bases | `/freestyle/tricks/double_over_down`, `/freestyle/tricks/paradon`, `/freestyle/tricks/barfly`, `/freestyle/tricks/down_double_down` | The four cells, linked from the grid list in the draft |
| Variant family pages | `/freestyle/families/barfly`, `/freestyle/families/double_over_down` | The two variants above the Family Parent threshold (already linked in variant groups; also link from the grid list) |
| Minor variant browses | `/freestyle/tricks?family=paradon`, `/freestyle/tricks?family=down_double_down` | The two below-threshold variants |
| Glossary family card | `/freestyle/glossary#term-down` | Already the page's glossary cross-link; keep |
| Out-direction gloss | `/freestyle/glossary#op-direction-out` | The "outside across to the inside" circle direction |
| Dex and catch token glosses | `/freestyle/glossary#op-flag-dex`, `/freestyle/glossary#op-flag-xbd` | For the representative formula |
| Clipper | `/freestyle/tricks/clipper` | The landing surface the draft glosses |
| Modifier examples | `/freestyle/modifier/diving`, `/freestyle/modifier/atomic`, `/freestyle/modifier/symposium`, `/freestyle/modifier/stepping` | The operators named in the stacking paragraph |
| Compound exemplars | `/freestyle/tricks/down_diver`, `/freestyle/tricks/fusion`, `/freestyle/tricks/dolomite`, `/freestyle/tricks/blurriest`, `/freestyle/tricks/nemesis` | All verified active rows |
| Family browse | `/freestyle/tricks?view=family#family-down` | Already present; keep |

---

## 5. Cross-cutting consistency findings (logged for follow-up, no changes made)

Found while verifying the four pages; each is a candidate fix for a later punch list,
none was applied.

1. **Pair naming inconsistency:** `canonical_name` is `whirling swirl` (space) but
   `swirling-whirl` (hyphen). The confusion pair should be typographically identical.
2. **`whirling_swirl` description lede** "A whirl delay followed by a swirl" carries
   both a vocabulary error (a whirl is not a delay) and the forbidden sequencing
   frame; `execution_summary` repeats "followed by".
3. **`swirling_whirl` renders with no About prose at all** (placeholder description
   suppressed, all UX prose columns empty) and lacks an
   `operational_notation_source` while its twin has one.
4. **Stale rotational-weight text:** `freestyleCoreAtomEducational.ts` whirl entry,
   "Rotational base; modifier weights count rotationally on whirl", contradicts the
   settled flat-weight doctrine (the retired "+2 rotational" model). Should be
   reworded.
5. **Sequence-framing text:** same file, swirl entry, "whirling-swirl is a 4-ADD
   whirl(arrow)swirl composition" implies execution order with an arrow; contradicts
   the integrated-movement teaching above.
6. **Osis mislabeled as a dex:** `CORE_TRICK_SPEC` (freestyleLandingContent.ts) osis
   line reads "core atom: double-pass rotational dex"; the canonical row has zero
   `[DEX]` tokens (spin + cross-body stall). "Rotational body atom" or similar would
   be accurate.
7. **Swirl parity drift across surfaces:** DB row
   `CLIP > SAME BACK SWIRL [DEX] > SAME CLIP [XBD] [DEL]`; glossary family card says
   `CLIP > OP BACK SWIRL [DEX] > OP CLIP [XBD] [DEL]`; `CORE_TRICK_SPEC` says
   `SET > OP BACK SWIRL [DEX] > OP CLIP [XBD] [DEL]`. Three surfaces, three
   readings of entry and side. The canonical row should win; the secondary surfaces
   need reconciling.
8. **Osis formula convention drift:** glossary family card
   `SET > (BACK or FRONT) SPIN [BOD] > SAME or OP CLIP [XBD] [DEL]` uses uppercase
   parenthetical annotation and "SAME or OP" instead of the ratified lowercase
   `(back or front)` and `SAME/OP` forms (the DB row itself is conformant).
9. **Family invariant over-claims:** `freestyleFamilyInvariants.ts` osis entry
   `spin > ss clipper` states a same-side catch; the canonical row allows `SAME/OP`
   (and torque, an osis-family member, ends on the opposite clipper).
10. **Down family page hero leads with a raw count** ("45 documented descendants" as
    the subtitle), against the view-layer copy standard; template-wide slot, worst on
    the umbrella family.
11. **Ruled doctrine wearing an observational badge:** the down one-family ruling
    renders only inside the collapsed "Observational notes" disclosure with the
    observational badge; it is canonical doctrine and belongs in the Overview.
12. **`swirling` modifier beginner note** ("The whirl-and-swirl launch set: a
    rotational opening carried by a swirl dexterity") is vague and reads as if the
    launch contains both circles; it is also flagged NEEDS-CURATOR in the source
    file. The whirling note's trailing "(whirling osis is the blender)" example is
    good content in an odd place.
13. **No `down` entry in `freestyleTrickFamilyEvolution.ts`**, so the umbrella family
    page has no "How it branches" section; the doctrine supplies the material for
    one (variant grid step plus operator-stacking step).
