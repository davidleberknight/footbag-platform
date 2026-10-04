/**
 * The staging firewall keeps the administrators' SSH addresses on both SSH
 * ports, whatever the dev-and-testers' parameters hold.
 *
 * Both SSH ports read one joined list. If either port read only the
 * dev-and-testers' addresses, or the join dropped the administrators' list, the
 * next apply would lock every administrator out of staging over SSH, with the
 * plan showing nothing but a firewall replacement.
 *
 * Read from the HCL as text, as the job-role policy tests are: the suite has no
 * initialized tree and no credential, by design.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const source = readFileSync(resolve(__dirname, '../../terraform/staging/lightsail.tf'), 'utf-8');

/** Each port_info block's text, keyed by its from_port. */
function portBlocks(): Map<number, string> {
  const out = new Map<number, string>();
  for (const m of source.matchAll(/\n\s+port_info \{([\s\S]*?)\n\s+\}/g)) {
    const port = /from_port\s+=\s+(\d+)/.exec(m[1]);
    expect(port, 'a port_info block with no from_port').toBeTruthy();
    out.set(Number(port![1]), m[1]);
  }
  return out;
}

describe('the staging firewall keeps the administrators on SSH', () => {
  it('joins the administrators\' list ahead of the dev-and-testers\' and drops neither', () => {
    expect(source).toMatch(
      /\n\s+ssh_cidrs\s+=\s+distinct\(concat\(var\.operator_cidrs, local\.dev_tester_cidrs\)\)/,
    );
  });

  it('admits that joined list, and only it, on both SSH ports', () => {
    const blocks = portBlocks();
    for (const port of [22, 2222]) {
      const block = blocks.get(port);
      expect(block, `no port_info for ${port}`).toBeTruthy();
      expect(block, `port ${port}`).toMatch(/\n\s+cidrs\s+=\s+local\.ssh_cidrs\s*(\n|$)/);
    }
  });
});
