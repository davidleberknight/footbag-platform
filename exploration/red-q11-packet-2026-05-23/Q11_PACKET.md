# Single Question for Red — Is PassBack a different scoring convention?

**Date:** 2026-05-23
**Reviewer:** Red Husted
**Length:** ~2 pages. One question. Four possible answers.

---

## Before you start

Red — this is a single focused question. It's not about any individual
trick; it's about how we should be reading the PassBack book overall.

A pattern has shown up across a clean batch of PassBack entries that we
think you're the right person to interpret. We've laid out four ways the
pattern could be explained; pick whichever feels closest, or write a
fifth. "I don't know" is a fine answer — knowing it's unresolved still
helps us shape the platform.

There's a one-page summary in `Q11_ONE_PAGER.md` and a one-line reply
worksheet in `Q11_RESPONSE.md` if you want the short form.

---

## The observation

We pulled 17 PassBack tricks where the move name decomposes cleanly
(single reading, stable vocabulary, no ambiguous tokens). For each one
we compared two numbers:

- **PassBack total** — the ADD value printed in the PassBack book.
- **IFPA-derivation total** — what you'd get by adding up the IFPA-side
  weights of the parts: base trick + each modifier + positional.

In **every single one of the 17 rows**, the PassBack total was **lower**
than the IFPA derivation. The gap was usually +1, sometimes +2, +3, or
even +5. Never zero, never PB-higher. The same-direction pattern across
17 rows is too consistent to be random data error.

### A few example rows

| PassBack trick | PB notation reading | PB total | IFPA-derivation total | Gap |
|----------------|---------------------|----------|-----------------------|-----|
| Blurrage | Stepping far Barrage | 3 | 4 | +1 |
| Predator | Atomic far DLO | 3 | 4 | +1 |
| Schmoe | Stepping near Legover | 2 | 3 | +1 |
| GDLO | Gyro DLO | 2 | 4 | +2 |
| Pandora's Box | Gyro Pickup | 1 | 3 | +2 |
| Darkwalk | Pixie Diving near Butterfly | 2 | 5 | +3 |
| Colossus | Spinning Diving near Symp. Whirl | 1 | 6 | +5 |

(Full list of 17 in `Q11_EVIDENCE.md`.)

---

## The question

**Is PassBack scoring the same system as IFPA scoring, or is it a
different convention?**

We've been treating PB as another voice inside one shared scoring
system — when it disagrees with IFPA-derivation we've been asking
"which weighting is right?". But if PB is actually a separate scoring
convention, the question stops being "who's right?" and starts being
"which convention applies in which context?" — which is a very
different framing for the platform.

---

## Four ways to read the pattern

### A. PassBack is a baseline scoring layer

PassBack was authored as a community / tournament-floor scoring system
— a self-contained baseline, never intended to align trick-for-trick
with the full IFPA add-up. The numbers are deliberately compressed.

*If this is right:* PB scores are **historical provenance**. We
publish the IFPA-derived value as canonical; the PB number gets shown
as "PassBack historically rates this at N" next to it. No more "which
is right?" debate — they're answering different questions.

### B. PassBack is a conservative floor

PB intentionally rounds down — "if you're not sure how many adds it's
worth, call it the lower number." A floor, not a baseline.

*If this is right:* Same publishing outcome as (A), but the prose
framing is different — PB is "minimum credit", IFPA-derivation is
"full credit".

### C. PassBack uses a different formula entirely

PB applies a different add-up rule — maybe weights certain modifiers
differently (gyro = +0? quantum = +0?), maybe treats stacked modifiers
with diminishing returns, maybe treats folk-named tricks as atomic.
Not a baseline or a floor — an actually different math.

*If this is right:* We need per-modifier or per-trick metadata
explaining which formula applies. Harder to operationalize, but
honest if it's true.

### D. PassBack is a snapshot from an earlier era

The PB numbers reflect IFPA-grammar **as it stood when PB was
authored** — before later rulings (pt8 about transitive blurry, pt10
about atomic-implicit-paradox, pt12 about positional weights) refined
the system. The gap is timeline drift, not convention difference.

*If this is right:* PB scores are honored as **historical record**,
not corrected against. We publish IFPA-derived as canonical and label
PB as "the book's value at time of writing."

---

## What we'd love to know

1. **Which of A / B / C / D feels closest?** (Or: a different reading
   entirely. Or: "honestly, I'm not sure.")
2. **If A or D:** is it OK for the platform to publish IFPA-derivation
   values and label PB as historical provenance alongside?
3. **If B or C:** is there a per-modifier or per-trick rule we should
   know about? (For instance: "gyro is +0 in PB", "folk-named tricks
   in PB get baseline 1 regardless of decomposition", etc.)
4. **Anything we're missing.** PB has been treated as a single
   monolithic source; if there are actually multiple conventions
   inside it (early printings vs late, certain trick families scored
   differently), that's exactly the kind of thing you'd know and we
   wouldn't.

---

## Why this question matters

Right now the platform sits on a fence. We've shipped three PB
divergences as "the IFPA-derived value is canonical, the PB number is
provenance metadata" — but only because the three rows fit a single
pattern (gap = +1). The other 14 rows in the clean batch don't fit
that pattern, and we don't have a principled way to handle them.

Your answer here lets us either:

- **(A or D ruling):** roll out the same "publish IFPA-derived,
  surface PB as historical provenance" treatment to all 17 rows and
  potentially dozens more — cleanly, without parsing each row's
  decomposition.
- **(B or C ruling):** build the per-modifier or per-trick metadata
  the platform needs to honor PB's convention where it applies.
- **("I don't know"):** ship the three pilots as documented, defer
  the other 14, keep collecting evidence until the pattern is
  clearer.

All three outcomes are fine — but knowing which one you'd lean toward
shapes a lot of downstream work.

---

## One thing this is **not**

This isn't about whether PassBack is right or wrong. PB is a real
document with real authority in real freestyle communities; the
question is just **what scoring system it's expressing**, so we can
honor it correctly on the platform rather than implicitly overriding
it.

— end —
