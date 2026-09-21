/**
 * scripts/ci/check_closed_namespace.sh — no child of the zone is delegated away.
 *
 * The served set under the domain is the apex, www and the archive, and no
 * subzone is delegated to a third party. That absence has to be asserted rather
 * than left to convention, because the cost of a delegated child is not
 * recoverable by agreement with whoever runs it: certificate authorisation is
 * read at the closest node, so the child can obtain a publicly trusted
 * certificate for a name under the domain; relaxed alignment lets it send mail
 * that authenticates as the domain; and the archive's access cookies are scoped
 * to the whole domain with no exclusion syntax, so any name answering over HTTPS
 * receives a signed-in member's archive credentials.
 *
 * Before this gate, the only thing standing between the zone and a delegated
 * child was a comment. Adding an NS record set passed every check in the tree.
 *
 * Two shapes have to fail, not one. The obvious one is a literal NS record. The
 * other is a record whose type is computed: a type read out of a values file is
 * how an NS record arrives without the word appearing anywhere in the tree. The
 * one legitimate computed type comes from a certificate's own validation
 * options, where the value is the certificate authority's rather than ours.
 *
 * The gate runs against a throwaway repository rather than this one, so a case
 * can assert what a delegated child does without one having to exist in
 * terraform/.
 *
 * What that leaves uncovered, stated because it read the other way here until it
 * was checked: an ordinary suite run does NOT exercise the real tree. The
 * conventions suite runs the gate inside fixture repositories too, so the only
 * things that run it against this repository are the pre-PR gate and CI. A
 * delegation committed alongside a change that is only ever run through the
 * default suite is caught at the pull request, not at the keyboard.
 */
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { SPAWN_GUARD } from '../fixtures/spawnGuard';

const SCRIPT = join(process.cwd(), 'scripts/ci/check_closed_namespace.sh');

interface RunResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

/** The zone's own apex NS set: created by the provider with the hosted zone and
 *  declared only to lower its cache lifetime. Not a delegation, and the one case
 *  that must pass. */
const APEX_NS = `resource "aws_route53_record" "apex_ns" {
  zone_id         = aws_route53_zone.primary.zone_id
  name            = var.domain_name
  type            = "NS"
  ttl             = 300
  records         = aws_route53_zone.primary.name_servers
  allow_overwrite = true
}
`;

/** An ordinary address record at the apex, carrying a nested block whose own
 *  name attribute is a different hostname. */
const APEX_ALIAS = `resource "aws_route53_record" "apex_a" {
  zone_id = local.zone_id
  name    = var.domain_name
  type    = "A"

  alias {
    name                   = aws_cloudfront_distribution.main[0].domain_name
    zone_id                = aws_cloudfront_distribution.main[0].hosted_zone_id
    evaluate_target_health = false
  }
}
`;

function childDelegation(label: string, name: string): string {
  return `resource "aws_route53_record" "${label}" {
  zone_id = local.zone_id
  name    = ${name}
  type    = "NS"
  ttl     = 300
  records = ["ns1.example.net", "ns2.example.net"]
}
`;
}

/** Stands up a throwaway repository holding only a terraform tree, runs the gate
 *  inside it, and tears it down. The script resolves its own root through git,
 *  so the fixture has to be a repository rather than a bare directory. */
function inFixtureRepo(trees: Record<string, string>): RunResult {
  const files: Record<string, string> = {};
  for (const [tree, contents] of Object.entries(trees)) {
    files[`terraform/${tree}/main.tf`] = contents;
  }
  return inFixtureRepoFiles(files);
}

/** The same, addressed by repository-relative path rather than by tree name, so
 *  a case can put a file at a depth or an extension the old glob never reached.
 *  Every one of those was a real miss: a module directory, the top of the tree,
 *  the JSON syntax, and anywhere outside terraform/ altogether. */
function inFixtureRepoFiles(files: Record<string, string>): RunResult {
  const dir = mkdtempSync(join(tmpdir(), 'footbag-test-closednamespace-'));
  try {
    for (const [path, contents] of Object.entries(files)) {
      const full = join(dir, path);
      mkdirSync(join(full, '..'), { recursive: true });
      writeFileSync(full, contents, 'utf-8');
    }
    const init = spawnSync('git', ['init', '-q'], { cwd: dir, encoding: 'utf-8', ...SPAWN_GUARD });
    expect(init.status).toBe(0);

    const r = spawnSync('bash', [SCRIPT], { cwd: dir, encoding: 'utf-8', ...SPAWN_GUARD });
    return { exitCode: r.status ?? -1, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('check_closed_namespace.sh', () => {
  it('passes a zone carrying its own apex nameserver set and ordinary records', () => {
    const r = inFixtureRepo({ production: APEX_NS + APEX_ALIAS });
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toMatch(/\[closed-namespace\] pass/);
  });

  it('refuses a nameserver record naming a child of the zone', () => {
    const r = inFixtureRepo({
      production: APEX_NS + childDelegation('bridge', '"legacy.${var.domain_name}"'),
    });
    expect(r.exitCode).not.toBe(0);
    expect(r.stderr).toMatch(/record 'bridge' declares type NS/);
    expect(r.stderr).toMatch(/delegates a child of the zone/);
  });

  // The apex set is recognised by the record's own top-level name. A nested
  // block carrying that same expression must not launder a child delegation
  // past the check.
  it('refuses a child delegation whose nested block names the apex', () => {
    const laundered = `resource "aws_route53_record" "laundered" {
  zone_id = local.zone_id
  name    = "bridge.\${var.domain_name}"
  type    = "NS"

  alias {
    name = var.domain_name
  }
}
`;
    const r = inFixtureRepo({ production: APEX_NS + laundered });
    expect(r.exitCode).not.toBe(0);
    expect(r.stderr).toMatch(/record 'laundered' declares type NS/);
  });

  it('allows a computed type that comes from a certificate’s own validation options', () => {
    const validation = `resource "aws_route53_record" "cert_validation" {
  for_each = {
    for dvo in aws_acm_certificate.main[0].domain_validation_options : dvo.domain_name => {
      name   = dvo.resource_record_name
      type   = dvo.resource_record_type
      record = dvo.resource_record_value
    }
  }

  zone_id = local.zone_id
  name    = each.value.name
  type    = each.value.type
  ttl     = 60
  records = [each.value.record]
}
`;
    const r = inFixtureRepo({ production: APEX_NS + validation });
    expect(r.exitCode).toBe(0);
  });

  // The shape that lets an NS record arrive without the word appearing in the
  // tree at all: the type is read out of a map an operator fills in.
  it('refuses a computed type read from anywhere else', () => {
    const fromValues = `resource "aws_route53_record" "mirror" {
  for_each = var.legacy_records

  zone_id = local.zone_id
  name    = "\${each.key}.\${var.domain_name}"
  type    = each.value.type
  ttl     = 60
  records = each.value.records
}
`;
    const r = inFixtureRepo({ production: APEX_NS + fromValues });
    expect(r.exitCode).not.toBe(0);
    expect(r.stderr).toMatch(/record 'mirror' takes its type from/);
  });

  // The allowance for a computed type is decided by what the block actually
  // reads from, so it is read from code with every comment cut away first.
  // Otherwise a block excuses itself by naming the permitted source in a
  // comment, which is the cheapest possible way past this gate.
  it('refuses a computed type whose block only names the certificate source in a comment', () => {
    const excused = `resource "aws_route53_record" "mirror" {
  for_each = var.legacy_records

  zone_id = local.zone_id
  name    = "\${each.key}.\${var.domain_name}"
  # shaped like domain_validation_options, but read from the values file
  type    = each.value.type
  ttl     = 60
  records = each.value.records
}
`;
    const r = inFixtureRepo({ production: APEX_NS + excused });
    expect(r.exitCode).not.toBe(0);
    expect(r.stderr).toMatch(/record 'mirror' takes its type from/);
  });

  // A gate that reports success having examined nothing is worse than no gate,
  // because the green result is read as evidence. Two ways to examine nothing:
  // read no files, and read files while extracting no record from them.
  it('fails rather than passing when it finds no terraform to read', () => {
    const r = inFixtureRepo({});
    expect(r.exitCode).not.toBe(0);
    expect(r.stderr).toMatch(/no terraform files were scanned/);
  });

  it('fails when it reads terraform but extracts no record, which is its own defect', () => {
    const r = inFixtureRepo({ production: 'variable "domain_name" {\n  type = string\n}\n' });
    expect(r.exitCode).not.toBe(0);
    expect(r.stderr).toMatch(/no DNS record was extracted/);
    expect(r.stderr).toMatch(/defect in this gate/);
  });

  it('says how many records it judged, not only how many files it opened', () => {
    const r = inFixtureRepo({ production: APEX_NS + APEX_ALIAS });
    expect(r.stdout).toMatch(/pass \(2 DNS records across 1 terraform files\)/);
  });

  // Every case below was demonstrated against the gate as it stood: each one
  // printed a pass and exit 0 while doing the thing the gate exists to refuse.

  // Two quotation marks defeated both branches at once. The classifier asked
  // "does it start and end with a quote", so an interpolation wrapped in quotes
  // went down the literal branch, was compared to NS as a whole string, came out
  // different, and passed. This is the file header's own stated threat model.
  it('refuses a delegation whose type is an interpolation inside quotes', () => {
    const sneaky = `locals {
  s = "S"
}

resource "aws_route53_record" "bridge" {
  zone_id = local.zone_id
  name    = "legacy.\${var.domain_name}"
  type    = "N\${local.s}"
  ttl     = 300
  records = ["ns1.legacyhost.net"]
}
`;
    const r = inFixtureRepo({ production: APEX_NS + sneaky });
    expect(r.exitCode).not.toBe(0);
    expect(r.stderr).toMatch(/record 'bridge' takes its type from/);
  });

  it('refuses a delegation whose type is a bare interpolation', () => {
    const sneaky = `resource "aws_route53_record" "bridge" {
  zone_id = local.zone_id
  name    = "legacy.\${var.domain_name}"
  type    = "\${local.bridge_type}"
  ttl     = 300
  records = ["ns1.legacyhost.net"]
}
`;
    const r = inFixtureRepo({ production: APEX_NS + sneaky });
    expect(r.exitCode).not.toBe(0);
  });

  // A child zone delegates as surely as an NS record set, and it additionally
  // breaks the apex authorisation record, which is inherited only while no child
  // zone exists.
  it('refuses a hosted zone declared for a child of the domain', () => {
    const child = `resource "aws_route53_zone" "legacy_child" {
  name = "legacy.example.org"
}
`;
    const r = inFixtureRepo({ production: APEX_NS + child });
    expect(r.exitCode).not.toBe(0);
    expect(r.stderr).toMatch(/hosted zone 'legacy_child'/);
    expect(r.stderr).toMatch(/breaks the apex CAA record/);
  });

  it('accepts the zone the tree exists to declare', () => {
    const apex = `resource "aws_route53_zone" "primary" {
  name = var.domain_name
}
`;
    const r = inFixtureRepo({ production: apex + APEX_NS });
    expect(r.exitCode).toBe(0);
  });

  // Ships inside the provider version this tree pins, manages record sets as a
  // set, and can carry a delegation among them in a shape the gate does not read.
  it('refuses the exclusive record-set resource rather than half-reading it', () => {
    const exclusive = `resource "aws_route53_records_exclusive" "bridge" {
  zone_id = local.zone_id
}
`;
    const r = inFixtureRepo({ production: APEX_NS + exclusive });
    expect(r.exitCode).not.toBe(0);
    expect(r.stderr).toMatch(/aws_route53_records_exclusive/);
  });

  it('refuses a record set minted by a shell provisioner', () => {
    const provisioner = `resource "null_resource" "bridge_push" {
  provisioner "local-exec" {
    command = "aws route53 change-resource-record-sets --hosted-zone-id Z1 --change-batch file://bridge.json"
  }
}
`;
    const r = inFixtureRepo({ production: APEX_NS + provisioner });
    expect(r.exitCode).not.toBe(0);
    expect(r.stderr).toMatch(/change-resource-record-sets/);
  });

  it('reads a module directory, which the old two-level glob never reached', () => {
    const r = inFixtureRepoFiles({
      'terraform/production/main.tf': APEX_NS,
      'terraform/modules/dns/main.tf': childDelegation('bridge', '"legacy.${var.domain_name}"'),
    });
    expect(r.exitCode).not.toBe(0);
    expect(r.stderr).toMatch(/record 'bridge' declares type NS/);
  });

  it('reads a file at the top of the terraform tree', () => {
    const r = inFixtureRepoFiles({
      'terraform/production/main.tf': APEX_NS,
      'terraform/dns.tf': childDelegation('bridge', '"legacy.${var.domain_name}"'),
    });
    expect(r.exitCode).not.toBe(0);
  });

  // terraform loads a .tf.json exactly as it loads HCL, and everything in this
  // gate reads HCL. Scanned-and-not-judged is worse than unscanned, because the
  // file counts towards the total that says something was examined.
  it('refuses the JSON syntax rather than scanning it without reading it', () => {
    const r = inFixtureRepoFiles({
      'terraform/production/main.tf': APEX_NS,
      'terraform/production/dns.tf.json': '{"resource":{"aws_route53_record":{"b":{"type":"NS"}}}}',
    });
    expect(r.exitCode).not.toBe(0);
    expect(r.stderr).toMatch(/declares Terraform in JSON/);
  });

  it('refuses terraform declared outside the tree it scans', () => {
    const r = inFixtureRepoFiles({
      'terraform/production/main.tf': APEX_NS,
      'infra/dns.tf': childDelegation('bridge', '"legacy.${var.domain_name}"'),
    });
    expect(r.exitCode).not.toBe(0);
    expect(r.stderr).toMatch(/outside terraform\//);
  });

  // One unmatched brace inside a quoted value kept the block open forever, so
  // the record was never emitted and never judged. The global count could not
  // see one record go missing, and the pass line read as evidence.
  it('judges a record carrying an unmatched brace inside a string value', () => {
    const braced = `resource "aws_route53_record" "bridge" {
  zone_id        = local.zone_id
  set_identifier = "bridge{"
  name           = "legacy.\${var.domain_name}"
  type           = "NS"
  ttl            = 300
  records        = ["ns1.legacyhost.net"]

  weighted_routing_policy {
    weight = 100
  }
}
`;
    const r = inFixtureRepo({ production: APEX_NS + braced });
    expect(r.exitCode).not.toBe(0);
    expect(r.stderr).toMatch(/record 'bridge' declares type NS/);
  });

  // The exemption is read from the iteration expression, not from anywhere in
  // the block. A mention in an ignore_changes list is live code, so the test
  // proving a comment could not launder it passed while this did.
  it('refuses a computed type whose block names the certificate source in a lifecycle block', () => {
    const laundered = `resource "aws_route53_record" "bridge" {
  for_each = var.legacy_records

  zone_id = local.zone_id
  name    = each.value.fqdn
  type    = each.value.type
  ttl     = 300
  records = each.value.records

  lifecycle {
    ignore_changes = [local.domain_validation_options]
  }
}
`;
    const r = inFixtureRepo({ production: APEX_NS + laundered });
    expect(r.exitCode).not.toBe(0);
    expect(r.stderr).toMatch(/record 'bridge' takes its type from/);
  });

  // The one shape the gate whitelisted. Handing the whole namespace to a third
  // party is strictly worse than any child delegation: every resolver that takes
  // its nameservers from the zone rather than from the registry follows.
  it('refuses an apex nameserver set repointed away from the zone', () => {
    const handover = `resource "aws_route53_record" "apex_ns_handover" {
  zone_id         = aws_route53_zone.primary.zone_id
  name            = var.domain_name
  type            = "NS"
  ttl             = 300
  records         = ["ns1.legacyhost.net", "ns2.legacyhost.net"]
  allow_overwrite = true
}
`;
    const r = inFixtureRepo({ production: handover });
    expect(r.exitCode).not.toBe(0);
    expect(r.stderr).toMatch(/rather than the zone's own name_servers/);
  });

  // Four spellings of the same apex. Rejecting the others made an ordinary,
  // format-clean refactor fail this gate for no reason, which is how a gate
  // teaches people to route around it.
  it.each([
    ['an interpolated domain variable', '"${var.domain_name}"'],
    ['a local', 'local.apex'],
    ['the zone resource', 'aws_route53_zone.primary.name'],
    ['the empty-name shorthand', '""'],
  ])('accepts the apex nameserver set spelled as %s', (_label, spelling) => {
    const apex = `resource "aws_route53_record" "apex_ns" {
  zone_id = aws_route53_zone.primary.zone_id
  name    = ${spelling}
  type    = "NS"
  ttl     = 300
  records = aws_route53_zone.primary.name_servers
}
`;
    const r = inFixtureRepo({ production: apex });
    expect(r.exitCode, r.stderr).toBe(0);
  });

  it('names the ruling that would permit a bridge, so reversing it is deliberate', () => {
    const r = inFixtureRepo({
      production: APEX_NS + childDelegation('bridge', '"legacy.${var.domain_name}"'),
    });
    expect(r.stderr).toMatch(/permitted only as a migration bridge BEFORE go-live/);
  });
});
