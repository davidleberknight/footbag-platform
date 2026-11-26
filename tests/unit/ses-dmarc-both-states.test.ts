/**
 * The reporting-policy record owns both of its states.
 *
 * Before the zone move the legacy zone may publish its own policy at _dmarc,
 * which the mirror must keep serving from the moment delegation lands; from
 * email day the platform publishes its own there. One resource holds both, so
 * the mail-day apply updates the record in place. Split across two resources,
 * the mail-day apply would create a second record at a name that already holds
 * one, and fail inside the cutover window.
 *
 * This reads the record's declared count and value expressions and evaluates
 * the count over the states the sequence passes through, so a record that
 * vanishes while the legacy policy is published, or exists while nothing should
 * be served, fails here rather than in the apply that needed it.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { hclBlocks } from '../fixtures/hclBlocks';

const SES = readFileSync(resolve(__dirname, '../..', 'terraform/production/ses.tf'), 'utf-8');

interface State {
  ses_enable_mail_records: boolean;
  enable_legacy_mirror_records: boolean;
  legacy_dmarc_txt: string;
}

function dmarcBlock(): string {
  const block = hclBlocks(SES, 'resource').find((b) => b.type === 'aws_route53_record' && b.name === 'dmarc');
  expect(block, 'the reporting-policy record is not declared').toBeDefined();
  return block!.body;
}

/** Evaluates the declared count over one state; only flags, the one string and boolean operators are admitted. */
function count(state: State): number {
  const m = /^\s*count\s*=\s*(.+?)\s*\?\s*1\s*:\s*0\s*$/m.exec(dmarcBlock());
  expect(m, 'the record count is not a single condition').not.toBeNull();
  const expr = m![1]!
    .replace(/var\.legacy_dmarc_txt\s*!=\s*""/g, String(state.legacy_dmarc_txt !== ''))
    .replace(/var\.([a-z_]+)/g, (_, name: string) => {
      expect(name in state, `the count reads var.${name}, which this table does not set`).toBe(true);
      return String(state[name as keyof State]);
    });
  expect(expr, 'the count uses more than boolean flags and operators').toMatch(/^[\s()!&|truefals]+$/);
  return (new Function(`return (${expr});`)() as boolean) ? 1 : 0;
}

describe('the reporting-policy record', () => {
  it('exists exactly when a policy is to be served', () => {
    const cases: Array<[string, State, number]> = [
      // Defect caught: a record appears in the zone-move window when the legacy
      // zone publishes none, so the mirror serves a policy the legacy zone does not.
      ['the zone-move window, no legacy policy', { ses_enable_mail_records: false, enable_legacy_mirror_records: true, legacy_dmarc_txt: '' }, 0],
      // Defect caught: the legacy policy stops being served the moment delegation moves.
      ['the zone-move window, a legacy policy', { ses_enable_mail_records: false, enable_legacy_mirror_records: true, legacy_dmarc_txt: 'v=DMARC1; p=none' }, 1],
      // Defect caught: email day publishes no policy.
      ['email day', { ses_enable_mail_records: true, enable_legacy_mirror_records: true, legacy_dmarc_txt: 'v=DMARC1; p=none' }, 1],
      // Defect caught: the launch apply, which clears the mirror, takes the
      // platform's own policy with it.
      ['after the launch apply', { ses_enable_mail_records: true, enable_legacy_mirror_records: false, legacy_dmarc_txt: 'v=DMARC1; p=none' }, 1],
    ];
    for (const [label, state, want] of cases) {
      expect(count(state), label).toBe(want);
    }
  });

  it('serves the legacy policy until email day and the platform policy from it, in one resource', () => {
    // Defect caught: the legacy value is held by a second resource, so the
    // mail-day apply creates a record at a name that already has one.
    const body = dmarcBlock();
    expect(body).toMatch(/var\.ses_enable_mail_records\s*\?\s*"v=DMARC1; p=\$\{var\.ses_dmarc_policy\}/);
    expect(body).toMatch(/:\s*var\.legacy_dmarc_txt\s*\]/);
    const elsewhere = hclBlocks(SES, 'resource').filter((b) => b.name !== 'dmarc' && /_dmarc\./.test(b.body));
    expect(elsewhere.map((b) => b.name), 'another resource writes _dmarc').toEqual([]);
  });
});
