/**
 * The guard that stops the legacy mirror being switched off on its own.
 *
 * The apex address, www, the apex mail routing and the apex sender policy each
 * exist while the mirror flag is on or their switched state is. So the mirror
 * flag turned off before the record switch and the mail apply have both run
 * deletes them, and every mirrored legacy name, in one apply. Once the
 * delegation points at this zone that is the live legacy site and its mail
 * gone, from a one-word slip in the values file.
 *
 * The cutover scripts refuse that state on their own paths; a hand edit or any
 * other apply path meets only the precondition on the hosted zone. This file
 * reads that precondition as declared and evaluates it over the flag states
 * the sequence actually passes through, so a guard deleted, inverted or
 * weakened fails here rather than in the apply that needed it.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { hclBlocks } from '../fixtures/hclBlocks';

const ROUTE53 = readFileSync(resolve(__dirname, '../..', 'terraform/production/route53.tf'), 'utf-8');

interface Flags {
  enable_legacy_mirror_records: boolean;
  enable_platform_custom_domain: boolean;
  enable_apex_alias_records: boolean;
  ses_enable_mail_records: boolean;
}

/** The zone's precondition condition, as written in the tree. */
function declaredCondition(): string {
  const zone = hclBlocks(ROUTE53, 'resource').find((b) => b.type === 'aws_route53_zone' && b.name === 'primary');
  expect(zone, 'the production hosted zone is not declared').toBeDefined();
  const conditions = [...zone!.body.matchAll(/^\s*condition\s*=\s*(.+)$/gm)].map((m) => m[1]!.trim());
  const mirror = conditions.filter((c) => c.includes('var.enable_legacy_mirror_records'));
  expect(mirror, 'the hosted zone carries no precondition on the mirror flag').toHaveLength(1);
  return mirror[0]!;
}

/** local.apex_alias_mode as declared, since the guard reads it. */
function declaredAliasMode(): string {
  const m = /^\s*apex_alias_mode\s*=\s*(.+)$/m.exec(ROUTE53);
  expect(m, 'local.apex_alias_mode is not declared').not.toBeNull();
  return m![1]!.trim();
}

/**
 * Evaluates a declared expression over boolean flags. Only `var.<flag>`,
 * `local.apex_alias_mode`, `&&`, `||`, `!` and parentheses are admitted, which
 * is all either expression uses; anything else fails rather than being guessed.
 */
function evaluate(expression: string, flags: Flags): boolean {
  const alias = declaredAliasMode();
  const substituted = expression
    .replace(/local\.apex_alias_mode/g, `(${alias})`)
    .replace(/var\.([a-z_]+)/g, (_, name: string) => {
      expect(name in flags, `the expression reads var.${name}, which this table does not set`).toBe(true);
      return String(flags[name as keyof Flags]);
    });
  expect(substituted, 'the expression uses more than boolean flags and operators').toMatch(/^[\s()!&|truefals]+$/);
  return new Function(`return (${substituted});`)() as boolean;
}

const off: Flags = {
  enable_legacy_mirror_records: false,
  enable_platform_custom_domain: false,
  enable_apex_alias_records: false,
  ses_enable_mail_records: false,
};

describe('the hosted zone refuses the mirror flag turned off on its own', () => {
  it('admits every state the cutover sequence passes through', () => {
    const states: Array<[string, Flags]> = [
      // Defect caught: the guard blocks the zone-move window itself, so no apply
      // can run while the legacy site is served from the mirror.
      ['the zone-move window', { ...off, enable_legacy_mirror_records: true }],
      // Defect caught: the guard blocks the record switch or the mail apply,
      // which both run with the mirror still on.
      ['after the record switch', { ...off, enable_legacy_mirror_records: true, enable_platform_custom_domain: true, enable_apex_alias_records: true }],
      ['after the mail apply', { enable_legacy_mirror_records: true, enable_platform_custom_domain: true, enable_apex_alias_records: true, ses_enable_mail_records: true }],
      // Defect caught: the launch apply, the one change meant to clear the
      // mirror, is refused, so go-live cannot retire the legacy names.
      ['the launch apply', { enable_legacy_mirror_records: false, enable_platform_custom_domain: true, enable_apex_alias_records: true, ses_enable_mail_records: true }],
    ];
    for (const [label, flags] of states) {
      expect(evaluate(declaredCondition(), flags), `refused: ${label}`).toBe(true);
    }
  });

  it('refuses the mirror off while anything still rides it', () => {
    const states: Array<[string, Flags]> = [
      // Defect caught: a values-file slip deletes the apex, www, the apex mail
      // records and every legacy name while the legacy site is live.
      ['every flag off', off],
      // Defect caught: the apex MX and sender policy go before mail has moved,
      // so inbound mail to the domain stops.
      ['the record switch done, mail not moved', { ...off, enable_platform_custom_domain: true, enable_apex_alias_records: true }],
      // Defect caught: the apex address and www go while they still serve the
      // legacy site.
      ['mail moved, the record switch not made', { ...off, ses_enable_mail_records: true }],
      // Defect caught: the alias flag alone does not switch the apex (it needs
      // the custom domain as well), so the apex and www would be deleted.
      ['the alias flag without the custom domain', { ...off, enable_apex_alias_records: true, ses_enable_mail_records: true }],
    ];
    for (const [label, flags] of states) {
      expect(evaluate(declaredCondition(), flags), `admitted: ${label}`).toBe(false);
    }
  });
});
