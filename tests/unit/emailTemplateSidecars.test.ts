import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  listEmailTemplateKeys,
  emailTemplateMergeFields,
  emailTemplateDefaultClassification,
} from '../../src/services/emailTemplateRegistry';

// Conformance drift gate between the committed sidecars (the pre-go-live
// source of truth for template wording) and the code registry (the source of
// truth for which templates exist and which merge fields each may use). Every
// registered variant key has exactly one sidecar and vice versa; every {token}
// in a sidecar's subject or body is declared for that key and every declared
// field is used; the classification matches the registry default; and no
// conditional-syntax artifact survives — templates are logic-less plain text.

const SIDECAR_DIR = join(process.cwd(), 'curated', 'email_templates');

interface Sidecar {
  templateKey: string;
  subjectTemplate: string;
  bodyTemplate: string;
  piiClassification: string;
  isEnabled: boolean;
}

function loadSidecars(): Map<string, Sidecar> {
  const out = new Map<string, Sidecar>();
  for (const file of readdirSync(SIDECAR_DIR).filter((f) => f.endsWith('.json')).sort()) {
    out.set(file.replace(/\.json$/, ''), JSON.parse(readFileSync(join(SIDECAR_DIR, file), 'utf8')) as Sidecar);
  }
  return out;
}

function tokensIn(text: string): string[] {
  return [...text.matchAll(/\{([a-z][a-zA-Z0-9]*)\}/g)].map((m) => m[1]!);
}

describe('email template sidecars conform to the registry', () => {
  const sidecars = loadSidecars();

  it('the sidecar set and the registered variant-key set are identical', () => {
    expect([...sidecars.keys()].sort()).toEqual(listEmailTemplateKeys());
  });

  it('every sidecar stem equals its templateKey and carries valid fields', () => {
    for (const [stem, s] of sidecars) {
      expect(s.templateKey, stem).toBe(stem);
      expect(s.subjectTemplate.trim().length, stem).toBeGreaterThan(0);
      expect(s.bodyTemplate.trim().length, stem).toBeGreaterThan(0);
      expect(typeof s.isEnabled, stem).toBe('boolean');
    }
  });

  it('every sidecar classification matches the registry default', () => {
    for (const [stem, s] of sidecars) {
      expect(s.piiClassification, stem).toBe(emailTemplateDefaultClassification(stem));
    }
  });

  it('sidecar tokens and the declared merge-field set match exactly', () => {
    for (const [stem, s] of sidecars) {
      const declared = [...(emailTemplateMergeFields(stem) ?? [])].sort();
      const used = [...new Set([...tokensIn(s.subjectTemplate), ...tokensIn(s.bodyTemplate)])].sort();
      expect(used, `${stem}: template tokens vs declared merge fields`).toEqual(declared);
    }
  });

  it('two variants of one send key never share a body: each says its own thing', () => {
    // Variant keys exist precisely because the wording differs; two variants
    // with the same body means the shaper is choosing between identical
    // messages and one of them is not doing its job. The Active Player pair is
    // the case that motivated the check: the notice sent once the status has
    // ended must not repeat the reminder sent while it was still current.
    const bodies = new Map<string, string>();
    for (const [stem, s] of sidecars) {
      const normalized = s.bodyTemplate.trim();
      const twin = bodies.get(normalized);
      expect(twin, `${stem} and ${twin} carry identical bodies`).toBeUndefined();
      bodies.set(normalized, stem);
    }
  });

  it('the Active Player ending notice speaks in the past tense', () => {
    const dayOf = sidecars.get('active_player_expiry_day_of')!;
    expect(dayOf.bodyTemplate).toContain('ended on {displayDate}');
    expect(dayOf.bodyTemplate).not.toContain('expires on');
    expect(dayOf.subjectTemplate).not.toContain('expires');
    // It must also name what the member can no longer do, not merely announce
    // the ending.
    expect(dayOf.bodyTemplate).toContain('Official IFPA Roster');
  });

  it('no sidecar carries conditional-syntax artifacts', () => {
    for (const [stem, s] of sidecars) {
      for (const text of [s.subjectTemplate, s.bodyTemplate]) {
        expect(text.includes('{{'), `${stem}: doubled braces`).toBe(false);
        expect(text.includes('}}'), `${stem}: doubled braces`).toBe(false);
        expect(/\{[#/^]/.test(text), `${stem}: section/conditional syntax`).toBe(false);
      }
    }
  });
});
