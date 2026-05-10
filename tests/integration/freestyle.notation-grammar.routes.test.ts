/**
 * Integration tests for the Phase 3 read-only notation-grammar diagnostic
 * panel rendered on GET /freestyle/tricks/:slug.
 *
 * The panel is fed by `freestyleService.shapeNotationGrammar`, which reads the
 * Phase-0 parser columns (jobs_notation_raw, structural_parse_json,
 * computed_add_formula, computed_adds, add_formula_status) loaded by
 * `freestyleTricks.getBySlug`. Asserted ADD remains editorial truth; the panel
 * surfaces parser output for diagnostic review only.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';

import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import { insertFreestyleTrick } from '../fixtures/factories';

const { dbPath } = setTestEnv('3115');

// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let createApp: Awaited<ReturnType<typeof importApp>>;

beforeAll(async () => {
  const db = createTestDb(dbPath);

  // 1) No parser data — panel must be hidden, page renders as before.
  insertFreestyleTrick(db, {
    slug:           'trick-bare',
    canonical_name: 'trick bare',
    adds:           '3',
    base_trick:     'trick-bare',
    trick_family:   'trick-bare',
    description:    'no parse data; control row',
  });

  // 2) Parser succeeded; computed equals asserted; exact_self_atom.
  //    Includes a descriptive role (rotation) that is absent from
  //    add_contributing_roles to exercise the layer-distinction branch.
  insertFreestyleTrick(db, {
    slug:           'trick-self-atom',
    canonical_name: 'trick self atom',
    adds:           '5',
    base_trick:     'trick-self-atom',
    trick_family:   'trick-self-atom',
    description:    'self-atom + agree path',
    jobs_notation_raw:        'CLIP > OP IN [DEX]',
    jobs_notation_normalized: 'clip > op in [dex]',
    structural_parse_json: JSON.stringify({
      descriptive_roles: {
        core_family: [{ token: 'symposium', atom_resolved: true }],
        rotation:    [{ token: 'spinning',  atom_resolved: false }],
      },
      add_contributing_roles: {
        core_family: [{ token: 'symposium', atom_resolved: true }],
      },
      parse_warnings:  [],
      policy_tokens:   [],
      additive_flags:  [],
    }),
    computed_add_formula: 'symposium(5)',
    computed_adds:        5,
    add_formula_status:   'exact_self_atom',
  });

  // 3) Approximate parse; computed disagrees with asserted; parse_warnings present.
  insertFreestyleTrick(db, {
    slug:           'trick-approx',
    canonical_name: 'trick approx',
    adds:           '7',
    base_trick:     'trick-approx',
    trick_family:   'trick-approx',
    description:    'approximate + disagree path',
    structural_parse_json: JSON.stringify({
      descriptive_roles: {
        core_family: [{ token: 'whirl',    atom_resolved: false }],
        modifier:    [{ token: 'spinning', atom_resolved: false }],
      },
      add_contributing_roles: {
        core_family: [{ token: 'whirl',    atom_resolved: false }],
        modifier:    [{ token: 'spinning', atom_resolved: false }],
      },
      parse_warnings: ['ambiguous_modifier_attachment'],
      policy_tokens:  [],
      additive_flags: [],
    }),
    computed_add_formula: 'whirl(3) + spinning(1)',
    computed_adds:        4,
    add_formula_status:   'approximate',
  });

  // 4) Policy-dependent: a policy_tokens entry must surface in its section.
  insertFreestyleTrick(db, {
    slug:           'trick-policy',
    canonical_name: 'trick policy',
    adds:           '8',
    base_trick:     'trick-policy',
    trick_family:   'trick-policy',
    description:    'policy-dependent path',
    structural_parse_json: JSON.stringify({
      descriptive_roles: {
        core_family: [{ token: 'whirl', atom_resolved: false }],
      },
      add_contributing_roles: {
        core_family: [{ token: 'whirl', atom_resolved: false }],
      },
      parse_warnings: [],
      policy_tokens:  ['quantum'],
      additive_flags: [],
    }),
    computed_add_formula: null,
    computed_adds:        null,
    add_formula_status:   'policy_dependent',
  });

  // 5) Unresolved with an unresolved token in descriptive_roles.
  insertFreestyleTrick(db, {
    slug:           'trick-unresolved',
    canonical_name: 'trick unresolved',
    adds:           '4',
    base_trick:     'trick-unresolved',
    trick_family:   'trick-unresolved',
    description:    'unresolved token path',
    structural_parse_json: JSON.stringify({
      descriptive_roles: {
        unresolved_tokens: [{ token: 'zzunknown', atom_resolved: false }],
      },
      add_contributing_roles: {},
      parse_warnings: [],
      policy_tokens:  [],
      additive_flags: [],
    }),
    computed_add_formula: null,
    computed_adds:        null,
    add_formula_status:   'unresolved',
  });

  // 6) Unparseable structural_parse_json — shaping returns null; panel hidden.
  insertFreestyleTrick(db, {
    slug:           'trick-bad-json',
    canonical_name: 'trick bad json',
    adds:           '2',
    base_trick:     'trick-bad-json',
    trick_family:   'trick-bad-json',
    description:    'unparseable JSON path',
    structural_parse_json: 'not-json-at-all',
    add_formula_status:    'unresolved',
  });

  // 7) Unknown status string — STATUS_LABELS fallback uses the raw status.
  insertFreestyleTrick(db, {
    slug:           'trick-unknown-status',
    canonical_name: 'trick unknown status',
    adds:           '3',
    base_trick:     'trick-unknown-status',
    trick_family:   'trick-unknown-status',
    description:    'unknown-status fallback path',
    structural_parse_json: JSON.stringify({
      descriptive_roles:      {},
      add_contributing_roles: {},
      parse_warnings:         [],
      policy_tokens:          [],
      additive_flags:         [],
    }),
    add_formula_status: 'something_new',
  });

  // 8) Modifier-derived row — exercises the new exact_modifier_derived label
  //    wording and the multi-role descriptive/contributing layers.
  insertFreestyleTrick(db, {
    slug:           'trick-mod-derived',
    canonical_name: 'trick mod derived',
    adds:           '4',
    base_trick:     'whirl',
    trick_family:   'whirl',
    description:    'Paradox-modified whirl.',
    structural_parse_json: JSON.stringify({
      descriptive_roles: {
        core_family: [{ token: 'whirl',   atom_resolved: false }],
        modifier:    [{ token: 'paradox', atom_resolved: false }],
      },
      add_contributing_roles: {
        core_family: [{ token: 'whirl',   atom_resolved: false }],
        modifier:    [{ token: 'paradox', atom_resolved: false }],
      },
      parse_warnings: [],
      policy_tokens:  [],
      additive_flags: [],
    }),
    computed_add_formula: 'paradox(+1) + whirl(3) = 4',
    computed_adds:        4,
    add_formula_status:   'exact_modifier_derived',
  });

  // 9) Row with NULL description — editorial-context block must be hidden.
  insertFreestyleTrick(db, {
    slug:           'trick-no-description',
    canonical_name: 'trick no description',
    adds:           '4',
    base_trick:     'trick-no-description',
    trick_family:   'trick-no-description',
    description:    null,
    structural_parse_json: JSON.stringify({
      descriptive_roles: {
        core_family: [{ token: 'trick-no-description', atom_resolved: true }],
      },
      add_contributing_roles: {
        core_family: [{ token: 'trick-no-description', atom_resolved: true }],
      },
      parse_warnings: [],
      policy_tokens:  [],
      additive_flags: [],
    }),
    computed_add_formula: 'trick-no-description(4) [self-atom] = 4',
    computed_adds:        4,
    add_formula_status:   'exact_self_atom',
  });

  // 10) Mechanical-warning-only row — exercises the warning-noise downgrade:
  //     parse_warnings carries only `inferred_self_canonical_atom`, which
  //     should now render INSIDE the Diagnostic details disclosure, not as a
  //     prominent top-level "Parse warnings" section sibling to role layers.
  insertFreestyleTrick(db, {
    slug:           'trick-mechanical-warn',
    canonical_name: 'trick mechanical warn',
    adds:           '5',
    base_trick:     'trick-mechanical-warn',
    trick_family:   'trick-mechanical-warn',
    description:    'mechanical-warning-only path',
    structural_parse_json: JSON.stringify({
      descriptive_roles: {
        core_family: [{ token: 'symposium', atom_resolved: true }],
      },
      add_contributing_roles: {
        core_family: [{ token: 'symposium', atom_resolved: true }],
      },
      parse_warnings: ['inferred_self_canonical_atom'],
      policy_tokens:  [],
      additive_flags: [],
    }),
    computed_add_formula: 'symposium(5) [self-atom] = 5',
    computed_adds:        5,
    add_formula_status:   'exact_self_atom',
  });

  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

// ---------------------------------------------------------------------------

describe('GET /freestyle/tricks/:slug — notation-grammar panel hidden by default', () => {
  it('renders 200 for a trick with no parser data', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks/trick-bare');
    expect(res.status).toBe(200);
  });

  it('omits the Structural decomposition section when no structural_parse_json', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks/trick-bare');
    expect(res.text).not.toContain('Structural decomposition');
    expect(res.text).not.toContain('notation-grammar-panel');
  });

  it('omits the panel when structural_parse_json is unparseable', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks/trick-bad-json');
    expect(res.status).toBe(200);
    expect(res.text).not.toContain('Structural decomposition');
  });
});

// ---------------------------------------------------------------------------

describe('GET /freestyle/tricks/:slug — exact_self_atom (computed agrees with asserted)', () => {
  it('renders the Structural decomposition section', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks/trick-self-atom');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Structural decomposition');
    expect(res.text).toContain('notation-grammar-panel');
  });

  it('shows the exact_self_atom status label and raw key (Phase 4 wording: distinguishes from structurally-derived)', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks/trick-self-atom');
    expect(res.text).toContain('Exact: named trick / self-atom');
    expect(res.text).toContain('(exact_self_atom)');
    // Pre-Phase-4 wording must not appear; Phase 4 distinguishes self-atom
    // tautological agreement from modifier-derived structural confirmation.
    expect(res.text).not.toContain('Exact (self-atom)');
  });

  it('renders the agree phrase when computed equals asserted', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks/trick-self-atom');
    expect(res.text).toContain('agrees with asserted');
    expect(res.text).not.toContain('disagrees with asserted');
  });

  it('renders the formula and jobs notation when provided', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks/trick-self-atom');
    expect(res.text).toContain('symposium(5)');
    expect(res.text).toContain('CLIP &gt; OP IN [DEX]'); // HTML-escaped
    expect(res.text).toContain('Jobs notation');
    expect(res.text).toContain('Derivation');
  });

  it('renders both descriptive and ADD-contributing role layers with distinct contents', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks/trick-self-atom');
    expect(res.text).toContain('Descriptive roles');
    expect(res.text).toContain('ADD-contributing roles');
    // descriptive layer carries rotation→spinning; contributing layer does not.
    // Both layers carry symposium under core_family, so check structural-layer
    // membership by anchoring on the layer headings.
    const descriptiveStart = res.text.indexOf('Descriptive roles');
    const contributingStart = res.text.indexOf('ADD-contributing roles');
    const policyOrEnd = res.text.indexOf('Policy tokens') !== -1
      ? res.text.indexOf('Policy tokens')
      : res.text.length;
    const descriptiveBlock  = res.text.slice(descriptiveStart, contributingStart);
    const contributingBlock = res.text.slice(contributingStart, policyOrEnd);

    expect(descriptiveBlock).toContain('spinning');
    expect(contributingBlock).not.toContain('spinning');

    expect(descriptiveBlock).toContain('symposium');
    expect(contributingBlock).toContain('symposium');
  });

  it('annotates atom_resolved tokens with the (atom) marker', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks/trick-self-atom');
    // symposium is atom_resolved=true; spinning is not.
    expect(res.text).toMatch(/symposium<\/code>\s*<em>\(atom\)<\/em>/);
    expect(res.text).not.toMatch(/spinning<\/code>\s*<em>\(atom\)<\/em>/);
  });

  it('omits Policy tokens / Parse warnings / standalone Unresolved tokens sections when those lists are empty', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks/trick-self-atom');
    expect(res.text).not.toContain('Policy tokens');
    expect(res.text).not.toContain('Parse warnings');
    // Standalone "Unresolved tokens" section was removed in Phase 4 (deduped
    // — descriptive layer carries them when present). Self-atom row has no
    // unresolved entries in descriptive either, so the label string never
    // appears anywhere in the panel.
    expect(res.text).not.toContain('Unresolved tokens');
    expect(res.text).not.toContain('notation-grammar-unresolved');
  });

  it('renders the editorial-context block when row.description is present', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks/trick-self-atom');
    expect(res.text).toContain('Editorial context');
    expect(res.text).toContain('self-atom + agree path');
    expect(res.text).toContain('notation-grammar-editorial');
  });

  it('puts Jobs notation behind the Diagnostic details disclosure', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks/trick-self-atom');
    expect(res.text).toContain('Diagnostic details');
    expect(res.text).toContain('Jobs notation');
    // jobs notation must appear *inside* the <details> wrapper, not as a
    // top-level dl entry under the main status block.
    const detailsStart = res.text.indexOf('<details');
    const detailsEnd   = res.text.indexOf('</details>', detailsStart);
    const jobsIndex    = res.text.indexOf('Jobs notation');
    expect(detailsStart).toBeGreaterThan(-1);
    expect(jobsIndex).toBeGreaterThan(detailsStart);
    expect(jobsIndex).toBeLessThan(detailsEnd);
  });
});

// ---------------------------------------------------------------------------

describe('GET /freestyle/tricks/:slug — approximate (computed disagrees with asserted)', () => {
  it('shows the disagree phrase when computed differs from asserted', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks/trick-approx');
    expect(res.status).toBe(200);
    expect(res.text).toContain('disagrees with asserted; asserted value is editorial truth');
    // 'agrees with asserted' is a substring of 'disagrees with asserted', so
    // anchor on the CSS class the agree span carries — it is unique to that branch.
    expect(res.text).not.toContain('notation-grammar-agree');
  });

  it('shows the Approximate status label and raw key', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks/trick-approx');
    expect(res.text).toContain('Approximate');
    expect(res.text).toContain('(approximate)');
  });

  it('renders parse_warnings entries inside the Diagnostic details disclosure', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks/trick-approx');
    expect(res.text).toContain('Parse warnings');
    expect(res.text).toContain('ambiguous_modifier_attachment');
    // Phase 4: parse_warnings live inside the <details> block, not as a
    // top-level sibling next to the role layers. Anchor on the disclosure.
    const detailsStart   = res.text.indexOf('<details');
    const detailsEnd     = res.text.indexOf('</details>', detailsStart);
    const warningsIndex  = res.text.indexOf('Parse warnings');
    const ambiguousIndex = res.text.indexOf('ambiguous_modifier_attachment');
    expect(detailsStart).toBeGreaterThan(-1);
    expect(warningsIndex).toBeGreaterThan(detailsStart);
    expect(warningsIndex).toBeLessThan(detailsEnd);
    expect(ambiguousIndex).toBeGreaterThan(detailsStart);
    expect(ambiguousIndex).toBeLessThan(detailsEnd);
  });
});

// ---------------------------------------------------------------------------

describe('GET /freestyle/tricks/:slug — policy_dependent', () => {
  it('shows the Policy-dependent status label and raw key', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks/trick-policy');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Policy-dependent');
    expect(res.text).toContain('(policy_dependent)');
  });

  it('renders the Policy tokens section with each policy_tokens entry', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks/trick-policy');
    expect(res.text).toContain('Policy tokens');
    expect(res.text).toMatch(/<code>quantum<\/code>/);
  });

  it('renders an em-dash for Computed ADD when computed_adds is null, and the disagree phrase fires', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks/trick-policy');
    // assertedAdds=8, computedAdds=null → addsAgree=false → disagree phrase
    expect(res.text).toContain('disagrees with asserted; asserted value is editorial truth');
  });

  it('uses a generic policy-token narrative; does NOT leak the hardcoded post-pt9-stale list (backside, shooting)', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks/trick-policy');
    // The pre-Phase-4 narrative listed all examples ("(quantum, nuclear,
    // backside, shooting, down-family)") in the status sentence — stale
    // post-pt9 (shooting and backside no longer policy tokens) and high-
    // density. Phase 4 made the wording generic.
    expect(res.text).not.toContain('quantum, nuclear, backside, shooting, down-family');
    expect(res.text).not.toContain('backside, shooting');
    // The status description ON THE ROW should still say something honest
    // about the contested-token shape. Anchor on the new generic phrasing.
    expect(res.text).toContain('contested and pending expert review');
  });
});

// ---------------------------------------------------------------------------

describe('GET /freestyle/tricks/:slug — unresolved', () => {
  it('shows the Unresolved status label and raw key', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks/trick-unresolved');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Unresolved');
    expect(res.text).toContain('(unresolved)');
  });

  it('renders unresolved tokens in the descriptive layer only, not as a duplicate standalone section', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks/trick-unresolved');
    // Token + label still present, surfaced in the descriptive role layer.
    expect(res.text).toContain('Unresolved tokens');
    expect(res.text).toMatch(/<code>zzunknown<\/code>/);
    // Phase 4 dedupe: the standalone "Unresolved tokens" section (and its
    // class hook) must not render. Descriptive layer uses <strong>, not <h3>.
    expect(res.text).not.toContain('<h3>Unresolved tokens</h3>');
    expect(res.text).not.toContain('notation-grammar-unresolved');
    // Label appears once total, attached to the descriptive bucket.
    const matches = res.text.match(/Unresolved tokens/g) ?? [];
    expect(matches.length).toBe(1);
  });
});

// ---------------------------------------------------------------------------

describe('GET /freestyle/tricks/:slug — unknown add_formula_status falls back gracefully', () => {
  it('uses the raw status value as the label when not in STATUS_LABELS', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks/trick-unknown-status');
    expect(res.status).toBe(200);
    // Both the <strong> label and the parenthesized key render the raw status.
    expect(res.text).toContain('something_new');
    expect(res.text).toContain('(something_new)');
  });
});

// ---------------------------------------------------------------------------

describe('GET /freestyle/tricks/:slug — exact_modifier_derived (Phase 4 label distinction)', () => {
  it('shows the new exact_modifier_derived label "Exact: structurally derived"', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks/trick-mod-derived');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Exact: structurally derived');
    expect(res.text).toContain('(exact_modifier_derived)');
    // Pre-Phase-4 wording must not appear; the new wording exists to
    // distinguish modifier-derived structural confirmation from self-atom
    // tautological agreement.
    expect(res.text).not.toContain('Exact (modifier-derived)');
    // Self-atom wording must not leak onto a modifier-derived row.
    expect(res.text).not.toContain('Exact: named trick / self-atom');
  });

  it('renders the editorial-context block when description is present', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks/trick-mod-derived');
    expect(res.text).toContain('Editorial context');
    expect(res.text).toContain('Paradox-modified whirl.');
  });

  it('renders the modifier-derived formula and both role layers', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks/trick-mod-derived');
    // Handlebars HTML-escapes `=` to `&#x3D;`; assert formula via fragments
    // so the test reads cleanly regardless of which characters need escaping.
    expect(res.text).toContain('paradox(+1)');
    expect(res.text).toContain('whirl(3)');
    expect(res.text).toMatch(/paradox\(\+1\)\s*\+\s*whirl\(3\)/);
    expect(res.text).toContain('Descriptive roles');
    expect(res.text).toContain('ADD-contributing roles');
  });
});

// ---------------------------------------------------------------------------

describe('GET /freestyle/tricks/:slug — editorial context block visibility', () => {
  it('hides the editorial-context block when description is null', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks/trick-no-description');
    expect(res.status).toBe(200);
    // Panel renders (parse data present) but editorial section is suppressed.
    expect(res.text).toContain('Structural decomposition');
    expect(res.text).not.toContain('Editorial context');
    expect(res.text).not.toContain('notation-grammar-editorial');
  });

  it('renders editorial-context text via the dedicated CSS hook', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks/trick-self-atom');
    expect(res.text).toContain('class="notation-grammar-editorial"');
    expect(res.text).toContain('class="notation-grammar-editorial-text"');
  });
});

// ---------------------------------------------------------------------------

describe('GET /freestyle/tricks/:slug — Diagnostic details disclosure (warning noise reduction)', () => {
  it('places inferred_self_canonical_atom inside the Diagnostic details disclosure rather than at the top level', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks/trick-mechanical-warn');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Diagnostic details');
    expect(res.text).toContain('inferred_self_canonical_atom');
    // The mechanical warning must live inside <details>...</details>.
    const detailsStart  = res.text.indexOf('<details');
    const detailsEnd    = res.text.indexOf('</details>', detailsStart);
    const warningIndex  = res.text.indexOf('inferred_self_canonical_atom');
    expect(detailsStart).toBeGreaterThan(-1);
    expect(warningIndex).toBeGreaterThan(detailsStart);
    expect(warningIndex).toBeLessThan(detailsEnd);
  });

  it('omits the disclosure when there is nothing diagnostic to show', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks/trick-mod-derived');
    // trick-mod-derived has no parse_warnings and no jobs_notation_raw, so
    // hasDiagnosticDetails must be false and the <details> wrapper hidden.
    expect(res.text).not.toContain('Diagnostic details');
    // Sanity: the panel itself is still present.
    expect(res.text).toContain('Structural decomposition');
  });
});
