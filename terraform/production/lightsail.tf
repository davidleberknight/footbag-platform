# =============================================================================
# Lightsail — web instance + static IP
# Bootstrap (Docker, /srv/footbag, systemd) is performed manually via SSH
# after first apply. user_data is intentionally not used (DD §7.2).
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

  # Host-level recovery. The database ships to S3 every few minutes, but nothing
  # else on this host does: Docker, the systemd units, /srv/footbag/env, the AWS
  # credential files and the pinned host key are all hand-bootstrapped and
  # declared nowhere. Without this, losing the instance means rebuilding it by
  # hand before a restore can even begin. Daily, seven retained, incremental,
  # billed on space actually used.
  #
  # `add_on` is an in-place update on this resource, unlike `key_pair_name` and
  # `name`, which are ForceNew. A plan that proposes REPLACING this instance is
  # not this block and must be refused: the member database is on local disk.
  #
  # 15:00 UTC is roughly 03:00 in the operator's timezone, chosen to sit away
  # from deploys so a snapshot never captures a half-migrated database.
  add_on {
    type          = "AutoSnapshot"
    snapshot_time = "15:00"
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

  # SSH — restricted to operator CIDRs plus the lightsail-connect alias for
  # AWS-managed browser-SSH source IPs (permanent break-glass per DD §7.2).
  port_info {
    protocol          = "tcp"
    from_port         = 22
    to_port           = 22
    cidrs             = var.operator_cidrs
    cidr_list_aliases = ["lightsail-connect"]
  }

  # SSH alternate port for ISPs that block port 22 outbound to AWS EC2 ranges.
  # sshd on the host listens on both 22 and 2222.
  port_info {
    protocol  = "tcp"
    from_port = 2222
    to_port   = 2222
    cidrs     = var.operator_cidrs
  }

  # HTTP — CloudFront only. The ranges come from data.http.aws_ip_ranges and
  # are collapsed as described above it. Direct-to-origin traffic from any
  # other source is refused at the Lightsail firewall, so the X-Forwarded-For
  # chain only ever comes from CloudFront.
  # Belt-and-suspenders with the nginx-layer X-Origin-Verify shared-secret
  # gate.
  port_info {
    protocol  = "tcp"
    from_port = 80
    to_port   = 80
    cidrs     = local.cloudfront_port_cidrs
  }

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
      condition     = 2 * length(var.operator_cidrs) + length(local.cloudfront_port_cidrs) <= 60
      error_message = "The firewall would hold ${2 * length(var.operator_cidrs) + length(local.cloudfront_port_cidrs)} address entries (ports 22 and 2222: ${length(var.operator_cidrs)} each, port 80: ${length(local.cloudfront_port_cidrs)}); a Lightsail instance allows at most 60. Remove a stale SSH address first."
    }

    # A new instance starts on Lightsail's default firewall, SSH and HTTP open to
    # every address, and a replacement keeps the instance's name, so without
    # this the rules above are never written to it. Triggered on the ARN, which
    # changes only when the instance is replaced, for the reason given on the
    # static address's attachment.
    replace_triggered_by = [aws_lightsail_instance.web.arn]
  }
}
