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

## Narrative arc (and the ending)

Freestyle begins -> tricks accumulate -> naming becomes necessary -> notation becomes
necessary -> classification becomes necessary -> families become necessary -> dictionaries
become necessary -> this encyclopedia is the latest step in that evolution. The page ends on
that progression, not on a list of links.

## Topics as one narrative (evidence for the thesis)

Origins of freestyle; early pioneers; rise of tournaments; evolution of routines; evolution
of shred; development of ADD scoring; development of notation; growth of compositional
thinking; explosion of operators; Footbag World; PassBack; footbag.org; BAP; Hall of Fame;
modern video era; the role of online media; how today's dictionary fits into that history.

## What the repo already supports (assemble, do not invent)

Facts: era periods/labels (HISTORY_ERAS, service evolution[]); ADD-by-era numbers 2001-2025
(INSIGHTS_DIFFICULTY_ERAS); pioneer names + person links (HISTORY_PIONEERS ->
/history/:personId); geographic-shift facts (Klouda 109 podiums, EU cluster); 1972 origin and
1997 Hall of Fame founding (hofService); BAP ADD-naming origin (bapService); 774 events
1980-2026, 395 Sick-3 (source note). Interpretation already written: two-phase story, combo
evolution, routines-to-guiltless, modern-era framing. Navigation targets to link: /hof, /bap,
/history/:personId, /freestyle/records, /freestyle/leaders, /freestyle/competition,
/freestyle/notation-article, glossary Sources.

## What only the curator can supply (never invented; gathered via the interview below)

Footbag World history; BAP and Hall of Fame specifics beyond the one existing paragraph each;
milestone dates and attributions; notation-evolution authorship/origin; PassBack and
footbag.org contribution narrative; contributor names beyond the pioneers list; archival media
for the three empty slots.

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
