/**
 * freestyleHashtagRoles.ts
 * ========================
 *
 * Curator-maintained registry of which freestyle concepts carry MORE than one
 * hashtag role. Declarative data only: no DB access, no service wiring, no
 * behavior. No consumers are wired yet; this is the source of truth a future
 * hashtag-form shaper and the media-tag bare-token guard will read.
 *
 * Doctrine (why this layer exists): a concept's hashtag form is decided by the
 * ROLE it is playing, not by its `freestyle_tricks.type`. Roles and their tag
 * forms:
 *   - trick    -> bare `#<slug>`   (the trick's own media gallery)
 *   - set      -> the set prefix tag   (a set / uptime system)
 *   - operator -> the modifier / operator prefix tag   (a modifier across bases)
 *   - family   -> the family prefix tag   (a trick family)
 * The tag-form prefixes themselves are owned by the media-tag taxonomy and the
 * media-tag invariant, not here; the role-to-prefix binding is reconciled when
 * a consumer is wired, so no prefix string is hardcoded in this module.
 *
 * A concept usually carries exactly one role, inferred from its structural
 * type, and is therefore ABSENT from this registry. This file lists only the
 * exceptions: concepts that are genuinely two things at once and so need two
 * hashtags. The bare namespace stays reserved for trick-role media, so a
 * concept that is a set or an operator but NOT also a trick gets no bare tag;
 * only a registry entry that declares the trick role re-opens the bare tag.
 *
 * Membership is a curator judgment and is NEVER derived from `type='set'`:
 * pixie and atomic are both set-type rows, yet pixie is a performed trick AND a
 * set system while atomic is a set concept only. The list starts conservatively
 * and grows only on a per-concept curator decision.
 */

export type HashtagRole = 'trick' | 'set' | 'operator' | 'family';

/**
 * Concepts that carry more than their single structural role, each mapped to
 * the full role set it plays. Pixie and Fairy are each both a performed
 * canonical trick (a bare hashtag) and a set system (a set-prefix hashtag).
 *
 * Toe and Clipper are foundational stalls that are also set names; whether they
 * create the same trick-versus-set split is a separate open question, so they
 * are intentionally NOT listed until that is decided.
 */
export const DUAL_ROLE_REGISTRY: Readonly<Record<string, readonly HashtagRole[]>> =
  Object.freeze({
    pixie: Object.freeze(['trick', 'set'] as const),
    fairy: Object.freeze(['trick', 'set'] as const),
  });

/** Roles explicitly declared for a slug, or undefined when it is single-role. */
export function getDeclaredRoles(slug: string): readonly HashtagRole[] | undefined {
  return DUAL_ROLE_REGISTRY[slug];
}

/** Whether the registry declares `role` for `slug`; single-role slugs are false. */
export function declaresRole(slug: string, role: HashtagRole): boolean {
  return getDeclaredRoles(slug)?.includes(role) ?? false;
}

/**
 * Whether the registry re-opens the bare (trick-role) hashtag namespace for a
 * concept whose structural type is not itself a trick. A consumer still grants
 * the bare tag to any concept that is structurally a trick; this answers only
 * the dual-role override, so a set-only or operator-only concept stays false.
 */
export function declaresTrickRole(slug: string): boolean {
  return declaresRole(slug, 'trick');
}
