# freestyle/doctrine/ — doctrine of record

This directory holds the standing freestyle doctrine: the rulings in force, the rules
they establish, and the evidence chains behind them, written as permanent documents.
`exploration/` holds the dated working history (audit packets, decision packets,
evidence passes) that produced these consolidations; a consumed exploration document
carries a banner pointing at its successor here and remains in place as history.

## Promotion governance principle (curator-set)

The goal is not to eliminate expert judgment but to minimize the need for NEW expert
judgment. Every ruling should reduce the future decision space by creating reusable
precedent: a question put to the rules expert or the curator is well-formed when its
answer settles a class of cases, not one row. When expert input is unavailable,
promotion proceeds by documentary evidence, structural derivation from canonical
exemplars, and established precedent — with the burden of proof on keeping a case
blocked rather than on releasing it. A case none of those resolve stays in Emerging
Vocabulary, visibly and honestly, until sufficient evidence exists; parking a name
there is a correct outcome, not a failure. Frequency of attestation is evidence,
never authority, and a derivation is only as good as its written proof: every
evidence-derived ruling records the proof and its adversarial checks (the pattern in
`OPERATOR_DERIVATIONS.md`) so a future ruling that changes it has a chain to amend
instead of an unexplained edit.

## Authority relationship

- `src/content/freestyleOperatorReference.ts` is the canonical home for every
  operator's ADD value, structure, and X-Dex behavior, with the
  `freestyle/inputs/base_dictionary/trick_modifiers.csv` registry as its data-side mirror.
  These documents link to it and never duplicate its values.
- These documents are canonical for rulings and method: which expert and curator
  rulings are in force, what each ruling means, how evidence was weighed, and which
  questions remain open.
- Where a document here conflicts with any other source, resolve it through the
  authority order in the root `CLAUDE.md`; it is stated only there.

## Contents

- `DOWN_FAMILY.md` — the one-family ruling for the down/barfly lineage, the
  set-by-foot grid, the display umbrella, and the open embedded-base question.
- `POSITIONAL_IDENTITY.md` — identity by side-configuration, the ratified
  positional-vocabulary mapping, and the resolver contract.
- `MIRROR_RULE.md` — the zulu/weaving ducking-mirror rule and its extension to
  operator stacks.
- `OPERATOR_DERIVATIONS.md` — operator rulings derived from the written record,
  with their proofs and the explicit boundary of what is not proven.
- `RED_RULINGS.md` — the ledger of expert rulings in effect and where each lives.
- `RED_QUEUE.md` — the open questions awaiting the rules expert or the curator.
- `AUTHORITY.md` — the single authoritative source for each public freestyle
  datum, the ADD-authority order, and the duplications still to consolidate.
