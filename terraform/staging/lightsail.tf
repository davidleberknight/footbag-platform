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
  # the host's authorized_keys. An operator whose own address has changed
  # updates operator_cidrs and applies instead. operator_cidrs in
  # terraform.tfvars holds the routine SSH CIDR allow-list and may carry
  # multiple /32s for network flexibility.
  port_info {
    protocol          = "tcp"
    from_port         = 22
    to_port           = 22
    cidrs             = var.operator_cidrs
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
    cidrs     = var.operator_cidrs
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
