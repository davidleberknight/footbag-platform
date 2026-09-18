/**
 * scripts/lib/egress-allowlist.sh — whether this workstation can still reach the
 * host's SSH port, asked once for the tree.
 *
 * Two operator scripts ask it immediately before handing off to a deploy, and
 * both used to ask it of the local Terraform values file: one matched the
 * address as a fixed string but carried on when the address lookup failed, the
 * other stopped on a failed lookup but matched as an unanchored regex, so
 * 1.2.3.4 passed against an entry for 51.2.3.4/32 by substring alone. Neither
 * read AWS, neither could tell that an address fell inside a wider range, and
 * neither could see a source-IP alias.
 *
 * The cases that matter most in a year are the ones no grep could have answered:
 * an address admitted on port 22 but not on the port the deploy actually uses,
 * and a lookup that fails answering "unknown" rather than "fine". The second is
 * the one that stranded a deploy part-way through its remote half.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { writeFileSync, chmodSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

import { SPAWN_GUARD } from '../fixtures/spawnGuard';
import { NO_AWS_CREDENTIALS } from '../fixtures/awsIsolation';
import { createScratchDir, removeScratch } from '../fixtures/scratchDir';

const LIB = join(process.cwd(), 'scripts/lib/egress-allowlist.sh');

let scratch: string;
let binDir: string;

beforeEach(() => {
  scratch = createScratchDir('egress-allowlist');
  binDir = join(scratch, 'bin');
  mkdirSync(binDir, { recursive: true });
});

afterEach(() => {
  removeScratch(scratch);
});

function writeExecutable(path: string, lines: string[]): string {
  writeFileSync(path, `#!/usr/bin/env bash\n${lines.join('\n')}\n`, 'utf-8');
  chmodSync(path, 0o755);
  return path;
}

/**
 * An `ssh` that answers the configuration query, on PATH ahead of the stub the
 * shared machine-isolation declaration installs. Without one the alias does not
 * resolve, which is a clean runner's condition and its own case below.
 */
function stubSshOnPath(port: number, hostname = '198.51.100.4'): void {
  writeExecutable(join(binDir, 'ssh'), [
    'for a in "$@"; do',
    '  if [[ "$a" == "-G" ]]; then',
    `    printf 'hostname ${hostname}\\nuser dave\\nport ${port}\\n'`,
    '    exit 0',
    '  fi',
    'done',
    'exit 255',
  ]);
}

/** A lookup that answers with one address, or fails outright. */
function checkipStub(address: string | null): string {
  const path = join(scratch, 'checkip.sh');
  return writeExecutable(path, address === null ? ['exit 1'] : [`echo "${address}"`]);
}

interface PortRule {
  fromPort: number;
  toPort: number;
  protocol?: string;
  cidrs?: string[];
  cidrListAliases?: string[];
}

/** An `aws` answering get-instance-port-states with the given firewall. */
function awsStub(portStates: PortRule[] | 'refuses' | 'gibberish'): string {
  const path = join(scratch, 'aws-stub.sh');
  if (portStates === 'refuses') {
    return writeExecutable(path, [
      'echo "An error occurred (AccessDeniedException) when calling GetInstancePortStates" >&2',
      'exit 254',
    ]);
  }
  if (portStates === 'gibberish') {
    return writeExecutable(path, ['echo "<html>not json</html>"']);
  }
  return writeExecutable(path, [`cat <<'JSON'\n${JSON.stringify({ portStates })}\nJSON`]);
}

interface LibResult {
  status: number | null;
  stdout: string;
  stderr: string;
}

function callLib(body: string, env: NodeJS.ProcessEnv = {}): LibResult {
  const res = spawnSync('bash', ['-c', `set -euo pipefail; source "${LIB}"; ${body}`], {
    encoding: 'utf-8',
    env: {
      ...process.env,
      ...NO_AWS_CREDENTIALS,
      PATH: `${binDir}:${process.env.PATH ?? ''}`,
      ...env,
    },
    ...SPAWN_GUARD,
  });
  return { status: res.status, stdout: res.stdout ?? '', stderr: res.stderr ?? '' };
}

/** Run the whole check and read back what it set, one field per line. */
function check(
  opts: {
    address: string | null;
    port: number | null;
    firewall: PortRule[] | 'refuses' | 'gibberish';
    target?: string;
  },
): { verdict: string; address: string; port: string; detail: string; stderr: string } {
  if (opts.port !== null) stubSshOnPath(opts.port);
  const res = callLib(
    [
      `egress_allowlist_check ${opts.target ?? 'production'} footbag-production`,
      'echo "VERDICT=$EGRESS_VERDICT"',
      'echo "ADDRESS=$EGRESS_ADDRESS"',
      'echo "PORT=$EGRESS_PORT"',
      'echo "DETAIL<<"',
      'printf "%s\\n" "$EGRESS_DETAIL"',
    ].join('; '),
    {
      EGRESS_CHECKIP_CMD: checkipStub(opts.address),
      EGRESS_AWS_BIN: awsStub(opts.firewall),
    },
  );
  const out = res.stdout;
  const field = (name: string): string => out.match(new RegExp(`^${name}=(.*)$`, 'm'))?.[1] ?? '';
  return {
    verdict: field('VERDICT'),
    address: field('ADDRESS'),
    port: field('PORT'),
    detail: out.slice(out.indexOf('DETAIL<<') + 'DETAIL<<\n'.length),
    stderr: res.stderr,
  };
}

/** The shape both Terraform trees carry: the alias on 22, the deploy on 2222. */
const TWO_PORT_FIREWALL: PortRule[] = [
  {
    fromPort: 22,
    toPort: 22,
    protocol: 'tcp',
    cidrs: ['203.0.113.0/24'],
    cidrListAliases: ['lightsail-connect'],
  },
  { fromPort: 2222, toPort: 2222, protocol: 'tcp', cidrs: ['203.0.113.0/26'], cidrListAliases: [] },
];

describe('the containment arithmetic', () => {
  function contains(cidr: string, address: string): number | null {
    return callLib(`rc=0; egress_cidr_contains '${cidr}' '${address}' || rc=$?; exit "$rc"`).status;
  }

  it('matches an address against its own /32 entry', () => {
    expect(contains('203.0.113.7/32', '203.0.113.7')).toBe(0);
  });

  it('sees an address that falls inside a wider range', () => {
    // The case a literal match could never answer, and the reason an operator on
    // a roaming network was asked to attest by hand on every single run.
    expect(contains('203.0.113.0/24', '203.0.113.200')).toBe(0);
    expect(contains('10.0.0.0/8', '10.255.255.255')).toBe(0);
  });

  it('rejects an address outside the range', () => {
    expect(contains('203.0.113.0/24', '203.0.114.1')).toBe(1);
    expect(contains('203.0.113.0/26', '203.0.113.200')).toBe(1);
  });

  it('does not match one address as a substring of another', () => {
    // The unanchored-regex defect: dots match any character, so this pair read
    // as covered and the check reported an address the firewall would refuse.
    expect(contains('51.2.3.4/32', '1.2.3.4')).toBe(1);
  });

  it('treats an entry with no prefix length as a single address', () => {
    expect(contains('203.0.113.7', '203.0.113.7')).toBe(0);
    expect(contains('203.0.113.7', '203.0.113.8')).toBe(1);
  });

  it('admits everything through a zero-length prefix', () => {
    expect(contains('0.0.0.0/0', '198.51.100.23')).toBe(0);
  });

  it('reads a leading-zero octet as decimal rather than octal', () => {
    // Bash arithmetic reads 010 as 8, so an entry written this way would compare
    // as a different address entirely and fail silently in the safe direction
    // once and the unsafe direction the next time.
    expect(contains('010.0.0.0/8', '10.1.2.3')).toBe(0);
  });

  it('answers "could not tell" rather than "no" on a range it cannot parse', () => {
    // Distinct from 1, because a malformed entry means the question went
    // unanswered. Reporting it as "not covered" would send an operator to add an
    // address that may well already be there.
    expect(contains('not-a-range', '203.0.113.7')).toBe(2);
    expect(contains('203.0.113.0/33', '203.0.113.7')).toBe(2);
    expect(contains('203.0.113.999/24', '203.0.113.7')).toBe(2);
  });

  it('refuses an address with an out-of-range octet', () => {
    expect(contains('203.0.113.0/24', '203.0.113.999')).toBe(2);
  });
});

describe('the port the deploy will actually use', () => {
  it('reports the port the operator\'s own configuration resolves the alias to', () => {
    stubSshOnPath(2222);
    const res = callLib('egress_ssh_port footbag-production');
    expect(res.status).toBe(0);
    expect(res.stdout).toBe('2222');
  });

  it('refuses an alias this workstation does not configure', () => {
    // No ssh of its own, so the shared machine-isolation declaration answers the
    // way a clean runner does: ssh echoes the name back as the hostname rather
    // than failing. Falling through to ssh's built-in 22 here would make the
    // whole check report confidently about a port nothing will use.
    const res = callLib('rc=0; egress_ssh_port footbag-production || rc=$?; exit "$rc"');
    expect(res.status).toBe(1);
    expect(res.stdout).toBe('');
  });
});

describe('the whole check, against a live firewall', () => {
  it('reports covered when the address falls inside a range open on that port', () => {
    const r = check({ address: '203.0.113.9', port: 2222, firewall: TWO_PORT_FIREWALL });
    expect(r.verdict).toBe('covered');
    expect(r.address).toBe('203.0.113.9');
    expect(r.port).toBe('2222');
    expect(r.detail).toContain('203.0.113.0/26');
    expect(r.detail).toContain('footbag-production-web');
  });

  it('reads the port the deploy uses, not port 22', () => {
    // The whole reason the port comes from the alias. This address is admitted
    // on 22 by the /24 and refused on 2222 by the /26, so a check that assumed
    // one port would give the wrong answer for the other.
    const onTwentyTwo = check({ address: '203.0.113.200', port: 22, firewall: TWO_PORT_FIREWALL });
    expect(onTwentyTwo.verdict).toBe('covered');

    const onDeployPort = check({
      address: '203.0.113.200',
      port: 2222,
      firewall: TWO_PORT_FIREWALL,
    });
    expect(onDeployPort.verdict).toBe('uncovered');
  });

  it('reports the source-IP alias without counting it as coverage', () => {
    // The alias admits the Lightsail access path, which is the way back in and
    // a separate way onto the host. Counting it would replace one false
    // positive with another.
    const r = check({ address: '198.51.100.23', port: 22, firewall: TWO_PORT_FIREWALL });
    expect(r.verdict).toBe('uncovered');
    expect(r.detail).toContain('lightsail-connect');
    expect(r.detail).toContain('does not\nadmit this deploy');
  });

  it('names what is open when the address is not, so the operator can see the gap', () => {
    const r = check({ address: '198.51.100.23', port: 2222, firewall: TWO_PORT_FIREWALL });
    expect(r.verdict).toBe('uncovered');
    expect(r.detail).toContain('203.0.113.0/26');
  });

  it('reports a port carrying no rule at all as uncovered rather than unknown', () => {
    const r = check({
      address: '203.0.113.9',
      port: 2222,
      firewall: [{ fromPort: 22, toPort: 22, protocol: 'tcp', cidrs: ['203.0.113.0/24'] }],
    });
    expect(r.verdict).toBe('uncovered');
    expect(r.detail).toMatch(/no rule open on port\n?2222/);
  });

  it('matches a rule spanning a port range', () => {
    const r = check({
      address: '203.0.113.9',
      port: 2222,
      firewall: [{ fromPort: 2200, toPort: 2300, protocol: 'tcp', cidrs: ['203.0.113.0/24'] }],
    });
    expect(r.verdict).toBe('covered');
  });

  it('does not admit a TCP connection through a UDP rule', () => {
    const r = check({
      address: '203.0.113.9',
      port: 2222,
      firewall: [{ fromPort: 2222, toPort: 2222, protocol: 'udp', cidrs: ['203.0.113.0/24'] }],
    });
    expect(r.verdict).toBe('uncovered');
  });

  it('admits a rule declared for all protocols', () => {
    const r = check({
      address: '203.0.113.9',
      port: 2222,
      firewall: [{ fromPort: 2222, toPort: 2222, protocol: 'all', cidrs: ['203.0.113.0/24'] }],
    });
    expect(r.verdict).toBe('covered');
  });
});

describe('everything it cannot read is unknown, never fine', () => {
  it('answers unknown when the egress address cannot be resolved', () => {
    // The defect this replaces: the address a run cannot resolve is precisely
    // the one the check exists to doubt, and one script warned and carried on to
    // the deploy, which then stranded part-way through its remote half.
    const r = check({ address: null, port: 2222, firewall: TWO_PORT_FIREWALL });
    expect(r.verdict).toBe('unknown');
    expect(r.detail).toContain('unknown rather than fine');
  });

  it('answers unknown when the address comes back as something that is not one', () => {
    const r = check({ address: 'service temporarily unavailable', port: 2222, firewall: TWO_PORT_FIREWALL });
    expect(r.verdict).toBe('unknown');
  });

  it('answers unknown when the SSH alias does not resolve', () => {
    const r = check({ address: '203.0.113.9', port: null, firewall: TWO_PORT_FIREWALL });
    expect(r.verdict).toBe('unknown');
    expect(r.detail).toContain("alias 'footbag-production' is not configured");
  });

  it('answers unknown when AWS refuses, and keeps what AWS said', () => {
    // The reason terraform-output.sh exists, applied here: a refusal that threw
    // away the provider's own sentence sent operators to look at the firewall
    // when the answer was that their credentials had stopped authenticating.
    const r = check({ address: '203.0.113.9', port: 2222, firewall: 'refuses' });
    expect(r.verdict).toBe('unknown');
    expect(r.detail).toContain('AccessDeniedException');
  });

  it('answers unknown when the firewall comes back in a shape it cannot read', () => {
    const r = check({ address: '203.0.113.9', port: 2222, firewall: 'gibberish' });
    expect(r.verdict).toBe('unknown');
    expect(r.detail).toContain('could not read');
  });

  it('says on stderr that a stubbed run proves nothing about the firewall', () => {
    const r = check({ address: '203.0.113.9', port: 2222, firewall: TWO_PORT_FIREWALL });
    expect(r.stderr).toContain('SYNTHETIC');
    expect(r.stderr).toContain('proves nothing about the firewall');
  });
});
