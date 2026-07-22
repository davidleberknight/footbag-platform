import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

/**
 * Administrator-configurable system parameters have their normative defaults
 * defined in the Configurable Parameters section of the user-stories document
 * and are seeded into the system_config table at initial database creation.
 * The two lists must stay in lockstep: a key seeded in schema.sql that is not
 * documented, or a documented seeded-default that is not seeded, is drift this
 * test fails on. Where both sides express a plain integer default, the values
 * must also match.
 *
 * This is deliberately narrow: it verifies only the documented seeded-default
 * contract. It does not attempt to discover every runtime configuration read in
 * application source.
 */

const schemaPath = path.join(process.cwd(), 'database', 'schema.sql');
const storiesPath = path.join(process.cwd(), 'docs', 'USER_STORIES.md');

// A system_config seed tuple is (id, created_at, config_key, value_json,
// effective_start_at, reason_text, changed_by_member_id). Every seed id starts
// with 'seed-', and config_key + value_json share the third VALUES line.
function schemaSeededDefaults(): Map<string, string> {
  const sql = fs.readFileSync(schemaPath, 'utf8');
  const re =
    /'seed-[a-z0-9-]+',\s*\n\s*'[^']*',\s*\n\s*'([a-z0-9_]+)',\s*'([^']*)',/g;
  const out = new Map<string, string>();
  for (const m of sql.matchAll(re)) out.set(m[1]!, m[2]!);
  return out;
}

// The Configurable Parameters section is the run of bullet lines under the
// heading that names it, up to the next top-level heading. Each seeded-default
// bullet reads `- ` + backtick + `key = value` + backtick.
function documentedDefaults(): Map<string, string> {
  const md = fs.readFileSync(storiesPath, 'utf8');
  const lines = md.split('\n');
  const start = lines.findIndex(l => /^##\s+.*Configurable Parameters/.test(l));
  if (start < 0) throw new Error('Configurable Parameters heading not found');
  const out = new Map<string, string>();
  for (let i = start + 1; i < lines.length; i++) {
    if (/^##\s/.test(lines[i]!)) break;
    const m = lines[i]!.match(/^- `([a-z0-9_]+)\s*=\s*([^`]+)`/);
    if (m) out.set(m[1]!, m[2]!.trim());
  }
  return out;
}

// A plain-integer default on both sides is comparable; a documented value with
// a unit suffix ("730 days") compares on its leading integer, which is what
// the schema stores as value_json.
function leadingInt(value: string): number | null {
  const m = value.match(/^(\d+)\b/);
  return m ? Number(m[1]) : null;
}

describe('system_config seed / Configurable Parameters parity', () => {
  const seeded = schemaSeededDefaults();
  const documented = documentedDefaults();

  it('every documented seeded-default is seeded in schema.sql', () => {
    const missingFromSchema = [...documented.keys()]
      .filter(k => !seeded.has(k))
      .sort();
    expect(missingFromSchema, `documented but not seeded: ${missingFromSchema.join(', ')}`)
      .toEqual([]);
  });

  it('every seeded system_config key is documented as a configurable parameter', () => {
    const missingFromDocs = [...seeded.keys()]
      .filter(k => !documented.has(k))
      .sort();
    expect(missingFromDocs, `seeded but not documented: ${missingFromDocs.join(', ')}`)
      .toEqual([]);
  });

  it('documented and seeded integer defaults agree', () => {
    const mismatches: string[] = [];
    for (const [key, docValue] of documented) {
      const seededValue = seeded.get(key);
      if (seededValue === undefined) continue; // covered by the direction tests
      const docInt = leadingInt(docValue);
      const seededInt = leadingInt(seededValue);
      if (docInt === null || seededInt === null) continue; // not both integers
      if (docInt !== seededInt) {
        mismatches.push(`${key}: documented ${docInt} vs seeded ${seededInt}`);
      }
    }
    expect(mismatches, `default-value mismatches: ${mismatches.join('; ')}`).toEqual([]);
  });
});
