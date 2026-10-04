# =============================================================================
# Lightsail — Origin server
# Single instance + static IP + firewall rules.
# nginx + Docker Compose stack runs on this host.
# =============================================================================

# CloudFront origin-facing IPv4 CIDRs, fetched at apply time from the AWS-
# published prefix list. Pins port 80 ingress to actual CloudFront edges so
# direct-to-origin probes from arbitrary IPs are dropped at the firewall
# before they can reach nginx. Belt-and-suspenders with the X-Origin-Verify
# nginx gate (rendered into nginx.conf by docker/nginx/40-render-nginx-conf.sh):
# firewall rejects most direct probes; the secret header rejects anything that
# slipped through (e.g. a CloudFront edge IP that isn't ours).
#
# List refreshes on every `terraform apply`. AWS publishes prefix changes a
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

locals {
  cloudfront_origin_facing_cidrs = [
    for prefix in jsondecode(data.http.aws_ip_ranges.response_body).prefixes :
    prefix.ip_prefix
    if prefix.service == "CLOUDFRONT_ORIGIN_FACING"
  ]
}

# Each dev-and-tester's address, one parameter per person, written and deleted
# only by onboarding and offboarding as the directly authenticated identity. The
# administrators' own entries stay in operator_cidrs, in the values file, and are
# never read from here. Outside /footbag/<env>/ on purpose: the runtime role reads
# that whole prefix, and an operator's home address is nothing the application
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

  # Only a canonical single IPv4 host is admitted, so a malformed or widened
  # value in someone's parameter can neither open the port to a range nor fail
  # an administrator's plan; it is left out and reported by the check below.
  dev_tester_valid = [
    for v in local.dev_tester_address_values :
    can(regex("^[0-9.]+/32$", v)) && try("${cidrhost(v, 0)}/32" == v, false)
  ]
  dev_tester_cidrs = [
    for i, v in local.dev_tester_address_values : v if local.dev_tester_valid[i]
  ]
  dev_tester_invalid_names = [
    for i, n in local.dev_tester_address_names : n if !local.dev_tester_valid[i]
  ]

  # The SSH allow-list: the administrators' entries first, as they always were,
  # then each dev-and-tester address not already present. An address both an
  # administrator and a dev-and-tester hold appears once, and removing the
  # dev-and-tester's parameter leaves the administrator's entry admitting it.
  operator_ssh_cidrs = distinct(concat(var.operator_cidrs, local.dev_tester_cidrs))
}

# A warning, never a failure: a bad value in one person's parameter must not stop
# anybody's apply. The address is simply not admitted until it is corrected.
check "dev_tester_addresses_are_single_hosts" {
  assert {
    condition     = length(local.dev_tester_invalid_names) == 0
    error_message = "These dev-and-tester address parameters hold something other than a single IPv4 host (a.b.c.d/32) and are not admitted to SSH: ${join(", ", local.dev_tester_invalid_names)}. Re-run onboarding for that person to correct it."
  }
}

resource "aws_lightsail_key_pair" "operator" {
  name       = "${local.prefix}-operator"
  public_key = var.ssh_public_key
}

resource "aws_lightsail_instance" "web" {
  name              = "${local.prefix}-web"
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

resource "aws_lightsail_static_ip" "web" {
  name = "${local.prefix}-web-ip"
}

resource "aws_lightsail_static_ip_attachment" "web" {
  static_ip_name = aws_lightsail_static_ip.web.name
  instance_name  = aws_lightsail_instance.web.name
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
  # may carry multiple /32s for network flexibility; the dev-and-testers'
  # addresses are joined to it above, from their own parameters.
  port_info {
    protocol          = "tcp"
    from_port         = 22
    to_port           = 22
    cidrs             = local.operator_ssh_cidrs
    cidr_list_aliases = ["lightsail-connect"]
  }

  # HTTP — CloudFront origins only. The CloudFront origin-facing prefix list
  # comes from data.http.aws_ip_ranges (above). Direct-to-origin probes from
  # any other source are rejected at the Lightsail firewall before reaching
  # nginx, defending the X-Forwarded-For trust chain (Express trusts RFC1918
  # peers, so reaching nginx with a spoofed XFF would otherwise spoof req.ip).
  port_info {
    protocol  = "tcp"
    from_port = 80
    to_port   = 80
    cidrs     = local.cloudfront_origin_facing_cidrs
  }

  # SSH alternate port — operator access when port 22 is ISP-blocked
  # Some ISPs block outbound port 22 to AWS EC2 IP ranges.
  # sshd is configured to listen on both 22 and 2222 on the host.
  port_info {
    protocol  = "tcp"
    from_port = 2222
    to_port   = 2222
    cidrs     = local.operator_ssh_cidrs
  }

  # HTTPS — not terminated at Lightsail; CloudFront handles TLS
  # Kept closed unless direct-to-origin TLS is needed.

  lifecycle {
    precondition {
      condition     = length(local.cloudfront_origin_facing_cidrs) > 0
      error_message = "No CloudFront origin-facing CIDRs in AWS IP ranges; refusing to apply (would close port 80 entirely)."
    }
  }
}
