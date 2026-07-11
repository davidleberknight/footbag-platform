# The Atlas of the Freestyle Movement Universe, Volume III: Representation

Status: exploratory research under `exploration/`. Not production data, not doctrine, not a change to the live dictionary. No production code, no parser change, no grammar redesign, no dictionary change, no promotion or naming work, no biomechanics. Volumes I and II and their published errata are frozen and untouched. This volume studies how the operational notation represents the movement universe those volumes mapped; it describes the notation's information content and does not criticize, improve, or complete it.

Generated evidence: read-only measurement of the live dictionary's operational notation (895 active movements) via `../volume-2/handoff-interlude/validate_handoff_state.py` and the queries recorded here. Machine-readable inventory: `representation_catalog.csv`. Companions: `INFORMATION_LOSS_MAP.md`, `REPRESENTATION_STRENGTH_ANALYSIS.md`, `COMPRESSION_ANALYSIS.md`.

## 1. What Volume III maps

Volumes I and II mapped movement coordinates. Volume III maps the arrow between a movement and its written form:

```
   movement  --(operational notation)-->  notation string
```

It treats that arrow as an object: a mapping that may be incomplete, non-minimal, and lossy, and asks how much of a movement survives it. The question is representation, not movement, not scoring, not implementation. The governing distinction the whole volume serves is the one between a movement and its representation, and the goal is to make that distinction permanent for every later volume.

## 2. Method

For every structural coordinate identified in Volumes I and II, the notation was checked for whether the coordinate is explicitly written, derivable, partially written, written indirectly, intentionally omitted, impossible to recover, or outside the notation's design. Two collapse questions were then asked of the corpus directly: does the mapping ever send two distinct movements to one notation (many-to-one), and does one notation ever legitimately carry several structural readings (one-to-many). Both were measured against the 895 active movements, not argued. The per-coordinate results are in `representation_catalog.csv`; the narrative is below.

## 3. What the notation writes, measured

Across the 895 active movements, the presence of each explicit signal (rows whose notation contains the token):

```
   [DEL] landing delay        97.0%      SPIN body event          30.5%
   [DEX] dexterity            92.7%      (back) facing            27.9%
   [BOD] body operator        59.0%      >>   simultaneity        25.9%
   [XBD] cross-body           53.1%      (no plant while) stance  19.4%
   [PDX] paradox              15.8%      DUCK body event          18.9%
   SWIRL / WHIRL / BACK dir  ~20%        SAME/OP ambiguous side    4.5%
   [XDEX] far receiver         1.1%      WEAVE / ZULU body event    0.0%
```

The shape of this profile is the volume's first result. The near-universal signals are the two scored events every movement is built from, a dexterity and a landing. The common signals are the scored modifiers, cross-body and body operators. The rare signals are rare scoring conditions. And two body tokens the movement language needs do not exist in the corpus at all. The notation writes, densely, exactly the things that bear on the score and on the trick's family identity, and it writes them in proportion to how often they occur.

## 4. Per-coordinate representation

The catalog carries all seventeen coordinates; the summary by representation status:

- **Explicitly represented (high fidelity):** landing surface, dex direction, body operators, simultaneity, repeated dexterity, and the rare far-receiver condition. Each has a token, and the token is written wherever the structure occurs.
- **Partially represented:** launch surface (named for a concrete launch, unnamed for the generic set launch), dex side (the relative side is written, but the frame it is relative to is not), posture and stance (written for a marked minority, defaulted elsewhere), and orientation facing (coarse facing written, fine phase not).
- **Represented indirectly:** the intermediate carriage (no token; inferable only under a transition rule the grammar does not supply) and scoring (no token; the additive value is the count of scored brackets, so scoring is derivable from bracket structure rather than written).
- **Intentionally omitted or impossible to recover:** the reference frame, the support leg, and the free leg, absent from every one of the 895 movements.
- **Outside the design goals:** bag height and trajectory, which the notation does not attempt.

## 5. The collapse maps

### Many-to-one: distinct movements sharing one notation

Measured directly: **36 notation strings are each the written form of two or more distinctly-named canonical movements, covering 72 movements, 8% of the active corpus.** These are not near-misses; they are byte-identical notation strings for movements the dictionary names apart. The mapping is provably many-to-one. Beyond these measured collisions, the omitted coordinates each define a collapse class in principle: two movements differing only in the intermediate carriage, only in the reference frame or legs, only in the fine orientation phase, or only in an unmarked stance, share one notation because the distinguishing coordinate is not written. The 72 measured collisions are the visible floor of a larger collapse the omissions guarantee.

### One-to-many: one notation, several readings

Measured and structural: **40 movements write an explicit ambiguous side**, a deliberate either-side reading, so one notation legitimately stands for both side interpretations. The repeated-dexterity coordinate is a second, controlled one-to-many: written as two literal events, it also admits a count-operator reading at the naming layer. The generic set launch is a third: one launch token stands for several possible entry surfaces. These one-to-many cases are intentional latitude, not failure; the notation is choosing to leave a distinction open.

## 6. The answer: what the notation is

**Based solely on the evidence, the operational notation is best understood as a structural shorthand organized around scoring: it records the scored events and the family-distinguishing structure of a movement, and it discards the movement state that neither scores nor names.**

Every strand of evidence points the same way. The near-universal tokens are the scored events; the common tokens are the scored modifiers; the rarest token is a pure scoring condition; and the additive value is the bracket count, so the notation's spine is the scoring structure. The coordinates it writes well are the ones that distinguish trick families (surface, direction, operators). The coordinates it omits entirely are the ones a complete movement language would need and a scorer and a namer do not, the absolute frame and the legs. And the measured many-to-one collapse proves it is not a complete movement language: it cannot tell two distinctly-named movements apart when they score and structure alike.

It is not a pure scoring language, because it carries structural coordinates a bare score would not need. It is not a communication language in the loose sense, because it is precise about events. And it is not a complete movement language, because distinct movements collapse onto it. It is the thing in between: a shorthand that keeps what is needed to score a movement and to place it in a family, and drops the rest. Read that way, its omissions are not gaps in a movement language; they are the boundary of a scoring-and-identity shorthand, and the reference frame and legs fall outside that boundary by design (`COMPRESSION_ANALYSIS.md`).

## 7. Boundaries and the permanent distinction

Volume III does not evaluate the notation, propose a better one, or complete the grammar. It stops at description. Its one durable output is a distinction every later volume must carry: **a movement is not its notation.** The notation is a scoring-and-identity shorthand with a measured many-to-one collapse and deliberate one-to-many latitude, so any later volume that reads a movement from its notation is reading a compressed projection, not the movement, and must treat coordinates the catalog marks omitted, indirect, or impossible-to-recover as absent from the notation rather than absent from the movement. That is the line Volume III makes permanent: the movement, and its representation, are two different objects, and this volume is the map of the arrow between them.
