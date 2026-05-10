/**
 * Phase 3.5 audit-rendering helper. Renders the notation-grammar diagnostic
 * panel for a curated set of representative trick slugs against the live dev
 * DB, then writes a Markdown scaffold (`semantic-audit-notes.md`) with the
 * captured panel text and empty notes sections.
 *
 * Read-only. Does not modify the DB. Re-runnable any time the parser corpus
 * advances; will overwrite the scaffold.
 *
 * Run: `npx tsx scripts/audit-notation-grammar.ts`
 */
import fs from 'fs';
import path from 'path';

// ── Environment defaults ─────────────────────────────────────────────────────
// Mirror tests/setup-env.ts, but point at the real dev DB for realistic capture.
process.env.NODE_ENV               ??= 'development';
process.env.LOG_LEVEL              ??= 'error';
process.env.PORT                   ??= '3999';
process.env.FOOTBAG_DB_PATH        ??= path.join(process.cwd(), 'database', 'footbag.db');
process.env.PUBLIC_BASE_URL        ??= 'http://localhost:3999';
process.env.SESSION_SECRET         ??= 'audit-script-session-secret';
process.env.JWT_SIGNER             ??= 'local';
process.env.JWT_LOCAL_KEYPAIR_PATH ??= path.join(
  require('os').tmpdir(),
  `audit-script-jwt-${process.pid}.pem`,
);
process.env.SES_ADAPTER            ??= 'stub';
process.env.AWS_REGION             ??= 'us-east-1';
process.env.INTERNAL_EVENT_SECRET  ??= 'audit-script-internal-event-secret';
process.env.STUB_PASSWORD          ??= 'audit-script-stub-password';

// ── Picklist (25 slugs, by bucket) ───────────────────────────────────────────
interface Pick {
  slug:   string;
  reason: string;
}

interface Bucket {
  key:    string;
  title:  string;
  intro:  string;
  picks:  Pick[];
}

const BUCKETS: Bucket[] = [
  {
    key:   'A',
    title: 'self-atom — surface atoms',
    intro: 'Single-token surface or body atoms; the simplest self-atom case. Looking for: does the atom annotation read clearly without erasing meaningful structure?',
    picks: [
      { slug: 'head-stall',            reason: 'surface family with `unusual_surface` token resolved as atom — simplest case' },
      { slug: 'knee-clipper',          reason: 'looks compositional (`knee` + `clipper`) but treated as one atom — does the panel hide that, and should it?' },
      { slug: 'cross-body-sole-stall', reason: 'longest self-atom name; tests whether multi-token core_family reads coherently' },
      { slug: 'cloud-kick',            reason: 'recently activated row; sanity-check parser handles fresh additions' },
    ],
  },
  {
    key:   'B',
    title: 'self-atom — compound / multi-component atoms',
    intro: 'Tricks whose names parse as compound but the parser absorbs the components into a single canonical atom. Looking for: does the descriptive vs ADD-contributing split clarify or obscure?',
    picks: [
      { slug: 'double-leg-over', reason: '"double" reads like a modifier but is absorbed by the atom' },
      { slug: 'atom-smasher',    reason: 'idiomatic compound (mirage base) — does the self-atom verdict feel earned?' },
      { slug: 'food-processor',  reason: 'highest-ADD self-atom; tests scaling for higher numbers' },
      { slug: 'surging',         reason: 'category=compound but base_trick is empty — atypical metadata; how does the panel handle a missing base?' },
      { slug: 'dada-curve',      reason: 'recently activated; no base_trick, no canonical decomposition — honesty test for parser limits' },
      { slug: 'sailing',         reason: 'Red pt9 newly-active set primitive (2 ADD, Pixie Quantum equivalence); single-token canonical parallel to quantum but with pt9-resolved ontology — does the panel reflect set-primitive shape cleanly?' },
    ],
  },
  {
    key:   'C',
    title: 'self-atom — directional / rotational-adjacent',
    intro: 'Looking for: is the rotational-family connection visible to the reader when the parser still calls the row a self-atom?',
    picks: [
      { slug: 'around-the-world', reason: 'three-word directional atom; unusual_surface interaction' },
      { slug: 'rev-up',           reason: 'classified as whirl family but parser reports self-atom' },
    ],
  },
  {
    key:   'D',
    title: 'modifier-derived — base tricks (rotational + non-rotational)',
    intro: 'Base tricks and their direct modifier compositions. Looking for: rendering scales gracefully across modifier density; non-rotational vs rotational base reads cleanly.',
    picks: [
      { slug: 'whirl',                    reason: 'canonical rotational base, no modifier — the "what does this row even need a panel for" baseline' },
      { slug: 'butterfly',                reason: 'non-rotational base trick anchoring a large family; contrast row to whirl' },
      { slug: 'paradox-whirl',            reason: 'classic single-modifier on rotational base; paradox is policy-adjacent' },
      { slug: 'spinning-whirl',           reason: 'spinning bonus is rotational-aware' },
      { slug: 'spinning-symposium-whirl', reason: 'doubly-modified rotational compound — densest descriptive layer in the corpus' },
      { slug: 'mobius',                   reason: 'torque-family compound whose name doesn\'t look compositional — does the panel reveal hidden ontology?' },
      { slug: 'gauntlet',                 reason: 'highest-ADD modifier-derived row in the corpus; rendering stress test' },
    ],
  },
  {
    key:   'E',
    title: 'modifier-derived — candidate-core',
    intro: 'Tricks whose names look like base-level identities but the data classifies them as derivatives of an upstream base. Looking for: does the panel hint at productive-multiplicity or hide ontology complexity?',
    picks: [
      { slug: 'blur',      reason: 'mirage-derived per data — does the panel hint at productive-multiplicity?' },
      { slug: 'ripwalk',   reason: 'butterfly-derived per data' },
      { slug: 'barfly',    reason: 'infinity listed as base_trick (infinity is not itself a dictionary row — exposes any downstream link issue)' },
      { slug: 'blurriest', reason: 'barfly-derived; chain through a candidate-core row — does the simplification compound?' },
      { slug: 'sumo',      reason: 'Red pt9 newly-active named compound (5 ADD, base=mirage, modifier_links=nuclear); tests whether candidate-core panel reads coherently for the Nuclear-Mirage / X-Dex productive-multiplicity case' },
    ],
  },
  {
    key:   'F',
    title: 'approximate (full universe)',
    intro: 'The only row whose computed ADD disagrees with the asserted value. Looking for: does the disagreement read educational, or alarming?',
    picks: [
      { slug: 'barraging-osis', reason: 'computed=4, asserted=5; the only approximate row in the corpus' },
    ],
  },
  {
    key:   'G',
    title: 'policy_dependent (full universe)',
    intro: 'The two rows carrying a policy token. Looking for: does the uncertainty read honest without making the system feel unreliable?',
    picks: [
      { slug: 'quantum',  reason: 'quantum policy token on a self-atomized row' },
      { slug: 'shooting', reason: 'shooting policy token, no base_trick — different shape from quantum' },
    ],
  },
];

// ── HTML extraction + flattening ─────────────────────────────────────────────

function decodeEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-fA-F]+);/g, (_m, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_m, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&mdash;/g, '—')
    .replace(/&ndash;/g, '–')
    .replace(/&middot;/g, '·')
    .replace(/&ldquo;/g, '"')
    .replace(/&rdquo;/g, '"')
    .replace(/&copy;/g, '©')
    .replace(/&nbsp;/g, ' ');
}

/**
 * Pull just the notation-grammar panel HTML from a full rendered page. Returns
 * an empty string when the panel isn't present (no parser data on this slug).
 */
function extractPanelHtml(pageHtml: string): string {
  const startMatch = pageHtml.match(
    /<section[^>]*class="[^"]*notation-grammar-panel[^"]*"[^>]*>/,
  );
  if (!startMatch || startMatch.index === undefined) return '';
  const start = startMatch.index;
  // Walk forward, balancing <section>/</section>. The template doesn't nest
  // <section> inside the panel, but match generically for safety.
  let depth = 0;
  const re = /<\/?section\b[^>]*>/g;
  re.lastIndex = start;
  let lastEnd = -1;
  let m: RegExpExecArray | null;
  while ((m = re.exec(pageHtml)) !== null) {
    if (m[0].startsWith('</')) {
      depth -= 1;
      if (depth === 0) { lastEnd = m.index + m[0].length; break; }
    } else {
      depth += 1;
    }
  }
  if (lastEnd === -1) return '';
  return pageHtml.slice(start, lastEnd);
}

/**
 * Flatten panel HTML into a readable plaintext block. Preserves the visual
 * hierarchy enough for human review without the full DOM.
 */
function flattenPanelHtml(html: string): string {
  let s = html;

  // Headings → emphasized standalone lines.
  s = s.replace(/<h2\b[^>]*>([\s\S]*?)<\/h2>/g, '\n## $1\n');
  s = s.replace(/<h3\b[^>]*>([\s\S]*?)<\/h3>/g, '\n### $1\n');

  // <dt>/<dd> pairs → "Label: value".
  s = s.replace(/<dt\b[^>]*>([\s\S]*?)<\/dt>\s*<dd\b[^>]*>([\s\S]*?)<\/dd>/g,
    (_full, label, value) => `\n${stripTags(label).trim()}: ${stripTags(value).trim()}`);

  // <li> → single-line bullet. The template's <li> inner is multi-line (label
  // strong + whitespace + comma-joined codes); collapse internal whitespace so
  // each bullet stays on one line in the captured plaintext.
  s = s.replace(/<li\b[^>]*>([\s\S]*?)<\/li>/g, (_full, inner) => {
    const oneLine = stripTags(inner).replace(/\s+/g, ' ').trim();
    return `\n  - ${oneLine}`;
  });

  // <code> → backtick form (kept inline-safe).
  s = s.replace(/<code\b[^>]*>([\s\S]*?)<\/code>/g, '`$1`');

  // <em>(atom)</em> survives stripTags as "(atom)".
  s = stripTags(s);
  s = decodeEntities(s);

  // Normalize whitespace.
  s = s.replace(/[ \t]+/g, ' ');
  s = s.replace(/[ \t]*\n[ \t]*/g, '\n');
  s = s.replace(/\n{3,}/g, '\n\n');
  return s.trim();
}

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, '');
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  // Defer imports until env is set.
  // eslint-disable-next-line @typescript-eslint/consistent-type-imports
  const request = (await import('supertest')).default;
  const { createApp } = await import('../src/app');

  const app = createApp();

  const out: string[] = [];
  out.push('# Semantic Audit Notes -- Phase 3.5');
  out.push('');
  out.push('Sprint-scoped audit of the live notation-grammar diagnostic panel rendered on `/freestyle/tricks/:slug`. Not a long-term canonical doc; findings flow into IP / parser / template iterations and this file gets retired when the audit is closed.');
  out.push('');
  out.push('## How to use');
  out.push('');
  out.push('Each section captures the structural-decomposition panel as it currently renders for one trick. The **Rendered panel** block is plain-text-flattened HTML from a real page render. The **Notes** block is for judgement: confusing wording, noisy warnings, misleading separations, missing semantics, progressive-disclosure opportunities.');
  out.push('');
  out.push('Status legend: `exact_modifier_derived` · `exact_self_atom` · `approximate` · `policy_dependent`.');
  out.push('');

  for (const bucket of BUCKETS) {
    out.push('---');
    out.push('');
    out.push(`## ${bucket.key}. ${bucket.title}`);
    out.push('');
    out.push(`_${bucket.intro}_`);
    out.push('');

    for (const pick of bucket.picks) {
      const url = `/freestyle/tricks/${pick.slug}`;
      // eslint-disable-next-line no-await-in-loop
      const res = await request(app).get(url);

      out.push(`### \`${pick.slug}\``);
      out.push('');
      out.push(`_Why selected:_ ${pick.reason}`);
      out.push('');
      out.push(`_Page status:_ HTTP ${res.status}`);
      out.push('');

      if (res.status !== 200) {
        out.push('**Rendered panel:** _(page did not return 200; no capture)_');
        out.push('');
      } else {
        const panelHtml = extractPanelHtml(res.text);
        if (!panelHtml) {
          out.push('**Rendered panel:** _(no notation-grammar panel rendered for this slug; row has no `structural_parse_json`, or the JSON is unparseable)_');
        } else {
          const flat = flattenPanelHtml(panelHtml);
          out.push('**Rendered panel:**');
          out.push('');
          out.push('```');
          out.push(flat);
          out.push('```');
        }
        out.push('');
      }

      out.push('**Notes:**');
      out.push('');
      out.push('_(empty)_');
      out.push('');
    }
  }

  const target = path.join(process.cwd(), 'semantic-audit-notes.md');
  fs.writeFileSync(target, out.join('\n'), 'utf8');
  // eslint-disable-next-line no-console
  console.error(`Wrote ${target} (${out.length} lines)`);
}

main().catch(err => {
  // eslint-disable-next-line no-console
  console.error('Audit script failed:', err);
  process.exit(1);
});
