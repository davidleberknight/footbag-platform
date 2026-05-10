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

  it('shows the exact_self_atom status label and raw key', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks/trick-self-atom');
    expect(res.text).toContain('Exact (self-atom)');
    expect(res.text).toContain('(exact_self_atom)');
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

  it('omits Policy tokens / Parse warnings / Unresolved tokens sections when those lists are empty', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks/trick-self-atom');
    expect(res.text).not.toContain('Policy tokens');
    expect(res.text).not.toContain('Parse warnings');
    expect(res.text).not.toContain('Unresolved tokens');
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

  it('renders parse_warnings entries in the Parse warnings section', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks/trick-approx');
    expect(res.text).toContain('Parse warnings');
    expect(res.text).toContain('ambiguous_modifier_attachment');
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

  it('renders the Unresolved tokens section flattened from descriptive_roles', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks/trick-unresolved');
    expect(res.text).toContain('Unresolved tokens');
    expect(res.text).toMatch(/<code>zzunknown<\/code>/);
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
