# The Dependency Graph of Freestyle Understanding

A synthesis, not an implementation. This is the directed acyclic graph of freestyle
*concepts*, where an edge **A → B** means *you must understand A before B makes sense.*
It was discovered by authoring the pilot glossary entries and noticing that every
Reveal was really a statement about prerequisites.

The claim this document makes: **this one graph is simultaneously the glossary order,
the teaching order, the progression ladders, the Foundational Bases, and the spine of
the Read-Like-an-Expert essay.** Once the graph exists, those five artifacts are not
separate design problems — they are five different reads of the same structure.

---

## 1. Why a graph and not a tree

A tree gives every concept one parent. Freestyle does not work that way, and the whole
value of this artifact is in the places it doesn't:

- **Torque needs *both* Miraging and Osis.** Neither alone explains it.
- **Blur needs *both* Blurry and Mirage** — and Blurry itself needs *both* Stepping and
  Paradox.
- **Osis feeds *both* Torque and Blender.** One concept, two children.
- **Dexterity feeds nearly everything.** One concept, dozens of descendants.

These are **convergences** (a node with two or more parents) and **hubs** (a node with
many children). A tree cannot express either. The convergences are where understanding
is *assembled*, and the hubs are where it is *load-bearing* — and both are invisible in
a tree. That is the entire reason the graph is worth building.

---

## 2. The graph, by layer

Read top to bottom; every edge points downward (a lower node depends on the ones above
it). Nodes on one line are peers at the same depth.

```
LAYER 0  ·  STATES (roots — no prerequisites)
    The stall (a state the bag rests in)
        ├── Toe Stall                     Clipper Stall (cross-body)
        │        │                              │
LAYER 1  ·  THE UNIT AND ITS PROPERTIES
        └──> Dexterity (a trip between two stalls) <──────────┐
                 ├── Direction (in / out)                     │
                 ├── Side (same / opposite)                   │
                 ├── Body elements (spin, duck, dive, jump)   │
                 └── Cross-body (the reach across) <── Clipper Stall
                          │
LAYER 2  ·  THE CORE ATOMS (single-dex tricks; the irreducible twelve)
     ┌──────────────┬───────────────┬──────────────┬───────────┐
   ATW / Orbit   Mirage/Illusion  Legover/Pickup  Whirl/Swirl  Butterfly   Osis
   (same-side    (opposite-side   (same-side to   (dex to      (dex to     (SPIN + dex
    full orbit)   dex to toe)      toe)            clipper)     clipper)     to clipper)
        │             │                │               │           │           │
LAYER 3  ·  THE GRAMMAR
        └─────────────┴────> Set vs Operator (role: launch or modify?) ──> Compositional
                                                                            premise
                                                        (a trick is a formula: base + modifiers)
                                                                            │
LAYER 4  ·  OPERATORS (things that modify a base)                          │
     ┌───────────┬────────────┬──────────┬─────────┬──────────┬───────────┤
  Miraging     Whirling     Atomic    Stepping   Paradox    Spinning/    Pixie/Fairy/
  (←Mirage)    (←Whirl)                                      Ducking      Nuclear    Quantum
                                          └──> Blurry <──┘   (←body        (set          (a set:
                                             (Stepping +      elements)     modifiers)     op-in toe)
                                              Paradox)
        │             │                                │            │
LAYER 5  ·  COMPOUNDS (named tricks = base + operator(s))
      Torque        Blender          Blur            Barrage      Eggbeater    Down family
    (Miraging     (Whirling       (Blurry +        (two-dex     (Atomic +    (repeated
     + Osis)       + Osis)         Mirage)          set)         Legover)     down-dexes)
        │             │                │
LAYER 6  ·  SCORING
      ADD (count of structural components) <── atoms + operators + compositional premise
        │
LAYER 7  ·  NOTATION (a way to WRITE all of the above; depends on it, not before it)
      Job's notation ──> the bracket-count checksum (brackets = ADD; it audits itself)
        │
LAYER 8  ·  ORGANIZATION
      Family (tricks sharing a terminal) <── atoms + compositional premise
        │
LAYER 9  ·  THE INSIGHTS (sinks — everything points at them, nothing points out)
      Direction is structural  ──>  The Mirror Law                        [essay]
      Name → Formula → Family  ──>  The vocabulary is a small algebra      [essay]
      Families emerge from conserved terminal mechanics
      The ceiling, and the unnamed valid structures beyond it  ──>  The Frontier [essay]
```

The **convergence nodes** (two-plus parents — where understanding is assembled): Cross-body,
every core atom, Compositional premise, Blurry, Torque, Blender, Blur, Eggbeater, ADD,
Notation, and every insight. The **hubs** (many children — load-bearing): Dexterity
(the supreme hub), Toe Stall, Clipper Stall, Compositional premise, and the atoms Osis,
Mirage, Whirl, Butterfly.

---

## 3. Prerequisite closures — the questions answered

For each concept, its **full transitive closure**: everything you must understand
first, and the *depth* (how many prerequisites). Depth is the graph's own difficulty
signal.

**Before Mirage (depth 4 — shallow, an early atom):**
Stall → Toe Stall → Dexterity → Direction, Side. That's all. This shallowness is
exactly why mirage is teachable early and why it is the right place to seat the
Mirror Law.

**Before Barrage (depth 4 — shallow, an early compound):**
Stall → Toe Stall → Dexterity → Set vs Operator. "Do two dexes in one set." A compound,
but a near-surface one — which is why barrage is a natural first taste of stacking.

**Before Family (depth ~6 — mid):**
Stall → Toe/Clipper Stall → Dexterity → Cross-body → the core atoms (the terminals) →
Compositional premise. You need the atoms and the idea of composition, but *not* the
operator layer. Family sits earlier than most people place it.

**Before Torque (depth ~12 — deep):**
Stall → Toe Stall, Clipper Stall → Dexterity → Direction, Side, Cross-body, Spin →
Mirage, Osis → Set vs Operator → Compositional premise → Miraging → **Torque**. Twelve
prerequisites. This is the graph's proof of the pilot's discovery: torque *feels*
fundamental because the name is short, but it sits near the bottom of a deep well. It
is one of the last things you can truly understand, not one of the first.

**Before Blender (depth ~12 — deep, and nearly identical to Torque):**
Same as Torque with Whirl/Whirling in place of Mirage/Miraging. The closures overlap in
all but two nodes — which is the precise, graph-level statement of *why torque and
blender are twins*: their prerequisite sets differ by a single substitution.

**Before Quantum (depth 5 to define, deep to resolve):**
To *define* it: Stall → Toe Stall → Dexterity → Direction (in), Side (op), Set. Shallow.
But to *understand* it — to grasp the open question of whether quantum and miraging are
one set or two — you must additionally hold Miraging and Atomic in mind, which pulls the
whole operator layer in. Quantum is the graph's clearest case of **shallow to define,
deep to understand**, and the glossary should say so rather than pretend the definition
is the understanding.

The pattern across all six: **prerequisite depth, not ADD, is the true teaching
order.** Depth correlates with ADD loosely (deep tricks tend to score higher) but they
measure different things — ADD counts structural *components*, depth counts *concepts
you must already hold*. Torque and Barrage are both compounds, but one is depth-12 and
one is depth-4. The glossary should sequence by depth.

---

## 4. The one graph, five artifacts

This is the synthesis's real payload. Each design problem is a different operation on
the same graph:

| Artifact | Is this operation on the graph |
|---|---|
| **Glossary order** | a topological sort — teach a node only after its prerequisites (§5) |
| **Teaching / curriculum order** | the same topological sort; identical to glossary order |
| **Progression ladders** | *paths* through the graph — a ladder to Torque is the path root → … → Torque, each step adding one concept |
| **Foundational Bases** | the *hubs* — nodes ranked by out-degree (how much depends on them). Measured, not guessed (§6) |
| **Read Like an Expert essay** | a single *walk* down one deep path (Toe Stall → Dexterity → Mirage → Miraging → Osis → Torque), decoding at each node |
| **The ~12 insights / essays** | the *sinks* — the deepest nodes, where every path terminates (Layer 9) |

Five artifacts, one structure. Change the graph once and all five update. That is why
this is worth more than seven more entries: the entries are outputs of the graph.

---

## 5. The canonical order (topological sort)

The teaching order and the glossary order, linearized from the graph. This is the
sequence:

1. **The stall** → Toe Stall, Clipper Stall
2. **Dexterity** → Direction, Side, Cross-body, Body elements
3. **The core atoms**: Around the World / Orbit, Mirage / Illusion, Legover / Pickup,
   Whirl / Swirl, Butterfly, Osis
4. **The grammar**: Set vs Operator → the Compositional premise
5. **The operators**: Miraging, Whirling, Atomic, Stepping, Paradox, Blurry, Spinning /
   Ducking, the set-modifiers, Quantum
6. **Scoring**: ADD
7. **The compounds**: Barrage, Eggbeater, Torque, Blender, Blur, the Down family
8. **Notation** and the bracket-count checksum
9. **Family** (the organizing concept)
10. **The insights / essays**: Direction is structural → The Mirror Law; Name → Formula
    → Family (the algebra); Families from terminal mechanics; The Frontier

Two things this order fixes about the earlier plan:

- **Operators come before compounds, and notation comes late.** The pilot review's
  composition gap (compounds authored with undefined operators) was really a *topological
  violation* — teaching Layer 5 before Layer 4. The graph forbids it automatically.
- **Notation is Layer 7, not Layer 1.** You learn to *write* freestyle after you
  understand it, not before. The current glossary front-loads notation; the graph says
  that is backwards.

---

## 6. Foundational Bases, measured — and a correction

The earlier design chose Foundational Bases by intuition: Toe Stall, Clipper Stall,
Around the World, Inside Stall, Rake, Pendulum — "the movements everyone learns and
returns to." The graph lets us *measure* "returned to" as **out-degree**, and the
measurement partly disagrees.

The graph separates two ideas the phrase "Foundational Base" was quietly conflating:

- **Gateways** — low *in-degree*, few prerequisites, learned first. Toe Stall, Clipper
  Stall, Around the World, Mirage.
- **Hubs** — high *out-degree*, much depends on them. Dexterity (by far the highest),
  Toe Stall, Clipper Stall, the Compositional premise, Osis, Mirage, Whirl, Butterfly.

A true Foundational Base is high on **both** — a concept you meet early *and* keep
returning to. By that test:

- **Confirmed:** Toe Stall and Clipper Stall (both gateway and hub). The two genuine
  bases.
- **Demoted:** Around the World, Inside Stall, Rake, Pendulum are gateways but *not*
  hubs — few things are built on them. They are excellent *first tricks*, but the sport
  does not route through them. Calling them Foundational Bases overstates their
  structural role.
- **Promoted (the correction):** **Dexterity** is the supreme hub and was not on the
  list at all — because it is a *unit*, not a trick, and intuition looks for tricks. The
  graph says the single most foundational concept in freestyle is the dexterity itself.
  **Osis** is a hub (feeds torque, blender, and their whole line) and also missing.
  **The Compositional premise** — "a trick is a formula" — is a hub with no physical
  form at all, and may be the most load-bearing *idea* in the sport.

The lesson: **Foundational Bases are not the tricks a beginner performs most; they are
the concepts the most other concepts depend on.** Some are tricks (Toe Stall), some are
units (Dexterity), some are pure ideas (the Compositional premise). The graph is the
only way to see this, because out-degree is invisible from any single entry.

---

## 7. What this changes, immediately

- The glossary's authoring order is now fixed and non-negotiable: §5. Operators before
  compounds; notation late.
- The Foundational Bases set is corrected: Toe Stall, Clipper Stall, Dexterity, the
  Compositional premise, and the hub atoms (Osis, Mirage, Whirl, Butterfly) — chosen by
  out-degree, not by which tricks are popular.
- Progression ladders and the expert essay are now derivable, not designed: a ladder is
  a path, the essay is a walk.
- The pilot's "compressed-formula" insight is re-seen as a graph fact: a famous name
  that sits deep in the graph but reads as shallow. That gap — *deep in prerequisites,
  short in name* — is precisely the set of tricks that most reward the algebra lens.

---

## The one-line summary

Freestyle is a directed acyclic graph rooted at the toe stall and the dexterity,
converging through a dozen atoms and a handful of operators into named compounds, and
terminating in about a dozen insights; the glossary order is its topological sort, the
progression ladders are its paths, the Foundational Bases are its hubs, and the expert
essay is a single walk from the root to the deepest node — all of which the graph now
gives us for free.
