# Compatibility anomalies and Atlas findings (research-only; nothing repaired)

Each finding is classified per the Atlas taxonomy: data issue / doctrine question /
notation limitation / historical naming issue / insufficient evidence. No production
data, notation, aliases, or doctrine were changed.

## F1. Bedwetter's TOE-only entry vs four independent historical CLIP entries — doctrine question

`bedwetter` is notated `TOE > OP IN [DEX] > OP OUT [DEX] > OP OUT [DEX] > SAME TOE [DEL]`
(TOE entry). Four distinct historical Sick 3 performances enter it from CLIP-terminal
tricks: after `barraging_butterfly` (2008), after `blurriest` (2004), after `phoenix`
(2019), and after `atomic_drifter` (2008 and 2009, two records). Either (a) bedwetter has
a clipper-entry variant the dictionary does not carry, (b) the notated TOE entry is an
over-narrow canonical choice among historically flexible sets, or (c) Sick 3 rules
permitted a bridging set/pass between tricks, in which case link compatibility is a softer
constraint than direct-delay chaining. (c) is itself a historical-rules question this
corpus cannot settle. Strongest single challenge to the current notation in the corpus.

## F2. Sumo -> Pixie Paradon entry mismatch — doctrine question (same class as F1)

`sumo` terminates `OP TOE [DEL]`; `pixie_paradon` is notated with a CLIP entry. One 2006
performance chains them. Same trichotomy as F1.

## F3. "Whirlwind" names two different tricks across authorities — historical naming issue

The dictionary maps alias `whirlwind -> sole_survivor`, the folk-named canonical for
spinning symposium whirl (5 ADD; the alias arrived via the curator-ruled merge of the
spinning-symposium-whirl row into the folk name). But footbag.org itself (showmove 254)
and the FootbagMoves corpus both assert Whirlwind = Spinning Paradox Symposium Whirl at
6 ADD, a different, harder trick (adds the paradox). Two historical records resolve
through the alias ("Blurry Whirl > Paradox Symposium Whirl > Whirlwind": 2002 Western
Regionals, Ryan Mulroney; 2003 SEAPA NZ), totalling 15 ADD under the current alias but 16
if the footbag.org identity was meant. Curator review of the alias target (or an
era/source-scoped second alias) is warranted before either record is cited.

## F9. Combinations-page corpus statistics are not reproducible in-repo — data issue (known)

The public combo-analysis page's authored prose carries specific corpus statistics (hub
score 0.695, authority 0.863, out-degree 23 vs 15, "395 sequences across 22 years",
per-example appearance counts, the 22-ADD corpus maximum) sourced from the freestyle
evolution report's 395-sequence corpus. The archived sequence-foundation validation gate
already found these numbers unreproducible from the located corpus export (375 chains,
materially lower per-trick counts). Not repaired here; the mirror-extracted corpus in
this track is independent and smaller, so it verifies physical validity of the examples
but cannot verify the cited magnitudes.

## F4. Dexterity parity does NOT determine terminal foot — model insight (tested, refuted)

Across 894 resolved rows, "odd dex count => foot switch" agrees only ~48% of the time
(464 counter-examples), i.e. chance. The terminal foot is fixed by the side-marker chain
(SAME/OP references between side-bearing components), not by how many dexes occurred:
`smear` (2 dex) PRESERVEs while `ripwalk` (2 dex) SWITCHes. Any future combination
tooling must read the terminal contact, never count dexes. This validates the current
notation's design and kills a tempting shortcut.

## F5. Terminal-side encoding gaps — notation limitation

- 10 active rows have no `[DEL]`/`[KICK]` terminal at all (e.g. the bare `clipper` atom,
  `CLIP [XBD]`): position atoms whose "terminal" is themselves; the transition model
  cannot chain out of them without a convention.
- 11 rows have a delay terminal with no side marker: the endpoint contact side is simply
  unstated. This directly supports the track's premise that the primary unresolved
  variable in ambiguous names is the intended endpoint contact.
- 13 rows carry no operational notation at all; notably the `blazing_*` cohort, which is
  already queue-held on the blazing operator definition — the notation gap and the
  doctrine hold are the same underlying blocker.

## F6. VARIABLE terminals are a real, small, structured class — doctrine confirmation

42 rows resolve to VARIABLE: either the terminal itself is canonically either-side
(osis-style `SAME/OP ... [DEL]`) or a mid-chain either-side component leaves the endpoint
side undetermined relative to the set. These are not parse failures; they are the
canonical ambiguity the positional-identity doctrine already recognizes. Any sequence
model needs an explicit VARIABLE state, not a forced pick.

## F7. Historical reported totals essentially absent — insufficient evidence

The extractor captured 0 raw reported totals across 308 source records; the result blobs
name tricks but almost never per-trick or total ADDs. Historical-vs-current scoring
comparison therefore cannot be grounded in this corpus alone; it would need scans of
scoring sheets or contemporaneous forum posts (not in the mirror's event pages).

## F8. Corpus coverage — data issue (bounded)

Sequences were recovered only from mirror event pages with manually-entered result blobs
(73 pages yielded sequences of 363 mentioning Sick formats). Partial/none-resolution
records (174) preserve raw spellings for a future manual pass; several are likely
recoverable with curator eyes (e.g. era slang, run-together spellings). Duplicates were
retained as distinct source records; the normalized catalog groups repeat performances
without discarding any raw row.
