/**
 * Pure classification function for club bootstrap leaders.
 *
 * Owns the combination-gate logic that maps a per-(member, club) signal set
 * to a strong/weak/none classification. The function is intentionally pure
 * and stateless; the onboarding wizard's task-response handler invokes it to
 * drive the strong / weak / declined branches. The legacy data pipeline seeds
 * `club_bootstrap_leader_signals` evidence with its own implementation and
 * does not call this one.
 *
 * Combination gates (structural signals only):
 *   strong = (listed_contact AND affiliation)
 *         OR (hosting AND roster)
 *         OR (listed_contact AND hosting)
 *   weak   = any single structural signal (including mirror_text alone)
 *   none   = zero structural signals
 *
 * Context modifiers (`tier_signal`, `recent_activity`, `geographic_alignment`)
 * are observed alongside structural signals but never change the
 * classification. They enrich wizard display and admin sort only.
 */

export interface StructuralSignals {
  listed_contact: boolean;
  affiliation: boolean;
  hosting: boolean;
  roster: boolean;
  mirror_text: boolean;
}

export interface ContextModifiers {
  tier_signal: boolean;
  recent_activity: boolean;
  geographic_alignment: boolean;
}

export type BootstrapClassification = 'strong' | 'weak' | 'none';

export interface ClassifyBootstrapLeaderResult {
  classification: BootstrapClassification;
  matchedGate: 'listed_contact_and_affiliation'
             | 'hosting_and_roster'
             | 'listed_contact_and_hosting'
             | 'single_structural'
             | null;
  structural: StructuralSignals;
  modifiers: ContextModifiers;
}

const ZERO_MODIFIERS: ContextModifiers = {
  tier_signal: false,
  recent_activity: false,
  geographic_alignment: false,
};

export function classifyBootstrapLeader(
  structural: StructuralSignals,
  modifiers: ContextModifiers = ZERO_MODIFIERS,
): ClassifyBootstrapLeaderResult {
  if (structural.listed_contact && structural.affiliation) {
    return {
      classification: 'strong',
      matchedGate:    'listed_contact_and_affiliation',
      structural,
      modifiers,
    };
  }
  if (structural.hosting && structural.roster) {
    return {
      classification: 'strong',
      matchedGate:    'hosting_and_roster',
      structural,
      modifiers,
    };
  }
  if (structural.listed_contact && structural.hosting) {
    return {
      classification: 'strong',
      matchedGate:    'listed_contact_and_hosting',
      structural,
      modifiers,
    };
  }

  const anyStructural =
    structural.listed_contact ||
    structural.affiliation ||
    structural.hosting ||
    structural.roster ||
    structural.mirror_text;

  if (anyStructural) {
    return {
      classification: 'weak',
      matchedGate:    'single_structural',
      structural,
      modifiers,
    };
  }

  return {
    classification: 'none',
    matchedGate:    null,
    structural,
    modifiers,
  };
}
