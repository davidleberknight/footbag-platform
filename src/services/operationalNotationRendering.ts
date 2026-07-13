// Token-role highlighting for operational notation (set-arc form,
// e.g. `CLIP > OP IN [DEX] >> OP IN [DEX] [PDX] > OP TOE [DEL]`).
//
// Display-only. NEVER:
//   - reads any other freestyle_tricks column (no semantic inference)
//   - resolves cross-references (e.g. embedded `Frigidosis > ...`)
//   - mutates ontology / asserted_adds / modifier links
//   - couples to the semantic-notation parser
//
// Pure pattern-matching tokenizer over the operational set-arc grammar:
//   - Component flags ([DEX], [DEL], [BOD], [XBD], [PDX], [XDEX]) — square-bracket
//   - Pre-state flags ((back), (front), (no plant while), (rooted)) — parens, lowercase
//   - Surfaces (CLIP, TOE) — primary
//   - Sides (SAME, OP) — secondary
//   - Directions (IN, OUT, FRONT, BACK) — secondary; FRONT/BACK fuse into
//     rotation-variant when followed by WHIRL/SWIRL
//   - Body actions (SPIN, DUCK, DIVE) — primary
//   - Rotation variants (FRONT WHIRL, BACK WHIRL, FRONT SWIRL) — primary; 2-token fusion.
//     BACK SWIRL is retired from canonical notation (the swirl and reverse-swirl
//     dexes use the ordinary IN/OUT vocabulary); the fusion rule still tolerates
//     it so a non-canonical source string renders without breaking.
//   - Sequence operators (>, >>) — neutral
//
// Color palette (warm, distinct from semantic notation's cool palette).
// Primary saturated (warm: amber/orange/
// teal); secondary muted (gray). Restraint-first: 4 primary roles get color
// saturation; rest recede.

export type OperationalTokenRole =
  | 'surface'           // SET, CLIP, TOE
  | 'side'              // SAME, OP
  | 'direction'         // IN, OUT, FRONT, BACK (when standalone)
  | 'body_action'       // SPIN, DUCK, DIVE
  | 'rotation_variant'  // FRONT WHIRL, BACK WHIRL, FRONT SWIRL — 2-token fusion (BACK SWIRL tolerated for non-canonical sources)
  | 'component_flag'    // [DEX], [DEL], [BOD], [XBD], [PDX], [XDEX]
  | 'sequence_op'       // > or >>
  | 'pre_state'         // (back), (front), (no plant while), (rooted)
  | 'unknown';          // pass-through fallback; renders neutral

export interface OperationalToken {
  text:    string;                // verbatim text including any internal spaces (multi-word tokens)
  role:    OperationalTokenRole;  // machine-readable role (underscore form)
  cssRole: string;                // hyphenated CSS class suffix (e.g. 'sequence-op-major', 'component-flag-dex')
  label:   string;                // short educational tooltip text for the title attribute
}

export interface OperationalNotationDisplay {
  raw:    string;
  tokens: OperationalToken[];
}

// Static token vocabulary. Closed sets — no cross-row data dependency.
const SURFACES        = new Set([
  'SET', 'CLIP', 'TOE',
  // Anatomical + folk landing surfaces (stall surfaces beyond toe / clipper).
  'INSIDE', 'OUTSIDE', 'SOLE', 'KNEE', 'NECK', 'HEAD', 'FOREHEAD', 'SHOULDER', 'CLOUD', 'HEEL', 'PEAK',
]);
const SIDES           = new Set(['SAME', 'OP']);
const DIRECTIONS      = new Set(['IN', 'OUT']);
const FRONT_BACK      = new Set(['FRONT', 'BACK']);
const BODY_ACTIONS    = new Set(['SPIN', 'DUCK', 'DIVE', 'FLYING']);
const ROTATION_NOUNS  = new Set(['WHIRL', 'SWIRL']);
const COMPONENT_FLAGS = new Set(['DEX', 'DEL', 'BOD', 'XBD', 'PDX', 'XDEX', 'UNS', 'KICK']);

// Educational tooltip text per role. Used in the `title` attribute of each
// rendered <span> for native browser hover-disclosure. Generic fallbacks;
// per-token overrides below where specificity adds learner clarity.
// Harmonized with the semantic notationRendering layer for cross-layer
// consistency; ambiguous tokens carry layer-disambiguated text.
const ROLE_LABELS: Record<OperationalTokenRole, string> = {
  surface:          'Set position or landing surface',
  side:             'Step side (relative to plant foot)',
  direction:        'Arc direction',
  body_action:      'Body action within the trick',
  rotation_variant: 'Rotational dex step within the trick',
  component_flag:   'Component flag',
  sequence_op:      'Sequence step indicator',
  pre_state:        'Pre-state flag',
  unknown:          'Unrecognized: community notation may be evolving',
};

// Per-word-token specific tooltip overrides. Layer-disambiguated for tokens
// that also appear in semantic notation (WHIRL, SWIRL, TOE, SAME, OP, IN,
// OUT), so the same token reads distinctly across layers. Keyed UPPERCASE for
// case-insensitive lookup.
const WORD_TOKEN_LABELS: Record<string, string> = {
  // Surfaces
  SET:   'SET: launch the bag up (entry / start of trick)',
  CLIP:  'CLIP: clipper set position (start of trick)',
  TOE:   'TOE (operational): toe set position (start of trick)',
  // Sides — layer-disambiguated (semantic notation uses footedness role)
  SAME:  'SAME (operational): step on same side as plant foot',
  OP:    'OP (operational): step on opposite side from plant foot',
  // Directions — IN/OUT layer-disambiguated; FRONT/BACK fuse with WHIRL/SWIRL
  IN:    'IN (operational): inward arc (toward body)',
  OUT:   'OUT (operational): outward arc (away from body)',
  FRONT: 'FRONT: forward direction (fuses with WHIRL/SWIRL)',
  BACK:  'BACK: backward direction (fuses with WHIRL/SWIRL)',
  // Body actions
  SPIN:  'SPIN: body rotation in place',
  DUCK:  'DUCK: body action (downward)',
  DIVE:  'DIVE: body action (forward-downward)',
  FLYING: 'FLYING: airborne flying body action (the flying operator)',
  // Standalone WHIRL/SWIRL — layer-disambiguated from semantic core_family
  WHIRL: 'WHIRL (operational): rotational dex step within the trick',
  SWIRL: 'SWIRL (operational): rotational dex step within the trick',
};

// Component-flag specific tooltip overrides. The 6 flags carry meaningfully
// different educational content. Labels are user-facing prose ("<Name>
// component (clarifier)"); the raw token text already renders inside the
// pill, so the tooltip avoids repeating it.
export const COMPONENT_FLAG_LABELS: Record<string, string> = {
  DEX:  'Dexterity component (bag-foot interaction)',
  DEL:  'Delay component (final stall / landing)',
  BOD:  'Body component (body-position step, no bag-foot interaction)',
  XBD:  'Cross-body component (delay step across the body)',
  PDX:  'Paradox component (paradox-direction dex)',
  XDEX: 'X-Dex component (conditional +1, scored only where [XDEX] is present)',
  UNS:  'Unusual-surface component (stall on a non-standard landing surface)',
  KICK: 'Kick action marker (non-scoring; the kick itself carries no ADD)',
};

// Pre-state flag specific tooltip overrides — same rationale as
// COMPONENT_FLAG_LABELS. Lowercase since pre-state flags are lowercase by
// convention per OPERATIONAL_NOTATION_GRAMMAR §2.2.
const PRE_STATE_LABELS: Record<string, string> = {
  '(back)':            'Backward direction (next move oriented backward)',
  '(front)':           'Forward direction (next move oriented forward)',
  '(no plant while)':  'No support-leg plant during this segment',
  '(rooted)':          'Rooted / held position; no plant',
};

/**
 * Tokenize an operational-notation string into role-classified spans.
 *
 * Pure pattern-matching; no semantic resolution; no DB lookups; no parser
 * coupling. Returns one OperationalToken per recognized unit, in source
 * order. Empty/whitespace-only input → empty tokens array (caller should
 * still render the section omitted in that case via null shape).
 */
export function shapeOperationalNotationDisplay(
  raw: string | null | undefined,
): OperationalNotationDisplay | null {
  if (!raw || !raw.trim()) return null;
  const tokens: OperationalToken[] = [];
  const s = raw;
  let pos = 0;

  while (pos < s.length) {
    // Skip whitespace
    while (pos < s.length && /\s/.test(s[pos]!)) pos++;
    if (pos >= s.length) break;

    // Sequence operators — match >> before > (longer match wins)
    if (s.startsWith('>>', pos)) {
      tokens.push({
        text: '>>', role: 'sequence_op', cssRole: 'sequence-op-major',
        label: 'Major sequence boundary (often a no-plant break)',
      });
      pos += 2;
      continue;
    }
    if (s[pos] === '>') {
      tokens.push({
        text: '>', role: 'sequence_op', cssRole: 'sequence-op-minor',
        label: 'Sub-step (continuous flow)',
      });
      pos += 1;
      continue;
    }

    // Pre-state flag (...) — may contain internal whitespace e.g. "(no plant while)"
    if (s[pos] === '(') {
      const close = s.indexOf(')', pos);
      if (close > pos) {
        const text = s.slice(pos, close + 1);
        const label = PRE_STATE_LABELS[text.toLowerCase()] ?? ROLE_LABELS.pre_state;
        tokens.push({
          text, role: 'pre_state', cssRole: 'pre-state', label,
        });
        pos = close + 1;
        continue;
      }
    }

    // Component flag [...]
    if (s[pos] === '[') {
      const close = s.indexOf(']', pos);
      if (close > pos) {
        const text  = s.slice(pos, close + 1);
        const inner = text.slice(1, -1).toUpperCase();
        const label = COMPONENT_FLAG_LABELS[inner] ?? ROLE_LABELS.component_flag;
        const flagSlug = inner.toLowerCase();  // for cssRole granularity
        const cssRole = COMPONENT_FLAGS.has(inner)
          ? `component-flag component-flag-${flagSlug}`
          : 'component-flag';
        tokens.push({
          text, role: 'component_flag', cssRole, label,
        });
        pos = close + 1;
        continue;
      }
    }

    // Word token
    const wordMatch = s.slice(pos).match(/^[A-Za-z][A-Za-z0-9-]*/);
    if (wordMatch) {
      const word  = wordMatch[0];
      const upper = word.toUpperCase();
      pos += word.length;

      // Surface (CLIP, TOE)
      if (SURFACES.has(upper)) {
        tokens.push({ text: word, role: 'surface', cssRole: 'surface', label: WORD_TOKEN_LABELS[upper] ?? ROLE_LABELS.surface });
        continue;
      }
      // Side (SAME, OP)
      if (SIDES.has(upper)) {
        tokens.push({ text: word, role: 'side', cssRole: 'side', label: WORD_TOKEN_LABELS[upper] ?? ROLE_LABELS.side });
        continue;
      }
      // Body action (SPIN, DUCK, DIVE)
      if (BODY_ACTIONS.has(upper)) {
        tokens.push({ text: word, role: 'body_action', cssRole: 'body-action', label: WORD_TOKEN_LABELS[upper] ?? ROLE_LABELS.body_action });
        continue;
      }
      // FRONT/BACK — lookahead for WHIRL/SWIRL to fuse into rotation_variant
      if (FRONT_BACK.has(upper)) {
        const ahead = s.slice(pos).match(/^\s+([A-Za-z]+)/);
        if (ahead && ROTATION_NOUNS.has(ahead[1]!.toUpperCase())) {
          // Consume the whitespace + the rotation noun
          const fused = `${word} ${ahead[1]}`;
          pos += ahead[0]!.length;
          // Compose a per-fused-token tooltip to avoid the generic
          // "Rotational variant" fallback.
          const dirLabel = upper === 'FRONT' ? 'forward' : 'backward';
          const nounLabel = ahead[1]!.toUpperCase() === 'WHIRL' ? 'whirl' : 'swirl';
          tokens.push({
            text: fused, role: 'rotation_variant', cssRole: 'rotation-variant',
            label: `Rotational dex: ${dirLabel}-direction ${nounLabel}`,
          });
          continue;
        }
        // Standalone direction
        tokens.push({ text: word, role: 'direction', cssRole: 'direction', label: WORD_TOKEN_LABELS[upper] ?? ROLE_LABELS.direction });
        continue;
      }
      // Plain direction (IN, OUT)
      if (DIRECTIONS.has(upper)) {
        tokens.push({ text: word, role: 'direction', cssRole: 'direction', label: WORD_TOKEN_LABELS[upper] ?? ROLE_LABELS.direction });
        continue;
      }
      // Standalone WHIRL/SWIRL (no preceding FRONT/BACK) — still rotation_variant
      if (ROTATION_NOUNS.has(upper)) {
        tokens.push({ text: word, role: 'rotation_variant', cssRole: 'rotation-variant', label: WORD_TOKEN_LABELS[upper] ?? ROLE_LABELS.rotation_variant });
        continue;
      }

      // Unknown token — pass-through (neutral). Future O1c may surface
      // unknowns as glossary candidates or curator-correction hints.
      tokens.push({ text: word, role: 'unknown', cssRole: 'unknown', label: ROLE_LABELS.unknown });
      continue;
    }

    // Single character we don't recognize (e.g. punctuation) — pass through
    // verbatim as an unknown token so it stays visible to the curator.
    tokens.push({ text: s[pos]!, role: 'unknown', cssRole: 'unknown', label: ROLE_LABELS.unknown });
    pos += 1;
  }

  return { raw: raw.trim(), tokens };
}
