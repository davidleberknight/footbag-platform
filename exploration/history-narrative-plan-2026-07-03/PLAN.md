# Freestyle History — narrative plan (planning only, no page prose)

The History page is the introduction to the whole encyclopedia: a reader who finishes it
should understand why the dictionary exists and how freestyle became the sport the rest of
the encyclopedia documents. Unlike the family pages, History has no fixed contract; its
story must stabilize before any code. Plan order (curator-set): research and curator pass
(gather facts) -> outline and narrative -> write the page -> move prose into a content
module only if needed.

## Thesis (the spine every section is evidence for)

Freestyle did not become more difficult simply because players got better. It evolved
because each generation introduced new ideas that expanded the vocabulary available to
everyone who followed. Sections are evidence for that claim, not independent essays.

## Central idea

The encyclopedia does not merely document tricks; it documents the evolution of a language.
That idea sits at the center of the page.

## Narrative framework: why it mattered, not what happened (recalibrated)

Model the page on the Footbag Hall of Fame and BAP pages, not their wording but their
purpose: they explain why people, organizations, and ideas mattered, not just what
happened. History is an integrated why-it-mattered narrative, never a chronology of
tournaments or a catalog of technical milestones. Every section is evidence for the
thesis.

The institutions are woven into one story as the mechanisms by which individual
innovation became shared language:

- Recognition of innovation. The Hall of Fame (founded 1997 by Stalberger and fellow
  pioneers, after the 1972 Oregon origin) preserves the pioneers, champions, and
  promoters who turned a back-yard game into a global sport. The Big Add Posse, named
  after ADD, the measure of difficulty itself, is invite-only peer recognition earned
  only by shredding hard in front of the members, so it recognizes exactly the players
  pushing the frontier, the ones who expand the vocabulary.
- Preservation and spread of knowledge. Footbag World, footbag.org's move list, and
  PassBack are how tricks were written down, named, and carried from one player to the
  next.
- From individual to shared. Naming, notation, and classification are how a move one
  player invented became a word every player could use.

Treat the Hall of Fame and BAP pages (already linked on the site) as primary sources
the reader can follow for the detailed stories. History complements them, never
duplicates them: it integrates their historical perspective into the broader arc and
answers the bigger questions rather than retelling their rosters:

- Who expanded the vocabulary?
- Why were BAP and the Hall of Fame created?
- How did Footbag World, PassBack, and footbag.org preserve and spread knowledge?
- How did ideas move from individual players into the shared language of the sport?

## The ending (completes the arc)

Freestyle began as a handful of tricks. As the vocabulary expanded, names became
necessary. As the number of named tricks exploded, notation became necessary. As
notation matured, classification became necessary. As classification grew more
sophisticated, dictionaries and encyclopedias became necessary. This encyclopedia is
the latest step in that evolution: it exists not simply to list tricks, but to preserve
and explain the language that four decades of players collectively created.

## Primary factual foundation: the encyclopedia's own pages

The factual foundation is our own site, not web search. External web sources are secondary
and require verification; if a fact is not supported by our own pages or another reliable
primary source, the narrative is not built on it. History synthesizes what the encyclopedia
already knows, connecting these pages into one story, and each is read as evidence for the
thesis rather than an isolated statistic:

- Hall of Fame (/hof) and BAP (/bap): why the recognition institutions existed and what they
  contributed (pioneers and promoters; the ADD-named frontier).
- Competition (/freestyle/competition): the documented event history by era shows the sport's
  growth, and competition formats diversifying over time is the sport maturing; the competitor
  and podium data (FreestyleCompetitorViewModel, era counts) is the people who shaped it.
- Insights (/freestyle/insights): the strongest thesis evidence, from a documented archive of
  395 Sick3 sequences. Modifier frequency (mostUsedModifiers) shows the vocabulary expanded
  through compositional thinking, layering operators onto known bases, not endless invention of
  unrelated moves. Connector analysis (connectors) shows some tricks, Whirl above all, became
  structural hubs rather than merely popular, the claim the Whirl page already teaches.
  Most-used tricks (mostUsed) show which moves became central to the shared language.
- Records / leaders (/freestyle/records, /freestyle/leaders): the measured peaks of the
  vocabulary.
- The dictionary and glossary: the vocabulary itself and the language for describing it, the
  thing the whole history has been building toward.

Read Competition and Insights as evidence, not statistics: each number is a sign of how
freestyle evolved, in service of the thesis. The web-research material in `INTERVIEW_NOTES.md`
is a secondary reference only, used to fill gaps our own pages cannot, and only after
verification. The concrete numbers behind Competition and Insights are mined into
`EVIDENCE.md`, each mapped to the section it anchors.

## Topics as one narrative (evidence for the thesis)

Origins of freestyle; early pioneers; rise of tournaments; evolution of routines; evolution
of shred; development of ADD scoring; development of notation; growth of compositional
thinking; explosion of operators; Footbag World; PassBack; footbag.org; BAP; Hall of Fame;
modern video era; the role of online media; how today's dictionary fits into that history.

## What the repo already supports (assemble, do not invent)

Facts: era periods/labels (HISTORY_ERAS, service evolution[]); ADD-by-era numbers 2001-2025
(INSIGHTS_DIFFICULTY_ERAS); pioneer names + person links (HISTORY_PIONEERS ->
/history/:personId); geographic-shift facts (Klouda 109 podiums, EU cluster); 774 events
1980-2026, 395 Sick-3 (source note). Interpretation already written: two-phase story, combo
evolution, routines-to-guiltless, modern-era framing.

On-site primary sources, read and confirmed (link, do not duplicate). Hall of Fame (/hof,
hofService): 1972 Oregon origin, Mike Marshall and John Stalberger; founded 1997 by Stalberger
and fellow pioneers to honour the pioneers, champions, and promoters who turned a back-yard
game into a global sport; member pages live on footbaghalloffame.net. BAP (/bap, bapService):
named after ADD, the difficulty metric; an invite-only elite entered only by shredding hard in
front of the members; "the legends of freestyle." These two supply the recognition half of the
narrative; History links them and integrates their significance rather than retelling them.

Navigation targets to link: /hof, /bap, /history/:personId, /freestyle/records,
/freestyle/leaders, /freestyle/competition, /freestyle/notation-article, glossary Sources.

## Curator-supplied and still-open (never invented)

Gathered (see `INTERVIEW_NOTES.md`), web-sourced and pending verification before publishing:
Footbag World / WFA history (1983 founding, newsletter to magazine, media push, standardizing
role); origin context (1972, Asian antecedents, 1983 Wham-O sale); PassBack (Matt Kemmer,
~2021 on, education hub). These carry per-claim reliability flags in the notes; verify names,
dates, and attributions (and drop the uncertain Native American origin detail) before any
reach the page.

Still open, the spine of the thesis and not yet supplied: milestone tricks and ideas with
rough dates (symposium, paradox, blurry, fearless, the operator explosion); notation origin
and authorship; footbag.org's role in preserving and spreading knowledge; archival media for
the three empty slots; contributor names beyond the pioneers list.

## Interview prompts (the research pass — answer in one sitting)

### Origins and pioneers
1. Where did freestyle split off from footbag, and who were the first people doing freestyle
   rather than just kicking? Roughly when?
2. Who were the early pioneers, what did each one bring, and roughly when were they active?

### Tournaments, routines, shred
3. When did tournaments start shaping freestyle, and what changed once it was competitive?
4. How did routines and shred diverge, and why? When did each become its own thing?

### The vocabulary expanding (the thesis in action)
5. Which tricks or ideas were genuine turning points, where the vocabulary jumped (for example
   symposium, paradox, blurry, fearless)? For each: roughly when did it become widely
   recognized or standard, and who is associated with it?
6. Which milestones matter historically even if they were not the literal first occurrence?
7. When did compositional thinking (linking, combos, thinking in sequences) become the way
   players understood freestyle?
8. The explosion of operators (spinning, atomic, symposium, nuclear, and the rest): when did
   the operator vocabulary proliferate, and what drove it?

### Scoring and notation
9. How did ADD scoring come to be, how did the difficulty numbers change over time, and who
   formalized it?
10. Where did the notation (JOBs / operational notation) come from, who created it, roughly
    when, and why did notation become necessary?

### The institutions (each documented or advanced the sport)
11. Footbag World: tell me everything you remember. What it was, when, who ran it, what role it
    played.
12. BAP: how did it begin, who, when, and what does it recognize?
13. Hall of Fame: how does induction work, who are the key inductees, and what years?
14. PassBack: what is it, and what role did it play in documenting freestyle?
15. footbag.org: what role did it play (the move list, the community, the documentation)?
16. The modern video era and online media (YouTube, social): how did video change how freestyle
    spread and was documented?

### The through-line (confirms the thesis and the ending)
17. In your view, did freestyle get harder because players got better, or because each
    generation expanded the vocabulary it handed forward?
18. Where does this encyclopedia fit in the naming -> notation -> classification -> dictionary
    progression? Is it the latest step in that story?

## Writing order (after the interview)

1. Lock the outline and narrative from the interview answers plus the repo facts.
2. Write the page: opening thesis, the evidence sections, the institutions, the language-
   evolution ending, references, and navigation.
3. Only then relocate prose into a content module and pay down the hardcoded-template /
   service-inlined debt; add section anchors and fix the landing "Coming Soon" tiles.

## File / route reference map (for the build)

Page: route publicRoutes.ts:92 -> freestyleController.history -> getFreestyleHistoryPage
(freestyleService.ts:8142-8241, content interface FreestyleHistoryContent :4154-4178) ->
src/views/freestyle/history.hbs. Content: src/content/freestyleEditorial.ts (HISTORY_ERAS,
HISTORY_PIONEERS, HISTORY_ADD_SYSTEM, INSIGHTS_DIFFICULTY_ERAS). Landing tiles:
src/views/freestyle/landing.hbs:199-220 (three hardcoded "Coming soon" spans, no anchors on
history sections yet). Link targets: /hof (hofService), /bap (bapService), /history/:personId
(historyService + historical_persons table), /freestyle/records + /freestyle/leaders. FB World:
no surface exists (new). Raw source text: exploration/fborg/ (JobsNotation.txt and peers).
