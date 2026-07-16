// Emerging Vocabulary publication gate.
//
// Names in this set are under active synonym / historical-vocabulary reconciliation
// and are NOT yet defensibly "genuinely unresolved". Until the reconciliation is
// ratified, they must not appear on the PUBLIC Emerging Vocabulary surface
// (/freestyle/observational): an obvious alias, abbreviation, retired name, or
// spelling variant must never be shown to visitors as if it were novel vocabulary.
// They remain fully visible with provenance on the internal workbench
// (/internal/freestyle/emerging-vocabulary), which is where the reconciliation runs.
//
// A name leaves this set one of two ways: it resolves to a canonical (an alias is
// registered, and the request-time DB filter drops it on its own), or the
// reconciliation confirms it is a genuinely-unresolved trick and a maintainer clears
// it from the hold. Matched case-insensitively on the observational row name.
export const EV_REVIEW_HELD_NAMES: ReadonlySet<string> = new Set([
  'bs fusion',
  'bs pigbeater',
  'bs reactor',
  'bubba beater',
  'butterfly swivel',
  'butterfly symp. blink',
  'clipper far dso',
  'clipper far grifter',
  'delusional butterfly',
  'double helix',
  'double over downing osis',
  'double whip',
  'double-dex twist',
  'far triple over down',
  'flailing blacula',
  'flaming homer',
  'flaming tard',
  'frantic clipper',
  'frenzy',
  'fusing clipper',
  'ill frenzy',
  'illusioning far clipper',
  'johny quest',
  'johny vodka',
  'jolimont ss mirage',
  'kill frenzy',
  'kiss of the scorpion',
  'mama curve',
  'massacre',
  'midtime toe near illusion',
  'midtime toe near mirage',
  'neutron smasher',
  'null butterfly',
  'peeking osis',
  'pixie ss original tap',
  'quasi whirl',
  'rev. big apple',
  'reverse walkover',
  'scattered whirl',
  'scorpions toe nail',
  'slapping clipper',
  'slapping dlo',
  'smiling far butterfly',
  'splicing infinity',
  'spyro symposium torquescrew',
  'super ego',
  'symple atw',
  'symple reverse atw',
  'symposium bubba beater',
  'toe midtime near whirr',
  'toe near triage',
  'toe set os double over down dragon',
  'toe set os double over down flapper',
  'toe set os double over downing osis',
  'toe set os triple over down',
  'toe set ss triple over down',
  'torquescrew',
  'triple atw in-out',
  'triple atw out-in',
  'twisting near toe',
  'warped dlo',
  'whipping osis',
  'whirlwind swirl',
  'wiggle butterfly',
  'xbd outside stall',
  'your mom',
  'your sister',
  'zulu le loup',
]);
