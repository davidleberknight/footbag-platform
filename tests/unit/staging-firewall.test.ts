/**
 * The staging firewall keeps the administrators' SSH addresses on both SSH
 * ports, and the dev-and-testers' on the routine port, whatever their
 * parameters hold.
 *
 * Port 2222, which every routine connection uses, reads the joined list; port
 * 22 reads the administrators' list beside the Lightsail console alias. If
 * 2222 read only the dev-and-testers' addresses, or the join dropped the
 * administrators' list, the next apply would lock every administrator out of
 * staging over SSH; if it dropped the dev-and-testers', they would be locked
 * out. Port 22 listing the dev-and-testers as well is what overran the
 * instance's address cap, and leaving it empty could admit every address.
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

  it('admits that joined list, and only it, on the routine SSH port', () => {
    const block = portBlocks().get(2222);
    expect(block, 'no port_info for 2222').toBeTruthy();
    expect(block, 'port 2222').toMatch(/\n\s+cidrs\s+=\s+local\.ssh_cidrs\s*(\n|$)/);
  });

  it('admits the administrators\' list and the console alias, and nothing wider, on port 22', () => {
    const block = portBlocks().get(22);
    expect(block, 'no port_info for 22').toBeTruthy();
    expect(block, 'port 22').toMatch(/\n\s+cidrs\s+=\s+var\.operator_cidrs\s*(\n|$)/);
    expect(block, 'port 22').toMatch(/cidr_list_aliases\s+=\s+\["lightsail-connect"\]/);
  });
});

describe('a replaced instance keeps its address and its firewall, in both trees', () => {
  // A replacement keeps the instance's name, so neither the static address's
  // attachment nor the firewall plans a change from instance_name alone, while
  // Lightsail detaches the address from the instance it deletes and starts the
  // new one on its default rules with SSH and HTTP open to every address.
  // Defect caught: either resource stops being replaced with the instance, or is
  // triggered by the whole instance, whose in-place updates (tags, the snapshot
  // add-on) would then detach the address from a running host.
  const resourceBlock = (tf: string, type: string): string => {
    const start = tf.indexOf(`resource "${type}" "web"`);
    expect(start, type).toBeGreaterThan(-1);
    const next = tf.indexOf('\nresource "', start + 1);
    return tf.slice(start, next === -1 ? undefined : next);
  };
  for (const tree of ['staging', 'production']) {
    const tf = readFileSync(resolve(__dirname, `../../terraform/${tree}/lightsail.tf`), 'utf-8');
    for (const type of ['aws_lightsail_static_ip_attachment', 'aws_lightsail_instance_public_ports']) {
      it(`${tree}: ${type} is replaced when the instance's ARN changes, and only then`, () => {
        expect(resourceBlock(tf, type)).toMatch(/\n\s+replace_triggered_by\s+=\s+\[aws_lightsail_instance\.web\.arn\]/);
      });
    }
  }
});
