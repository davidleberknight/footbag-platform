# =============================================================================
# Lightsail — Origin server
# Single instance + static IP + firewall rules.
# nginx + Docker Compose stack runs on this host.
# =============================================================================

# CloudFront's IPv4 ranges, fetched at plan time from the AWS-published list.
# They pin port 80 ingress to CloudFront so direct-to-origin probes from
# arbitrary IPs are dropped at the firewall before they can reach nginx.
# Belt-and-suspenders with the X-Origin-Verify nginx gate (rendered into
# nginx.conf by docker/nginx/40-render-nginx-conf.sh): the firewall rejects most
# direct probes; the secret header rejects anything that slipped through (e.g. a
# CloudFront edge IP that isn't ours).
#
# The list refreshes on every `terraform apply`. AWS publishes prefix changes a
# few times per year; re-applying after a published syncToken bump keeps the
# allowlist fresh.
data "http" "aws_ip_ranges" {
  url = "https://ip-ranges.amazonaws.com/ip-ranges.json"

  lifecycle {
    postcondition {
      condition     = self.status_code == 200
      error_message = "Failed to fetch AWS IP ranges: HTTP ${self.status_code}"
    }
  }
}

# A Lightsail instance's IPv4 firewall holds at most 60 address entries across
# all its ports, and one entry per origin-facing range left too few for SSH.
# Port 80 therefore admits, for each origin-facing range, the widest range AWS
# publishes as CloudFront's own (service CLOUDFRONT, region GLOBAL) that
# contains it, or the range itself where none does. AWS states that a range
# listed under a service is used by that service exclusively, so every address
# admitted is still CloudFront's and port 80 stays closed to everything else;
# a container wider than /16 is never used, so one broad block in a future list
# cannot widen the rule. A new origin-facing range inside an admitted block
# costs no new entry.
#
# Selection is integer arithmetic on each range's network number. The coverage
# precondition below checks the result a different way, with cidrhost, so a
# mistake in one cannot pass the other.
locals {
  aws_ip_prefixes = jsondecode(data.http.aws_ip_ranges.response_body).prefixes

  cloudfront_origin_facing_cidrs = distinct([
    for prefix in local.aws_ip_prefixes :
    prefix.ip_prefix
    if prefix.service == "CLOUDFRONT_ORIGIN_FACING"
  ])

  cloudfront_origin_facing_blocks = [
    for cidr in local.cloudfront_origin_facing_cidrs : {
      cidr = cidr
      len  = tonumber(split("/", cidr)[1])
      net  = sum([for i, octet in split(".", split("/", cidr)[0]) : tonumber(octet) * pow(256, 3 - i)])
    }
  ]

  cloudfront_edge_blocks = [
    for cidr in distinct([
      for prefix in local.aws_ip_prefixes :
      prefix.ip_prefix
      if prefix.service == "CLOUDFRONT" && prefix.region == "GLOBAL"
      ]) : {
      cidr = cidr
      len  = tonumber(split("/", cidr)[1])
      net  = sum([for i, octet in split(".", split("/", cidr)[0]) : tonumber(octet) * pow(256, 3 - i)])
    }
    if tonumber(split("/", cidr)[1]) >= 16
  ]

  cloudfront_origin_containers = [
    for o in local.cloudfront_origin_facing_blocks : {
      origin = o.cidr
      containers = [
        for c in local.cloudfront_edge_blocks : c
        if c.len <= o.len && floor(o.net / pow(2, 32 - c.len)) == floor(c.net / pow(2, 32 - c.len))
      ]
    }
  ]

  # The widest container, or the range itself. The 33 keeps min() from being
  # called on nothing when a range has no container; no prefix length equals it.
  cloudfront_port_cidrs = distinct([
    for e in local.cloudfront_origin_containers :
    concat(
      [for c in e.containers : c.cidr if c.len == min(concat([for d in e.containers : d.len], [33])...)],
      [e.origin],
    )[0]
  ])

  cloudfront_origin_facing_covered = alltrue([
    for o in local.cloudfront_origin_facing_blocks : anytrue([
      for cidr in local.cloudfront_port_cidrs :
      tonumber(split("/", cidr)[1]) <= o.len
      && cidrhost("${split("/", o.cidr)[0]}/${split("/", cidr)[1]}", 0) == split("/", cidr)[0]
    ])
  ])
}

# Each dev-and-tester's addresses, one parameter per person holding a
# comma-separated list of single hosts, written and deleted only by onboarding
# and offboarding as the directly authenticated identity. The administrators'
# own entries stay in operator_cidrs, in the values file, and are never read
# from here. Outside /footbag/<env>/ on purpose: the runtime role reads
# that whole prefix, and a dev-and-tester's home address is nothing the application
# should see. An empty path reads as an empty list, so with nobody onboarded the
# firewall is exactly operator_cidrs.
data "aws_ssm_parameters_by_path" "dev_tester_addresses" {
  path      = "/footbag-ops/${var.environment}/dev-testers"
  recursive = false
}

locals {
  # The provider marks parameter values sensitive whatever their type. These are
  # plain String parameters holding firewall addresses, and leaving them marked
  # would hide the whole port_info diff, the administrators' entries included.
  dev_tester_address_names  = data.aws_ssm_parameters_by_path.dev_tester_addresses.names
  dev_tester_address_values = nonsensitive(data.aws_ssm_parameters_by_path.dev_tester_addresses.values)

  # One entry per address, carrying the parameter it came from, so a bad entry
  # is reported against its person while their other addresses still apply.
  dev_tester_entries = flatten([
    for i, v in local.dev_tester_address_values : [
      for cidr in split(",", v) : { name = local.dev_tester_address_names[i], cidr = cidr }
    ]
  ])

  # Only a canonical single IPv4 host is admitted, so a malformed or widened
  # entry in someone's parameter can neither open the port to a range nor fail
  # an administrator's plan; it is left out and reported by the check below.
  dev_tester_valid = [
    for e in local.dev_tester_entries :
    can(regex("^[0-9.]+/32$", e.cidr)) && try("${cidrhost(e.cidr, 0)}/32" == e.cidr, false)
  ]
  dev_tester_cidrs = [
    for i, e in local.dev_tester_entries : e.cidr if local.dev_tester_valid[i]
  ]
  dev_tester_invalid_names = distinct([
    for i, e in local.dev_tester_entries : e.name if !local.dev_tester_valid[i]
  ])

  # The SSH allow-list: the administrators' entries first, as they always were,
  # then each dev-and-tester address not already present. An address both an
  # administrator and a dev-and-tester hold appears once, and removing the
  # dev-and-tester's parameter leaves the administrator's entry admitting it.
  ssh_cidrs = distinct(concat(var.operator_cidrs, local.dev_tester_cidrs))
}

# A warning, never a failure: a bad value in one person's parameter must not stop
# anybody's apply. The bad entry is simply not admitted until it is corrected.
check "dev_tester_addresses_are_single_hosts" {
  assert {
    condition     = length(local.dev_tester_invalid_names) == 0
    error_message = "These dev-and-tester address parameters hold an entry other than a single IPv4 host (a.b.c.d/32, comma-separated), which is not admitted to SSH: ${join(", ", local.dev_tester_invalid_names)}. Re-run onboarding for that person to correct it."
  }
}

resource "aws_lightsail_key_pair" "operator" {
  name       = "${local.prefix}-operator"
  public_key = var.ssh_public_key
}

resource "aws_lightsail_instance" "web" {
  name              = local.web_instance_name
  availability_zone = "${var.aws_region}a"
  blueprint_id      = var.lightsail_blueprint_id
  bundle_id         = var.lightsail_bundle_id
  key_pair_name     = aws_lightsail_key_pair.operator.name

  # user_data is intentionally omitted.
  # All host bootstrap (Docker CE install, /srv/footbag directory setup,
  # systemd service install) is performed manually via SSH after first apply.
  # See AWS_OPERATIONS.md (private GitHub repo), "Host bootstrap".

  # Host-level recovery, matching production. The bootstrap above is exactly why
  # this matters: none of it is declared, so without a snapshot a lost instance
  # is a hand rebuild. Staging carries it too so the two environments do not
  # diverge and so the restore path is exercised somewhere safe first.
  #
  # `add_on` is an in-place update, unlike `key_pair_name` and `name`, which are
  # ForceNew. A plan proposing to REPLACE this instance is not this block.
  add_on {
    type          = "AutoSnapshot"
    snapshot_time = "14:00"
    status        = "Enabled"
  }

  tags = {
    Role = "web"
  }
}

# A host restored from a snapshot is a new instance under a new name, because
# Lightsail names are immutable and the old instance is kept, stopped, until the
# restore has been proved. scripts/restore-host.sh records that name in the
# values file and removes the old instance from state; this block then takes the
# restored instance in on the next plan. With no name recorded it imports
# nothing, so a fresh environment still creates its instance, and an import
# whose address is already in state is ignored, so it is safe to leave in place.
import {
  for_each = var.lightsail_instance_name == "" ? toset([]) : toset([var.lightsail_instance_name])
  to       = aws_lightsail_instance.web
  id       = each.value
}

resource "aws_lightsail_static_ip" "web" {
  name = "${local.prefix}-web-ip"
}

# Replaced with the instance. A replacement keeps the instance's name, so
# instance_name alone plans no change here, while Lightsail detaches the address
# from the instance it deletes: without this the new instance comes up on a
# fresh public address and the static one is left attached to nothing. The ARN
# is new for every instance, so it triggers on a replacement and on nothing
# else; the whole resource would also trigger on an in-place update such as its
# tags, detaching the address from a running host for no reason. A restore's
# adoption imports the restored instance under a new name, which this resource
# follows through instance_name, a replacing argument, so the address moves then
# too.
resource "aws_lightsail_static_ip_attachment" "web" {
  static_ip_name = aws_lightsail_static_ip.web.name
  instance_name  = aws_lightsail_instance.web.name

  lifecycle {
    replace_triggered_by = [aws_lightsail_instance.web.arn]
  }
}

resource "aws_lightsail_instance_public_ports" "web" {
  instance_name = aws_lightsail_instance.web.name

  # SSH — restricted to declared operator IP ranges plus the lightsail-connect
  # alias for AWS-managed browser-SSH source IPs. The Lightsail access path is
  # the way back in rather than a path for ordinary work: it reaches the host
  # when no address on the list still works, when the named accounts are
  # damaged, or when a new host has nobody on it, and it rests on the AWS
  # permission that mints its short-lived credential rather than on any key in
  # the host's authorized_keys. An administrator whose own address has changed
  # updates operator_cidrs and applies instead; a dev-and-tester's new address
  # is set by re-running their onboarding. operator_cidrs in
  # terraform.tfvars holds the administrators' routine SSH CIDR allow-list and
  # may carry multiple /32s for network flexibility.
  #
  # Port 22 admits the administrators only. Every routine connection, the
  # dev-and-testers' included, is made on 2222 (below), and a Lightsail
  # instance's firewall holds at most 60 addresses in all, about half of them
  # the CloudFront list on port 80: listing the dev-and-testers on both SSH
  # ports is what overran that cap. The list is never left empty, since an empty
  # list can admit every address.
  port_info {
    protocol          = "tcp"
    from_port         = 22
    to_port           = 22
    cidrs             = var.operator_cidrs
    cidr_list_aliases = ["lightsail-connect"]
  }

  # HTTP — CloudFront only. The ranges come from data.http.aws_ip_ranges and
  # are collapsed as described above it. Direct-to-origin traffic from any
  # other source is refused at the Lightsail firewall, so the X-Forwarded-For
  # chain only ever comes from CloudFront.
  port_info {
    protocol  = "tcp"
    from_port = 80
    to_port   = 80
    cidrs     = local.cloudfront_port_cidrs
  }

  # No HTTPS port, and no origin certificate role or expiry alarm beside it,
  # unlike production. An origin certificate needs a name of the origin's own
  # in a zone this account controls, and staging has none: its CloudFront
  # origin is the static address on nip.io, so its hop stays plaintext. The
  # shared parts (the nginx listener rendered only when a certificate is
  # present, the container monitor's expiry reading) run here unchanged and
  # prove that a host with no certificate boots and serves on 80 alone.
  # Production proves the rest itself, before members are loaded:
  # scripts/provision-origin-tls.sh simulates the role and reads the
  # certificate served on 443, and the switch to https-only follows.

  # SSH alternate port — the port every routine connection uses, since some
  # ISPs block outbound port 22 to AWS EC2 IP ranges. It admits the
  # administrators and the dev-and-testers, whose addresses are joined to the
  # administrators' above from their own parameters.
  # sshd is configured to listen on both 22 and 2222 on the host.
  port_info {
    protocol  = "tcp"
    from_port = 2222
    to_port   = 2222
    cidrs     = local.ssh_cidrs
  }

  # HTTPS — not terminated at Lightsail; CloudFront handles TLS
  # Kept closed unless direct-to-origin TLS is needed.

  lifecycle {
    precondition {
      condition     = length(local.cloudfront_origin_facing_cidrs) > 0
      error_message = "No CloudFront origin-facing CIDRs in AWS IP ranges; refusing to apply (would close port 80 entirely)."
    }

    # Every range CloudFront reaches the origin from must stay admitted, or part
    # of the site's traffic is dropped at the firewall with a clean plan.
    precondition {
      condition     = local.cloudfront_origin_facing_covered
      error_message = "The collapsed CloudFront list on port 80 no longer covers every CloudFront origin-facing range; refusing to apply (CloudFront requests from the uncovered ranges would be dropped)."
    }

    # Lightsail refuses the whole port set above 60 entries, and the refusal
    # otherwise arrives mid-apply. Every port_info's cidrs are counted here, so a
    # port added above must be added to this sum.
    precondition {
      condition     = length(var.operator_cidrs) + length(local.cloudfront_port_cidrs) + length(local.ssh_cidrs) <= 60
      error_message = "The firewall would hold ${length(var.operator_cidrs) + length(local.cloudfront_port_cidrs) + length(local.ssh_cidrs)} address entries (port 22: ${length(var.operator_cidrs)}, port 80: ${length(local.cloudfront_port_cidrs)}, port 2222: ${length(local.ssh_cidrs)}); a Lightsail instance allows at most 60. Remove a stale SSH address first."
    }

    # A new instance starts on Lightsail's default firewall, SSH and HTTP open to
    # every address, and a replacement keeps the instance's name, so without
    # this the rules above are never written to it. Triggered on the ARN, which
    # changes only when the instance is replaced, for the reason given on the
    # static address's attachment.
    replace_triggered_by = [aws_lightsail_instance.web.arn]
  }
}
