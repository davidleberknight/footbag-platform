# Atomic far / X-Dex — slice closed as analysis-only (2026-06-30)

**No canonical writes. No atomic far-receiver rows authored or promoted.** This records why the
"atomic + far receiver (X-Dex fires)" Class-B slice has no clean candidates and is blocked on a
curator/Red review.

## Intended pattern (the slice premise)

    atomic + far receiver = atomic (+1) + base + X-Dex (+1)

i.e. an atomic compound whose terminating base is an X-Dex receiver (mirage / illusion / whirl /
torque / drifter) in the explicit **far** form should fire X-Dex for an extra +1.

## Finding — the premise is not supported by the attested corpus

1. **The attested "atomic far …" source names resolve to already-promoted default atomic rows.**
   The only atomic-far-receiver names in the generator source packets
   (`phase-e-promotion-packet-2026-05-28/promotion_candidates_curator_confirm.csv`) are:

   | source name | source slug | source decomposition |
   |---|---|---|
   | Atomic far Whirl | `atomic-whirl` | `atomic(+1) + whirl(3) = 4` |
   | Atomic far Symp. Whirl | `atomic-symposium-whirl` | `atomic(+1) + symposium(+1) + whirl(3) = 5` |
   | Atomic Ducking far Mirage | `atomic-ducking-mirage` | `atomic(+1) + ducking(+1) + mirage(2) = 4` |

   Each maps to a default atomic row already promoted in the prior Class-B slice
   (`atomic_whirl`, `atomic_symposium_whirl`, `atomic_ducking_mirage`).

2. **Their source decomposition scores them as `atomic + base`, with no X-Dex term.** The `far`
   qualifier is stripped; the decomposition carries no `[XDEX]` and no extra +1. So the corpus
   treats these as the default form, not an X-Dex-firing far form.

3. **`atom_smasher` is the counterexample where atomic + far receiver DOES fire X-Dex.**
   `atom_smasher` (= atomic far mirage, ADD 4) carries the X-Dex bracket:
   `TOE > OP OUT [DEX] > OP IN [DEX] [XDEX] > OP TOE [DEL]` = mirage(2) + atomic(1) + **X-Dex(1)** = 4.

4. **Therefore the corpus contains an `atom_smasher`-vs-PassBack inconsistency** on whether an
   atomic-far-receiver fires X-Dex: `atom_smasher` says yes; the PassBack "atomic far X" names say no
   (positional-strip to default). This must be resolved by **curator/Red review before any further
   atomic far / X-Dex promotion.** Promoting the PassBack names as +2 would contradict their own
   source decomposition, duplicate the already-promoted default rows, and violate source-attestation.

## Disposition

- The clean atomic Class-B set is **complete**: `atomic_swirl`, `atomic_whirl`,
  `atomic_symposium_whirl`, `atomic_ducking_mirage` (all default receiver / non-receiver, no X-Dex).
- The atomic far / X-Dex extension is **blocked** pending the one curator/Red question above.
- Next Class-B work should pivot to a different family (blurry / nuclear), each with its own per-row
  doctrine call.
