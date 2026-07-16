# Full-Corpus Falsification: Does the Bundle-Step Grammar Cover Every Notated Trick

Status: exploratory research under `exploration/`. Not production data, not doctrine, not a change to the live dictionary. This is the highest-information test the roadmap named: parse every notated trick and check whether the current theory covers the whole corpus. Companion file: `full_corpus_parse.csv` (one row per trick: slug, name, ADD, contact count, scored-event count, classification). Grounded in the operational notation of all 895 active tricks that carry it.

The claim under test: every notated trick can be represented as an ordered sequence of contacts, where each contact carries one or more scored events, and the ADD total equals the count of scored events.

Discipline: falsification. Residue is reported, not explained away. Names are not treated as structure. No physical possibility is inferred.

## Method

For each of the 895 active tricks with operational notation: the scored-event count was computed as the number of scored bracketed components (dexterity, delay, body, cross-body, paradox, unusual-surface, and x-dex; the kick component does not score); the contact count was computed as the number of steps separated by the succession and overlap markers; and each trick was classified. The full token vocabulary of the corpus was also enumerated to find any token the grammar cannot place. Every count and classification is in the companion CSV; the operational notation for each flagged trick is quoted below so the reader can check the reading.

## Verdict: the theory survives

The score identity holds for the entire corpus. Of 895 tricks, 892 have a scored-event count exactly equal to their stored ADD. The only three exceptions are rows whose notation is an unfinished placeholder with no scored components at all, so there is nothing to count; they are a data gap, not a counterexample. There is not a single trick where a complete formula parses and the event count disagrees with the ADD. This is as strong as a corpus-wide structural claim gets.

The parse also holds. Every complete notation decomposes into an ordered sequence of one to eight contacts, each carrying a bundle of the known event kinds. The token vocabulary is closed: every surface, side, direction, body action, rotation noun, scored bracket, and grade-neutral pre-state qualifier in the corpus is a grammar element. Only one token type is not a primitive of the grammar, and it is a name (see below).

Classification of all 895:

| Classification | Count | Meaning |
|---|---|---|
| fully-explained | 728 | parses to contacts, event count equals ADD, uses only settled elements |
| explained-known-extension | 151 | same, but uses paradox, x-dex, swing, or backside, which parse and score correctly but are theory-deferred for structural interpretation |
| doctrine-question-symp-encoding | 10 | parses and scores, but symposium is written as a dex token rather than a suspension |
| parse-residue-embedded-name | 3 | a trick name is used as a compound token instead of decomposing to primitives |
| notation-gap | 3 | notation is an unfinished placeholder; nothing to parse |

So 879 of 895 parse and score with no reservation (the first three rows above), 13 carry a data or doctrine flag that is not a theory failure, and 3 are a genuine, small residue.

## The counts confirm the model's shape, not just its arithmetic

Contact count and event count come apart in both directions, exactly as the bundle-step model predicts and a linear model forbids. Some tricks have more events than contacts, because a contact bundles several scored events: squeeze is one contact carrying two scored components, and cross-body sole stall is two contacts carrying three. Some have more contacts than events, because unscored contacts exist: walk over is five contacts carrying two scored events, the rest being body and landing steps that score nothing. If a trick were a linear chain of one scored event per step, these two counts would always be equal. They are routinely unequal, and the ADD still tracks events, not contacts. That is direct evidence for the bundle, against the chain.

## The failures, in full, and what each implies

**Three notation gaps (data, not theory).** `toe_stall` is stored as `[set] > toe`, `clipper_stall` as `[set] > clipper`, and `pendulum` as `TOE SWING (SET) > (contact)`. None carries a scored component, so none can be parsed to its stored ADD. This is unfinished notation for three of the oldest, simplest entries, not a limit of the model. Implication: finish the notation; nothing in the theory needs to change.

**Three embedded-name residues (a real, small crack).** `ducking_osis` is `SET > DUCK [BOD] > SAME/OP OSIS [BOD] [XBD] [DEL]`, and `weaving_osis` and `zulu_osis` are the same shape. Here the token `OSIS` is a trick name used as a single compound component that stands in for a body-plus-cross-body-clipper bundle. The trick still parses into contacts and its event count still equals its ADD, because the brackets on the `OSIS` token are all present and counted. But the notation is using a name where the grammar expects primitives, which is exactly the thing the whole project set out to avoid. This is the one genuine residue the sweep found. Implication: it does not break the score identity or the contact structure, but it shows the notation is not always fully decomposed. It is a data-hygiene defect in three rows, and it is honest to call it residue rather than fold it into an explanation.

**Ten symposium-encoding doctrine questions.** Rows such as `clipper_symposium_whirl` (`CLIP > SAME SYMP [DEX] > OP IN [DEX] > OP CLIP [XBD] [DEL]`) write symposium as a dedicated `SYMP` dexterity token, while the far more common form writes it as a suspension pre-state fused to a dexterity, `(no plant while) ... [BOD] [DEX]`. Both parse and both score correctly, so this is not a theory failure; it is the same movement notated two ways, a curator or doctrine decision about which encoding is canonical. Implication: reconcile the two symposium encodings in the data; the model is indifferent to the choice.

**One hundred fifty-one known-extension rows.** These use paradox, x-dex, swing, or backside. Every one parses into contacts and its event count equals its ADD, so the model covers them arithmetically and structurally. They are flagged only because the earlier snapshot marked these four elements as not yet studied for their internal structure, so their coverage is by counting, not yet by understanding. Implication: not a failure, but a pointer to the next studies, which the roadmap already ordered.

## Revised statement of the theory

None required. The failures do not force new structure. The score-equals-events identity and the contact parse both survive the whole corpus, so the model is not revised. Three honest asterisks are added to the record, none of which is a change to the theory:

- The identity is corpus-wide with exactly three exceptions, and all three are unfinished notation, not disagreements.
- The notation occasionally embeds a trick name as a compound token, in three rows, which is a data defect to fix, and is the only genuine residue found.
- Coverage of the paradox, x-dex, swing, and backside families is currently by event-counting, which is real but shallow; understanding their internal structure is deferred, not claimed.

Everything the earlier snapshot marked as firm stays firm and is now checked against all 895 tricks rather than a slice: a trick is an ordered sequence of contacts, each a bundle of scored events, and difficulty is the number of scored events. The single most load-bearing claim, that ADD equals the event count, is now as well tested as the corpus allows.

## Short list of all failures

1. `toe_stall`, `clipper_stall`, `pendulum`: notation gap; finish the notation.
2. `ducking_osis`, `weaving_osis`, `zulu_osis`: a trick name used as a compound token; decompose it to primitives.
3. Ten symposium rows written with a `SYMP` dexterity token rather than a suspension pre-state; reconcile the encoding.

No names generated, no production code, no dictionary changes. Deliverables: this note and `full_corpus_parse.csv`. The next roadmap step is the events-only versus carrier-and-manner decision, then paradox and x-dex, both of which this sweep shows are covered by counting and unstudied in structure.
