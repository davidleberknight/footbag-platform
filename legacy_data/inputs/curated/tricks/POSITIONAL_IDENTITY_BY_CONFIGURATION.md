# Positional Identity by Configuration

Replacement identity doctrine for positional trick names. Supersedes the
positional-qualifier clause of the slug-normalization rule (the clause that said
`same-side` / `near` / `far` / `opposite` / `ss` / `op` qualifiers do not change
the slug). Companion to RELATIVE_SIDE_RELATIONSHIPS.md (what the qualifier means)
and RELATIVE_SIDE_TARGETING_RULE.md (which component it targets).

## Core rule

Lexical normalization handles SPELLING only (abbreviation expansion, preferred
spelling). It never decides identity.

Positional qualifiers are STRUCTURAL, not lexical. They are not deleted. A
positional qualifier sets the side of one side-bearing component, so it can
change the trick's identity.

A positional name resolves by its side-configuration (the set of SAME/OP markers
across its side-bearing components, i.e. its operational notation):

- if the configuration equals the base trick's configuration -> **alias of the base**;
- if the configuration equals an existing canonical's configuration -> **alias of that canonical**;
- if the configuration is new and historically attested -> **distinct canonical**;
- if the configuration cannot be resolved -> **held / review**.

**Core rule.** A fixed relationship in notation is insufficient evidence for
multi-component identity collapse. Multi-component positional aliases require
explicit curated equivalence.

## Identity statuses

- **SAFE_ALIAS** — resolves to the base. Autonomous only for single-component
  identities (component_count <= 1). Multi-component identities require a curated
  equivalence; the resolver may not infer them on its own.
- **CURATED_EQUIVALENCE** — a human-attested assertion that two configurations
  represent the same identity. May authorize a multi-component alias that the
  resolver cannot infer autonomously.
- **NEEDS_CURATED_EQUIVALENCE** — a fixed/redundant-looking multi-component
  configuration. Held until a curator asserts the equivalence.

## Why

Two names denote the same trick if and only if they resolve to the same
side-configuration. The old rule normalized by the NAME (delete the qualifier
token); this rule normalizes by the NOTATION (the qualifier's effect on the
configuration). The old rule is the degenerate case of this one: on a base with
a single independently variable side-bearing component, no positional qualifier
can change the configuration, so the slug collapses to the base exactly as the
old clause asserted. The old clause was over-generalized from that single case to
all cases.

## Dependencies and scope

- A positional qualifier is structural only on a base with at least two
  independently variable side-bearing components (dexes and/or catches), per the
  variability doctrine. On a single-component base the qualifier cannot change the
  configuration, so it is a lexical alias of the base (or, where it asserts the
  side the lone component cannot take, an ill-formed conflict held for review).
- Identity is the resolved configuration, never the spelling or the position of
  the qualifier token in the string. `Far X`, `X (far)`, and `X-op` resolve
  identically.
- This note governs identity only. It does not author tricks, set ADD, or decide
  X-Dex scoring (a separate receiver-gated rule).

## Resolver safety invariant

A resolver implementing this doctrine MUST NEVER classify a positional name as a
base alias (SAFE_ALIAS) when its base has more than one side-bearing component,
UNLESS an explicit curated equivalence row asserts that equivalence. A
"fixed relationship" read from notation can be a notation gap, so a
multi-component alias requires human assertion, never an autonomous resolver
call. Single-component bases (component_count <= 1) may alias to the base
without a curated row. Multi-component cases lacking a curated equivalence row
are held for curator review, not aliased.

## Status

Frozen. The resolution outcomes above are the complete decision set; no
per-operator or per-spelling special cases are permitted.
